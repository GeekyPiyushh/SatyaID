import { createRateLimiter } from '../../utils/rate-limit';
import { Router } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { analyticsFilters, pagedFilters } from '../../validators/regulatory';
import { objectId } from '../../validators/batch2';
import * as service from '../../services/regulatory/analytics';
import { AppError } from '../../utils/app-error';
export const analyticsRouter = Router();
analyticsRouter.use(authenticate, createRateLimiter('analyticsRouter', { windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Request limit reached' } }); } }));
analyticsRouter.param('id', (_req, _res, next, id) => objectId.safeParse(id).success ? next() : next(new AppError(422, 'VALIDATION_ERROR', 'Invalid institution reference')));
const reply = (res: any, data: unknown) => res.json({ success: true, message: 'Success', data });
analyticsRouter.get('/national/overview', requireRoles('AICTE_ADMIN'), validate(analyticsFilters, 'query'), async (_req, res) => reply(res, await service.overview(res.locals.user, res.locals.validated)));
analyticsRouter.get('/institutions/:id/overview', validate(analyticsFilters, 'query'), async (req, res) => {
 const f = { ...res.locals.validated, institution: String(req.params.id) };
 reply(res, { ...await service.overview(res.locals.user, f), utilization: await service.breakdown(res.locals.user, f, 1, 100), breakdownLimit: 100 });
});
analyticsRouter.get('/enrolments/trends', validate(analyticsFilters, 'query'), async (_req, res) => reply(res, await service.trends(res.locals.user, res.locals.validated)));
analyticsRouter.get('/intake-utilization', validate(pagedFilters, 'query'), async (_req, res) => { const { page, limit, ...f } = res.locals.validated; reply(res, await service.breakdown(res.locals.user, f, page, limit)); });
for (const type of ['conflicts', 'uploads'] as const) analyticsRouter.get(`/${type}/summary`, validate(analyticsFilters, 'query'), async (_req, res) => {
 await service.analyticsScope(res.locals.user, res.locals.validated);
 const f = res.locals.validated;
 const model = type === 'conflicts' ? (await import('../../models')).EnrolmentConflict : (await import('../../models')).UploadJob;
 reply(res, { observedAt: new Date().toISOString(), filters: f, applicableFilters: type === 'uploads' ? ['institution', 'state', 'from', 'to'] : Object.keys(f), items: await service.aggregate(model, [...(type === 'conflicts' ? service.conflictStages(f) : service.uploadStages(f)), { $group: { _id: '$status', count: { $sum: 1 } } }]) });
});
