import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
import { processNextUpload } from '../src/services/uploads';
import { processNextReport } from '../src/services/regulatory/reports';
import { columns } from '../src/services/upload-parser';
import { reconcileAdmissions } from '../src/services/operations/reconcile';
const suite = process.env.TEST_MONGODB_URI ? describe : describe.skip;
const app = createApp({ CORS_ORIGINS: [] }), secret = randomBytes(40).toString('hex'), suffix = randomBytes(8).toString('hex');
const spec = YAML.parse(readFileSync('docs/openapi.yaml', 'utf8')), ajv = new Ajv2020({ strict: false }); addFormats(ajv);
ajv.addSchema({ $id: 'https://satyaid.invalid/api', ...spec });
const samples: { operation: string; milliseconds: number }[] = [];
suite('Batch 4 synthetic complete HTTP workflow', () => {
 let admin: any, staff: any, studentAccount: any, employer: any, otherEmployer: any, institution: any, year: any, program: any, offering: any, category: any, pool: any, student: any, enrolment: any, report: any, sharing: any, credential: any;
 const token = (u: any) => jwt.sign({}, secret, { subject: String(u._id), issuer: 'satyaid', audience: 'satyaid-api', expiresIn: '10m' });
 async function call(method: string, path: string, actor: any, body?: any, expected = 200) {
  const start = performance.now(), r = await (request(app) as any)[method]('/api/v1' + path).auth(token(actor), { type: 'bearer' }).send(body); samples.push({ operation: method.toUpperCase() + ' ' + path.replace(/[a-f\d]{24}/g, '{id}'), milliseconds: Number((performance.now() - start).toFixed(2)) });
  expect(r.status, JSON.stringify(r.body)).toBe(expected);
  if (expected < 300) {
   const pathKey = ('/api/v1' + path.split('?')[0]).replace(/[a-f\d]{24}/g, '{id}');
   const schema = spec.paths[pathKey]?.[method]?.responses[String(expected)]?.content?.['application/json']?.schema;
   if (!schema) throw new Error('No documented response for ' + pathKey);
   const check = ajv.compile({ $ref: 'https://satyaid.invalid/api#/paths/' + pathKey.replace(/~/g, '~0').replace(/\//g, '~1') + '/' + method + '/responses/' + expected + '/content/application~1json/schema' });
   expect(check(r.body), JSON.stringify(check.errors)).toBe(true);
  } return r.body.data;
 }
 beforeAll(async () => {
  const url = new URL(process.env.TEST_MONGODB_URI!); if (!url.pathname.endsWith('_test')) throw new Error('Dedicated test database required'); url.pathname += '_e2e_test'; await connectDatabase(url.toString());
  for (const model of Object.values(mongoose.models)) await model.createIndexes(); process.env.JWT_SECRET = secret;
  process.env.UPLOAD_ENCRYPTION_KEY = randomBytes(32).toString('base64'); process.env.APAAR_ENCRYPTION_KEY = randomBytes(32).toString('base64'); process.env.APAAR_LOOKUP_KEY = randomBytes(32).toString('base64'); process.env.APAAR_KEY_VERSION = suffix;
  const user = (role: string) => m.User.create({ email: `${role}-${suffix}@example.invalid`, role, passwordHash: 'unusable-synthetic-e2e-hash' });
  admin = await user('AICTE_ADMIN'); staff = await user('INSTITUTION_ADMIN'); studentAccount = await user('STUDENT'); employer = await user('EMPLOYER'); otherEmployer = await m.User.create({ email: `other-${suffix}@example.invalid`, role: 'EMPLOYER', passwordHash: 'unused' });
 });
 afterAll(async () => { await writeFile('/tmp/satyaid-batch4-http-measurements.json', JSON.stringify({ tool: 'Vitest + Supertest performance.now', node: process.version, dataset: 'One workflow: 2 institutions, 4 unique students, 5 admission drafts, 4 successful activations; last-seat concurrency 2; all other requests sequential', samples }, null, 2)); await disconnectDatabase(); });
 it('FLOW 1 provisions approvals and account permissions through HTTP', async () => {
  institution = await call('post', '/institutions', admin, { pid: `E2E-${suffix}`, name: 'Synthetic E2E Institute', state: 'Demo' }, 201);
  year = await call('post', '/academic-years', admin, { code: `E2E-${suffix}`, startsOn: '2026-01-01T00:00:00Z', endsOn: '2027-12-31T00:00:00Z' }, 201);
  program = await call('post', '/programs', admin, { code: `E2E-${suffix}`, name: 'Synthetic E2E program' }, 201);
  offering = await call('post', '/offerings', admin, { institution: institution._id, program: program._id }, 201);
  category = await call('post', '/seat-categories', admin, { code: `E2E-${suffix}`, name: 'Synthetic base' }, 201);
  pool = await call('post', '/intakes', admin, { offering: offering._id, academicYear: year._id, category: category._id, kind: 'BASE', approvedSeats: 3, sourceReference: 'Synthetic E2E approval' }, 201);
  await call('post', `/institutions/${institution._id}/memberships`, admin, { user: String(staff._id), role: 'INSTITUTION_ADMIN' }, 201);
 });
 it('requires matching account roles when granting and checking institution membership', async () => {
  await call('post', `/institutions/${institution._id}/memberships`, admin, { user: String(employer._id), role: 'INSTITUTION_ADMIN' }, 422);
  const stale = await m.InstitutionMembership.create({ user: employer._id, institution: institution._id, role: 'INSTITUTION_ADMIN' });
  await call('get', `/institutions/${institution._id}`, employer, undefined, 403);
  await m.InstitutionMembership.deleteOne({ _id: stale._id });
 });
 it('FLOW 2 creates and activates a scoped student with analytics', async () => {
  student = await call('post', '/students', staff, { institution: institution._id, institutionStudentId: 'E2E-1', displayName: 'Synthetic E2E Student' }, 201);
  enrolment = await call('post', '/enrolments', staff, { student: student.studentId, allocation: pool._id, institutionStudentId: 'E2E-1', startsOn: '2026-08-01', admissionDate: '2026-08-01', entryType: 'REGULAR', idempotencyKey: `admit-${suffix}` }, 201);
  await call('post', `/enrolments/${enrolment._id}/activate`, staff, {});
  const stats = await call('get', `/analytics/institutions/${institution._id}/overview?academicYear=${year._id}`, staff); expect(stats.occupiedSeats).toBe(1);
  const listing = await call('get', `/students?institution=${institution._id}&limit=10`, staff); expect(listing.total).toBe(1);
 });
 it('FLOW 3 validates, reviews and commits an upload without treating 202 as completion', async () => {
  const csv = columns.join(',') + '\n' + ['E2E-2', 'Synthetic Upload Student', '', '', pool._id, year._id, '2026-08-01', '2026-08-01', '', 'REGULAR'].join(',') + '\n';
  const start = performance.now(); const queued = await request(app).post('/api/v1/uploads/students').auth(token(staff), { type: 'bearer' }).field('institution', institution._id).field('idempotencyKey', `upload-${suffix}`).attach('file', Buffer.from(csv), { filename: 'synthetic.csv', contentType: 'text/csv' }); expect(queued.status).toBe(202); const id = queued.body.data._id;
  await processNextUpload(); samples.push({ operation: 'Bulk validation 1 row (queue + worker)', milliseconds: Number((performance.now() - start).toFixed(2)) });
  const review = await call('get', `/uploads/${id}/results`, staff); expect(review.items[0].status).toBe('VALID');
  await call('post', `/uploads/${id}/commit`, staff, {}, 202); await call('post', `/uploads/${id}/commit`, staff, {}, 202); await processNextUpload();
  expect((await call('get', `/uploads/${id}`, staff)).status).toBe('COMPLETED');
 });
 it('FLOW 4 records overlapping institutional admissions and reviewed resolution', async () => {
  const other = await call('post', '/institutions', admin, { pid: `OTHER-${suffix}`, name: 'Synthetic Other E2E', state: 'Demo' }, 201);
  const o = await call('post', '/offerings', admin, { institution: other._id, program: program._id }, 201);
  const p = await call('post', '/intakes', admin, { offering: o._id, academicYear: year._id, category: category._id, kind: 'BASE', approvedSeats: 1, sourceReference: 'Synthetic E2E' }, 201);
  await call('post', '/students', admin, { existingStudent: student.studentId, institution: other._id, institutionStudentId: 'OTHER-1', displayName: 'Synthetic E2E Student' }, 201);
  const e = await call('post', '/enrolments', admin, { student: student.studentId, allocation: p._id, institutionStudentId: 'OTHER-1', startsOn: '2026-08-01', admissionDate: '2026-08-01', entryType: 'REGULAR', idempotencyKey: `other-${suffix}` }, 201);
  await call('post', `/enrolments/${e._id}/activate`, admin, {});
  const conflicts = await call('get', '/conflicts', admin); const c = conflicts.items.find((x: any) => x.student === student.studentId); expect(c).toBeTruthy();
  await call('post', `/conflicts/${c._id}/resolve`, admin, { resolution: 'LEGITIMATE_OVERLAP', reasonCode: 'SYNTHETIC_REVIEW', version: c.version });
  await call('get', `/analytics/conflicts/summary?institution=${institution._id}`, staff);
  await call('get', `/students/${student.studentId}?institution=${other._id}`, staff, undefined, 403);
 });
 it('FLOW 5 binds selective consent and credentials to a student and employer', async () => {
  await call('post', `/students/${student.studentId}/account-link`, admin, { user: String(studentAccount._id) });
  for (const e of [employer, otherEmployer]) await call('post', '/verification/employers', admin, { user: String(e._id), organization: 'Synthetic Employer', status: 'APPROVED', approvalReference: 'SYNTHETIC' });
  const invite = await call('post', '/verification/invitations', studentAccount, { enrolment: enrolment._id, employer: String(employer._id), claims: ['INSTITUTION', 'PROGRAM'] }, 201);
  sharing = await call('post', '/verification/requests', employer, { invitationToken: invite.token, purposeCode: 'DEMO_SCREENING', claims: ['INSTITUTION', 'PROGRAM'] }, 201);
  await call('post', `/consents/${sharing.consentRequestId}/approve`, studentAccount, { claims: ['INSTITUTION'] });
  const result = await call('get', `/verification/requests/${sharing.requestId}/result`, employer); expect(Object.keys(result.claims)).toEqual(['INSTITUTION']);
  credential = await call('post', '/credentials', studentAccount, { request: sharing.requestId }, 201); expect(credential.qrReference).toMatch(/^satyaid:\/\/verify#token=/);
  await call('post', '/credentials/verify', otherEmployer, { token: credential.token }, 404);
  await call('post', '/credentials/verify', employer, { token: credential.token });
 });
 it('denies disclosure immediately when actor, linkage or employer approval becomes unavailable', async () => {
  await m.User.updateOne({ _id: studentAccount._id }, { $set: { active: false } }); await call('get', `/verification/requests/${sharing.requestId}/result`, employer, undefined, 404);
  await m.User.updateOne({ _id: studentAccount._id }, { $set: { active: true } });
  await m.Student.updateOne({ _id: student.studentId }, { $unset: { user: 1 } }); await call('post', '/credentials/verify', employer, { token: credential.token }, 404);
  await m.Student.updateOne({ _id: student.studentId }, { $set: { user: studentAccount._id } });
  await m.EmployerProfile.updateOne({ user: employer._id }, { $set: { status: 'SUSPENDED' } }); await call('get', `/verification/requests/${sharing.requestId}/result`, employer, undefined, 403);
  await m.EmployerProfile.updateOne({ user: employer._id }, { $set: { status: 'APPROVED' } });
  await call('post', `/consents/${sharing.consentRequestId}/revoke`, studentAccount, {}); await call('post', '/credentials/verify', employer, { token: credential.token }, 404);
 });
 it('FLOW 6 generates and downloads a scoped snapshot report', async () => {
  report = await call('post', '/reports', staff, { reportType: 'INTAKE_UTILIZATION', format: 'JSON', filters: { institution: institution._id, academicYear: year._id } }, 202);
  const reportStart = performance.now(); await processNextReport(); const r = await request(app).get(`/api/v1/reports/${report.reportId}/download`).auth(token(staff), { type: 'bearer' }); expect(r.status).toBe(200); expect(r.body.metadata.officialFiling).toBe(false); samples.push({ operation: 'Regulatory snapshot report generation and download', milliseconds: Number((performance.now() - reportStart).toFixed(2)) });
  await call('get', `/reports/${report.reportId}`, employer, undefined, 404);
 });
 it('FLOW 7 simulates without mutation and reconciles counters', async () => {
  const before = (await m.IntakeAllocation.findById(pool._id))!.toObject();
  await call('post', '/intelligence/policy-simulations', admin, { institution: institution._id, academicYear: year._id, category: category._id, asOf: '2026-10-24T00:00:00Z', hypothetical: { kind: 'BASE', method: 'FIXED', value: 1, rounding: 'FLOOR' } });
  expect((await m.IntakeAllocation.findById(pool._id))!.toObject()).toEqual(before); expect((await reconcileAdmissions()).findings).toEqual([]);
 });
 it('bounds last-seat contention to one successful activation with indexed listing', async () => {
  const admissions: any[] = [];
  for (let i = 3; i <= 4; i++) {
   const s = await call('post', '/students', staff, { institution: institution._id, institutionStudentId: `E2E-${i}`, displayName: 'Synthetic Contention' }, 201);
   admissions.push(await call('post', '/enrolments', staff, { student: s.studentId, allocation: pool._id, institutionStudentId: `E2E-${i}`, startsOn: '2026-08-01', admissionDate: '2026-08-01', idempotencyKey: `seat-${i}-${suffix}` }, 201));
  }
  const start = performance.now(); const results = await Promise.all(admissions.map(e => request(app).post(`/api/v1/enrolments/${e._id}/activate`).auth(token(staff), { type: 'bearer' }).send({})));
  samples.push({ operation: 'Last-seat activation concurrency 2', milliseconds: Number((performance.now() - start).toFixed(2)) }); expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  const plan: any = await m.StudentInstitution.find({ institution: institution._id, status: 'ACTIVE' }).sort({ _id: 1 }).limit(20).explain('executionStats');
  await writeFile('/tmp/satyaid-batch4-query-plan.json', JSON.stringify({ query: 'StudentInstitution institution/status sort _id', winningPlan: plan.queryPlanner.winningPlan, executionStats: plan.executionStats }, null, 2)); expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('IXSCAN');
 });
});
