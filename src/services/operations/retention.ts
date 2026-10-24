import mongoose from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import * as m from '../../models';
import { AppError } from '../../utils/app-error';
import { audit } from '../student';
export interface RetentionOptions { cutoff: Date; apply?: boolean; actor?: any; now?: Date; limit?: number }
// Payload-only purge. Academic, consent, job outcomes and audit documents are never deleted.
export async function runRetention(options: RetentionOptions) {
 const now = options.now ?? new Date(), { cutoff, apply = false, actor } = options, limit = options.limit ?? 500;
 if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isFinite(cutoff.getTime()) || cutoff > new Date(now.getTime() - 30 * 86400000)) throw new AppError(422, 'RETENTION_POLICY_INVALID', 'Explicit cutoff must be at least 30 days old; limit 1–500');
 if (apply) {
  const name = mongoose.connection.name;
  if (process.env.NODE_ENV === 'production' || !/_(test|demo)$/.test(name) || process.env.ALLOW_RETENTION_APPLY !== 'true') throw new AppError(403, 'RETENTION_APPLY_DISABLED', 'Apply is limited to explicitly enabled synthetic databases');
  if (!actor || !await m.User.exists({ _id: actor._id, role: 'AICTE_ADMIN', active: true })) throw new AppError(403, 'FORBIDDEN', 'Active regulator required');
 }
 const summary = { uploadJobs: 0, uploadRows: 0, reports: 0, invitations: 0, credentials: 0 };
 const dormant = { updatedAt: { $lte: cutoff }, payloadPurgedAt: null, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }], status: { $in: ['PENDING', 'VALIDATED', 'COMPLETED', 'PARTIAL', 'FAILED'] } };
 const jobs = await m.UploadJob.find(dormant).select('_id').limit(limit).lean();
 for (const job of jobs) {
  // The job write fences confirmation/claiming; transaction conflicts retry against fresh eligibility.
  const counts = await mongoose.connection.transaction(async session => {
   const current = await m.UploadJob.findOne({ ...dormant, _id: job._id }).session(session); if (!current) return;
   const rows = await m.UploadRowResult.countDocuments({ job: job._id, payload: { $exists: true } }).session(session);
   const hasSource = await m.UploadJob.exists({ _id: job._id, payload: { $exists: true } }).session(session);
   if (!rows && !hasSource) return;
   if (apply) {
    await m.UploadJob.updateOne({ _id: job._id }, { $set: { payloadPurgedAt: now, status: ['PENDING', 'VALIDATED'].includes(String(current.status)) ? 'FAILED' : current.status, failureCode: 'UPLOAD_PAYLOAD_EXPIRED' }, $unset: { payload: 1 } }, { session });
    await m.UploadRowResult.updateMany({ job: job._id, payload: { $exists: true } }, { $unset: { payload: 1 } }, { session });
   }
   return { jobs: 1, rows };
  });
  if (counts) { summary.uploadJobs += counts.jobs; summary.uploadRows += counts.rows; }
 }
 const targets = [
  { model: m.ReportJob, key: 'reports', filter: { expiresAt: { $lte: cutoff }, payloadPurgedAt: null, content: { $exists: true }, status: { $in: ['COMPLETED', 'FAILED'] } }, update: { $unset: { content: 1 }, $set: { payloadPurgedAt: now } } },
  { model: m.VerificationInvitation, key: 'invitations', filter: { expiresAt: { $lte: cutoff }, tokenPurgedAt: null }, update: null },
  { model: m.DigitalCredential, key: 'credentials', filter: { expiresAt: { $lte: cutoff }, tokenPurgedAt: null }, update: null },
 ];
 for (const target of targets) {
  const ids = await target.model.find(target.filter).select('_id').limit(limit).lean();
  if (!apply) { summary[target.key as keyof typeof summary] = ids.length; continue; }
  for (const row of ids) {
   // Unique digest indexes remain valid: replace expired digests with unguessable tombstones.
   const field = target.key === 'invitations' ? 'digest' : 'tokenDigest';
   const update = target.update ?? { $set: { [field]: createHash('sha256').update(randomBytes(48)).digest('hex'), tokenPurgedAt: now } };
   const result = await target.model.updateOne({ ...target.filter, _id: row._id }, update);
   summary[target.key as keyof typeof summary]! += result.modifiedCount;
  }
 }
 if (apply) await audit(actor, 'RETENTION_PAYLOAD_PURGE', 'RetentionRun', new mongoose.Types.ObjectId());
 return { mode: apply ? 'APPLY' : 'DRY_RUN', cutoff: cutoff.toISOString(), limitPerCategory: limit, counts: summary, academicHistoryDeleted: false, repeatUntilCountsZero: true };
}
