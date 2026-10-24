import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { verifyAccess } from '../src/services/auth';
import { calculateQuota } from '../src/services/management';
import { protectIdentity, revealIdentity } from '../src/services/identity-crypto';
import { randomBytes } from 'node:crypto';
const app = createApp({ CORS_ORIGINS: [] });
describe('security boundaries', () => {
 it('rejects missing tokens', async () => { expect((await request(app).get('/api/v1/institutions')).status).toBe(401); });
 it('rejects malformed login and refresh requests before database access', async () => {
  expect((await request(app).post('/api/v1/auth/login').send({ email: 'invalid', password: '' })).status).toBe(422);
  expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'bad' })).status).toBe(422);
 });
 it('validates expiry, signature, issuer and audience', () => {
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  const sign = (options: jwt.SignOptions, secret = process.env.JWT_SECRET!) => jwt.sign({}, secret, { subject: 'test', issuer: 'satyaid', audience: 'satyaid-api', ...options });
  expect(verifyAccess(sign({ expiresIn: 60 }))).toBe('test');
  for (const token of [sign({ expiresIn: -1 }), sign({ issuer: 'wrong' }), sign({ audience: 'wrong' }), sign({}, 'other-secret')]) expect(() => verifyAccess(token)).toThrow();
 });
 it('keeps health independent and readiness separate', async () => { expect((await request(app).get('/api/health')).status).toBe(200); expect((await request(app).get('/api/ready')).status).toBe(503); });
});
describe('quota calculation', () => {
 it('calculates only configured fixed or percentage limits with explicit rounding', () => {
  expect(calculateQuota({ method: 'PERCENTAGE', value: 0.07, rounding: 'CEILING' }, 10000)).toBe(7);
  expect(calculateQuota({ method: 'FIXED', value: 7, rounding: 'FLOOR' }, 101)).toBe(7);
  expect(calculateQuota({ method: 'PERCENTAGE', value: 5, rounding: 'FLOOR' }, 101)).toBe(5);
  expect(calculateQuota({ method: 'PERCENTAGE', value: 5, rounding: 'CEILING' }, 101)).toBe(6);
  expect(calculateQuota({ method: 'PERCENTAGE', value: 5, rounding: 'HALF_UP' }, 110)).toBe(6);
 });
});
describe('identity encryption', () => {
 it('authenticates ciphertext and binds it to the student; lookup is deterministic', () => {
  const encryption = randomBytes(32).toString('base64'), lookup = randomBytes(32).toString('base64');
  const first = protectIdentity('synthetic-only', 'student-a', encryption, lookup);
  const second = protectIdentity('synthetic-only', 'student-a', encryption, lookup);
  expect(first.lookupDigest).toEqual(second.lookupDigest);
  expect(first.ciphertext).not.toEqual(second.ciphertext);
  expect(revealIdentity(first, 'student-a', encryption)).toBe('synthetic-only');
  expect(() => revealIdentity(first, 'student-b', encryption)).toThrow();
  first.tag[0] = first.tag[0]! ^ 1;
  expect(() => revealIdentity(first, 'student-a', encryption)).toThrow();
 });
});
