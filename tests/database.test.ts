import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
const uri = process.env.TEST_MONGODB_URI;
const app = createApp({ CORS_ORIGINS: [] });
const suite = uri ? describe : describe.skip;
suite('isolated replica-set integration', () => {
 let admin: any, staff: any, institution: any, other: any, offering: any, year: any, category: any;
 let token: string;
 const password = randomBytes(24).toString('hex');
 beforeAll(async () => {
  if (!new URL(uri!).pathname.endsWith('_test')) throw new Error('Integration suite requires a dedicated _test database');
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  await connectDatabase(uri!);
  for (const model of Object.values(mongoose.models)) await model.createIndexes();
  const suffix = randomBytes(8).toString('hex');
  admin = await m.User.create({ email: `admin-${suffix}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), role: 'AICTE_ADMIN' });
  staff = await m.User.create({ email: `staff-${suffix}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), role: 'INSTITUTION_STAFF' });
  institution = await m.Institution.create({ pid: `demo-${suffix}`, name: 'Synthetic Institute', state: 'Demo' });
  other = await m.Institution.create({ pid: `other-${suffix}`, name: 'Other Synthetic', state: 'Demo' });
  await m.InstitutionMembership.create({ institution: institution._id, user: staff._id, role: 'INSTITUTION_STAFF' });
  const program = await m.Program.create({ code: `CS-${suffix}`, name: 'Synthetic CS' });
  offering = await m.InstitutionProgram.create({ institution: institution._id, program: program._id });
  year = await m.AcademicYear.create({ code: suffix, startsOn: new Date('2026-01-01'), endsOn: new Date('2027-01-01') });
  category = await m.SeatCategory.create({ code: suffix, name: 'Synthetic base' });
  token = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password })).body.data.accessToken;
 }, 30000);
 afterAll(disconnectDatabase);
 it('rejects invalid credentials and never returns hashes', async () => {
  const bad = await request(app).post('/api/v1/auth/login').send({ email: admin.email, password: 'wrong' }); expect(bad.status).toBe(401);
  const me = await request(app).get('/api/v1/auth/me').auth(token, { type: 'bearer' }); expect(me.status).toBe(200); expect(me.body.data.passwordHash).toBeUndefined();
 });
 it('enforces roles and cross-institution boundaries', async () => {
  const staffToken = (await request(app).post('/api/v1/auth/login').send({ email: staff.email, password })).body.data.accessToken;
  expect((await request(app).get(`/api/v1/institutions/${institution._id}`).auth(staffToken, { type: 'bearer' })).status).toBe(200);
  expect((await request(app).get(`/api/v1/institutions/${other._id}`).auth(staffToken, { type: 'bearer' })).status).toBe(403);
  expect((await request(app).post('/api/v1/institutions').auth(staffToken, { type: 'bearer' }).send({ pid: 'forbidden', name: 'X', state: 'X' })).status).toBe(403);
 });
 it('rotates refresh tokens and revokes replayed families', async () => {
  const first = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password })).body.data;
  const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }); expect(rotated.status).toBe(200);
  expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
  expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken })).status).toBe(401);
 });
 it('revokes logout refresh sessions', async () => {
  const login = (await request(app).post('/api/v1/auth/login').send({ email: admin.email, password })).body.data;
  expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken: login.refreshToken })).status).toBe(200);
  expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken })).status).toBe(401);
 });
 it('creates intakes with audit, rejects duplicate indexes and calculates scoped capacity', async () => {
  const body = { offering: String(offering._id), academicYear: String(year._id), category: String(category._id), kind: 'BASE', approvedSeats: 60, sourceReference: 'Synthetic approval only' };
  const result = await request(app).post('/api/v1/intakes').auth(token, { type: 'bearer' }).send(body); expect(result.status).toBe(201);
  expect(await m.AuditEvent.countDocuments({ resourceId: result.body.data._id })).toBe(1);
  expect((await request(app).post('/api/v1/intakes').auth(token, { type: 'bearer' }).send(body)).status).toBe(409);
  const summary = await request(app).get(`/api/v1/offerings/${offering._id}/capacity?academicYear=${year._id}`).auth(token, { type: 'bearer' }); expect(summary.status).toBe(200); expect(summary.body.data.baseSeats).toBe(60);
 });
 it('rejects overlapping approved rules while accepting a documented configured rule', async () => {
  const body = { offering: String(offering._id), academicYear: String(year._id), category: String(category._id), version: 1, kind: 'BASE', method: 'FIXED', value: 7, rounding: 'FLOOR', effectiveFrom: '2020-01-01T00:00:00Z', effectiveUntil: '2099-01-01T00:00:00Z', sourceReference: 'Synthetic rule, not an AICTE policy', approvalStatus: 'APPROVED' };
  expect((await request(app).post('/api/v1/quota-rules').auth(token, { type: 'bearer' }).send(body)).status).toBe(201);
  expect((await request(app).post('/api/v1/quota-rules').auth(token, { type: 'bearer' }).send({ ...body, version: 2 })).status).toBe(409);
  const result = await request(app).get(`/api/v1/offerings/${offering._id}/capacity?academicYear=${year._id}`).auth(token, { type: 'bearer' });
  expect(result.body.data.configuredQuotas[0].seats).toBe(7);
 });
 it('prevents a capacity reduction below occupied seats', async () => {
  const allocation = await m.IntakeAllocation.findOne({ offering: offering._id });
  await m.IntakeAllocation.updateOne({ _id: allocation!._id }, { $set: { occupiedSeats: 10 } });
  const result = await request(app).patch(`/api/v1/intakes/${allocation!._id}`).auth(token, { type: 'bearer' }).send({ approvedSeats: 5, sourceReference: 'Synthetic correction' });
  expect(result.status).toBe(409);
 });
 it('validates references and quota shape before persistence', async () => {
  const result = await request(app).post('/api/v1/quota-rules').auth(token, { type: 'bearer' }).send({}); expect(result.status).toBe(422);
  await expect(m.InstitutionProgram.create({ institution: institution._id, program: offering.program })).rejects.toMatchObject({ code: 11000 });
  expect((await request(app).get('/api/ready')).status).toBe(200);
 });
});
