import { z } from 'zod';
import { objectId, code } from './batch2';
export const printAuthorizationSchema = z.object({ status: z.enum(['APPROVED','SUSPENDED']), authorityReference: code, expiresAt: z.iso.datetime() }).strict().refine(v => v.status === 'SUSPENDED' || new Date(v.expiresAt) > new Date() && new Date(v.expiresAt).getTime() <= Date.now() + 366 * 86400000, 'Approval expiry must be future and within366 days');
export const printConsentSchema = z.object({ expiresInSeconds: z.number().int().min(60).max(86400).default(900) }).strict();
export const printDataSchema = z.object({ institution: objectId, enrolment: objectId, disclosure: z.enum(['REDACTED','FULL']).default('REDACTED'), consentId: objectId.optional(), purposeCode: z.literal('CERTIFICATE_PRINT_PREPARATION') }).strict().refine(v => v.disclosure !== 'FULL' || Boolean(v.consentId), 'Full disclosure needs an explicit student consent reference');
