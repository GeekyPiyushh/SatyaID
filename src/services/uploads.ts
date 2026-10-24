import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as m from '../models';
import { AppError } from '../utils/app-error';
import { writeScope, audit, createStudent, digestIdentity, identityKeys, identityLookupQuery } from './student';
import { allocationContext, createEnrolment, changeAdmission } from './admissions';
import { parseStudentFile } from './upload-parser';
import { sealUpload, openUpload, uploadFingerprint, uploadFingerprintCandidates } from './upload-crypto';
import { capacity } from './management';
import { objectId, name, code, day, apaar } from '../validators/batch2';
const optional = (schema: z.ZodType) => z.union([schema, z.literal('')]).optional();
const rowSchema = z.object({ institutionStudentId: code, displayName: name, dateOfBirth: optional(day), apaarId: optional(apaar), allocation: objectId, academicYear: objectId, admissionDate: day, startsOn: day, endsOn: optional(day), entryType: z.enum(['REGULAR', 'LATERAL_ENTRY', 'TRANSFER']) }).strict().refine(v => !v.endsOn || v.startsOn <= v.endsOn);
const hidden = 'status totalRows validRows invalidRows committedRows failureCode attempts institution payloadPurgedAt createdAt updatedAt';
export async function jobAccess(user: any, id: string) {
 const job = await m.UploadJob.findById(id).select(hidden);
 if (!job) throw new AppError(404, 'NOT_FOUND', 'Upload not found');
 await writeScope(user, String(job.institution)); return job;
}
export async function queueUpload(user: any, institution: string, key: string, file: Buffer, format: string) {
 await writeScope(user, institution); const fingerprint = uploadFingerprint(file);
 const previous = await m.UploadJob.findOne({ institution, idempotencyKey: key }).select('+fingerprint');
 if (previous) { if (!uploadFingerprintCandidates(file).includes(String(previous.fingerprint)) || previous.format !== format) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Upload key was used for different content'); return jobAccess(user, String(previous._id)); }
 const id = new mongoose.Types.ObjectId();
 try {
  await mongoose.connection.transaction(async session => {
   await m.UploadJob.create([{ _id: id, institution, submittedBy: user._id, idempotencyKey: key, fingerprint, format, payload: sealUpload(file, String(id)) }], { session });
   await audit(user, 'UPLOAD_QUEUED', 'UploadJob', id, session, institution);
  });
 } catch (e: any) { if (e.code !== 11000) throw e; const existing = await m.UploadJob.findOne({ institution, idempotencyKey: key }).select('+fingerprint'); if (!existing || !uploadFingerprintCandidates(file).includes(String(existing.fingerprint)) || existing.format !== format) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Upload key was used for different content'); return jobAccess(user, String(existing._id)); }
 return jobAccess(user, String(id));
}
export async function confirmUpload(user: any, id: string) {
 const job = await jobAccess(user, id);
 if (job.payloadPurgedAt) throw new AppError(409, 'UPLOAD_PAYLOAD_EXPIRED', 'Upload staging has expired; submit a new file with a new idempotency key');
 if (['COMMITTING', 'COMPLETED'].includes(String(job.status))) return job;
 if (!['VALIDATED', 'PARTIAL'].includes(String(job.status))) throw new AppError(409, 'UPLOAD_NOT_VALIDATED', 'Only validated uploads can be committed');
 await mongoose.connection.transaction(async session => {
  const changed = await m.UploadJob.updateOne({ _id: id, status: { $in: ['VALIDATED', 'PARTIAL'] } }, { $set: { status: 'COMMITTING', commitRequested: true, leaseUntil: null, attempts: 0 } }, { session });
  if (changed.modifiedCount) await audit(user, 'UPLOAD_COMMIT_CONFIRMED', 'UploadJob', id, session, job.institution);
 }); return jobAccess(user, id);
}
async function preview(job: any, user: any, renew: () => Promise<void>) {
 const bytes = openUpload(Buffer.from(job.payload), String(job._id));
 const rows = await parseStudentFile(bytes, job.format);
 const seenRoll = new Set<string>(), seenIdentity = new Set<string>(), planned = new Map<string, number>();
 for (let i = 0; i < rows.length; i++) {
  await renew(); const row = rows[i]!; const parsed = rowSchema.safeParse(row); const errors: string[] = [], warnings: string[] = [];
  let data: any = parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== '')) : row;
  if (!parsed.success) errors.push(parsed.error.issues.some(issue => issue.path[0] === 'apaarId') ? 'INVALID_APAAR_FORMAT' : 'INVALID_ROW_FIELDS');
  if (seenRoll.has(row.institutionStudentId!)) errors.push('DUPLICATE_ROW'); seenRoll.add(row.institutionStudentId!);
  try {
   if (row.apaarId) {
    const digest = digestIdentity(row.apaarId).toString('hex'); if (seenIdentity.has(digest)) errors.push('DUPLICATE_IDENTITY_IN_FILE'); seenIdentity.add(digest);
    const vault = await m.ApaarIdentityVault.findOne(identityLookupQuery(row.apaarId));
    if (vault) {
     const profile = await m.StudentInstitution.findOne({ student: vault.student, institution: job.institution, institutionStudentId: row.institutionStudentId });
     if (!profile) errors.push('IDENTITY_REVIEW_REQUIRED'); else { data.existingStudent = String(vault.student); warnings.push('EXISTING_PROTECTED_IDENTITY'); }
    }
   } else warnings.push('MISSING_APAAR');
   if (parsed.success) {
    const context = await allocationContext(data.allocation);
    if (String(context.offering.institution) !== String(job.institution)) errors.push('INVALID_INSTITUTION_MAPPING');
    if (String(context.year._id) !== data.academicYear) errors.push('ACADEMIC_YEAR_MISMATCH');
    if (new Date(data.admissionDate) < context.year.startsOn! || new Date(data.admissionDate) > context.year.endsOn! || new Date(data.startsOn) < context.year.startsOn! || new Date(data.startsOn) > context.year.endsOn!) errors.push('INVALID_ADMISSION_DATE');
    const profile = await m.StudentInstitution.findOne({ institution: job.institution, institutionStudentId: data.institutionStudentId });
    if (profile) {
     if (profile.displayName !== data.displayName || data.dateOfBirth && profile.dateOfBirth?.toISOString().slice(0, 10) !== data.dateOfBirth) errors.push('CONFLICTING_STUDENT_DETAILS');
     else if (data.existingStudent && data.existingStudent !== String(profile.student)) errors.push('IDENTITY_REVIEW_REQUIRED');
     else { data.existingStudent = String(profile.student); if (data.apaarId && !await m.ApaarIdentityVault.exists({ student: profile.student, ...identityLookupQuery(data.apaarId) })) errors.push('IDENTITY_REVIEW_REQUIRED'); }
     if (await m.Enrolment.exists({ student: profile.student, offering: context.offering._id, academicYear: context.year._id, status: { $nin: ['REJECTED', 'WITHDRAWN', 'TRANSFERRED'] } })) errors.push('DUPLICATE_SUBMISSION');
    }
    if (data.existingStudent && await m.Enrolment.exists({ student: data.existingStudent, institution: { $ne: job.institution }, status: 'ACTIVE', startsOn: { $lte: new Date(data.endsOn ?? '9999-12-31') }, $or: [{ endsOn: null }, { endsOn: { $gte: new Date(data.startsOn) } }] })) warnings.push('POTENTIAL_ENROLMENT_OVERLAP');
    const summary = await capacity(user, String(context.offering._id), String(context.year._id));
    const ceilings = summary.configuredQuotas.filter(r => String(r.category) === String(context.category._id) && r.kind === context.allocation.kind).map(r => r.seats);
    const previewLimit = Math.min(Number(context.allocation.approvedSeats), ...ceilings);
    const selected = planned.get(data.allocation) ?? 0;
    if (Number(context.allocation.occupiedSeats) + selected >= previewLimit) errors.push('CAPACITY_EXHAUSTED');
    if (!errors.length) planned.set(data.allocation, selected + 1);
   }
  } catch (error) { errors.push(error instanceof AppError ? error.code : 'ROW_VALIDATION_FAILED'); }
  const rowNumber = i + 1;
  await mongoose.connection.transaction(async session => {
   const lease = await m.UploadJob.updateOne({ _id: job._id, leaseToken: job.leaseToken, status: 'VALIDATING', leaseUntil: { $gt: new Date() } }, { $set: { leaseUntil: new Date(Date.now() + 60000) } }, { session });
   if (!lease.matchedCount) throw new AppError(409, 'UPLOAD_LEASE_LOST', 'Upload lease was reassigned');
   await m.UploadRowResult.updateOne({ job: job._id, rowNumber }, { $set: { status: errors.length ? 'INVALID' : 'VALID', errorCodes: [...new Set(errors)], warnings, payload: sealUpload(Buffer.from(JSON.stringify(data)), `${job._id}:${rowNumber}`) } }, { upsert: true, session });
  });
 }
 const validRows = await m.UploadRowResult.countDocuments({ job: job._id, status: 'VALID' });
 await m.UploadJob.updateOne({ _id: job._id, leaseToken: job.leaseToken }, { $set: { status: 'VALIDATED', totalRows: rows.length, validRows, invalidRows: rows.length - validRows, leaseUntil: null }, $unset: { payload: 1, leaseToken: 1 } });
}
async function commit(job: any, user: any, renew: () => Promise<void>) {
 const rows = m.UploadRowResult.find({ job: job._id, status: { $in: ['VALID', 'FAILED'] } }).select('+payload').sort({ rowNumber: 1 }).cursor();
 for await (const row of rows) {
  await renew();
  try {
   await mongoose.connection.transaction(async session => {
    const current = await m.UploadRowResult.findById(row._id).select('+payload').session(session);
    if (!current || current.status === 'COMMITTED') return;
    const data = JSON.parse(openUpload(Buffer.from(current.payload as any), `${job._id}:${current.rowNumber}`).toString('utf8'));
    await writeScope(user, String(job.institution));
    let studentId = data.existingStudent;
    if (studentId) {
     if (!await m.StudentInstitution.exists({ student: studentId, institution: job.institution, institutionStudentId: data.institutionStudentId, status: 'ACTIVE' }).session(session)) throw new AppError(409, 'STUDENT_ASSOCIATION_CHANGED', 'Student association changed');
    } else {
     const created = await createStudent(user, { institution: String(job.institution), institutionStudentId: data.institutionStudentId, displayName: data.displayName, dateOfBirth: data.dateOfBirth, apaarId: data.apaarId }, session); studentId = String(created.studentId);
    }
    const e = await createEnrolment(user, { student: studentId, allocation: data.allocation, institutionStudentId: data.institutionStudentId, admissionDate: data.admissionDate, startsOn: data.startsOn, endsOn: data.endsOn, entryType: data.entryType, idempotencyKey: `upload:${job._id}:${current.rowNumber}` }, session);
    await changeAdmission(user, String(e._id), 'activate', session);
    await m.UploadRowResult.updateOne({ _id: current._id }, { $set: { status: 'COMMITTED', student: studentId, enrolment: e._id, errorCodes: [] }, $unset: { payload: 1 } }, { session });
   });
  } catch (error: any) { await m.UploadRowResult.updateOne({ _id: row._id, status: { $ne: 'COMMITTED' } }, { $set: { status: 'FAILED', errorCodes: [error instanceof AppError ? error.code : error.code === 11000 ? 'DUPLICATE_SUBMISSION' : 'ROW_PROCESSING_FAILED'] } }); }
 }
 const committedRows = await m.UploadRowResult.countDocuments({ job: job._id, status: 'COMMITTED' });
 const failed = await m.UploadRowResult.countDocuments({ job: job._id, status: { $in: ['INVALID', 'FAILED'] } });
 await m.UploadJob.updateOne({ _id: job._id, leaseToken: job.leaseToken }, { $set: { status: failed ? 'PARTIAL' : 'COMPLETED', committedRows, leaseUntil: null }, $unset: { leaseToken: 1 } });
}
export async function retryUpload(user: any, id: string) {
 const job = await jobAccess(user, id);
 if (job.payloadPurgedAt) throw new AppError(409, 'UPLOAD_PAYLOAD_EXPIRED', 'Upload staging has expired; submit a new file with a new idempotency key');
 if (job.status !== 'FAILED') throw new AppError(409, 'UPLOAD_NOT_FAILED', 'Only failed jobs can be retried');
 const stored = await m.UploadJob.findById(id);
 await m.UploadJob.updateOne({ _id: id, status: 'FAILED' }, { $set: { status: stored!.commitRequested ? 'COMMITTING' : 'PENDING', attempts: 0, leaseUntil: null }, $unset: { leaseToken: 1, failureCode: 1 } });
 await audit(user, 'UPLOAD_RETRY_REQUESTED', 'UploadJob', id, undefined, job.institution);
 return jobAccess(user, id);
}
export async function processNextUpload(): Promise<boolean> {
 await m.UploadJob.updateMany({ status: { $in: ['VALIDATING', 'COMMITTING'] }, attempts: { $gte: 3 }, leaseUntil: { $lt: new Date() } }, { $set: { status: 'FAILED', failureCode: 'WORKER_RETRY_EXHAUSTED', leaseUntil: null }, $unset: { leaseToken: 1 } });
 const leaseToken = randomUUID();
 const job = await m.UploadJob.findOneAndUpdate({ status: { $in: ['PENDING', 'VALIDATING', 'COMMITTING'] }, attempts: { $lt: 3 }, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] }, { $set: { leaseToken, leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { createdAt: 1 } }).select('+payload');
 if (!job) return false;
 let actor: any;
 const renew = async () => { const fresh = await m.User.findOne({ _id: job.submittedBy, active: true }); if (!fresh) throw new AppError(403, 'UPLOAD_ACTOR_UNAVAILABLE', 'Uploader account is unavailable'); await writeScope(fresh, String(job.institution)); if (actor) actor.role = fresh.role; const result = await m.UploadJob.updateOne({ _id: job._id, leaseToken }, { $set: { leaseUntil: new Date(Date.now() + 60000) } }); if (!result.matchedCount) throw new AppError(409, 'UPLOAD_LEASE_LOST', 'Upload lease was reassigned'); };
 try {
  const user = await m.User.findOne({ _id: job.submittedBy, active: true });
  if (!user) throw new AppError(403, 'UPLOAD_ACTOR_UNAVAILABLE', 'Uploader account is unavailable');
  await writeScope(user, String(job.institution)); actor = user;
  if (job.status === 'COMMITTING') await commit(job, user, renew);
  else { await m.UploadJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: 'VALIDATING' } }); await preview(job, user, renew); }
 } catch (error) {
  await m.UploadJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: 'FAILED', failureCode: error instanceof AppError ? error.code : 'UPLOAD_PROCESSING_FAILED', leaseUntil: null }, $unset: { leaseToken: 1 } });
 }
 return true;
}
