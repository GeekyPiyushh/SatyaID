import { z } from 'zod';
import { objectId, day, pagination } from './batch2';
export const analyticsFilters = z.object({ institution: objectId.optional(), academicYear: objectId.optional(), program: objectId.optional(), category: objectId.optional(), state: z.string().trim().min(1).max(100).optional(), from: day.optional(), to: day.optional() }).strict().refine(v => !v.from || !v.to || v.from <= v.to, 'Invalid date range');
export const pagedFilters = analyticsFilters.safeExtend(pagination);
export type AnalyticsFilters = z.infer<typeof analyticsFilters>;
export const claims = ['INSTITUTION', 'PROGRAM', 'ENROLMENT_STATUS', 'ACADEMIC_YEAR', 'START_DATE', 'ADMISSION_DATE'] as const;
export const claimSet = z.array(z.enum(claims)).min(1).max(claims.length).refine(v => new Set(v).size === v.length, 'Duplicate claims');
