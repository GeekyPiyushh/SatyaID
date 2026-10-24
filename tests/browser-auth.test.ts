import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { digestToken } from '../src/services/auth';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
const uri = process.env.TEST_MONGODB_URI, suite = uri ? describe : describe.skip;
const origin = 'http://localhost:5173', app = createApp({ CORS_ORIGINS: [origin] });
const password = randomBytes(24).toString('hex'); let user: any;
const cookiePairs = (response: any) => (response.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]!);
suite('browser cookie and CSRF transport', () => {
 beforeAll(async () => {
  if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
  process.env.JWT_SECRET = randomBytes(40).toString('hex'); process.env.CSRF_SECRET = randomBytes(40).toString('hex');
  await connectDatabase(uri); for (const model of Object.values(m.User.db.models)) await model.createIndexes();
  user = await m.User.create({ email: `browser-${randomBytes(8).toString('hex')}@example.invalid`, role: 'AICTE_ADMIN', passwordHash: await bcrypt.hash(password, 12) });
 });
 afterAll(disconnectDatabase);
 async function login(agent: any) {
  const csrf = await agent.post('/api/v1/auth/browser/csrf').set('Origin', origin).send({}); expect(csrf.status).toBe(200);
  const response = await agent.post('/api/v1/auth/browser/login').set('Origin', origin).set('X-CSRF-Token', csrf.body.data.csrfToken).send({ email: user.email, password }); expect(response.status).toBe(200); return response;
 }
 it('denies missing/untrusted origins and CSRF without leaking JSON refresh tokens', async () => {
  expect((await request(app).post('/api/v1/auth/browser/csrf').send({})).status).toBe(403);
  expect((await request(app).post('/api/v1/auth/browser/csrf').set('Origin', 'https://untrusted.example').send({})).status).toBe(403);
  expect((await request(app).post('/api/v1/auth/browser/login').set('Origin', origin).send({ email: user.email, password })).status).toBe(403);
  const downgrade = await request(app).post('/api/v1/auth/login').set('Origin', origin).send({ email: user.email, password }); expect(downgrade.status).toBe(403); expect(downgrade.body.error.code).toBe('BROWSER_TRANSPORT_REQUIRED');
 });
 it('sets HttpOnly scoped cookies, exact credentialed CORS and short-lived memory tokens', async () => {
  const agent = request.agent(app); const response = await login(agent);
  expect(response.headers['access-control-allow-origin']).toBe(origin); expect(response.headers['access-control-allow-credentials']).toBe('true'); expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.data.refreshToken).toBeUndefined(); expect(response.body.data.accessToken).toBeTruthy();
  const set = (response.headers['set-cookie'] as unknown as string[]).join(';'); expect(set).toContain('HttpOnly'); expect(set).toContain('SameSite=Lax'); expect(set).toContain('Path=/api/v1/auth/browser');
  expect((await agent.get('/api/v1/auth/me').set('Origin', origin).auth(response.body.data.accessToken, { type: 'bearer' })).status).toBe(200);
  const bad = await agent.post('/api/v1/auth/browser/refresh').set('Origin', origin).set('X-CSRF-Token', 'wrong').send({}); expect(bad.status).toBe(403);
 });
 it('rotates refresh cookies and revokes the family on a real replay', async () => {
  const agent = request.agent(app); const initial = await login(agent); const oldCookies = cookiePairs(initial), oldCsrf = initial.body.data.csrfToken;
  const rotated = await agent.post('/api/v1/auth/browser/refresh').set('Origin', origin).set('X-CSRF-Token', oldCsrf).send({}); expect(rotated.status).toBe(200); expect(cookiePairs(rotated)[0]).not.toBe(oldCookies[0]);
  const replay = await request(app).post('/api/v1/auth/browser/refresh').set('Origin', origin).set('Cookie', oldCookies).set('X-CSRF-Token', oldCsrf).send({}); expect(replay.status).toBe(401);
  const revoked = await agent.post('/api/v1/auth/browser/refresh').set('Origin', origin).set('X-CSRF-Token', rotated.body.data.csrfToken).send({}); expect(revoked.status).toBe(401);
 });
 it('rejects an expired session cookie even when its signature/CSRF are valid', async () => {
  const agent = request.agent(app), response = await login(agent);
  const raw = cookiePairs(response).find(c=>c.startsWith('satyaid_refresh='))!.split('=')[1]!;
  await m.RefreshSession.updateOne({ digest: digestToken(raw) }, { $set: { expiresAt: new Date(0) } });
  expect((await agent.post('/api/v1/auth/browser/refresh').set('Origin', origin).set('X-CSRF-Token', response.body.data.csrfToken).send({})).status).toBe(401);
 });
 it('bootstraps a new page CSRF token, binds transport, and clears cookies on logout', async () => {
  const agent = request.agent(app); const initial = await login(agent);
  const rawCookie = cookiePairs(initial).find(c => c.startsWith('satyaid_refresh='))!.split('=')[1]!;
  expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rawCookie })).status).toBe(401);
  const bootstrap = await agent.post('/api/v1/auth/browser/csrf').set('Origin', origin).send({});
  const refreshed = await agent.post('/api/v1/auth/browser/refresh').set('Origin', origin).set('X-CSRF-Token', bootstrap.body.data.csrfToken).send({}); expect(refreshed.status).toBe(200);
  const ended = await agent.post('/api/v1/auth/browser/logout').set('Origin', origin).set('X-CSRF-Token', refreshed.body.data.csrfToken).send({}); expect(ended.status).toBe(200); expect((ended.headers['set-cookie'] as unknown as string[]).join(';')).toContain('Expires=Thu, 01 Jan 1970');
  const next = await agent.post('/api/v1/auth/browser/csrf').set('Origin', origin).send({});
  expect((await agent.post('/api/v1/auth/browser/refresh').set('Origin', origin).set('X-CSRF-Token', next.body.data.csrfToken).send({})).status).toBe(401);
 });
});
