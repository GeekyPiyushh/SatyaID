import 'dotenv/config';
import { isIP } from 'node:net';
import { validateConfiguredKeys } from '../security/keys';
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
  CSRF_SECRET: z.string().min(32).optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().regex(/^\.?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/).optional(),
  COOKIE_PATH: z.string().regex(/^\/[A-Za-z0-9/_-]*$/).default('/api/v1/auth/browser'),
  TRUST_PROXY: z.string().default('').transform(v => v.split(',').map(s => s.trim()).filter(Boolean)).pipe(z.array(z.string().refine(v => {
    const [host, bits] = v.split('/'); const family = host ? isIP(host) : 0;
    return Boolean(family) && (bits === undefined || /^\d+$/.test(bits) && Number(bits) > 0 && Number(bits) <= (family === 4 ? 32 : 128));
  }, 'Explicit IP/CIDR trust required; blanket trust is forbidden'))),
  JWT_ISSUER: z.string().default('satyaid'),
  JWT_AUDIENCE: z.string().default('satyaid-api'),
  MONGODB_URI: z.string().optional().refine((value) => {
    if (value === undefined) return true;
    try { const url = new URL(value); return ['mongodb:', 'mongodb+srv:'].includes(url.protocol) && Boolean(url.hostname) && url.pathname.length > 1 && !url.hash; }
    catch { return false; }
  }, 'Expected a MongoDB connection URL'),
});

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const normalized = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === '' ? undefined : v]));
  const result = schema.safeParse(normalized);
  if (!result.success) {
    // Field names only: validation input can contain credentials.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  const config = result.data;
  const browserBase = '/api/v1/auth/browser';
  if (!(config.COOKIE_PATH === '/' || config.COOKIE_PATH === browserBase || browserBase.startsWith(config.COOKIE_PATH.replace(/\/$/, '') + '/'))) throw new Error('Invalid environment configuration: COOKIE_PATH');
  if (config.COOKIE_SAME_SITE === 'none' && !(config.COOKIE_SECURE ?? config.NODE_ENV === 'production')) throw new Error('Invalid environment configuration: COOKIE_SECURE');
  if (config.NODE_ENV === 'production') {
    const weak = (v: string | undefined) => !v || new Set(v).size < 10 || /change.?me|your.?secret|development|test.?secret|placeholder/i.test(v);
    if (weak(config.JWT_SECRET) || weak(config.CSRF_SECRET) || !config.MONGODB_URI || config.COOKIE_SECURE === false || !config.CORS_ORIGINS.length || config.CORS_ORIGINS.some(v => !v.startsWith('https://'))) throw new Error('Invalid production configuration: signing/CSRF keys, MongoDB, HTTPS origins and secure cookies required');
  }
  try { validateConfiguredKeys(normalized); } catch { throw new Error('Invalid environment configuration: purpose-separated cryptographic keys/keyring'); }
  return config;
}
export type Environment = ReturnType<typeof parseEnvironment>;
