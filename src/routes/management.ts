import { createRateLimiter } from '../utils/rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles, institutionScope } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as m from '../models';
import { auditedWrite, exists, scopeOffering, capacity } from '../services/management';
import { AppError } from '../utils/app-error';
export const managementRouter = Router();
managementRouter.use(authenticate, createRateLimiter('managementRouter', { windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Request limit reached' } }); } }));
const admin = requireRoles('AICTE_ADMIN');
const id = z.string().regex(/^[a-f\d]{24}$/i);
const text = z.string().trim().min(1).max(200);
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
managementRouter.param('id', (req, _res, next, value) => { if (!id.safeParse(value).success) return next(new AppError(422, 'VALIDATION_ERROR', 'Invalid resource identifier')); next(); });
const institution = z.object({ pid: text, name: text, state: text, status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE') }).strict();
managementRouter.post('/institutions', admin, validate(institution), async (_req, res) => { res.status(201); reply(res, await auditedWrite(m.Institution, res.locals.validated, res.locals.user)); });
managementRouter.get('/institutions', validate(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), state: text.optional(), program: id.optional(), search: z.string().max(100).optional() }).strict(), 'query'), async (_req, res) => {
 const v = res.locals.validated; const filter: any = {};
 if (res.locals.user.role !== 'AICTE_ADMIN') filter._id = { $in: (await m.InstitutionMembership.find({ user: res.locals.user._id, active: true })).map(x => x.institution) };
 if (v.program) { const ids = (await m.InstitutionProgram.find({ program: v.program })).map(x => x.institution); filter._id = { $in: ids.filter(x => !filter._id || filter._id.$in.some((y: any) => String(y) === String(x))) }; }
 if (v.status) filter.status = v.status; if (v.state) filter.state = v.state;
 if (v.search) filter.name = { $regex: v.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
 reply(res, { items: await m.Institution.find(filter).sort({ _id: 1 }).skip((v.page - 1) * v.limit).limit(v.limit), total: await m.Institution.countDocuments(filter), page: v.page, limit: v.limit });
});
managementRouter.get('/institutions/:id', async (req, res) => { await institutionScope(res.locals.user, String(req.params.id)); const result = await m.Institution.findById(req.params.id); if (!result) throw new AppError(404, 'NOT_FOUND', 'Institution not found'); reply(res, result); });
managementRouter.patch('/institutions/:id', validate(institution.omit({ pid: true }).partial().refine(v => Object.keys(v).length > 0)), async (req, res) => { await institutionScope(res.locals.user, String(req.params.id), true); if (res.locals.user.role !== 'AICTE_ADMIN' && res.locals.validated.status !== undefined) throw new AppError(403, 'FORBIDDEN', 'Only AICTE can change institution status'); reply(res, await auditedWrite(m.Institution, res.locals.validated, res.locals.user, String(req.params.id))); });
const masters = [
 ['programs', m.Program, z.object({ code: text, name: text }).strict()],
 ['academic-years', m.AcademicYear, z.object({ code: text, startsOn: z.iso.datetime(), endsOn: z.iso.datetime() }).strict().refine(v => v.startsOn < v.endsOn, 'Invalid date range')],
 ['seat-categories', m.SeatCategory, z.object({ code: text, name: text }).strict()],
] as const;
for (const [path, model, schema] of masters) {
 managementRouter.get('/' + path, async (_req, res) => reply(res, await (model as any).find().sort({ _id: 1 }).limit(100)));
 managementRouter.post('/' + path, admin, validate(schema), async (_req, res) => { res.status(201); reply(res, await auditedWrite(model as any, res.locals.validated, res.locals.user)); });
 managementRouter.patch('/' + path + '/:id', admin, validate(schema), async (req, res) => reply(res, await auditedWrite(model as any, res.locals.validated, res.locals.user, String(req.params.id))));
}
managementRouter.post('/offerings', admin, validate(z.object({ institution: id, program: id }).strict()), async (_req, res) => { const v = res.locals.validated; await exists(m.Institution, v.institution); await exists(m.Program, v.program); res.status(201); reply(res, await auditedWrite(m.InstitutionProgram, v, res.locals.user)); });
managementRouter.get('/institutions/:id/offerings', async (req, res) => { await institutionScope(res.locals.user, String(req.params.id)); reply(res, await m.InstitutionProgram.find({ institution: req.params.id }).limit(100)); });
managementRouter.post('/institutions/:id/memberships', validate(z.object({ user: id, role: z.enum(['INSTITUTION_ADMIN', 'INSTITUTION_STAFF']), active: z.boolean().default(true) }).strict()), async (req, res) => { await institutionScope(res.locals.user, String(req.params.id), true); if (res.locals.user.role !== 'AICTE_ADMIN' && res.locals.validated.role !== 'INSTITUTION_STAFF') throw new AppError(403, 'FORBIDDEN', 'Only AICTE can appoint institution administrators'); if (!await m.User.exists({ _id: res.locals.validated.user, role: res.locals.validated.role, active: true })) throw new AppError(422, 'INVALID_MEMBERSHIP_ACCOUNT', 'Active account with matching institution role required'); res.status(201); reply(res, await auditedWrite(m.InstitutionMembership, { ...res.locals.validated, institution: req.params.id }, res.locals.user)); });
managementRouter.patch('/institutions/:id/memberships/:membershipId', admin, validate(z.object({ active: z.boolean() }).strict()), async (req, res) => { if (!id.safeParse(req.params.membershipId).success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid membership identifier'); const record = await m.InstitutionMembership.findOne({ _id: req.params.membershipId, institution: req.params.id }); if (!record) throw new AppError(404, 'NOT_FOUND', 'Membership not found'); reply(res, await auditedWrite(m.InstitutionMembership, res.locals.validated, res.locals.user, String(record._id))); });
const allocation = z.object({ offering: id, academicYear: id, category: id, kind: z.enum(['BASE', 'SUPERNUMERARY']), approvedSeats: z.number().int().min(0).max(1000000), sourceReference: text }).strict();
managementRouter.post('/intakes', admin, validate(allocation), async (_req, res) => { const v = res.locals.validated; await exists(m.InstitutionProgram, v.offering); await exists(m.AcademicYear, v.academicYear); await exists(m.SeatCategory, v.category); res.status(201); reply(res, await auditedWrite(m.IntakeAllocation, v, res.locals.user)); });
managementRouter.patch('/intakes/:id', admin, validate(z.object({ approvedSeats: z.number().int().min(0).max(1000000), sourceReference: text }).strict()), async (req, res) => {
 // Atomic predicate prevents reducing capacity below utilization.
 const current = await m.IntakeAllocation.findById(req.params.id); if (!current) throw new AppError(404, 'NOT_FOUND', 'Intake not found'); if (res.locals.validated.approvedSeats < Number(current.occupiedSeats)) throw new AppError(409, 'CAPACITY_CONFLICT', 'Capacity is below occupied seats');
 reply(res, await auditedWrite(m.IntakeAllocation, { ...res.locals.validated, version: current.version }, res.locals.user, String(current._id)));
});
const quota = z.object({ offering: id, academicYear: id, category: id, version: z.number().int().min(1), kind: z.enum(['BASE', 'SUPERNUMERARY']), method: z.enum(['FIXED', 'PERCENTAGE']), value: z.number().min(0).max(1000000), rounding: z.enum(['FLOOR', 'CEILING', 'HALF_UP']), effectiveFrom: z.iso.datetime(), effectiveUntil: z.iso.datetime(), sourceReference: text, approvalStatus: z.enum(['DRAFT', 'APPROVED', 'RETIRED']).default('DRAFT') }).strict().refine(v => v.effectiveFrom < v.effectiveUntil && (v.method !== 'PERCENTAGE' || v.value <= 100) && (v.method !== 'FIXED' || Number.isInteger(v.value)), 'Invalid quota configuration');
managementRouter.post('/quota-rules', admin, validate(quota), async (_req, res) => { const v = res.locals.validated; await exists(m.InstitutionProgram, v.offering); await exists(m.AcademicYear, v.academicYear); await exists(m.SeatCategory, v.category); res.status(201); reply(res, await auditedWrite(m.QuotaRule, v, res.locals.user)); });
managementRouter.get('/offerings/:id/capacity', validate(z.object({ academicYear: id }).strict(), 'query'), async (req, res) => reply(res, await capacity(res.locals.user, String(req.params.id), res.locals.validated.academicYear)));
managementRouter.get('/offerings/:id/quota-rules', async (req, res) => { await scopeOffering(res.locals.user, String(req.params.id)); reply(res, await m.QuotaRule.find({ offering: req.params.id }).limit(100)); });
managementRouter.get('/institutions/:id/intake-report', validate(z.object({ academicYear: id }).strict(), 'query'), async (req, res) => { await institutionScope(res.locals.user, String(req.params.id)); const offerings = await m.InstitutionProgram.find({ institution: req.params.id }).limit(100); reply(res, await Promise.all(offerings.map(o => capacity(res.locals.user, String(o._id), res.locals.validated.academicYear)))); });

managementRouter.patch('/offerings/:id', admin, validate(z.object({ active: z.boolean() }).strict()), async (req, res) => reply(res, await auditedWrite(m.InstitutionProgram, res.locals.validated, res.locals.user, String(req.params.id))));
managementRouter.patch('/quota-rules/:id/retire', admin, validate(z.object({}).strict()), async (req, res) => reply(res, await auditedWrite(m.QuotaRule, { approvalStatus: 'RETIRED' }, res.locals.user, String(req.params.id))));
