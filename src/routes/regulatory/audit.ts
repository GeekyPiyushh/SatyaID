import { createRateLimiter } from '../../utils/rate-limit';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles, institutionScope } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { objectId, pagination, day } from '../../validators/batch2';
import { AuditEvent } from '../../models';
import { verifyAuditSignature } from '../../utils/audit-integrity';
import { AppError } from '../../utils/app-error';
export const auditRouter = Router();
auditRouter.use(authenticate, createRateLimiter('auditRouter', { windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Request limit reached' } }); } }));
const filters = z.object({ institution: objectId.optional(), from: day.optional(), to: day.optional(), ...pagination }).strict().refine(v => !v.from || !v.to || v.from <= v.to);
async function scope(user: any, v: any) {
 if (user.role !== 'AICTE_ADMIN') { if (user.role !== 'INSTITUTION_ADMIN' || !v.institution) throw new AppError(403, 'FORBIDDEN', 'Scoped institution administrator access required'); await institutionScope(user, v.institution, true); }
 const match: any = {}; if (v.institution) match.institution = v.institution;
 if (v.from || v.to) match.occurredAt = { ...(v.from ? { $gte: new Date(v.from) } : {}), ...(v.to ? { $lt: new Date(new Date(v.to).getTime() + 86400000) } : {}) }; return match;
}
auditRouter.get('/events', validate(filters, 'query'), async (_req, res) => {
 const v = res.locals.validated; const match = await scope(res.locals.user, v);
 const projection = res.locals.user.role === 'AICTE_ADMIN' ? '-integrityTag -__v' : 'actorRole action resourceType resourceId occurredAt outcome correlationId integrityVersion';
 res.json({ success: true, message: 'Success', data: { items: await AuditEvent.find(match).select(projection).sort({ _id: -1 }).skip((v.page - 1) * v.limit).limit(v.limit), total: await AuditEvent.countDocuments(match), page: v.page, limit: v.limit } });
});
auditRouter.get('/integrity', requireRoles('AICTE_ADMIN'), validate(filters, 'query'), async (_req, res) => {
 const v = res.locals.validated; const match = await scope(res.locals.user, v);
 const events = await AuditEvent.find(match).select('+integrityTag').sort({ _id: -1 }).skip((v.page - 1) * v.limit).limit(v.limit);
 const checks = events.map(event => ({ eventId: event._id, status: verifyAuditSignature(event) }));
 res.json({ success: true, message: 'Success', data: { checks, checked: checks.length, page: v.page, limit: v.limit, guarantee: 'Per-event HMAC field-tampering detection when the signing key remains trusted. Not a hash chain; does not detect event deletion, reordering, or privileged rewrite with the key. Coverage is this requested page only.' } });
});
