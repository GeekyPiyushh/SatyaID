import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { createApp } from '../src/app';
import { errorHandler } from '../src/middlewares/error-handler';
import { validate } from '../src/middlewares/validate';
import { parseEnvironment } from '../src/config/env';

const app = createApp({ CORS_ORIGINS: ['http://localhost:5173'] });
describe('HTTP foundation without database', () => {
  it('returns health and security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'SatyaID AICTE APAAR Backend API is running', data: { service: 'satyaid-backend' } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
  it('returns consistent 404', async () => {
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
  it('allows configured origins and preflight', async () => {
    const res = await request(app).options('/api/health').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
  it('rejects unlisted origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://untrusted.example');
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('does not grant browser access with an empty allowlist', async () => {
    const res = await request(createApp({ CORS_ORIGINS: [] })).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(403);
  });
  it('handles invalid JSON safely', async () => {
    const res = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{broken');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
  it('limits JSON payloads', async () => {
    const res = await request(app).post('/api/health').send({ value: 'x'.repeat(110000) });
    expect(res.status).toBe(413);
  });
  it('does not expose unexpected error details', async () => {
    const fixture = express();
    fixture.get('/', () => { throw new Error('confidential-value'); });
    fixture.use(errorHandler);
    const res = await request(fixture).get('/');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } });
  });
  it('validates and transforms input without adding speculative API routes', async () => {
    const fixture = express();
    fixture.use(express.json());
    fixture.post('/', validate(z.object({ count: z.coerce.number().int().positive() }).strict()), (_req, res) => res.json(res.locals.validated));
    fixture.use(errorHandler);
    expect((await request(fixture).post('/').send({ count: '3' })).body).toEqual({ count: 3 });
    const invalid = await request(fixture).post('/').send({ count: -1 });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
describe('configuration', () => {
  it('boots configuration without a database URL', () => {
    expect(parseEnvironment({}).PORT).toBe(3000);
  });
  it('validates port and exact origins', () => {
    expect(() => parseEnvironment({ PORT: '0' })).toThrow('PORT');
    expect(() => parseEnvironment({ CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
    expect(() => parseEnvironment({ CORS_ORIGINS: 'https://example.com/path' })).toThrow();
  });
  it('does not expose invalid database URLs', () => {
    expect(() => parseEnvironment({ MONGODB_URI: 'secret-value' })).toThrow('Invalid environment configuration: MONGODB_URI');
  });
});
