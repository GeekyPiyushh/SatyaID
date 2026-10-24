import { createRateLimiter } from '../utils/rate-limit';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { enrolmentSchema, objectId, pagination, day, code } from '../validators/batch2';
import * as service from '../services/admissions';
import { writeScope, audit } from '../services/student';
import * as m from '../models';
import { AppError } from '../utils/app-error';
export const enrolmentRouter = Router();
enrolmentRouter.use(authenticate, createRateLimiter('enrolments.1', { windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Request limit reached' } }); } }));
enrolmentRouter.param('id', (_req, _res, next, id) => objectId.safeParse(id).success ? next() : next(new AppError(422, 'VALIDATION_ERROR', 'Invalid enrolment reference')));
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
enrolmentRouter.post('/', validate(enrolmentSchema), async (_req, res) => { res.status(201); reply(res, await service.createEnrolment(res.locals.user, res.locals.validated)); });
enrolmentRouter.get('/', validate(z.object({ institution: objectId, ...pagination, program: objectId.optional(), academicYear: objectId.optional(), category: objectId.optional(), status: z.enum(['DRAFT', 'PENDING_VALIDATION', 'ACTIVE', 'UNDER_REVIEW', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED', 'REJECTED']).optional() }).strict(), 'query'), async (_req, res) => {
 const { page, limit, program, ...filter } = res.locals.validated; await writeScope(res.locals.user, filter.institution);
 const query: any = filter;
 if (program) query.offering = { $in: (await m.InstitutionProgram.find({ institution: filter.institution, program })).map(o => o._id) };
 const items = await m.Enrolment.find(query).select('-requestFingerprint').sort({ _id: 1 }).skip((page - 1) * limit).limit(limit);
 await audit(res.locals.user, 'ENROLMENT_LIST', 'Institution', filter.institution, undefined, filter.institution);
 reply(res, { items, total: await m.Enrolment.countDocuments(query), page, limit });
});
enrolmentRouter.get('/:id', async (req, res) => { const e = await service.enrolmentAccess(res.locals.user, String(req.params.id)); await audit(res.locals.user, 'ENROLMENT_READ', 'Enrolment', e._id, undefined, e.institution); const result = e.toObject(); delete result.requestFingerprint; reply(res, result); });
enrolmentRouter.get('/:id/history', async (req, res) => { await service.enrolmentAccess(res.locals.user, String(req.params.id)); reply(res, await m.EnrolmentHistory.find({ enrolment: req.params.id }).sort({ createdAt: 1 }).limit(100)); });
enrolmentRouter.patch('/:id', validate(z.object({ endsOn: day.optional(), status: z.enum(['PENDING_VALIDATION', 'UNDER_REVIEW', 'REJECTED']).optional(), reasonCode: code, version: z.number().int().positive() }).strict()), async (req, res) => {
 await service.enrolmentAccess(res.locals.user, String(req.params.id), true);
 reply(res, await mongoose.connection.transaction(async session => {
  const e = await m.Enrolment.findById(req.params.id).session(session); const v = res.locals.validated;
  if (!e || e.version !== v.version || !['DRAFT', 'PENDING_VALIDATION', 'UNDER_REVIEW'].includes(String(e.status))) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only current unactivated submissions can be edited');
  const allowed: Record<string, string[]> = { DRAFT: ['PENDING_VALIDATION', 'REJECTED'], PENDING_VALIDATION: ['UNDER_REVIEW', 'REJECTED'], UNDER_REVIEW: ['PENDING_VALIDATION', 'REJECTED'] };
  if (v.status && !allowed[String(e.status)]?.includes(v.status) || v.endsOn && new Date(v.endsOn) < e.startsOn!) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Invalid state or date transition');
  const fromStatus = e.status; if (v.status) e.status = v.status; if (v.endsOn) e.endsOn = new Date(v.endsOn); e.version = Number(e.version) + 1; await e.save({ session });
  await m.EnrolmentHistory.create([{ enrolment: e._id, actor: res.locals.user._id, fromStatus, toStatus: e.status, reasonCode: v.reasonCode }], { session }); await audit(res.locals.user, 'ADMISSION_UPDATED', 'Enrolment', e._id, session, e.institution); return e;
 }));
});
for (const operation of ['activate', 'withdraw'] as const) enrolmentRouter.post(`/:id/${operation}`, validate(z.object({}).strict()), async (req, res) => reply(res, await service.changeAdmission(res.locals.user, String(req.params.id), operation)));
