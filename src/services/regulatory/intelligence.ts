import mongoose from 'mongoose';
import * as m from '../../models';
import { overview, aggregate, analyticsScope, uploadStages, percentage } from './analytics';
import { prevalidate } from './compliance';
import { allocationRows } from './allocation-rows';
import { calculateQuota } from '../management';
import { AppError } from '../../utils/app-error';
export const qualityWeights = { profileCompleteness: 20, identityAssurance: 15, uploadValidity: 20, overlapReview: 15, intakeConfiguration: 15, reconciliation: 15 } as const;
type QualityKey = keyof typeof qualityWeights;
export type ScoreInput = Record<QualityKey, { numerator: number; denominator: number }>;
export function qualityScore(input: ScoreInput, truncated = false) {
 const components = (Object.keys(qualityWeights) as QualityKey[]).map(key => ({ dimension: key, weight: qualityWeights[key], numerator: input[key].numerator, denominator: input[key].denominator, score: input[key].denominator > 0 ? Math.round(Math.max(0, Math.min(1, input[key].numerator / input[key].denominator)) * 10000) / 100 : null }));
 const reasons = components.filter(c => c.denominator < (c.dimension === 'intakeConfiguration' ? 1 : 5)).map(c => `INSUFFICIENT_${c.dimension.toUpperCase()}_OBSERVATIONS`);
 if (truncated) reasons.push('TRUNCATED_PREVALIDATION');
 const insufficientData = reasons.length > 0;
 const score = insufficientData ? null : Math.round(components.reduce((sum, c) => sum + (c.score ?? 0) * c.weight / 100, 0) * 100) / 100;
 return { calculationVersion: 'satyaid-quality-v1', label: 'Project operational data-readiness signal; not an official rating, compliance judgment or ranking', score, insufficientData, reasons, components, minimumObservations: 'Five observations for every non-configuration dimension; one active offering for configuration. Missing data does not become a zero rating.' };
}
export async function governanceData(user: any, f: { institution: string; academicYear: string; from?: string; to?: string }) {
 await analyticsScope(user, f);
 const from = f.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), to = f.to ?? new Date().toISOString().slice(0, 10);
 const since = new Date(from), until = new Date(new Date(to).getTime() + 86400000);
 const stats = await overview(user, { institution: f.institution, academicYear: f.academicYear });
 const validation = await prevalidate(user, { institution: f.institution, academicYear: f.academicYear });
 const profiles = await aggregate(m.StudentInstitution, [{ $match: { institution: new mongoose.Types.ObjectId(f.institution), status: 'ACTIVE' } }, { $group: { _id: null, total: { $sum: 1 }, complete: { $sum: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$displayName', ''] }, ''] }, { $ne: [{ $ifNull: ['$institutionStudentId', ''] }, ''] }, { $ne: [{ $ifNull: ['$student', null] }, null] }] }, 1, 0] } } } }]);
 const uploads = await aggregate(m.UploadJob, [...uploadStages({ institution: f.institution, from, to }), { $lookup: { from: m.UploadRowResult.collection.name, localField: '_id', foreignField: 'job', pipeline: [{ $group: { _id: '$status', count: { $sum: 1 } } }], as: '_rows' } }, { $unwind: '$_rows' }, { $group: { _id: '$_rows._id', count: { $sum: '$_rows.count' } } }]);
 const config = await aggregate(m.InstitutionProgram, [{ $match: { institution: new mongoose.Types.ObjectId(f.institution), active: true } }, { $lookup: { from: m.IntakeAllocation.collection.name, localField: '_id', foreignField: 'offering', pipeline: [{ $match: { academicYear: new mongoose.Types.ObjectId(f.academicYear) } }, { $limit: 1 }], as: '_allocation' } }, { $group: { _id: null, total: { $sum: 1 }, configured: { $sum: { $cond: [{ $gt: [{ $size: '$_allocation' }, 0] }, 1, 0] } } } }]);
 const activity = await aggregate(m.AuditEvent, [{ $match: { institution: new mongoose.Types.ObjectId(f.institution), occurredAt: { $gte: since, $lt: until }, action: { $in: ['ADMISSION_REJECTED_CAPACITY_EXHAUSTED', 'STUDENT_PROFILE_UPDATED', 'ADMISSION_UPDATED'] } } }, { $group: { _id: '$action', count: { $sum: 1 } } }]);
 const identity = await aggregate(m.IdentityVerificationEvent, [{ $match: { institution: new mongoose.Types.ObjectId(f.institution), createdAt: { $gte: since, $lt: until } } }, { $lookup: { from: m.Enrolment.collection.name, localField: 'student', foreignField: 'student', pipeline: [{ $match: { institution: new mongoose.Types.ObjectId(f.institution), academicYear: new mongoose.Types.ObjectId(f.academicYear) } }, { $limit: 1 }], as: '_enrolment' } }, { $match: { '_enrolment.0': { $exists: true } } }, { $group: { _id: { reasonCode: '$reasonCode', provider: '$provider' }, count: { $sum: 1 } } }]);
 const active = stats.enrolmentsByStatus.find(e => e._id === 'ACTIVE')?.count ?? 0;
 const rowTotal = uploads.reduce((sum, row) => sum + row.count, 0), rowFailures = uploads.filter(row => ['INVALID', 'FAILED'].includes(row._id)).reduce((sum, row) => sum + row.count, 0);
 const official = stats.identityStatusDistribution.find(s => s._id === 'OFFICIALLY_VERIFIED')?.count ?? 0;
 const errorCount = validation.findings.filter(f => ['ERROR', 'BLOCKING'].includes(f.severity)).length;
 const observations = stats.allocationBreakdown.reduce((sum, a) => sum + a.allocationCount, 0) + active;
 const score = qualityScore({ profileCompleteness: { numerator: profiles[0]?.complete ?? 0, denominator: profiles[0]?.total ?? 0 }, identityAssurance: { numerator: official, denominator: stats.uniqueStudents }, uploadValidity: { numerator: rowTotal - rowFailures, denominator: rowTotal }, overlapReview: { numerator: Math.max(0, active - stats.openConflicts), denominator: active }, intakeConfiguration: { numerator: config[0]?.configured ?? 0, denominator: config[0]?.total ?? 0 }, reconciliation: { numerator: Math.max(0, observations - errorCount), denominator: observations } }, validation.truncated);
 return { stats, validation, score, active, rowTotal, rowFailures, activity, identity, window: { from, to }, filters: f };
}
export function anomalyAlerts(data: Awaited<ReturnType<typeof governanceData>>) {
 const alerts: any[] = [];
 const add = (ruleId: string, severity: string, explanation: string, evidence: unknown, action: string) => alerts.push({ ruleId, severity, explanation, evidence, institution: data.filters.institution, academicYear: data.filters.academicYear, window: data.window, recommendedAction: action });
 if (data.rowTotal >= 10 && data.rowFailures / data.rowTotal >= 0.2) add('UPLOAD_REJECTION_PRESSURE_V1', 'WARNING', 'At least 20% of ten or more observed upload rows are invalid/failed.', { rejectedRows: data.rowFailures, observedRows: data.rowTotal, percentage: percentage(data.rowFailures, data.rowTotal) }, 'Review recurring input errors and importer guidance; this is not a fraud finding.');
 if (data.active >= 5 && data.stats.openConflicts >= 3 && data.stats.openConflicts / data.active >= 0.25) add('UNRESOLVED_OVERLAP_PRESSURE_V1', 'WARNING', 'Unresolved review cases are high relative to active enrolments.', { openCases: data.stats.openConflicts, activeEnrolments: data.active }, 'Prioritize evidence review; overlaps may be legitimate.');
 const counterIssues = data.validation.findings.filter(f => ['COUNTER_RECONCILIATION_V1', 'CAPACITY_BOUND_V1'].includes(f.ruleId));
 if (counterIssues.length) add('CAPACITY_RECONCILIATION_V1', 'ERROR', 'Stored seat counters disagree with approved bounds or active records.', { findings: counterIssues.length, references: counterIssues.slice(0, 20).map(f => f.affectedReference), truncated: data.validation.truncated }, 'Reconcile counters and records through an audited process; do not silently change admissions.');
 const lastSeat = data.activity.find(x => x._id === 'ADMISSION_REJECTED_CAPACITY_EXHAUSTED')?.count ?? 0;
 if (lastSeat >= 5) add('CAPACITY_ATTEMPT_PRESSURE_V1', 'INFO', 'Five or more standalone activation attempts encountered capacity limits.', { attempts: lastSeat }, 'Review demand/configuration; high demand does not imply misconduct.');
 const amendments = data.activity.filter(x => ['STUDENT_PROFILE_UPDATED', 'ADMISSION_UPDATED'].includes(x._id)).reduce((sum, a) => sum + a.count, 0);
 if (amendments >= 10) add('AMENDMENT_VOLUME_V1', 'INFO', 'Ten or more audited profile/admission amendments occurred in the observation window.', { amendments }, 'Check correction workload and source-system quality without presuming errors.');
 const checks = data.identity.reduce((sum, e) => sum + e.count, 0), mismatches = data.identity.filter(e => e._id.reasonCode === 'MISMATCH').reduce((sum, e) => sum + e.count, 0);
 if (checks >= 5 && mismatches >= 3) add('IDENTITY_MISMATCH_REVIEW_V1', 'WARNING', 'Repeated mismatch outcomes occurred among scoped verification attempts.', { attempts: checks, mismatches, providers: [...new Set(data.identity.map(e => e._id.provider))], syntheticProviderWarning: 'MOCK_APAAR outcomes are simulations, not actual identity failures.' }, 'Review provider/source consistency; never classify a student as fraudulent from this signal.');
 return { version: 'satyaid-anomalies-v1', alerts, observedAt: new Date().toISOString(), filters: data.filters, dataSource: 'Registered SatyaID operational evidence; deterministic rules, no predictive ML', coverage: 'Academic-year cohort for enrolments; event window for uploads, audit and attributed verification events. Profile completeness is institution-wide. Live queries are not one snapshot.' };
}
export async function simulatePolicy(user: any, input: any) {
 if (user.role !== 'AICTE_ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only regulatory administrators may simulate policy');
 const year = await m.AcademicYear.findById(input.academicYear); if (!year) throw new AppError(422, 'INVALID_ACADEMIC_YEAR', 'Academic year not found');
 const asOf = new Date(input.asOf);
 if (asOf < year.startsOn! || asOf.getTime() >= year.endsOn!.getTime() + 86400000) throw new AppError(422, 'SIMULATION_PERIOD_INVALID', 'Effective assumption must fall inside the selected academic year');
 const f = { institution: input.institution, program: input.program, academicYear: input.academicYear, category: input.category, state: input.state };
 const selected = await allocationRows(f, 500, undefined, asOf);
 if (selected.truncated) throw new AppError(422, 'SIMULATION_SCOPE_TOO_LARGE', 'Narrow the scenario to at most 500 allocation pools');
 const rows = selected.rows.filter(row => row.kind === input.hypothetical.kind).map(row => {
  const quota = calculateQuota(input.hypothetical, row.baseSeats), ceiling = Math.min(row.approvedSeats, quota);
  return { allocationId: row.allocationId, offering: row.offering, approvedSeats: row.approvedSeats, occupiedSeats: row.occupiedSeats, currentConfiguredCeiling: row.currentCeiling, hypotheticalQuotaCeiling: quota, hypotheticalEffectiveCeiling: ceiling, difference: ceiling - row.currentCeiling, potentialShortfall: Math.max(0, row.occupiedSeats - ceiling), additionalApprovalNeededForFullHypotheticalQuota: Math.max(0, quota - row.approvedSeats), hypotheticalUtilizationPercentage: ceiling ? percentage(row.occupiedSeats, ceiling) : null, currentRuleVersions: row.rules.map((r: any) => ({ ruleId: r.ruleId, version: r.version })), ambiguousCurrentRules: row.ambiguousRules };
 });
 return { label: 'HYPOTHETICAL — no regulatory approval or admission decision', calculationVersion: 'satyaid-policy-simulation-v1', asOf: input.asOf, observedAt: new Date().toISOString(), assumptions: ['Uses existing decimal quota formula and explicit rounding.', 'Current configured ceilings use approved effective rules at asOf.', 'Occupancy is current stored occupancy, not historical/future demand.', 'Hypothetical effective ceiling is capped by existing approved allocation.', 'Positive hypothetical quota does not authorize additional seats.', 'No database writes or audit inserts are performed by this simulator.'], affectedOfferingCount: new Set(rows.map(row => row.offering)).size, rows };
}
