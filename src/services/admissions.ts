import mongoose, { ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import * as m from '../models';
import { AppError } from '../utils/app-error';
import { writeScope, audit } from './student';
import { detectConflicts } from './conflicts';
import { calculateQuota } from './management';
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function allocationContext(id: string, session?: ClientSession, requireActive = true) {
 const allocation = await m.IntakeAllocation.findById(id).session(session ?? null);
 if (!allocation) throw new AppError(422, 'INVALID_ALLOCATION', 'Approved allocation not found');
 const offering = await m.InstitutionProgram.findById(allocation.offering).session(session ?? null);
 if (!offering || requireActive && !offering.active) throw new AppError(422, 'INVALID_OFFERING', 'Program offering is unavailable');
 const institution = await m.Institution.findOne({ _id: offering.institution, ...(requireActive ? { status: 'ACTIVE' } : {}) }).session(session ?? null);
 const year = await m.AcademicYear.findById(allocation.academicYear).session(session ?? null);
 const category = await m.SeatCategory.findById(allocation.category).session(session ?? null);
 if (!institution || !year || !category) throw new AppError(422, 'INVALID_ALLOCATION_REFERENCE', 'Allocation configuration is incomplete');
 return { allocation, offering, year, category };
}
export async function enrolmentAccess(user: any, id: string, write = false) {
 const enrolment = await m.Enrolment.findById(id);
 if (!enrolment) throw new AppError(404, 'NOT_FOUND', 'Enrolment not found');
 if (user.role === 'STUDENT' && !write) {
  if (!await m.Student.exists({ _id: enrolment.student, user: user._id })) throw new AppError(403, 'FORBIDDEN', 'Enrolment access denied');
 } else await writeScope(user, String(enrolment.institution));
 return enrolment;
}
export async function createEnrolment(user: any, data: any, session?: ClientSession): Promise<any> {
 const context = await allocationContext(data.allocation, session);
 const institution = String(context.offering.institution);
 await writeScope(user, institution);
 if (!session) {
  try { return await mongoose.connection.transaction(s => createEnrolment(user, data, s)); }
  catch (error: any) {
   if (error.code !== 11000) throw error;
   const previous = await m.Enrolment.findOne({ institution, idempotencyKey: data.idempotencyKey });
   if (previous?.requestFingerprint === fingerprint(data)) return previous;
   throw new AppError(409, 'DUPLICATE_SUBMISSION', 'Admission submission already exists');
  }
 }
 const previous = await m.Enrolment.findOne({ institution, idempotencyKey: data.idempotencyKey }).session(session);
 if (previous) { if (previous.requestFingerprint !== fingerprint(data)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different request'); return previous; }
 if (!await m.StudentInstitution.exists({ student: data.student, institution, institutionStudentId: data.institutionStudentId, status: 'ACTIVE' }).session(session)) throw new AppError(422, 'INVALID_STUDENT_ASSOCIATION', 'Active institution-owned student profile required');
 const admission = new Date(data.admissionDate);
 if (admission < context.year.startsOn! || admission > context.year.endsOn! || new Date(data.startsOn) < context.year.startsOn! || new Date(data.startsOn) > context.year.endsOn!) throw new AppError(422, 'ACADEMIC_YEAR_MISMATCH', 'Admission and start dates must fall within the selected academic year');
 const locked = await m.Student.findOneAndUpdate({ _id: data.student }, { $inc: { lockVersion: 1 } }, { session });
 if (!locked) throw new AppError(422, 'INVALID_STUDENT', 'Student not found');
 if (await m.Enrolment.exists({ student: data.student, offering: context.offering._id, academicYear: context.year._id, status: { $nin: ['REJECTED', 'WITHDRAWN', 'TRANSFERRED'] } }).session(session)) throw new AppError(409, 'DUPLICATE_SUBMISSION', 'A submission already exists for this program and year');
 const [enrolment] = await m.Enrolment.create([{ ...data, requestFingerprint: fingerprint(data), institution, offering: context.offering._id, academicYear: context.year._id, category: context.category._id }], { session });
 await m.EnrolmentHistory.create([{ enrolment: enrolment!._id, actor: user._id, toStatus: 'DRAFT', reasonCode: 'ADMISSION_SUBMITTED' }], { session });
 await audit(user, 'ADMISSION_SUBMITTED', 'Enrolment', enrolment!._id, session, institution);
 return enrolment;
}
export async function changeAdmission(user: any, id: string, operation: 'activate' | 'withdraw' | 'transfer-out', existingSession?: ClientSession): Promise<any> {
 const scoped = !existingSession ? await enrolmentAccess(user, id, true) : null;
 const work = async (session: ClientSession) => {
  const e = await m.Enrolment.findById(id).session(session);
  if (!e) throw new AppError(404, 'NOT_FOUND', 'Enrolment not found');
  await writeScope(user, String(e.institution));
  const target = operation === 'activate' ? 'ACTIVE' : operation === 'transfer-out' ? 'TRANSFERRED' : 'WITHDRAWN';
  if (e.status === target) return e;
  if (operation === 'activate' && !['DRAFT', 'PENDING_VALIDATION'].includes(String(e.status)) || operation !== 'activate' && e.status !== 'ACTIVE') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Enrolment cannot make this transition');
  const { allocation, offering } = await allocationContext(String(e.allocation), session, operation === 'activate');
  await m.Student.updateOne({ _id: e.student }, { $inc: { lockVersion: 1 } }, { session });
  // Serialize allocation decisions against quota approval/retirement updates.
  await m.InstitutionProgram.updateOne({ _id: offering._id }, { $inc: { __v: 1 } }, { session });
  if (operation === 'activate') {
   const bases = await m.IntakeAllocation.find({ offering: allocation.offering, academicYear: allocation.academicYear, kind: 'BASE' }).session(session);
   const base = bases.reduce((sum, a) => sum + Number(a.approvedSeats), 0);
   const rules = await m.QuotaRule.find({ offering: allocation.offering, academicYear: allocation.academicYear, category: allocation.category, kind: allocation.kind, approvalStatus: 'APPROVED', effectiveFrom: { $lte: new Date() }, effectiveUntil: { $gt: new Date() } }).session(session);
   const ceiling = Math.min(Number(allocation.approvedSeats), ...rules.map(r => calculateQuota(r as any, base)));
   const reserved = await m.IntakeAllocation.updateOne({ _id: allocation._id, occupiedSeats: { $lt: ceiling }, $expr: { $lt: ['$occupiedSeats', '$approvedSeats'] } }, { $inc: { occupiedSeats: 1, version: 1 } }, { session });
   if (reserved.modifiedCount !== 1) throw new AppError(409, 'CAPACITY_EXHAUSTED', 'The applicable approved seat capacity is exhausted');
   await m.SeatReservation.create([{ enrolment: e._id, allocation: allocation._id, quotaRule: rules[0]?._id }], { session });
  } else {
   const released = await m.SeatReservation.updateOne({ enrolment: e._id, status: 'ACTIVE' }, { $set: { status: 'RELEASED', releasedAt: new Date() } }, { session });
   if (released.modifiedCount !== 1) throw new AppError(409, 'RESERVATION_INCONSISTENT', 'Reservation requires regulatory reconciliation');
   const counter = await m.IntakeAllocation.updateOne({ _id: allocation._id, occupiedSeats: { $gt: 0 } }, { $inc: { occupiedSeats: -1, version: 1 } }, { session });
   if (counter.modifiedCount !== 1) throw new AppError(409, 'RESERVATION_INCONSISTENT', 'Capacity counter requires reconciliation');
  }
  const fromStatus = e.status; e.status = target; e.version = Number(e.version) + 1; await e.save({ session });
  await m.EnrolmentHistory.create([{ enrolment: e._id, actor: user._id, fromStatus, toStatus: target, reasonCode: operation === 'activate' ? 'SEAT_RESERVED' : operation === 'transfer-out' ? 'TRANSFER_RELEASED' : 'SEAT_RELEASED' }], { session });
  if (operation === 'activate') await detectConflicts(e, user, session);
  await audit(user, operation === 'activate' ? 'ADMISSION_ACTIVATED' : operation === 'transfer-out' ? 'ADMISSION_TRANSFERRED' : 'ADMISSION_WITHDRAWN', 'Enrolment', e._id, session, e.institution);
  return e;
 };
 if (existingSession) return work(existingSession);
 try { return await mongoose.connection.transaction(work); }
 catch (error) {
  if (error instanceof AppError) {
   try { await audit(user, `ADMISSION_REJECTED_${error.code}`, 'Enrolment', id, undefined, scoped?.institution); }
   catch { console.error('Admission rejection audit could not be recorded.'); }
  }
  throw error;
 }
}
