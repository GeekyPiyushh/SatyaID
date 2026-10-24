import 'dotenv/config';
import { z } from 'zod';

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch { return false; }
}, 'Use exact HTTP(S) origins without paths or trailing slashes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z.string().default('').transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)).pipe(z.array(origin)),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().default('satyaid'),
  JWT_AUDIENCE: z.string().default('satyaid-api'),
  MONGODB_URI: z.string().optional().refine((value) => {
    if (value === undefined) return true;
    try { const url = new URL(value); return ['mongodb:', 'mongodb+srv:'].includes(url.protocol) && Boolean(url.hostname) && url.pathname.length > 1 && !url.hash; }
    catch { return false; }
  }, 'Expected a MongoDB connection URL'),
});

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Field names only: validation input can contain credentials.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
export type Environment = ReturnType<typeof parseEnvironment>;
