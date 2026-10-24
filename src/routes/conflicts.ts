import { createRateLimiter } from '../utils/rate-limit';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { objectId, pagination, code } from '../validators/batch2';
import * as m from '../models';
import { conflictAccess, conflictFilter, conflictView } from '../services/conflicts';
import { audit } from '../services/student';
import { AppError } from '../utils/app-error';
export const conflictRouter = Router();
conflictRouter.use(authenticate, createRateLimiter('conflictRouter', { windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Request limit reached' } }); } }));
conflictRouter.param('id', (_req, _res, next, id) => objectId.safeParse(id).success ? next() : next(new AppError(422, 'VALIDATION_ERROR', 'Invalid conflict reference')));
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
const statuses = z.enum(['OPEN', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'RESOLVED', 'DISMISSED', 'ESCALATED']);
conflictRouter.get('/', validate(z.object({ ...pagination, status: statuses.optional() }).strict(), 'query'), async (_req, res) => {
 const v = res.locals.validated, filter: any = await conflictFilter(res.locals.user); if (v.status) filter.status = v.status;
 const cases = await m.EnrolmentConflict.find(filter).sort({ _id: 1 }).skip((v.page - 1) * v.limit).limit(v.limit);
 reply(res, { items: cases.map(c => conflictView(res.locals.user, c)), total: await m.EnrolmentConflict.countDocuments(filter), page: v.page, limit: v.limit });
});
conflictRouter.get('/:id', async (req, res) => { const c = await conflictAccess(res.locals.user, String(req.params.id)); await audit(res.locals.user, 'CONFLICT_READ', 'EnrolmentConflict', c._id); reply(res, conflictView(res.locals.user, c)); });
conflictRouter.get('/:id/history', validate(z.object(pagination).strict(), 'query'), async (req, res) => {
 const c = await conflictAccess(res.locals.user, String(req.params.id)); const { page, limit } = res.locals.validated;
 const history = await m.ConflictHistory.find({ conflict: c._id }).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit);
 reply(res, { items: res.locals.user.role === 'AICTE_ADMIN' ? history : history.map(h => ({ action: h.action, resolution: h.resolution, createdAt: h.createdAt })), total: await m.ConflictHistory.countDocuments({ conflict: c._id }), page, limit });
});
conflictRouter.post('/:id/evidence', validate(z.object({ institution: objectId.optional(), typeCode: code, protectedObjectReference: z.string().regex(/^evidence:[a-zA-Z0-9_.-]{1,100}$/) }).strict()), async (req, res) => {
 const c = await conflictAccess(res.locals.user, String(req.params.id)); const v = res.locals.validated;
 if (res.locals.user.role !== 'AICTE_ADMIN') {
  if (!v.institution || !(c.institutions as any[]).some(i => String(i) === v.institution) || !await m.InstitutionMembership.exists({ user: res.locals.user._id, institution: v.institution, active: true })) throw new AppError(403, 'FORBIDDEN', 'Evidence institution scope denied');
 }
 reply(res, await mongoose.connection.transaction(async session => {
  const [e] = await m.ConflictEvidence.create([{ conflict: c._id, actor: res.locals.user._id, ...v }], { session });
  await m.ConflictHistory.create([{ conflict: c._id, actor: res.locals.user._id, action: 'EVIDENCE_SUBMITTED', reasonCode: v.typeCode }], { session });
  await audit(res.locals.user, 'CONFLICT_EVIDENCE_SUBMITTED', 'EnrolmentConflict', c._id, session, v.institution); return { _id: e!._id, recorded: true };
 }));
});
conflictRouter.post('/:id/resolve', requireRoles('AICTE_ADMIN'), validate(z.object({ resolution: z.enum(['CONFIRMED_TRANSFER', 'LEGITIMATE_OVERLAP', 'DUPLICATE_SUBMISSION', 'DATA_ENTRY_ERROR', 'POLICY_VIOLATION_CONFIRMED', 'INSUFFICIENT_EVIDENCE']), reasonCode: code, version: z.number().int().positive() }).strict()), async (req, res) => {
 await conflictAccess(res.locals.user, String(req.params.id)); const v = res.locals.validated;
 reply(res, await mongoose.connection.transaction(async session => {
  const c = await m.EnrolmentConflict.findOneAndUpdate({ _id: req.params.id, version: v.version, status: { $nin: ['RESOLVED', 'DISMISSED'] } }, { $set: { status: 'RESOLVED', resolution: v.resolution, reasonCode: v.reasonCode }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
  if (!c) throw new AppError(409, 'CONFLICT_STATE_CHANGED', 'Conflict was resolved or changed');
  await m.ConflictHistory.create([{ conflict: c._id, actor: res.locals.user._id, action: 'RESOLVED', resolution: v.resolution, reasonCode: v.reasonCode }], { session });
  await audit(res.locals.user, 'CONFLICT_RESOLVED', 'EnrolmentConflict', c._id, session); return conflictView(res.locals.user, c);
 }));
});
conflictRouter.patch('/:id', requireRoles('AICTE_ADMIN'), validate(z.object({ status: z.enum(['UNDER_REVIEW', 'AWAITING_EVIDENCE', 'ESCALATED']), assignedReviewer: objectId.optional(), version: z.number().int().positive() }).strict()), async (req, res) => {
 const v = res.locals.validated;
 if (v.assignedReviewer && !await m.User.exists({ _id: v.assignedReviewer, role: 'AICTE_ADMIN', active: true })) throw new AppError(422, 'INVALID_REVIEWER', 'Reviewer must be an active regulator');
 reply(res, await mongoose.connection.transaction(async session => {
  const c = await m.EnrolmentConflict.findOneAndUpdate({ _id: req.params.id, version: v.version, status: { $nin: ['RESOLVED', 'DISMISSED'] } }, { $set: { status: v.status, ...(v.assignedReviewer ? { assignedReviewer: v.assignedReviewer } : {}) }, $inc: { version: 1 } }, { session, returnDocument: 'after' });
  if (!c) throw new AppError(409, 'CONFLICT_STATE_CHANGED', 'Conflict changed or is closed');
  await m.ConflictHistory.create([{ conflict: c._id, actor: res.locals.user._id, action: v.status }], { session }); await audit(res.locals.user, 'CONFLICT_REVIEW_UPDATED', 'EnrolmentConflict', c._id, session); return conflictView(res.locals.user, c);
 }));
});
