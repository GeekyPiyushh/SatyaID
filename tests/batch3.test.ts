import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import * as m from '../src/models';
import { createStudent } from '../src/services/student';
import { processNextReport, csvCell } from '../src/services/regulatory/reports';
import { createEnrolment, changeAdmission } from '../src/services/admissions';
const app = createApp({ CORS_ORIGINS: [] });
const uri = process.env.TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
suite('Batch 3 replica-set governance', () => {
 let admin: any, staff: any, otherStaff: any, account: any, wrongStudent: any, employer: any, otherEmployer: any;
 let institution: any, otherInstitution: any, offering: any, year: any, pool: any, student: any, enrolment: any, program: any;
 const secret = randomBytes(40).toString('hex');
 const token = (u: any) => jwt.sign({}, secret, { subject: String(u._id), algorithm: 'HS256', issuer: 'satyaid', audience: 'satyaid-api', expiresIn: '10m' });
 beforeAll(async () => {
  if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Dedicated test database required');
  process.env.AUDIT_HMAC_KEY = randomBytes(32).toString('base64'); process.env.AUDIT_KEY_VERSION = randomBytes(8).toString('hex');
  process.env.JWT_SECRET = secret; await connectDatabase(uri);
  for (const model of Object.values(mongoose.models)) await model.createIndexes();
  const suffix = randomBytes(8).toString('hex');
  const user = (role: string, name: string) => m.User.create({ email: `${name}-${suffix}@example.invalid`, passwordHash: 'unused-test-account', role });
  admin = await user('AICTE_ADMIN', 'admin'); staff = await user('INSTITUTION_ADMIN', 'staff'); otherStaff = await user('INSTITUTION_STAFF', 'other'); account = await user('STUDENT', 'student'); wrongStudent = await user('STUDENT', 'wrong-student'); employer = await user('EMPLOYER', 'employer'); otherEmployer = await user('EMPLOYER', 'other-employer');
  institution = await m.Institution.create({ pid: `governance-${suffix}`, name: 'Synthetic Governance Institute', state: 'Synthetic State' });
  otherInstitution = await m.Institution.create({ pid: `governance-other-${suffix}`, name: 'Synthetic Other Institute', state: 'Synthetic State' });
  await m.InstitutionMembership.create({ user: staff._id, institution: institution._id, role: 'INSTITUTION_ADMIN' }); await m.InstitutionMembership.create({ user: otherStaff._id, institution: otherInstitution._id, role: 'INSTITUTION_STAFF' });
  program = await m.Program.create({ code: `gov-${suffix}`, name: 'Synthetic Governance Program' });
  offering = await m.InstitutionProgram.create({ institution: institution._id, program: program._id });
  const otherOffering = await m.InstitutionProgram.create({ institution: otherInstitution._id, program: program._id });
  year = await m.AcademicYear.create({ code: `gov-${suffix}`, startsOn: new Date('2026-01-01'), endsOn: new Date('2027-12-31') });
  const category = await m.SeatCategory.create({ code: `gov-${suffix}`, name: 'Synthetic base' });
  const extra = await m.SeatCategory.create({ code: `gov-extra-${suffix}`, name: 'Synthetic extra' });
  pool = await m.IntakeAllocation.create({ offering: offering._id, academicYear: year._id, category: category._id, kind: 'BASE', approvedSeats: 10, sourceReference: 'Synthetic fixture approval' });
  await m.IntakeAllocation.create({ offering: offering._id, academicYear: year._id, category: extra._id, kind: 'SUPERNUMERARY', approvedSeats: 2, sourceReference: 'Synthetic fixture approval' });
  const otherPool = await m.IntakeAllocation.create({ offering: otherOffering._id, academicYear: year._id, category: category._id, kind: 'BASE', approvedSeats: 6, sourceReference: 'Synthetic fixture approval' });
  const created = await createStudent(admin, { institution: String(institution._id), institutionStudentId: 'GOV-001', displayName: 'Synthetic Governance Student' });
  student = await m.Student.findById(created.studentId); await m.Student.updateOne({ _id: student._id }, { $set: { user: account._id } });
  await createStudent(admin, { existingStudent: String(student._id), institution: String(otherInstitution._id), institutionStudentId: 'OTHER-GOV-001', displayName: 'Synthetic Governance Student' });
  enrolment = await createEnrolment(admin, { student: String(student._id), allocation: String(pool._id), institutionStudentId: 'GOV-001', startsOn: '2026-08-01', admissionDate: '2026-08-01', entryType: 'REGULAR', idempotencyKey: `gov-${suffix}` }); await changeAdmission(admin, String(enrolment._id), 'activate');
  const e = await createEnrolment(admin, { student: String(student._id), allocation: String(otherPool._id), institutionStudentId: 'OTHER-GOV-001', startsOn: '2026-08-01', admissionDate: '2026-08-01', entryType: 'REGULAR', idempotencyKey: `gov-other-${suffix}` }); await changeAdmission(admin, String(e._id), 'activate');
 }, 30000);
 afterAll(disconnectDatabase);
 const get = (path: string, u: any) => request(app).get('/api/v1' + path).auth(token(u), { type: 'bearer' });
 const post = (path: string, u: any, body: object) => request(app).post('/api/v1' + path).auth(token(u), { type: 'bearer' }).send(body);
 it('reconciles scoped base/extra counters and avoids double-counting shared students', async () => {
  const result = await get(`/analytics/national/overview?academicYear=${year._id}&program=${program._id}`, admin); expect(result.status).toBe(200);
  expect(result.body.data.approvedBaseIntake).toBe(16); expect(result.body.data.approvedSupernumeraryIntake).toBe(2); expect(result.body.data.occupiedSeats).toBe(2); expect(result.body.data.activeReservations).toBe(2); expect(result.body.data.uniqueStudents).toBe(1); expect(result.body.data.openConflicts).toBe(1);
  expect(result.body.data.utilizationPercentage).toBe(11.11); expect(JSON.stringify(result.body)).not.toContain('Synthetic Governance Student');
 });
 it('restricts national and cross-institution analytics and filters utilization', async () => {
  expect((await get('/analytics/national/overview', staff)).status).toBe(403);
  expect((await get(`/analytics/institutions/${institution._id}/overview`, otherStaff)).status).toBe(403);
  const own = await get(`/analytics/institutions/${institution._id}/overview?academicYear=${year._id}`, staff); expect(own.status).toBe(200); expect(own.body.data.approvedSeats).toBe(12); expect(own.body.data.occupiedSeats).toBe(1);
  expect((await get(`/analytics/intake-utilization?institution=${institution._id}&academicYear=${year._id}&category=${pool.category}`, staff)).body.data.items).toHaveLength(1);
 });
 it('handles zero denominators and returns bounded non-PII trends', async () => {
  const empty = await get(`/analytics/national/overview?academicYear=${new mongoose.Types.ObjectId()}`, admin); expect(empty.status).toBe(200); expect(empty.body.data.approvedSeats).toBe(0); expect(empty.body.data.utilizationPercentage).toBe(0);
  const trends = await get(`/analytics/enrolments/trends?institution=${institution._id}&academicYear=${year._id}`, staff); expect(trends.status).toBe(200); expect(trends.body.data.items[0].count).toBe(1);
  expect((await get('/analytics/uploads/summary', employer)).status).toBe(403);
 });
 let sharing: any, credential: any;
 async function inviteAndRequest() {
  const invitation = await post('/verification/invitations', account, { enrolment: String(enrolment._id), employer: String(employer._id), claims: ['INSTITUTION', 'PROGRAM', 'ENROLMENT_STATUS'], expiresInSeconds: 900 }); expect(invitation.status).toBe(201);
  const result = await post('/verification/requests', employer, { invitationToken: invitation.body.data.token, purposeCode: 'EMPLOYMENT_SCREENING', claims: ['INSTITUTION', 'PROGRAM'], expiresInSeconds: 3600 }); expect(result.status).toBe(201);
  return { ...result.body.data, invitation: invitation.body.data };
 }
 it('requires approved employers and uses one-time employer-bound invitations', async () => {
  expect((await post('/verification/requests', employer, { invitationToken: 'A'.repeat(64), purposeCode: 'DEMO', claims: ['INSTITUTION'] })).status).toBe(403);
  for (const e of [employer, otherEmployer]) expect((await post('/verification/employers', admin, { user: String(e._id), organization: 'Synthetic Hiring Organization', status: 'APPROVED', approvalReference: 'SYNTHETIC_REVIEW' })).status).toBe(200);
  sharing = await inviteAndRequest();
  expect((await post('/verification/requests', employer, { invitationToken: sharing.invitation.token, purposeCode: 'DEMO', claims: ['INSTITUTION'] })).status).toBe(404);
  const invalid = await post('/verification/requests', employer, { invitationToken: 'A'.repeat(64), purposeCode: 'DEMO', claims: ['INSTITUTION'] });
  const wrongOwner = await post('/verification/requests', otherEmployer, { invitationToken: sharing.invitation.token, purposeCode: 'DEMO', claims: ['INSTITUTION'] }); expect(invalid.status).toBe(404); expect(wrongOwner.body.error).toEqual(invalid.body.error);
  const stored: any = await m.VerificationInvitation.findById(sharing.invitation.invitationId).select('+digest').lean(); expect(JSON.stringify(stored)).not.toContain(sharing.invitation.token);
 });
 it('permits only the linked student to grant a subset and denies expansion', async () => {
  const path = `/consents/${sharing.consentRequestId}/approve`;
  expect((await post(path, wrongStudent, { claims: ['INSTITUTION'] })).status).toBe(404);
  expect((await post(path, admin, { claims: ['INSTITUTION'] })).status).toBe(403);
  expect((await get(`/verification/requests/${sharing.requestId}/result`, employer)).status).toBe(404);
  expect((await post(path, account, { claims: ['START_DATE'] })).status).toBe(422);
  expect((await post(path, account, { claims: ['INSTITUTION'], expiresInSeconds: 3600 })).status).toBe(200);
  const result = await get(`/verification/requests/${sharing.requestId}/result`, employer); expect(result.status).toBe(200); expect(Object.keys(result.body.data.claims)).toEqual(['INSTITUTION']); expect(result.body.data.governmentCertified).toBe(false);
  const text = JSON.stringify(result.body); for (const field of ['Synthetic Governance Student', 'apaar', 'lookupDigest', 'ciphertext', 'GOV-001', 'OTHER-GOV-001']) expect(text).not.toContain(field);
  expect((await get(`/verification/requests/${sharing.requestId}/result`, otherEmployer)).status).toBe(404);
  expect((await get('/consents/requests', account)).body.data.items.some((r: any) => r.consentRequestId === sharing.consentRequestId)).toBe(true);
 });
 it('issues an opaque QR-compatible reference requiring the intended authenticated employer', async () => {
  expect((await post('/credentials', account, { request: sharing.requestId, claims: ['PROGRAM'] })).status).toBe(422);
  const issued = await post('/credentials', account, { request: sharing.requestId, claims: ['INSTITUTION'], expiresInSeconds: 600 }); expect(issued.status).toBe(201); credential = issued.body.data;
  const stored: any = await m.DigitalCredential.findById(credential.credentialId).select('+tokenDigest').lean(); expect(JSON.stringify(stored)).not.toContain(credential.token);
  expect((await request(app).post('/api/v1/credentials/verify').send({ token: credential.token })).status).toBe(401);
  expect((await post('/credentials/verify', otherEmployer, { token: credential.token })).status).toBe(404);
  expect((await post('/credentials/verify', employer, { token: (credential.token[0] === 'A' ? 'B' : 'A') + credential.token.slice(1) })).status).toBe(404);
  const verified = await post('/credentials/verify', employer, { token: credential.token }); expect(verified.status).toBe(200); expect(Object.keys(verified.body.data.claims)).toEqual(['INSTITUTION']);
  const metadata = await get(`/credentials/${credential.credentialId}`, employer); expect(metadata.status).toBe(200); expect(metadata.body.data.tokenDigest).toBeUndefined(); expect(metadata.body.data.token).toBeUndefined();
  expect((await get(`/credentials/${credential.credentialId}`, otherEmployer)).status).toBe(404);
 });
 it('makes student consent revocation effective on subsequent live and QR disclosures', async () => {
  expect((await post(`/consents/${sharing.consentRequestId}/revoke`, wrongStudent, {})).status).toBe(404);
  expect((await post(`/consents/${sharing.consentRequestId}/revoke`, account, {})).status).toBe(200);
  expect((await get(`/verification/requests/${sharing.requestId}/result`, employer)).status).toBe(404);
  expect((await post('/credentials/verify', employer, { token: credential.token })).status).toBe(404);
  expect((await post('/credentials', account, { request: sharing.requestId })).status).toBe(404);
  const history = await get('/consents/history', account); expect(history.status).toBe(200); expect(history.body.data.items.some((e: any) => e.eventCode === 'CLAIMS_DISCLOSED')).toBe(true);
 });
 it('enforces consent and credential expiry, rejection and explicit credential revocation', async () => {
  const expiring = await inviteAndRequest(); await post(`/consents/${expiring.consentRequestId}/approve`, account, { claims: ['INSTITUTION'], expiresInSeconds: 600 });
  const issued = await post('/credentials', account, { request: expiring.requestId, expiresInSeconds: 600 }); expect(issued.status).toBe(201);
  await m.DigitalCredential.updateOne({ _id: issued.body.data.credentialId }, { $set: { expiresAt: new Date(0) } }); expect((await post('/credentials/verify', employer, { token: issued.body.data.token })).status).toBe(404);
  const second = await post('/credentials', account, { request: expiring.requestId, expiresInSeconds: 600 });
  expect((await post(`/credentials/${second.body.data.credentialId}/revoke`, account, {})).status).toBe(200); expect((await post('/credentials/verify', employer, { token: second.body.data.token })).status).toBe(404);
  await m.ConsentGrant.updateOne({ request: expiring.consentRequestId }, { $set: { expiresAt: new Date(0) } }); expect((await get(`/verification/requests/${expiring.requestId}/result`, employer)).status).toBe(404);
  const rejected = await inviteAndRequest(); expect((await post(`/consents/${rejected.consentRequestId}/reject`, account, {})).status).toBe(200); expect((await get(`/verification/requests/${rejected.requestId}/result`, employer)).status).toBe(404);
 });

 let generatedReport: any;
 it('generates snapshot-backed reports with scoped provenance and protected downloads', async () => {
  const queued = await post('/reports', staff, { reportType: 'INTAKE_UTILIZATION', format: 'JSON', filters: { institution: String(institution._id), academicYear: String(year._id) } }); expect(queued.status).toBe(202); generatedReport = queued.body.data;
  expect((await get(`/reports/${generatedReport.reportId}/download`, staff)).status).toBe(409);
  await processNextReport();
  const metadata = await get(`/reports/${generatedReport.reportId}`, staff); expect(metadata.body.data.status).toBe('COMPLETED'); expect(metadata.body.data.content).toBeUndefined(); expect(metadata.body.data.metadata.officialFiling).toBe(false);
  const download = await get(`/reports/${generatedReport.reportId}/download`, staff); expect(download.status).toBe(200); expect(download.body.rows).toHaveLength(2); expect(download.body.rows.reduce((sum: number, r: any) => sum + r.approvedSeats, 0)).toBe(12); expect(download.body.metadata.consistency).toContain('snapshot');
  expect((await get(`/reports/${generatedReport.reportId}/download`, otherStaff)).status).toBe(404);
  expect((await post('/reports', employer, { reportType: 'ENROLMENT_SUMMARY', format: 'JSON', filters: { institution: String(institution._id) } })).status).toBe(403);
 });
 it('supports JSON/CSV reports and neutralizes spreadsheet injection', async () => {
  expect(csvCell('=WEBSERVICE("synthetic")')).toMatch(/^"'/); expect(csvCell('  +SUM(1)')).toMatch(/^"'/);
  const result = await post('/reports', staff, { reportType: 'IDENTITY_STATUS', format: 'CSV', filters: { institution: String(institution._id), academicYear: String(year._id) } }); expect(result.status).toBe(202); await processNextReport();
  const downloaded = await get(`/reports/${result.body.data.reportId}/download`, staff); expect(downloaded.status).toBe(200); expect(downloaded.headers['content-type']).toContain('text/csv'); expect(downloaded.text).toContain('generatorVersion'); expect(downloaded.text).not.toContain('Synthetic Governance Student');
 });
 it('records controlled report failures without misleading success or private diagnostics', async () => {
  const queued = await post('/reports', staff, { reportType: 'ENROLMENT_SUMMARY', format: 'JSON', filters: { institution: String(institution._id) } });
  await m.ReportJob.updateOne({ _id: queued.body.data.reportId }, { $set: { reportType: 'SYNTHETIC_UNSUPPORTED' } }); await processNextReport();
  const result = await get(`/reports/${queued.body.data.reportId}`, staff); expect(result.body.data.status).toBe('FAILED'); expect(result.body.data.failureCode).toBe('UNSUPPORTED_REPORT_TYPE'); expect((await get(`/reports/${queued.body.data.reportId}/download`, staff)).status).toBe(409);
 });
 it('prevalidates counter disagreements and missing approvals without changing admissions', async () => {
  await m.IntakeAllocation.updateOne({ _id: pool._id }, { $inc: { occupiedSeats: 1 } });
  const invalid = await m.Enrolment.create({ student: student._id, allocation: new mongoose.Types.ObjectId(), institution: institution._id, offering: offering._id, academicYear: year._id, category: pool.category, status: 'DRAFT' });
  const before = await m.Enrolment.countDocuments({ institution: institution._id });
  const result = await get(`/reports/prevalidation?institution=${institution._id}&academicYear=${year._id}`, staff); expect(result.status).toBe(200); expect(result.body.data.findings.some((f: any) => f.ruleId === 'COUNTER_RECONCILIATION_V1')).toBe(true); expect(result.body.data.findings.some((f: any) => f.ruleId === 'MISSING_ALLOCATION_V1' && f.affectedReference === String(invalid._id))).toBe(true);
  expect(await m.Enrolment.countDocuments({ institution: institution._id })).toBe(before);
  await m.IntakeAllocation.updateOne({ _id: pool._id }, { $inc: { occupiedSeats: -1 } });
 });
 it('captures audit actor/correlation metadata and detects signed-event tampering', async () => {
  const event = await m.AuditEvent.create({ actor: admin._id, institution: institution._id, action: 'CONTROLLED_INTEGRITY_TEST', resourceType: 'Institution', resourceId: institution._id });
  expect(event.actorRole).toBe('AICTE_ADMIN'); expect(event.correlationId).toBeTruthy();
  const before = await get(`/audit/integrity?institution=${institution._id}&limit=100`, admin); expect(before.status).toBe(200); expect(before.body.data.checks.find((e: any) => e.eventId === String(event._id)).status).toBe('VALID');
  await m.AuditEvent.updateOne({ _id: event._id }, { $set: { action: 'CONTROLLED_TAMPERING' } });
  const after = await get(`/audit/integrity?institution=${institution._id}&limit=100`, admin); expect(after.body.data.checks.find((e: any) => e.eventId === String(event._id)).status).toBe('INVALID');
  const scoped = await get(`/audit/events?institution=${institution._id}`, staff); expect(scoped.status).toBe(200); expect(scoped.body.data.items[0].actor).toBeUndefined(); expect(JSON.stringify(scoped.body)).not.toContain(process.env.AUDIT_HMAC_KEY!);
  expect((await get(`/audit/events?institution=${institution._id}`, otherStaff)).status).toBe(403); expect((await get('/audit/integrity', staff)).status).toBe(403);
 });

 it('returns insufficient-data scorecards and enforces institution scope', async () => {
  const response = await get(`/intelligence/institutions/${institution._id}/quality-score?academicYear=${year._id}`, staff); expect(response.status).toBe(200); expect(response.body.data.insufficientData).toBe(true); expect(response.body.data.score).toBeNull(); expect(response.body.data.components.reduce((sum: number, c: any) => sum + c.weight, 0)).toBe(100);
  expect((await get(`/intelligence/institutions/${institution._id}/health?academicYear=${year._id}`, otherStaff)).status).toBe(403);
  expect((await get(`/intelligence/anomalies?institution=${institution._id}&academicYear=${year._id}`, employer)).status).toBe(403);
 });
 it('explains deterministic anomaly evidence without fraud or predictive claims', async () => {
  const job = await m.UploadJob.create({ institution: institution._id, submittedBy: admin._id, idempotencyKey: `signal-${randomBytes(8).toString('hex')}`, status: 'PARTIAL', totalRows: 10, invalidRows: 5, validRows: 5, committedRows: 5 });
  await m.UploadRowResult.create(Array.from({ length: 10 }, (_, i) => ({ job: job._id, rowNumber: i + 1, status: i < 5 ? 'INVALID' : 'COMMITTED', errorCodes: i < 5 ? ['SYNTHETIC_FORMAT_ERROR'] : [] })));
  await m.IdentityVerificationEvent.create(Array.from({ length: 5 }, () => ({ institution: institution._id, student: student._id, actor: admin._id, status: 'VERIFICATION_FAILED', provider: 'MOCK_APAAR', providerVersion: '1', reasonCode: 'MISMATCH' })));
  const result = await get(`/intelligence/anomalies?institution=${institution._id}&academicYear=${year._id}`, staff); expect(result.status).toBe(200);
  const upload = result.body.data.alerts.find((a: any) => a.ruleId === 'UPLOAD_REJECTION_PRESSURE_V1'); expect(upload.evidence).toMatchObject({ rejectedRows: 5, observedRows: 10, percentage: 50 });
  const identity = result.body.data.alerts.find((a: any) => a.ruleId === 'IDENTITY_MISMATCH_REVIEW_V1'); expect(identity.evidence.providers).toEqual(['MOCK_APAAR']); expect(identity.evidence.syntheticProviderWarning).toContain('simulations');
 });
 it('simulates decimal quota effects read-only and never grants additional seats', async () => {
  const body = { institution: String(institution._id), academicYear: String(year._id), category: String(pool.category), asOf: '2026-10-24T00:00:00Z', hypothetical: { kind: 'BASE', method: 'PERCENTAGE', value: 70, rounding: 'CEILING' } };
  const before = (await m.IntakeAllocation.findById(pool._id))!.toObject(); const rules = await m.QuotaRule.countDocuments({ offering: offering._id }); const audits = await m.AuditEvent.countDocuments({ institution: institution._id });
  expect((await post('/intelligence/policy-simulations', staff, body)).status).toBe(403);
  const result = await post('/intelligence/policy-simulations', admin, body); expect(result.status).toBe(200); expect(result.body.data.label).toContain('HYPOTHETICAL'); expect(result.body.data.rows[0].hypotheticalEffectiveCeiling).toBe(7); expect(result.body.data.rows[0].difference).toBe(-3);
  const large = await post('/intelligence/policy-simulations', admin, { ...body, hypothetical: { kind: 'BASE', method: 'FIXED', value: 100, rounding: 'FLOOR' } }); expect(large.status).toBe(200); expect(large.body.data.rows[0].hypotheticalEffectiveCeiling).toBe(10); expect(large.body.data.rows[0].additionalApprovalNeededForFullHypotheticalQuota).toBe(90);
  expect((await m.IntakeAllocation.findById(pool._id))!.toObject()).toEqual(before); expect(await m.QuotaRule.countDocuments({ offering: offering._id })).toBe(rules); expect(await m.AuditEvent.countDocuments({ institution: institution._id })).toBe(audits);
 });

 it('enforces configurable lifetimes and request expiry independently of consent expiry', async () => {
  expect((await post('/verification/invitations', account, { enrolment: String(enrolment._id), employer: String(employer._id), claims: ['INSTITUTION'], expiresInSeconds: 901 })).status).toBe(422);
  const next = await inviteAndRequest(); await post(`/consents/${next.consentRequestId}/approve`, account, { claims: ['INSTITUTION'] });
  await m.VerificationRequest.updateOne({ _id: next.requestId }, { $set: { expiresAt: new Date(0) } });
  expect((await get(`/verification/requests/${next.requestId}/result`, employer)).status).toBe(404);
 });
 it('rechecks active student account linkage and employer authorization before disclosure', async () => {
  const next = await inviteAndRequest(); await post(`/consents/${next.consentRequestId}/approve`, account, { claims: ['INSTITUTION'] });
  await m.User.updateOne({ _id: account._id }, { $set: { active: false } }); expect((await get(`/verification/requests/${next.requestId}/result`, employer)).status).toBe(404);
  await m.User.updateOne({ _id: account._id }, { $set: { active: true } });
  await post('/verification/employers', admin, { user: String(employer._id), organization: 'Synthetic Hiring Organization', status: 'SUSPENDED', approvalReference: 'SYNTHETIC_REVIEW' });
  expect((await get(`/verification/requests/${next.requestId}/result`, employer)).status).toBe(403);
  await post('/verification/employers', admin, { user: String(employer._id), organization: 'Synthetic Hiring Organization', status: 'APPROVED', approvalReference: 'SYNTHETIC_REVIEW' });
  expect((await get(`/verification/requests/${next.requestId}/result`, employer)).status).toBe(200);
 });

});
