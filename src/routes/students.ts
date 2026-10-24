import { certificatePrintData } from '../services/certificate-print';
import { printDataSchema } from '../validators/certificate-print';
import { profileView } from '../validators/student-status';
import { assessIdentity } from '../services/identity-policy';
import { createRateLimiter } from '../utils/rate-limit';
import { verifyStudentIdentity } from '../services/verification';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as m from '../models';
import * as service from '../services/student';
import { createStudentSchema, updateStudentSchema, pagination, objectId, apaar } from '../validators/batch2';
import { AppError } from '../utils/app-error';
export const studentRouter = Router();
studentRouter.use(authenticate, createRateLimiter('students.1', { windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Request limit reached' } }); } }));
studentRouter.param('id', (_req, _res, next, value) => objectId.safeParse(value).success ? next() : next(new AppError(422, 'VALIDATION_ERROR', 'Invalid student reference')));
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
studentRouter.post('/', validate(createStudentSchema), async (_req, res) => { res.status(201); reply(res, await service.createStudent(res.locals.user, res.locals.validated)); });
studentRouter.get('/', validate(z.object({ institution: objectId, ...pagination, search: z.string().max(80).optional() }).strict(), 'query'), async (_req, res) => {
 const v = res.locals.validated; await service.writeScope(res.locals.user, v.institution);
 const filter: any = { institution: v.institution }; if (v.search) filter.institutionStudentId = v.search;
 const items = await m.StudentInstitution.find(filter).sort({ _id: 1 }).skip((v.page - 1) * v.limit).limit(v.limit).lean();
 await service.audit(res.locals.user, 'STUDENT_LIST', 'Institution', v.institution, undefined, v.institution);
 reply(res, { items: items.map(profileView), total: await m.StudentInstitution.countDocuments(filter), page: v.page, limit: v.limit });
});
const scopeQuery = z.object({ institution: objectId.optional() }).strict();
studentRouter.get('/:id', validate(scopeQuery, 'query'), async (req, res) => reply(res, await service.readStudent(res.locals.user, String(req.params.id), res.locals.validated.institution)));
studentRouter.get('/:id/identity-status', validate(scopeQuery, 'query'), async (req, res) => {
 const { student } = await service.studentAccess(res.locals.user, String(req.params.id), res.locals.validated.institution);
 await service.audit(res.locals.user, 'IDENTITY_STATUS_READ', 'Student', student._id);
 const event = await m.IdentityVerificationEvent.findOne({ student: student._id }).sort({ createdAt: -1 }).select('provider providerVersion reasonCode createdAt status');
 reply(res, { identityStatus: student.identityStatus, latestEvent: event, official: false, identityAssessment: await assessIdentity(String(student._id), String(student.identityStatus)) });
});
studentRouter.patch('/:id', validate(updateStudentSchema), async (req, res) => {
 const { institution, version, ...changes } = res.locals.validated;
 await service.studentAccess(res.locals.user, String(req.params.id), institution, true);
 const result = await mongoose.connection.transaction(async session => {
  const profile = await m.StudentInstitution.findOneAndUpdate({ student: req.params.id, institution, version }, { $set: changes, $inc: { version: 1 } }, { returnDocument: 'after', runValidators: true, session });
  if (!profile) throw new AppError(409, 'WRITE_CONFLICT', 'Profile changed or does not exist');
  await service.audit(res.locals.user, 'STUDENT_PROFILE_UPDATED', 'Student', req.params.id, session, institution); return profile;
 }); reply(res, profileView(result));
});
studentRouter.post('/:id/apaar/link', validate(z.object({ institution: objectId, apaarId: apaar }).strict()), async (req, res) => { await service.linkIdentity(res.locals.user, String(req.params.id), res.locals.validated.institution, res.locals.validated.apaarId); reply(res, { linked: true }); });
studentRouter.post('/:id/account-link', requireRoles('AICTE_ADMIN'), validate(z.object({ user: objectId }).strict()), async (req, res) => {
 await service.studentAccess(res.locals.user, String(req.params.id));
 if (!await m.User.exists({ _id: res.locals.validated.user, role: 'STUDENT', active: true })) throw new AppError(422, 'INVALID_STUDENT_ACCOUNT', 'An active student account is required');
 const result = await mongoose.connection.transaction(async session => {
  const student = await m.Student.findOneAndUpdate({ _id: req.params.id, $or: [{ user: null }, { user: res.locals.validated.user }] }, { $set: { user: res.locals.validated.user } }, { returnDocument: 'after', session });
  if (!student) throw new AppError(409, 'ACCOUNT_ALREADY_LINKED', 'Account correction requires review');
  await service.audit(res.locals.user, 'STUDENT_ACCOUNT_LINKED', 'Student', req.params.id, session); return { linked: true };
 }); reply(res, result);
});

studentRouter.post('/:id/verify-apaar', createRateLimiter('students.2', { windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Verification limit reached' } }); } }), validate(z.object({ institution: objectId }).strict()), async (req, res) => reply(res, await verifyStudentIdentity(res.locals.user, String(req.params.id), res.locals.validated.institution)));

studentRouter.post('/:id/certificate-print-data', requireRoles('INSTITUTION_ADMIN'), validate(printDataSchema), async (req, res) => {
 res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Expires: '0' });
 reply(res, await certificatePrintData(res.locals.user, String(req.params.id), res.locals.validated));
});
