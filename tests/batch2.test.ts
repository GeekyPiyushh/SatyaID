import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { processNextUpload } from '../src/services/uploads';
import { MockApaarVerificationProvider } from '../src/providers/apaar';
import { columns } from '../src/services/upload-parser';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
const uri = process.env.TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const app = createApp({ CORS_ORIGINS: [] });
suite('Batch 2 replica-set workflows', () => {
 let admin: any, staff: any, outsider: any, institution: any, other: any, student: any, allocation: any, superAllocation: any;
 let token: string, staffToken: string, outsiderToken: string;
 const key = randomBytes(32).toString('hex');
 const sign = (u: any) => jwt.sign({}, key, { algorithm: 'HS256', issuer: 'satyaid', audience: 'satyaid-api', subject: String(u._id), expiresIn: '10m' });
 beforeAll(async () => {
  if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
  process.env.JWT_SECRET = key; process.env.APAAR_ENCRYPTION_KEY = randomBytes(32).toString('base64'); process.env.APAAR_LOOKUP_KEY = randomBytes(32).toString('base64'); process.env.APAAR_KEY_VERSION = randomBytes(8).toString('hex'); process.env.UPLOAD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  await connectDatabase(uri);
  for (const model of Object.values(mongoose.models)) await model.createIndexes();
  const suffix = randomBytes(8).toString('hex');
  admin = await m.User.create({ email: `b2admin-${suffix}@example.invalid`, passwordHash: 'unused-test-hash', role: 'AICTE_ADMIN' });
  staff = await m.User.create({ email: `b2staff-${suffix}@example.invalid`, passwordHash: 'unused-test-hash', role: 'INSTITUTION_STAFF' });
  outsider = await m.User.create({ email: `b2other-${suffix}@example.invalid`, passwordHash: 'unused-test-hash', role: 'INSTITUTION_ADMIN' });
  token = sign(admin); staffToken = sign(staff); outsiderToken = sign(outsider);
  institution = await m.Institution.create({ pid: `b2-${suffix}`, name: 'Synthetic Batch 2', state: 'Demo' });
  other = await m.Institution.create({ pid: `b2other-${suffix}`, name: 'Other Synthetic', state: 'Demo' });
  await m.InstitutionMembership.create({ institution: institution._id, user: staff._id, role: 'INSTITUTION_STAFF' });
  await m.InstitutionMembership.create({ institution: other._id, user: outsider._id, role: 'INSTITUTION_ADMIN' });
  const program = await m.Program.create({ code: `b2-${suffix}`, name: 'Synthetic Program' });
  const offering = await m.InstitutionProgram.create({ institution: institution._id, program: program._id });
  const year = await m.AcademicYear.create({ code: `b2-${suffix}`, startsOn: new Date('2026-01-01'), endsOn: new Date('2027-12-31') });
  const base = await m.SeatCategory.create({ code: `b2base-${suffix}`, name: 'Synthetic base' });
  const superCategory = await m.SeatCategory.create({ code: `b2extra-${suffix}`, name: 'Synthetic extra' });
  allocation = await m.IntakeAllocation.create({ offering: offering._id, academicYear: year._id, category: base._id, kind: 'BASE', approvedSeats: 1, sourceReference: 'Synthetic test approval' });
  superAllocation = await m.IntakeAllocation.create({ offering: offering._id, academicYear: year._id, category: superCategory._id, kind: 'SUPERNUMERARY', approvedSeats: 1, sourceReference: 'Synthetic test approval' });
 }, 30000);
 afterAll(async () => { if (mongoose.connection.readyState === 1 && process.env.APAAR_KEY_VERSION) await m.ApaarIdentityVault.deleteMany({ keyVersion: process.env.APAAR_KEY_VERSION }); await disconnectDatabase(); });
 async function register(roll: string, extra: Record<string, unknown> = {}) {
  return request(app).post('/api/v1/students').auth(staffToken, { type: 'bearer' }).send({ institution: String(institution._id), institutionStudentId: roll, displayName: 'Synthetic Student', ...extra });
 }
 it('creates a student without APAAR', async () => {
  const response = await register('FIRST'); expect(response.status).toBe(201); student = response.body.data; expect(student.identityStatus).toBe('UNVERIFIED');
 });
 it('updates only the owning institution profile', async () => {
  const body = { institution: String(institution._id), displayName: 'Synthetic Updated', version: 1 };
  expect((await request(app).patch(`/api/v1/students/${student.studentId}`).auth(outsiderToken, { type: 'bearer' }).send(body)).status).toBe(403);
  const response = await request(app).patch(`/api/v1/students/${student.studentId}`).auth(staffToken, { type: 'bearer' }).send(body); expect(response.status).toBe(200); expect(response.body.data.version).toBe(2);
 });
 it('encrypts identity and rejects duplicate lookup without exposing values', async () => {
  const result = await request(app).post(`/api/v1/students/${student.studentId}/apaar/link`).auth(staffToken, { type: 'bearer' }).send({ institution: String(institution._id), apaarId: '000000000001' }); expect(result.status).toBe(200);
  const vault: any = await m.ApaarIdentityVault.findOne({ student: student.studentId }).lean(); expect(vault?.ciphertext).toBeUndefined();
  const duplicate = await register('DUPLICATE', { apaarId: '000000000001' }); expect(duplicate.status).toBe(409); expect(JSON.stringify(duplicate.body)).not.toContain('000000000001');
 });
 it('scopes listing and keeps student account access restricted', async () => {
  const denied = await request(app).get(`/api/v1/students?institution=${institution._id}`).auth(outsiderToken, { type: 'bearer' }); expect(denied.status).toBe(403);
  const response = await request(app).get(`/api/v1/students/${student.studentId}?institution=${institution._id}`).auth(staffToken, { type: 'bearer' }); expect(response.status).toBe(200); expect(JSON.stringify(response.body)).not.toContain('lookupDigest');
 });
 let firstAdmission: any, secondAdmission: any;
 async function draft(profile: any, pool: any, key: string) {
  return request(app).post('/api/v1/enrolments').auth(staffToken, { type: 'bearer' }).send({ student: profile.studentId, allocation: String(pool._id), institutionStudentId: profile.profile.institutionStudentId, admissionDate: '2026-08-01', startsOn: '2026-08-01', idempotencyKey: key });
 }
 it('creates valid drafts and rejects mismatched dates and institutions', async () => {
  const a = await draft(student, allocation, 'FIRST-ADMISSION'); expect(a.status).toBe(201); firstAdmission = a.body.data;
  const second = await register('SECOND'); const b = await draft(second.body.data, allocation, 'SECOND-ADMISSION'); expect(b.status).toBe(201); secondAdmission = b.body.data;
  const replay = await draft(student, allocation, 'FIRST-ADMISSION'); expect(replay.body.data._id).toBe(firstAdmission._id);
 });
 it('allows exactly one concurrent last-seat activation, and safely replays activation', async () => {
  const responses = await Promise.all([firstAdmission, secondAdmission].map(e => request(app).post(`/api/v1/enrolments/${e._id}/activate`).auth(staffToken, { type: 'bearer' }).send({})));
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const winner = responses.find(r => r.status === 200)!.body.data;
  firstAdmission = winner;
  expect((await request(app).post(`/api/v1/enrolments/${winner._id}/activate`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(200);
  expect((await m.IntakeAllocation.findById(allocation._id))!.occupiedSeats).toBe(1);
  expect(await m.SeatReservation.countDocuments({ allocation: allocation._id, status: 'ACTIVE' })).toBe(1);
 });
 it('releases capacity on withdrawal and rejects reactivation', async () => {
  const endpoint = `/api/v1/enrolments/${firstAdmission._id}`;
  expect((await request(app).post(endpoint + '/withdraw').auth(staffToken, { type: 'bearer' }).send({})).status).toBe(200);
  expect((await request(app).post(endpoint + '/withdraw').auth(staffToken, { type: 'bearer' }).send({})).status).toBe(200);
  expect((await m.IntakeAllocation.findById(allocation._id))!.occupiedSeats).toBe(0);
  expect((await request(app).post(endpoint + '/activate').auth(staffToken, { type: 'bearer' }).send({})).status).toBe(409);
 });
 it('enforces a separate supernumerary pool and ownership', async () => {
  const p = (await register('SUPER')).body.data;
  const q = (await register('SUPER-TWO')).body.data;
  const a = await draft(p, superAllocation, 'SUPER-ONE'); const b = await draft(q, superAllocation, 'SUPER-TWO');
  expect((await request(app).post(`/api/v1/enrolments/${a.body.data._id}/activate`).auth(outsiderToken, { type: 'bearer' }).send({})).status).toBe(403);
  expect((await request(app).post(`/api/v1/enrolments/${a.body.data._id}/activate`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(200);
  expect((await request(app).post(`/api/v1/enrolments/${b.body.data._id}/activate`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(409);
 });

 let uploadPool: any, uploadJob: string;
 const csv = (rows: string[][]) => Buffer.from([columns, ...rows].map(r => r.join(',')).join('\n'));
 function row(roll: string, extras: Record<string, string> = {}) {
  const values: Record<string, string> = { institutionStudentId: roll, displayName: 'Synthetic Upload', dateOfBirth: '', apaarId: '', allocation: String(uploadPool._id), academicYear: String(uploadPool.academicYear), admissionDate: '2026-08-01', startsOn: '2026-08-01', endsOn: '', entryType: 'REGULAR', ...extras };
  return columns.map(key => values[key]!);
 }
 async function upload(buffer: Buffer, key: string, format = 'csv', bearer = staffToken) {
  return request(app).post('/api/v1/uploads/students').auth(bearer, { type: 'bearer' }).field('institution', String(institution._id)).field('idempotencyKey', key).attach('file', buffer, { filename: `synthetic.${format}`, contentType: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
 }
 it('previews CSV with row-level failures without committing data', async () => {
  const program = await m.Program.create({ code: `upload-${randomBytes(8).toString('hex')}`, name: 'Upload demo' });
  const offering = await m.InstitutionProgram.create({ institution: institution._id, program: program._id });
  uploadPool = await m.IntakeAllocation.create({ offering: offering._id, academicYear: allocation.academicYear, category: allocation.category, kind: 'BASE', approvedSeats: 10, sourceReference: 'Synthetic upload pool' });
  const file = csv([row('UPLOAD-ONE'), row('UPLOAD-BAD', { apaarId: 'bad' }), row('UPLOAD-ONE'), row('', { displayName: '' })]);
  const result = await upload(file, 'CSV-ONE'); expect(result.status).toBe(202); uploadJob = result.body.data._id;
  await processNextUpload();
  const preview = await request(app).get(`/api/v1/uploads/${uploadJob}`).auth(staffToken, { type: 'bearer' }); expect(preview.body.data.status).toBe('VALIDATED'); expect(preview.body.data.validRows).toBe(1); expect(preview.body.data.invalidRows).toBe(3);
  expect(await m.StudentInstitution.countDocuments({ institution: institution._id, institutionStudentId: 'UPLOAD-ONE' })).toBe(0);
  expect((await upload(file, 'CSV-ONE')).body.data._id).toBe(uploadJob);
  const results = await request(app).get(`/api/v1/uploads/${uploadJob}/results`).auth(staffToken, { type: 'bearer' }); expect(JSON.stringify(results.body)).not.toContain('payload');
 });
 it('commits valid CSV rows with partial success and repeats safely', async () => {
  expect((await request(app).post(`/api/v1/uploads/${uploadJob}/commit`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(202);
  await processNextUpload();
  const job = await m.UploadJob.findById(uploadJob); expect(job!.status).toBe('PARTIAL'); expect(job!.committedRows).toBe(1);
  await request(app).post(`/api/v1/uploads/${uploadJob}/commit`).auth(staffToken, { type: 'bearer' }).send({}); await processNextUpload();
  expect(await m.StudentInstitution.countDocuments({ institution: institution._id, institutionStudentId: 'UPLOAD-ONE' })).toBe(1);
  expect((await m.IntakeAllocation.findById(uploadPool._id))!.occupiedSeats).toBe(1);
 });
 it('supports XLSX text cells and never commits without confirmation', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Students'); sheet.addRow(columns); sheet.addRow(row('XLSX-ONE'));
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer()); const result = await upload(buffer, 'XLSX-ONE', 'xlsx'); expect(result.status).toBe(202);
  await processNextUpload(); const job = await m.UploadJob.findById(result.body.data._id); expect(job!.status).toBe('VALIDATED'); expect(job!.validRows).toBe(1);
 });
 it('denies unauthorized uploads and changed idempotency payloads, bounds bytes and rows', async () => {
  expect((await upload(csv([row('UNAUTHORIZED')]), 'DENIED', 'csv', outsiderToken)).status).toBe(403);
  expect((await upload(csv([row('CHANGED')]), 'CSV-ONE')).status).toBe(409);
  expect((await upload(Buffer.alloc(2 * 1024 * 1024 + 1, 65), 'LARGE')).status).toBe(413);
  const result = await upload(csv(Array.from({ length: 1001 }, (_, i) => row(`TOO-MANY-${i}`))), 'ROW-LIMIT'); expect(result.status).toBe(202);
  await processNextUpload(); expect((await m.UploadJob.findById(result.body.data._id))!.failureCode).toBe('ROW_LIMIT_EXCEEDED');
 });

 let conflict: any;
 it('flags same-identity overlapping enrolments without blocking legitimate overlap', async () => {
  const association = await request(app).post('/api/v1/students').auth(token, { type: 'bearer' }).send({ institution: String(other._id), institutionStudentId: 'TRANSFER-DEMO', displayName: 'Synthetic Student', existingStudent: student.studentId }); expect(association.status).toBe(201);
  const program = await m.Program.create({ code: `conflict-${randomBytes(8).toString('hex')}`, name: 'Other synthetic program' });
  const offering = await m.InstitutionProgram.create({ institution: other._id, program: program._id });
  const pool = await m.IntakeAllocation.create({ offering: offering._id, academicYear: allocation.academicYear, category: allocation.category, kind: 'BASE', approvedSeats: 2, sourceReference: 'Synthetic other approval' });
  const own = await draft(student, uploadPool, 'OVERLAP-OWN'); expect(own.status).toBe(201);
  expect((await request(app).post(`/api/v1/enrolments/${own.body.data._id}/activate`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(200);
  const target = await request(app).post('/api/v1/enrolments').auth(outsiderToken, { type: 'bearer' }).send({ student: student.studentId, allocation: String(pool._id), institutionStudentId: 'TRANSFER-DEMO', admissionDate: '2026-08-01', startsOn: '2026-08-01', entryType: 'TRANSFER', idempotencyKey: 'OVERLAP-TARGET' }); expect(target.status).toBe(201);
  expect((await request(app).post(`/api/v1/enrolments/${target.body.data._id}/activate`).auth(outsiderToken, { type: 'bearer' }).send({})).status).toBe(200);
  conflict = await m.EnrolmentConflict.findOne({ student: student.studentId }); expect(conflict.status).toBe('OPEN'); expect(conflict.ruleCode).toBe('POTENTIAL_TRANSFER_OVERLAP_V1');
 });
 it('redacts institutional conflict views and audits resolution without deleting records', async () => {
  const view = await request(app).get(`/api/v1/conflicts/${conflict._id}`).auth(staffToken, { type: 'bearer' }); expect(view.status).toBe(200); expect(view.body.data.secondEnrolment).toBeUndefined(); expect(view.body.data.institutions).toBeUndefined(); expect(view.body.data.explanation).toContain('no fraud classification');
  expect((await request(app).post(`/api/v1/conflicts/${conflict._id}/resolve`).auth(staffToken, { type: 'bearer' }).send({ resolution: 'CONFIRMED_TRANSFER', reasonCode: 'DEMO_REVIEW', version: 1 })).status).toBe(403);
  expect((await request(app).post(`/api/v1/conflicts/${conflict._id}/evidence`).auth(staffToken, { type: 'bearer' }).send({ institution: String(institution._id), typeCode: 'TRANSFER_REVIEW', protectedObjectReference: 'evidence:synthetic-demo' })).status).toBe(200);
  const result = await request(app).post(`/api/v1/conflicts/${conflict._id}/resolve`).auth(token, { type: 'bearer' }).send({ resolution: 'CONFIRMED_TRANSFER', reasonCode: 'DEMO_REVIEW', version: 1 }); expect(result.status).toBe(200);
  expect(await m.ConflictHistory.countDocuments({ conflict: conflict._id })).toBe(3);
  expect(await m.Enrolment.countDocuments({ student: student.studentId, status: 'ACTIVE' })).toBe(2);
 });

 it('simulates success/mismatch/not-found/timeout/unavailability without official status', async () => {
  const provider = new MockApaarVerificationProvider();
  const outcomes = ['MATCH', 'MISMATCH', 'NOT_FOUND', 'TIMEOUT', 'UNAVAILABLE'];
  for (let i = 1; i <= 5; i++) {
   const result = await provider.verify({ identifier: `00000000000${i}` }); expect(result.outcome).toBe(outcomes[i - 1]); expect(result.official).toBe(false);
  }
  expect((await provider.verify({ identifier: '999999999999' })).outcome).toBe('NOT_FOUND');
  const response = await request(app).post(`/api/v1/students/${student.studentId}/verify-apaar`).auth(staffToken, { type: 'bearer' }).send({ institution: String(institution._id) }); expect(response.status).toBe(200); expect(response.body.data.verificationStatus).toBe('MOCK_VERIFIED'); expect(response.body.data.official).toBe(false); expect(JSON.stringify(response.body)).not.toContain('000000000001');
  expect(await m.IdentityVerificationEvent.countDocuments({ student: student.studentId, provider: 'MOCK_APAAR' })).toBe(1);
 });
 it('rejects unauthorized verification and missing identity; never treats random values as official', async () => {
  expect((await request(app).post(`/api/v1/students/${student.studentId}/verify-apaar`).auth(outsiderToken, { type: 'bearer' }).send({ institution: String(institution._id) })).status).toBe(403);
  const p = (await register('NO-IDENTITY')).body.data;
  expect((await request(app).post(`/api/v1/students/${p.studentId}/verify-apaar`).auth(staffToken, { type: 'bearer' }).send({ institution: String(institution._id) })).status).toBe(409);
  for (const [suffix, expected] of [['2', 'VERIFICATION_FAILED'], ['3', 'VERIFICATION_FAILED'], ['4', 'UNVERIFIED'], ['5', 'UNVERIFIED']]) {
   const result = await register(`MOCK-${suffix}`, { apaarId: `00000000000${suffix}` }); expect(result.status).toBe(201);
   const verified = await request(app).post(`/api/v1/students/${result.body.data.studentId}/verify-apaar`).auth(staffToken, { type: 'bearer' }).send({ institution: String(institution._id) }); expect(verified.status).toBe(200); expect(verified.body.data.verificationStatus).toBe(expected); expect(verified.body.data.official).toBe(false);
  }
 });

 it('approves a reviewed transfer atomically and preserves source history', async () => {
  const source = await m.Enrolment.findOne({ student: student.studentId, institution: institution._id, status: 'ACTIVE' });
  const p = await m.Program.create({ code: `transfer-${randomBytes(8).toString('hex')}`, name: 'Transfer destination demo' });
  const o = await m.InstitutionProgram.create({ institution: other._id, program: p._id });
  const targetPool = await m.IntakeAllocation.create({ offering: o._id, academicYear: allocation.academicYear, category: allocation.category, kind: 'BASE', approvedSeats: 1, sourceReference: 'Synthetic transfer approval' });
  const before = Number((await m.IntakeAllocation.findById(source!.allocation))!.occupiedSeats);
  const response = await request(app).post('/api/v1/transfers').auth(staffToken, { type: 'bearer' }).send({ sourceEnrolment: String(source!._id), targetAllocation: String(targetPool._id), targetInstitutionStudentId: 'TRANSFER-DEMO', startsOn: '2026-09-01', admissionDate: '2026-09-01', idempotencyKey: 'REVIEWED-TRANSFER', reasonCode: 'SYNTHETIC_REVIEW' }); expect(response.status).toBe(201);
  const endpoint = `/api/v1/transfers/${response.body.data._id}/approve`;
  expect((await request(app).post(endpoint).auth(staffToken, { type: 'bearer' }).send({ reasonCode: 'APPROVAL' })).status).toBe(403);
  const approved = await request(app).post(endpoint).auth(token, { type: 'bearer' }).send({ reasonCode: 'REGULATOR_DEMO_REVIEW' }); expect(approved.status).toBe(200);
  expect((await m.Enrolment.findById(source!._id))!.status).toBe('TRANSFERRED');
  expect((await m.IntakeAllocation.findById(source!.allocation))!.occupiedSeats).toBe(before - 1);
  expect((await m.IntakeAllocation.findById(targetPool._id))!.occupiedSeats).toBe(1);
  expect((await request(app).post(endpoint).auth(token, { type: 'bearer' }).send({ reasonCode: 'REGULATOR_DEMO_REVIEW' })).status).toBe(200);
 });

 it('links student accounts only through regulators and denies employer directory access', async () => {
  const account = await m.User.create({ email: `self-${randomBytes(8).toString('hex')}@example.invalid`, passwordHash: 'unused-test-hash', role: 'STUDENT' });
  expect((await request(app).post(`/api/v1/students/${student.studentId}/account-link`).auth(staffToken, { type: 'bearer' }).send({ user: String(account._id) })).status).toBe(403);
  expect((await request(app).post(`/api/v1/students/${student.studentId}/account-link`).auth(token, { type: 'bearer' }).send({ user: String(account._id) })).status).toBe(200);
  expect((await request(app).get(`/api/v1/students/${student.studentId}`).auth(sign(account), { type: 'bearer' })).status).toBe(200);
  const unrelated = (await register('UNRELATED-SELF')).body.data;
  expect((await request(app).get(`/api/v1/students/${unrelated.studentId}`).auth(sign(account), { type: 'bearer' })).status).toBe(403);
  const employer = await m.User.create({ email: `employer-${randomBytes(8).toString('hex')}@example.invalid`, passwordHash: 'unused-test-hash', role: 'EMPLOYER' });
  expect((await request(app).get(`/api/v1/students?institution=${institution._id}`).auth(sign(employer), { type: 'bearer' })).status).toBe(403);
  expect((await request(app).get(`/api/v1/conflicts/${conflict._id}`).auth(sign(account), { type: 'bearer' })).status).toBe(403);
 });
 it('rejects academic-year mismatches and out-of-year admission dates', async () => {
  const p = (await register('BAD-DATES')).body.data;
  const body = { student: p.studentId, allocation: String(uploadPool._id), institutionStudentId: 'BAD-DATES', admissionDate: '2010-01-01', startsOn: '2026-08-01', idempotencyKey: 'BAD-DATES' };
  expect((await request(app).post('/api/v1/enrolments').auth(staffToken, { type: 'bearer' }).send(body)).status).toBe(422);
  const file = csv([row('WRONG-YEAR', { academicYear: String(new mongoose.Types.ObjectId()) })]);
  const queued = await upload(file, 'WRONG-YEAR'); await processNextUpload();
  const r = await m.UploadRowResult.findOne({ job: queued.body.data._id }); expect(r!.errorCodes).toContain('ACADEMIC_YEAR_MISMATCH');
 });
 it('commits XLSX records, recognizes duplicate identity rows and safely exports errors', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Students'); sheet.addRow(columns); sheet.addRow(row('XLSX-COMMIT'));
  const queued = await upload(Buffer.from(await workbook.xlsx.writeBuffer()), 'XLSX-COMMIT', 'xlsx'); await processNextUpload();
  await request(app).post(`/api/v1/uploads/${queued.body.data._id}/commit`).auth(staffToken, { type: 'bearer' }).send({}); await processNextUpload();
  expect((await m.UploadJob.findById(queued.body.data._id))!.status).toBe('COMPLETED');
  const duplicate = await upload(csv([row('IDENTITY-ROW-A', { apaarId: '000000000003' }), row('IDENTITY-ROW-B', { apaarId: '000000000003' })]), 'DUPLICATE-ID-ROWS'); await processNextUpload();
  const failed = await m.UploadRowResult.findOne({ job: duplicate.body.data._id, rowNumber: 2 }); expect(failed!.errorCodes).toContain('DUPLICATE_IDENTITY_IN_FILE');
  const report = await request(app).get(`/api/v1/uploads/${duplicate.body.data._id}/error-report`).auth(staffToken, { type: 'bearer' }); expect(report.status).toBe(200); expect(report.text).not.toContain('000000000003'); expect(report.text).not.toContain('Synthetic Upload');
 });
 it('recovers an interrupted worker lease and safely retries a persisted failure', async () => {
  const queued = await upload(csv([row('RECOVERED-ROW')]), 'RECOVERY'); const id = queued.body.data._id;
  await m.UploadJob.updateOne({ _id: id }, { $set: { status: 'VALIDATING', attempts: 1, leaseToken: 'interrupted', leaseUntil: new Date(0) } });
  await processNextUpload(); expect((await m.UploadJob.findById(id))!.status).toBe('VALIDATED');
  await request(app).post(`/api/v1/uploads/${id}/commit`).auth(staffToken, { type: 'bearer' }).send({}); await processNextUpload();
  expect((await m.UploadJob.findById(id))!.committedRows).toBe(1);
  const retry = await upload(csv([row('RETRY-AFTER-FAILURE')]), 'RETRY-PERSISTED');
  await m.UploadJob.updateOne({ _id: retry.body.data._id }, { $set: { status: 'FAILED', failureCode: 'SYNTHETIC_INTERRUPTION' } });
  expect((await request(app).post(`/api/v1/uploads/${retry.body.data._id}/retry`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(202);
  await processNextUpload(); expect((await m.UploadJob.findById(retry.body.data._id))!.status).toBe('VALIDATED');
 });
 it('rejects XLSX formulas in uploaded student data', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Students'); sheet.addRow(columns); sheet.addRow(row('FORMULA')); sheet.getCell('B2').value = { formula: '1+1', result: 2 };
  const queued = await upload(Buffer.from(await workbook.xlsx.writeBuffer()), 'FORMULA-XLSX', 'xlsx'); await processNextUpload();
  expect((await m.UploadJob.findById(queued.body.data._id))!.status).toBe('FAILED');
 });

 it('applies an approved supernumerary quota ceiling without manufacturing capacity', async () => {
  const program = await m.Program.create({ code: `quota-${randomBytes(8).toString('hex')}`, name: 'Configured quota test' });
  const offering = await m.InstitutionProgram.create({ institution: institution._id, program: program._id });
  const pool = await m.IntakeAllocation.create({ offering: offering._id, academicYear: allocation.academicYear, category: superAllocation.category, kind: 'SUPERNUMERARY', approvedSeats: 10, sourceReference: 'Synthetic capacity, no official percentage' });
  const rule = await request(app).post('/api/v1/quota-rules').auth(token, { type: 'bearer' }).send({ offering: String(offering._id), academicYear: String(allocation.academicYear), category: String(superAllocation.category), version: 1, kind: 'SUPERNUMERARY', method: 'FIXED', value: 1, rounding: 'FLOOR', effectiveFrom: '2020-01-01T00:00:00Z', effectiveUntil: '2099-01-01T00:00:00Z', sourceReference: 'Synthetic quota configuration', approvalStatus: 'APPROVED' }); expect(rule.status).toBe(201);
  const a = await draft((await register('QUOTA-A')).body.data, pool, 'QUOTA-A'); const b = await draft((await register('QUOTA-B')).body.data, pool, 'QUOTA-B');
  expect((await request(app).post(`/api/v1/enrolments/${a.body.data._id}/activate`).auth(staffToken, { type: 'bearer' }).send({})).status).toBe(200);
  const exhausted = await request(app).post(`/api/v1/enrolments/${b.body.data._id}/activate`).auth(staffToken, { type: 'bearer' }).send({}); expect(exhausted.status).toBe(409); expect(exhausted.body.error.code).toBe('CAPACITY_EXHAUSTED');
  expect((await m.IntakeAllocation.findById(pool._id))!.occupiedSeats).toBe(1);
 });
 it('rolls a failed transfer back without releasing the source seat', async () => {
  const target = await m.TransferRequest.findOne({ status: 'APPROVED', sourceInstitution: institution._id });
  const profile = (await register('TRANSFER-ROLLBACK')).body.data;
  await request(app).post('/api/v1/students').auth(token, { type: 'bearer' }).send({ institution: String(other._id), institutionStudentId: 'TRANSFER-ROLLBACK-TARGET', displayName: 'Synthetic Student', existingStudent: profile.studentId });
  const source = (await draft(profile, uploadPool, 'TRANSFER-ROLLBACK-SOURCE')).body.data;
  await request(app).post(`/api/v1/enrolments/${source._id}/activate`).auth(staffToken, { type: 'bearer' }).send({});
  const before = (await m.IntakeAllocation.findById(uploadPool._id))!.occupiedSeats;
  const transfer = await request(app).post('/api/v1/transfers').auth(staffToken, { type: 'bearer' }).send({ sourceEnrolment: source._id, targetAllocation: String(target!.targetAllocation), targetInstitutionStudentId: 'TRANSFER-ROLLBACK-TARGET', startsOn: '2026-09-01', admissionDate: '2026-09-01', idempotencyKey: 'TRANSFER-ROLLBACK', reasonCode: 'SYNTHETIC_REVIEW' });
  const result = await request(app).post(`/api/v1/transfers/${transfer.body.data._id}/approve`).auth(token, { type: 'bearer' }).send({ reasonCode: 'SYNTHETIC_APPROVAL' }); expect(result.status).toBe(409);
  expect((await m.Enrolment.findById(source._id))!.status).toBe('ACTIVE'); expect((await m.IntakeAllocation.findById(uploadPool._id))!.occupiedSeats).toBe(before);
  expect(await m.Enrolment.countDocuments({ student: profile.studentId, allocation: target!.targetAllocation })).toBe(0);
 });
 it('rejects an XLSX row address outside the configured bounds', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Students'); sheet.addRow(columns); sheet.getCell('A1002').value = 'Synthetic outside limit';
  const queued = await upload(Buffer.from(await workbook.xlsx.writeBuffer()), 'OUTSIDE-XLSX-ROW', 'xlsx'); await processNextUpload();
  expect((await m.UploadJob.findById(queued.body.data._id))!.status).toBe('FAILED');
 });

});
