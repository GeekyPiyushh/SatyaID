import { z } from 'zod';
import { AppError } from '../utils/app-error';
const config = z.object({
 INVITATION_MAX_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
 CONSENT_MAX_SECONDS: z.coerce.number().int().min(60).max(2592000).default(604800),
 CREDENTIAL_MAX_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
});
export function regulatoryConfig() { const result = config.safeParse(process.env); if (!result.success) throw new AppError(503, 'REGULATORY_CONFIG_INVALID', 'Regulatory service configuration is invalid'); return result.data; }
