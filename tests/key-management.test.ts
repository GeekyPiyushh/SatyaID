import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, createCipheriv } from 'node:crypto';
import { parseEnvironment } from '../src/config/env';
import { identityKey, validateConfiguredKeys } from '../src/security/keys';
import { sealUpload, openUpload } from '../src/services/upload-crypto';
const key = () => randomBytes(32).toString('base64');
afterEach(() => vi.unstubAllEnvs());
describe('version-aware cryptographic configuration', () => {
 it('rejects weak production defaults, broad proxy trust and insecure cross-site cookies', () => {
  expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow();
  expect(() => parseEnvironment({ TRUST_PROXY: 'true' })).toThrow();
  expect(() => parseEnvironment({ TRUST_PROXY: '0.0.0.0/0' })).toThrow();
  expect(() => parseEnvironment({ COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' })).toThrow();
  expect(parseEnvironment({ TRUST_PROXY: '127.0.0.1,10.0.0.0/8' }).TRUST_PROXY).toHaveLength(2);
 });
 it('validates canonical keys, separate purposes and missing identity versions', () => {
  const a = key(); expect(() => validateConfiguredKeys({ UPLOAD_ENCRYPTION_KEY: 'invalid' })).toThrow();
  expect(() => validateConfiguredKeys({ UPLOAD_ENCRYPTION_KEY: a, AUDIT_HMAC_KEY: a, AUDIT_KEY_VERSION: 'v1' })).toThrow();
  vi.stubEnv('APAAR_KEYRING_JSON', JSON.stringify({ v1: { encryptionKey: a, lookupKey: key() } }));
  expect(identityKey('v1').version).toBe('v1'); expect(() => identityKey('missing')).toThrow();
 });
 it('reads historic upload versions while writing active versions and rejects tampering', () => {
  const a = key(), b = key(); vi.stubEnv('UPLOAD_ENCRYPTION_KEY', ''); vi.stubEnv('UPLOAD_KEY_VERSION', 'v1'); vi.stubEnv('UPLOAD_KEYRING_JSON', JSON.stringify({ v1: a }));
  const bytes = Buffer.from('synthetic staging'), old = sealUpload(bytes, 'job:1');
  vi.stubEnv('UPLOAD_KEY_VERSION', 'v2'); vi.stubEnv('UPLOAD_KEYRING_JSON', JSON.stringify({ v1: a, v2: b }));
  expect(openUpload(old, 'job:1')).toEqual(bytes); const current = sealUpload(bytes, 'job:1'); expect(current.subarray(2, 4).toString()).toBe('v2');
  expect(() => openUpload(current, 'wrong-job')).toThrow(); const corrupt = Buffer.from(current); corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1; expect(() => openUpload(corrupt, 'job:1')).toThrow();
  vi.stubEnv('UPLOAD_KEYRING_JSON', JSON.stringify({ v2: b })); expect(() => openUpload(old, 'job:1')).toThrow();
 });
 it('reads legacy v1 only through an explicitly supplied legacy key', () => {
  const raw = key(), nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(raw, 'base64'), nonce); cipher.setAAD(Buffer.from('old'));
  const content = Buffer.concat([cipher.update('fixture'), cipher.final()]); const old = Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), content]);
  vi.stubEnv('UPLOAD_ENCRYPTION_KEY', raw); expect(openUpload(old, 'old').toString()).toBe('fixture');
  vi.stubEnv('UPLOAD_ENCRYPTION_KEY', ''); expect(() => openUpload(old, 'old')).toThrow();
 });
});
