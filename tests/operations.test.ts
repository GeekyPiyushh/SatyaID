import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import * as m from '../src/models';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { runRetention } from '../src/services/operations/retention';
import { reconcileAdmissions } from '../src/services/operations/reconcile';
import { processNextUpload, confirmUpload } from '../src/services/uploads';
import { processNextReport, downloadReport } from '../src/services/regulatory/reports';
const suite = process.env.TEST_MONGODB_URI ? describe : describe.skip;
suite('guarded synthetic operations and recovery', () => {
 let actor: any, inst: any, job: any; const old = new Date(Date.now() - 60 * 86400000), cutoff = new Date(Date.now() - 35 * 86400000);
 const id = () => new mongoose.Types.ObjectId();
 beforeAll(async () => {
  const uri = new URL(process.env.TEST_MONGODB_URI!); if (!uri.pathname.endsWith('_test')) throw new Error('Dedicated test database required'); uri.pathname += '_ops_test';
  await connectDatabase(uri.toString()); for (const model of Object.values(mongoose.models)) await model.createIndexes();
  actor = await m.User.create({ email: `ops-${randomBytes(8).toString('hex')}@example.invalid`, role: 'AICTE_ADMIN', passwordHash: 'synthetic-unusable-hash' });
  inst = await m.Institution.create({ pid: randomBytes(10).toString('hex'), name: 'Synthetic operations', state: 'Demo' });
  job = await m.UploadJob.create({ institution: inst._id, idempotencyKey: randomBytes(10).toString('hex'), status: 'VALIDATED', payload: Buffer.from('synthetic ciphertext'), submittedBy: actor._id });
  await m.UploadRowResult.create({ job: job._id, rowNumber: 1, status: 'INVALID', payload: Buffer.from('fixture') });
  await m.UploadJob.collection.updateOne({ _id: job._id }, { $set: { updatedAt: old } });
 });
 afterAll(disconnectDatabase);
 it('dry-run leaves payloads and academic history untouched', async () => {
  const result = await runRetention({ cutoff }); expect(result.mode).toBe('DRY_RUN'); expect(result.counts.uploadJobs).toBeGreaterThan(0);
  expect((await m.UploadJob.findById(job._id).select('+payload'))!.payload).toBeTruthy();
 });
 it('rejects recent cutoff and unauthorized cleanup', async () => {
  await expect(runRetention({ cutoff: new Date() })).rejects.toMatchObject({ code: 'RETENTION_POLICY_INVALID' });
  process.env.ALLOW_RETENTION_APPLY = 'true'; await expect(runRetention({ cutoff, apply: true, actor: { _id: id() } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
 });
 it('purges staging idempotently, preserves row outcomes, blocks confirmation', async () => {
  process.env.ALLOW_RETENTION_APPLY = 'true'; const first = await runRetention({ cutoff, apply: true, actor }); expect(first.counts.uploadJobs).toBeGreaterThan(0);
  const retained = await m.UploadRowResult.findOne({ job: job._id }).select('+payload'); expect(retained!.status).toBe('INVALID'); expect(retained!.payload).toBeUndefined();
  expect((await runRetention({ cutoff, apply: true, actor })).counts.uploadJobs).toBe(0);
  await expect(confirmUpload(actor, String(job._id))).rejects.toMatchObject({ code: 'UPLOAD_PAYLOAD_EXPIRED' });
  expect(await m.AuditEvent.countDocuments({ action: 'RETENTION_PAYLOAD_PURGE', actor: actor._id })).toBeGreaterThan(0);
 });
 it('does not purge live leases', async () => {
  const active = await m.UploadJob.create({ institution: inst._id, idempotencyKey: randomBytes(8).toString('hex'), status: 'VALIDATING', payload: Buffer.from('fixture'), leaseUntil: new Date(Date.now() + 60000) });
  await m.UploadJob.collection.updateOne({ _id: active._id }, { $set: { updatedAt: old } });
  await runRetention({ cutoff, apply: true, actor }); expect((await m.UploadJob.findById(active._id).select('+payload'))!.payload).toBeTruthy();
  await m.UploadJob.updateOne({ _id: active._id }, { $set: { status: 'FAILED' }, $unset: { leaseUntil: 1 } });
 });
 it('reclaims crashed upload leases and fails closed on unavailable encryption', async () => {
  const crashed = await m.UploadJob.create({ institution: inst._id, idempotencyKey: randomBytes(8).toString('hex'), submittedBy: actor._id, status: 'VALIDATING', attempts: 1, leaseToken: 'dead-worker', leaseUntil: old, payload: Buffer.concat([Buffer.from([2, 7]), Buffer.from('missing'), Buffer.alloc(40)]) });
  expect(await processNextUpload()).toBe(true); const result = await m.UploadJob.findById(crashed._id); expect(result!.status).toBe('FAILED'); expect(result!.failureCode).toBe('UPLOAD_KEY_VERSION_UNAVAILABLE'); expect(result!.attempts).toBe(2);
 });
 it('exhausts crashed upload leases without creating enrolments', async () => {
  const exhausted = await m.UploadJob.create({ institution: inst._id, idempotencyKey: randomBytes(8).toString('hex'), status: 'VALIDATING', attempts: 3, leaseUntil: old });
  await processNextUpload(); expect((await m.UploadJob.findById(exhausted._id))!.failureCode).toBe('WORKER_RETRY_EXHAUSTED');
 });
 it('expires reports before generation and refuses expired downloads', async () => {
  const report = await m.ReportJob.create({ requestedBy: actor._id, filters: {}, reportType: 'ENROLMENT_SUMMARY', format: 'JSON', expiresAt: old });
  await processNextReport(); expect((await m.ReportJob.findById(report._id))!.failureCode).toBe('REPORT_EXPIRED');
  await expect(downloadReport(actor, String(report._id))).rejects.toMatchObject({ code: 'REPORT_NOT_READY' });
 });
 it('purges expired report bytes and unique ephemeral digests while retaining evidence', async () => {
  const report = await m.ReportJob.create({ requestedBy: actor._id, filters: {}, reportType: 'ENROLMENT_SUMMARY', format: 'JSON', status: 'COMPLETED', content: Buffer.from('synthetic'), expiresAt: old });
  const inv = await m.VerificationInvitation.create({ student: id(), enrolment: id(), employer: id(), digest: randomBytes(32).toString('hex'), expiresAt: old });
  const before = (await m.VerificationInvitation.findById(inv._id).select('+digest'))!.digest;
  await runRetention({ cutoff, apply: true, actor });
  expect((await m.ReportJob.findById(report._id).select('+content'))!.content).toBeUndefined(); const after = await m.VerificationInvitation.findById(inv._id).select('+digest'); expect(after!.digest).not.toBe(before); expect(after!.tokenPurgedAt).toBeTruthy();
 });
 it('detects historical inconsistencies without repairing them', async () => {
  const a = await m.IntakeAllocation.create({ offering: id(), academicYear: id(), category: id(), kind: 'BASE', approvedSeats: 1, occupiedSeats: 2, sourceReference: 'Synthetic historical inconsistency' });
  const e = await m.Enrolment.create({ student: id(), allocation: a._id, status: 'ACCEPTED' });
  await m.SeatReservation.create({ enrolment: id(), allocation: a._id, status: 'ACTIVE' });
  const result = await reconcileAdmissions(); const codes = result.findings.map(f => f.code); expect(codes).toContain('OCCUPIED_COUNTER_MISMATCH'); expect(codes).toContain('ORPHANED_RESERVATION'); expect(codes).toContain('LEGACY_ACCEPTED_REVIEW'); expect(codes).toContain('ALLOCATION_REFERENCE_MISSING');
  expect((await m.IntakeAllocation.findById(a._id))!.occupiedSeats).toBe(2); expect((await m.Enrolment.findById(e._id))!.status).toBe('ACCEPTED');
 });
 it('reports database interruptions as failures instead of false completion', async () => {
  await disconnectDatabase(); await expect(processNextUpload()).rejects.toThrow();
 });
});
