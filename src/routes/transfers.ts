import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { objectId, code, day } from '../validators/batch2';
import * as m from '../models';
import { allocationContext, enrolmentAccess, createEnrolment, changeAdmission, fingerprint } from '../services/admissions';
import { audit } from '../services/student';
import { AppError } from '../utils/app-error';
export const transferRouter = Router();
transferRouter.use(authenticate);
transferRouter.param('id', (_req, _res, next, id) => objectId.safeParse(id).success ? next() : next(new AppError(422, 'VALIDATION_ERROR', 'Invalid transfer reference')));
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
async function access(user: any, id: string) {
 const transfer = await m.TransferRequest.findById(id); if (!transfer) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
 if (user.role !== 'AICTE_ADMIN' && (!['INSTITUTION_ADMIN', 'INSTITUTION_STAFF'].includes(user.role) || !await m.InstitutionMembership.exists({ user: user._id, institution: { $in: [transfer.sourceInstitution, transfer.targetInstitution] }, active: true }))) throw new AppError(403, 'FORBIDDEN', 'Transfer access denied');
 return transfer;
}
function view(user: any, t: any) { if (user.role === 'AICTE_ADMIN') return t; return { _id: t._id, status: t.status, startsOn: t.startsOn, createdAt: t.createdAt }; }
transferRouter.post('/', validate(z.object({ sourceEnrolment: objectId, targetAllocation: objectId, targetInstitutionStudentId: code, startsOn: day, admissionDate: day, idempotencyKey: code, reasonCode: code }).strict()), async (_req, res) => {
 const v = res.locals.validated; const source = await enrolmentAccess(res.locals.user, v.sourceEnrolment, true);
 if (source.status !== 'ACTIVE') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Transfer requires an active source enrolment');
 const target = await allocationContext(v.targetAllocation);
 if (String(source.institution) === String(target.offering.institution) || new Date(v.startsOn) < source.startsOn!) throw new AppError(422, 'INVALID_TRANSFER', 'Target institution or transfer period is invalid');
 const existing = await m.TransferRequest.findOne({ sourceEnrolment: v.sourceEnrolment, idempotencyKey: v.idempotencyKey }).select('+fingerprint');
 if (existing) { if (existing.fingerprint !== fingerprint(v)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Transfer key was used for different content'); reply(res, view(res.locals.user, existing)); return; }
 const result = await mongoose.connection.transaction(async session => {
  const [t] = await m.TransferRequest.create([{ ...v, sourceInstitution: source.institution, targetInstitution: target.offering.institution, requestedBy: res.locals.user._id, fingerprint: fingerprint(v) }], { session });
  await audit(res.locals.user, 'TRANSFER_REQUESTED', 'TransferRequest', t!._id, session, source.institution); return t;
 }); res.status(201); reply(res, view(res.locals.user, result));
});
transferRouter.get('/:id', async (req, res) => { const t = await access(res.locals.user, String(req.params.id)); await audit(res.locals.user, 'TRANSFER_READ', 'TransferRequest', t._id); reply(res, view(res.locals.user, t)); });
for (const operation of ['approve', 'reject'] as const) transferRouter.post(`/:id/${operation}`, requireRoles('AICTE_ADMIN'), validate(z.object({ reasonCode: code }).strict()), async (req, res) => {
 await access(res.locals.user, String(req.params.id));
 reply(res, await mongoose.connection.transaction(async session => {
  const t = await m.TransferRequest.findById(req.params.id).session(session); if (!t) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  const state = operation === 'approve' ? 'APPROVED' : 'REJECTED'; if (t.status === state) return t;
  if (t.status !== 'REQUESTED') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Transfer has already been decided');
  if (operation === 'approve') {
   const source = await m.Enrolment.findById(t.sourceEnrolment).session(session);
   if (!source || source.status !== 'ACTIVE') throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Source is no longer active');
   // The regulator must establish the target institution association through the student API first.
   const draft = await createEnrolment(res.locals.user, { student: String(source.student), allocation: String(t.targetAllocation), institutionStudentId: t.targetInstitutionStudentId, admissionDate: t.admissionDate!.toISOString().slice(0, 10), startsOn: t.startsOn!.toISOString().slice(0, 10), entryType: 'TRANSFER', idempotencyKey: `transfer:${t._id}` }, session);
   await changeAdmission(res.locals.user, String(source._id), 'transfer-out', session);
   await m.Enrolment.updateOne({ _id: source._id }, { $set: { endsOn: t.startsOn } }, { session });
   await m.Enrolment.updateOne({ _id: draft._id }, { $set: { transferFrom: source._id } }, { session });
   await changeAdmission(res.locals.user, String(draft._id), 'activate', session); t.targetEnrolment = draft._id;
  }
  t.status = state; t.reviewedBy = res.locals.user._id; t.reasonCode = res.locals.validated.reasonCode; await t.save({ session });
  await audit(res.locals.user, operation === 'approve' ? 'TRANSFER_APPROVED' : 'TRANSFER_REJECTED', 'TransferRequest', t._id, session); return t;
 }));
});
