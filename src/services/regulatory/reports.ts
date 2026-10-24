import { identityPresenceCounts, studentStatusDistribution } from './student-status';
import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import * as m from '../../models';
import { AppError } from '../../utils/app-error';
import { analyticsScope, overview, aggregate, uploadStages, conflictStages } from './analytics';
import { allocationRows } from './allocation-rows';
import { prevalidate } from './compliance';
import { institutionScope } from '../../middlewares/auth';
import { audit } from '../student';
import type { AnalyticsFilters } from '../../validators/regulatory';
export const reportTypes = ['ENROLMENT_SUMMARY', 'INTAKE_UTILIZATION', 'CATEGORY_UTILIZATION', 'UPLOAD_ERRORS', 'OVERLAP_CASES', 'IDENTITY_STATUS', 'ACADEMIC_YEAR_COMPLIANCE', 'STUDENT_STATUS_DISTRIBUTION'] as const;
export const REPORT_LIMIT = 500;
export function csvCell(value: unknown) {
 const text = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
 return '"' + (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"';
}
export async function reportScope(user: any, filters: AnalyticsFilters) {
 if (!['AICTE_ADMIN', 'INSTITUTION_ADMIN'].includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Report administrator permission required');
 if (user.role === 'INSTITUTION_ADMIN') { if (!filters.institution) throw new AppError(403, 'FORBIDDEN', 'Institution scope required'); await institutionScope(user, filters.institution, true); }
 await analyticsScope(user, filters);
}
const safeFields = 'requestedBy institution filters reportType format status attempts failureCode generatedAt expiresAt metadata contentDigest createdAt updatedAt';
export async function createReport(user: any, input: any) {
 await reportScope(user, input.filters);
 return mongoose.connection.transaction(async session => {
  const [job] = await m.ReportJob.create([{ requestedBy: user._id, institution: input.filters.institution, filters: input.filters, reportType: input.reportType, format: input.format, expiresAt: new Date(Date.now() + 86400000) }], { session });
  await audit(user, 'REPORT_QUEUED', 'ReportJob', job!._id, session, input.filters.institution); return { reportId: job!._id, status: 'PENDING', expiresAt: job!.expiresAt };
 });
}
export async function reportAccess(user: any, id: string) {
 const job = await m.ReportJob.findById(id).select(safeFields); if (!job) throw new AppError(404, 'REPORT_UNAVAILABLE', 'Report is unavailable');
 try { await reportScope(user, job.filters as AnalyticsFilters); } catch { throw new AppError(404, 'REPORT_UNAVAILABLE', 'Report is unavailable'); } return job;
}
async function reportData(user: any, job: any, session: mongoose.ClientSession) {
 const f = job.filters as AnalyticsFilters;
 const metadata: any = { title: 'SatyaID regulatory readiness report', reportType: job.reportType, generatorVersion: 'satyaid-reports-v1', generatedAt: new Date().toISOString(), academicYear: f.academicYear ?? null, institution: f.institution ?? null, filters: f, consistency: 'Source reads use one MongoDB snapshot transaction. generatedAt is a completion marker, not an exact source-event cutoff.', officialFiling: false, source: 'Institution-submitted records registered in SatyaID' };
 let rows: any[] = [], summary: any;
 if (job.reportType === 'STUDENT_STATUS_DISTRIBUTION') {
  rows = await studentStatusDistribution(f, session); metadata.truncated = false;
  summary = { definition: 'Current institution-submitted NRI/OCI/FN declarations on institution profiles joined to selected authoritative enrolments, grouped by current enrolment state. Legacy/missing profile values are UNKNOWN. Independent statuses may all be YES; no seat eligibility is inferred.', counts: 'enrolmentCount counts selected enrolments; distinctStudents deduplicates canonical students within each row and is not additive across status groups/institutions.', statusVerification: 'INSTITUTION_SUBMITTED_NOT_INDEPENDENTLY_VERIFIED', seatCategoryRelationship: 'NONE; approved allocation/category and counters remain authoritative' };
 } else if (['INTAKE_UTILIZATION', 'CATEGORY_UTILIZATION'].includes(job.reportType)) {
  const result = await allocationRows(f, REPORT_LIMIT, session); rows = result.rows; metadata.truncated = result.truncated; metadata.ruleVersions = result.rows.flatMap(row => row.rules); summary = { definition: 'Rows are approved allocation pools; quota ceilings do not grant extra approved seats', detailLimit: REPORT_LIMIT };
 } else if (job.reportType === 'ACADEMIC_YEAR_COMPLIANCE') {
  const result = await prevalidate(user, f, session); rows = result.findings; metadata.truncated = result.truncated; metadata.ruleVersion = result.ruleVersion; summary = { coverage: result.coverage, definition: result.definition };
 } else if (job.reportType === 'OVERLAP_CASES') {
  rows = await aggregate(m.EnrolmentConflict, [...conflictStages(f), { $sort: { _id: 1 } }, { $limit: REPORT_LIMIT + 1 }, { $project: { _id: 0, caseId: '$_id', status: 1, ruleCode: 1, severity: 1, createdAt: 1 } }], session); metadata.truncated = rows.length > REPORT_LIMIT; rows = rows.slice(0, REPORT_LIMIT); summary = { definition: 'Potential cases, not proven wrongdoing; institution reports omit other-party references' };
 } else if (job.reportType === 'UPLOAD_ERRORS') {
  rows = await aggregate(m.UploadJob, [...uploadStages(f), { $lookup: { from: m.UploadRowResult.collection.name, localField: '_id', foreignField: 'job', pipeline: [{ $match: { status: { $in: ['INVALID', 'FAILED'] } } }, { $unwind: '$errorCodes' }, { $group: { _id: { status: '$status', errorCode: '$errorCodes' }, count: { $sum: 1 } } }], as: '_errors' } }, { $unwind: '$_errors' }, { $group: { _id: '$_errors._id', count: { $sum: '$_errors.count' } } }, { $sort: { '_id.errorCode': 1 } }, { $limit: REPORT_LIMIT + 1 }], session); metadata.truncated = rows.length > REPORT_LIMIT; rows = rows.slice(0, REPORT_LIMIT); summary = { definition: 'Error occurrences; a row may contribute multiple error codes. Only job institution/state/createdAt filters apply.' };
 } else if (['ENROLMENT_SUMMARY', 'IDENTITY_STATUS'].includes(job.reportType)) {
  const stats = await overview(user, f, session); rows = job.reportType === 'IDENTITY_STATUS' ? stats.identityStatusDistribution : stats.enrolmentsByStatus; summary = job.reportType === 'IDENTITY_STATUS' ? { ...stats, identifierPresence: await identityPresenceCounts(f, session), admissionIdentityPolicy: 'ALLOW_WITH_REVIEW_FLAGS_V1', officialVerificationAvailable: false } : stats; metadata.truncated = false;
 } else throw new AppError(422, 'UNSUPPORTED_REPORT_TYPE', 'Report type is unsupported');
 return { metadata, summary, rows };
}
export async function processNextReport() {
 await m.ReportJob.updateMany({ status: { $in: ['PENDING', 'PROCESSING'] }, expiresAt: { $lte: new Date() } }, { $set: { status: 'FAILED', failureCode: 'REPORT_EXPIRED' }, $unset: { leaseToken: 1 } });
 await m.ReportJob.updateMany({ status: 'PROCESSING', attempts: { $gte: 3 }, leaseUntil: { $lt: new Date() } }, { $set: { status: 'FAILED', failureCode: 'REPORT_RETRY_EXHAUSTED' }, $unset: { leaseToken: 1 } });
 const leaseToken = randomUUID();
 const job = await m.ReportJob.findOneAndUpdate({ status: { $in: ['PENDING', 'PROCESSING'] }, attempts: { $lt: 3 }, expiresAt: { $gt: new Date() }, $or: [{ leaseUntil: null }, { leaseUntil: { $lt: new Date() } }] }, { $set: { status: 'PROCESSING', leaseToken, leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { createdAt: 1 } });
 if (!job) return false;
 try {
  const user = await m.User.findOne({ _id: job.requestedBy, active: true }); if (!user) throw new AppError(403, 'REQUESTER_UNAUTHORIZED', 'Requester is unavailable'); await reportScope(user, job.filters as AnalyticsFilters);
  await mongoose.connection.transaction(async session => {
   const current = await m.ReportJob.findOneAndUpdate({ _id: job._id, leaseToken, status: 'PROCESSING' }, { $set: { leaseUntil: new Date(Date.now() + 120000) } }, { session, returnDocument: 'after' });
   if (!current) throw new AppError(409, 'REPORT_LEASE_LOST', 'Report lease was reassigned');
   const data = await reportData(user, current, session);
   const keys = Array.from(new Set(data.rows.flatMap(row => Object.keys(row))));
   const identityColumns = job.reportType === 'IDENTITY_STATUS' ? ['identifierPresence'] : [];
   const headers = ['reportLabel', 'reportType', 'generatedAt', 'generatorVersion', 'source', 'officialFiling', 'scope', 'consistency', 'coverage', 'truncated', ...identityColumns, ...keys];
   const rows = data.rows.length ? data.rows : [{}];
   const content = Buffer.from(job.format === 'JSON' ? JSON.stringify(data) : [headers.map(csvCell).join(','), ...rows.map(row => [data.metadata.title, job.reportType, data.metadata.generatedAt, data.metadata.generatorVersion, data.metadata.source, false, job.filters, data.metadata.consistency, data.summary?.definition ?? data.summary?.coverage ?? data.summary?.denominatorNotes, Boolean(data.metadata.truncated), ...(identityColumns.length ? [data.summary.identifierPresence] : []), ...keys.map(k => row[k])].map(csvCell).join(','))].join('\n'));
   await m.ReportJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: 'COMPLETED', generatedAt: new Date(), metadata: data.metadata, content, contentDigest: createHash('sha256').update(content).digest('hex') }, $unset: { leaseToken: 1, leaseUntil: 1 } }, { session });
   await audit(user, 'REPORT_GENERATED', 'ReportJob', job._id, session, job.institution);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
 } catch (error) { await m.ReportJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: 'FAILED', failureCode: error instanceof AppError ? error.code : 'REPORT_GENERATION_FAILED' }, $unset: { leaseToken: 1, leaseUntil: 1 } }); }
 return true;
}
export async function downloadReport(user: any, id: string) {
 const job = await reportAccess(user, id);
 if (job.status !== 'COMPLETED' || job.expiresAt! <= new Date()) throw new AppError(409, 'REPORT_NOT_READY', 'Report is incomplete or expired');
 const artifact = await m.ReportJob.findById(id).select('+content');
 if (!artifact?.content || createHash('sha256').update(Buffer.from(artifact.content as any)).digest('hex') !== job.contentDigest) throw new AppError(409, 'REPORT_CONTENT_MISMATCH', 'Report content integrity check failed');
 await audit(user, 'REPORT_DOWNLOADED', 'ReportJob', job._id, undefined, job.institution);
 return { content: Buffer.from(artifact.content as any), format: job.format, id };
}
