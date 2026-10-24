import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createRateLimiter } from '../../utils/rate-limit';
import { authenticate, requireRoles } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { objectId, code, name, pagination } from '../../validators/batch2';
import { claimSet } from '../../validators/regulatory';
import * as m from '../../models';
import * as service from '../../services/regulatory/consent';
import * as credentials from '../../services/regulatory/credentials';
import { audit } from '../../services/student';
import { AppError } from '../../utils/app-error';
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
const lifetime = z.number().int().min(60).max(2592000);
function router() {
 const r = Router(); r.use(authenticate, createRateLimiter('consent.1', { windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Verification workflow limit reached' } }); } }));
 r.param('id', (_req, _res, next, id) => objectId.safeParse(id).success ? next() : next(new AppError(404, 'VERIFICATION_UNAVAILABLE', 'Verification reference is unavailable'))); return r;
}
export const verificationRouter = router();
export const consentRouter = router();
export const credentialRouter = router();
verificationRouter.post('/employers', requireRoles('AICTE_ADMIN'), validate(z.object({ user: objectId, organization: name, status: z.enum(['APPROVED', 'SUSPENDED']), approvalReference: code }).strict()), async (_req, res) => {
 const v = res.locals.validated;
 if (!await m.User.exists({ _id: v.user, role: 'EMPLOYER', active: true })) throw new AppError(422, 'EMPLOYER_UNAVAILABLE', 'Active employer account required');
 reply(res, await mongoose.connection.transaction(async session => {
  const employer = await m.EmployerProfile.findOneAndUpdate({ user: v.user }, { $set: v }, { upsert: true, session, returnDocument: 'after', runValidators: true }); await audit(res.locals.user, 'EMPLOYER_AUTHORIZATION_UPDATED', 'EmployerProfile', employer!._id, session); return { employerId: v.user, organization: employer!.organization, status: employer!.status };
 }));
});
verificationRouter.post('/invitations', validate(z.object({ enrolment: objectId, employer: objectId, claims: claimSet, expiresInSeconds: lifetime.default(900) }).strict()), async (_req, res) => { res.status(201); reply(res, await service.createInvitation(res.locals.user, res.locals.validated)); });
verificationRouter.post('/requests', validate(z.object({ invitationToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/), purposeCode: code, claims: claimSet, expiresInSeconds: lifetime.default(86400) }).strict()), async (_req, res) => { res.status(201); reply(res, await service.createVerificationRequest(res.locals.user, res.locals.validated)); });
verificationRouter.get('/requests', validate(z.object(pagination).strict(), 'query'), async (_req, res) => {
 await service.authorizedEmployer(res.locals.user); const { page, limit } = res.locals.validated;
 reply(res, { items: await m.VerificationRequest.find({ requester: res.locals.user._id }).select('_id purposeCode requestedClaims status expiresAt createdAt').sort({ _id: -1 }).skip((page - 1) * limit).limit(limit), total: await m.VerificationRequest.countDocuments({ requester: res.locals.user._id }), page, limit });
});
verificationRouter.get('/requests/:id/result', async (req, res) => reply(res, await service.verificationResult(res.locals.user, String(req.params.id))));
consentRouter.get('/requests', validate(z.object(pagination).strict(), 'query'), async (_req, res) => {
 const student = await service.linkedStudent(res.locals.user); const { page, limit } = res.locals.validated;
 const result = await m.VerificationRequest.aggregate([{ $match: { student: student._id } }, { $sort: { _id: -1 } }, { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $lookup: { from: m.ConsentRequest.collection.name, localField: '_id', foreignField: 'verificationRequest', as: '_consent' } }, { $unwind: '$_consent' }, { $lookup: { from: m.ConsentGrant.collection.name, localField: '_consent._id', foreignField: 'request', as: '_grant' } }, { $lookup: { from: m.EmployerProfile.collection.name, localField: 'requester', foreignField: 'user', as: '_employer' } }, { $project: { _id: 1, consentRequestId: '$_consent._id', status: '$_consent.status', authorizedClaims: { $ifNull: [{ $arrayElemAt: ['$_grant.fields', 0] }, []] }, consentExpiresAt: { $arrayElemAt: ['$_grant.expiresAt', 0] }, revokedAt: { $arrayElemAt: ['$_grant.revokedAt', 0] }, purposeCode: 1, requestedClaims: 1, expiresAt: 1, enrolment: 1, employerOrganization: { $arrayElemAt: ['$_employer.organization', 0] } } }], total: [{ $count: 'count' }] } }]).option({ maxTimeMS: 5000 });
 reply(res, { items: result[0]?.items ?? [], total: result[0]?.total[0]?.count ?? 0, page, limit });
});
consentRouter.get('/history', validate(z.object(pagination).strict(), 'query'), async (_req, res) => {
 const student = await service.linkedStudent(res.locals.user); const { page, limit } = res.locals.validated;
 const events = await m.VerificationEvent.aggregate([{ $lookup: { from: m.VerificationRequest.collection.name, localField: 'request', foreignField: '_id', as: '_request' } }, { $match: { '_request.student': student._id } }, { $sort: { _id: -1 } }, { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { eventCode: 1, claimTypes: 1, createdAt: 1, request: 1, outcome: 1 } }], total: [{ $count: 'count' }] } }]).option({ maxTimeMS: 5000 });
 reply(res, { items: events[0]?.items ?? [], total: events[0]?.total[0]?.count ?? 0, page, limit });
});
consentRouter.post('/:id/approve', validate(z.object({ claims: claimSet, expiresInSeconds: lifetime.default(3600) }).strict()), async (req, res) => reply(res, await service.decideConsent(res.locals.user, String(req.params.id), 'approve', res.locals.validated)));
for (const op of ['reject', 'revoke'] as const) consentRouter.post(`/:id/${op}`, validate(z.object({}).strict()), async (req, res) => reply(res, await service.decideConsent(res.locals.user, String(req.params.id), op, {})));
credentialRouter.post('/', validate(z.object({ request: objectId, claims: claimSet.optional(), expiresInSeconds: lifetime.default(3600) }).strict()), async (_req, res) => { res.status(201); reply(res, await credentials.issueCredential(res.locals.user, res.locals.validated)); });
credentialRouter.post('/verify', validate(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{64}$/) }).strict()), async (_req, res) => reply(res, await credentials.verifyCredential(res.locals.user, res.locals.validated.token)));
credentialRouter.get('/:id', async (req, res) => reply(res, await credentials.credentialMetadata(res.locals.user, String(req.params.id))));
credentialRouter.post('/:id/revoke', validate(z.object({}).strict()), async (req, res) => reply(res, await credentials.revokeCredential(res.locals.user, String(req.params.id))));
