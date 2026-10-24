import { AppError } from '../utils/app-error';
export type IdentityKey = { encryption: string; lookup: string; version: string };
const versionId = /^[A-Za-z0-9_.-]{1,63}$/;
export function decodeKey(raw: string, field = 'encryption key') {
 const key = Buffer.from(raw, 'base64');
 if (key.length !== 32 || key.toString('base64') !== raw) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', `Invalid ${field} format; expected canonical base64 of 32 bytes`);
 return key;
}
function jsonMap(raw: string | undefined, field: string): Record<string, any> {
 if (!raw) return {};
 try { const obj = JSON.parse(raw); if (!obj || Array.isArray(obj) || typeof obj !== 'object' || Object.keys(obj).length > 16) throw new Error(); return obj; }
 catch { throw new AppError(503, 'KEY_CONFIGURATION_INVALID', `Invalid ${field}`); }
}
export function identityKeyring(env: NodeJS.ProcessEnv = process.env) {
 const ring: Record<string, IdentityKey> = Object.create(null);
 for (const [version, item] of Object.entries(jsonMap(env.APAAR_KEYRING_JSON, 'APAAR_KEYRING_JSON'))) {
  if (!versionId.test(version) || !item || typeof item.encryptionKey !== 'string' || typeof item.lookupKey !== 'string') throw new AppError(503, 'KEY_CONFIGURATION_INVALID', 'Invalid APAAR keyring entry');
  decodeKey(item.encryptionKey); decodeKey(item.lookupKey);
  if (item.encryptionKey === item.lookupKey) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', 'Independent identity keys are required');
  ring[version] = { encryption: item.encryptionKey, lookup: item.lookupKey, version };
 }
 if (env.APAAR_ENCRYPTION_KEY || env.APAAR_LOOKUP_KEY) {
  if (!env.APAAR_ENCRYPTION_KEY || !env.APAAR_LOOKUP_KEY || !env.APAAR_KEY_VERSION || !versionId.test(env.APAAR_KEY_VERSION)) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', 'Complete identity key configuration required');
  decodeKey(env.APAAR_ENCRYPTION_KEY); decodeKey(env.APAAR_LOOKUP_KEY);
  if (env.APAAR_ENCRYPTION_KEY === env.APAAR_LOOKUP_KEY) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', 'Independent identity keys required');
  const previous = ring[env.APAAR_KEY_VERSION];
  if (previous && (previous.encryption !== env.APAAR_ENCRYPTION_KEY || previous.lookup !== env.APAAR_LOOKUP_KEY)) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', 'Conflicting identity key bindings');
  ring[env.APAAR_KEY_VERSION] = { encryption: env.APAAR_ENCRYPTION_KEY, lookup: env.APAAR_LOOKUP_KEY, version: env.APAAR_KEY_VERSION };
 }
 return ring;
}
export function identityKey(version = process.env.APAAR_KEY_VERSION) {
 const ring = identityKeyring(); const key = version ? ring[version] : undefined;
 if (!key) throw new AppError(503, 'IDENTITY_KEY_VERSION_UNAVAILABLE', 'Required identity key version is unavailable'); return key;
}
export function binaryKeyring(purpose: 'UPLOAD' | 'AUDIT', env: NodeJS.ProcessEnv = process.env) {
 const ring: Record<string, Buffer> = Object.create(null);
 for (const [id, raw] of Object.entries(jsonMap(env[`${purpose}_KEYRING_JSON`], `${purpose}_KEYRING_JSON`))) {
  if (!versionId.test(id) || typeof raw !== 'string') throw new AppError(503, 'KEY_CONFIGURATION_INVALID', `Invalid ${purpose} keyring entry`); ring[id] = decodeKey(raw);
 }
 const raw = env[purpose === 'UPLOAD' ? 'UPLOAD_ENCRYPTION_KEY' : 'AUDIT_HMAC_KEY'];
 const version = purpose === 'UPLOAD' && Object.keys(ring).length ? (env.UPLOAD_LEGACY_KEY_VERSION ?? 'legacy') : env[`${purpose}_KEY_VERSION`] ?? (purpose === 'UPLOAD' ? 'legacy' : undefined);
 if (raw) {
  if (!version || !versionId.test(version)) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', `Missing ${purpose} key version`);
  const key = decodeKey(raw); if (ring[version] && !ring[version]!.equals(key)) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', `Conflicting ${purpose} key bindings`); ring[version] = key;
 }
 return ring;
}
export function activeBinaryKey(purpose: 'UPLOAD' | 'AUDIT') {
 const version = process.env[`${purpose}_KEY_VERSION`] ?? (purpose === 'UPLOAD' ? 'legacy' : undefined);
 const key = version ? binaryKeyring(purpose)[version] : undefined;
 if (!version || !key) throw new AppError(503, `${purpose}_KEY_UNAVAILABLE`, `${purpose} protection is not configured`); return { version, key };
}
export function validateConfiguredKeys(env: NodeJS.ProcessEnv) {
 const identity = identityKeyring(env), upload = binaryKeyring('UPLOAD', env), audit = binaryKeyring('AUDIT', env);
 const all: { purpose: string; raw: string }[] = [];
 for (const key of Object.values(identity)) all.push({ purpose: 'identity-encryption', raw: key.encryption }, { purpose: 'identity-lookup', raw: key.lookup });
 for (const key of Object.values(upload)) all.push({ purpose: 'upload', raw: key.toString('base64') });
 for (const key of Object.values(audit)) all.push({ purpose: 'audit', raw: key.toString('base64') });
 for (const field of ['JWT_SECRET', 'CSRF_SECRET']) if (env[field]) all.push({ purpose: field, raw: env[field]! });
 for (const a of all) for (const b of all) if (a.purpose !== b.purpose && a.raw === b.raw) throw new AppError(503, 'KEY_CONFIGURATION_INVALID', 'Purpose-separated keys are required');
}
