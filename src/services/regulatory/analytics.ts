import mongoose, { PipelineStage } from 'mongoose';
import * as m from '../../models';
import { writeScope } from '../student';
import { AppError } from '../../utils/app-error';
import type { AnalyticsFilters } from '../../validators/regulatory';
const oid = (v: string) => new mongoose.Types.ObjectId(v);
export const dateMatch = (f: AnalyticsFilters) => f.from || f.to ? { ...(f.from ? { $gte: new Date(f.from) } : {}), ...(f.to ? { $lt: new Date(new Date(f.to).getTime() + 86400000) } : {}) } : undefined;
export async function analyticsScope(user: any, f: AnalyticsFilters, national = false) {
 if (user.role === 'AICTE_ADMIN') return;
 if (national || f.state || !f.institution) throw new AppError(403, 'FORBIDDEN', 'Regulatory or explicit institution scope required');
 await writeScope(user, f.institution);
}
export function institutionStages(f: AnalyticsFilters): any[] {
 const match: any = {}; if (f.institution) match._id = oid(f.institution); if (f.state) match.state = f.state;
 const p: any[] = [{ $match: match }];
 if (f.program) p.push({ $lookup: { from: m.InstitutionProgram.collection.name, localField: '_id', foreignField: 'institution', as: '_offerings' } }, { $match: { '_offerings.program': oid(f.program) } });
 return p;
}
export function offeringStages(f: AnalyticsFilters, field = 'offering'): any[] {
 const p: any[] = [{ $lookup: { from: m.InstitutionProgram.collection.name, localField: field, foreignField: '_id', as: '_offering' } }, { $unwind: '$_offering' }];
 const match: any = {}; if (f.program) match['_offering.program'] = oid(f.program); if (f.institution) match['_offering.institution'] = oid(f.institution); if (Object.keys(match).length) p.push({ $match: match });
 if (f.state) p.push({ $lookup: { from: m.Institution.collection.name, localField: '_offering.institution', foreignField: '_id', as: '_institution' } }, { $match: { '_institution.state': f.state } });
 return p;
}
export function allocationStages(f: AnalyticsFilters): any[] {
 const match: any = {}; if (f.academicYear) match.academicYear = oid(f.academicYear); if (f.category) match.category = oid(f.category);
 return [{ $match: match }, ...offeringStages(f)];
}
export function enrolmentStages(f: AnalyticsFilters): any[] {
 const match: any = {}; if (f.institution) match.institution = oid(f.institution); if (f.academicYear) match.academicYear = oid(f.academicYear); if (f.category) match.category = oid(f.category); const dates = dateMatch(f); if (dates) match.admissionDate = dates;
 return [{ $match: match }, ...offeringStages(f)];
}
export function uploadStages(f: AnalyticsFilters): any[] {
 const match: any = {}; if (f.institution) match.institution = oid(f.institution); const dates = dateMatch(f); if (dates) match.createdAt = dates;
 const p: any[] = [{ $match: match }]; if (f.state) p.push({ $lookup: { from: m.Institution.collection.name, localField: 'institution', foreignField: '_id', as: '_institution' } }, { $match: { '_institution.state': f.state } }); return p;
}
export function conflictStages(f: AnalyticsFilters): any[] {
 const match: any = {}; if (f.institution) match.institutions = oid(f.institution); const dates = dateMatch(f); if (dates) match.createdAt = dates;
 const p: any[] = [{ $match: match }];
 if (f.state) p.push({ $lookup: { from: m.Institution.collection.name, localField: 'institutions', foreignField: '_id', as: '_institutions' } }, { $match: { '_institutions.state': f.state } });
 if (f.academicYear || f.category || f.program) {
  const e: any = {}; if (f.academicYear) e.academicYear = oid(f.academicYear); if (f.category) e.category = oid(f.category);
  p.push({ $lookup: { from: m.Enrolment.collection.name, let: { ids: ['$firstEnrolment', '$secondEnrolment'] }, pipeline: [{ $match: { $expr: { $in: ['$_id', '$$ids'] }, ...e } }, ...(f.program ? offeringStages({ program: f.program }) : []), { $limit: 1 }], as: '_matchingEnrolments' } }, { $match: { '_matchingEnrolments.0': { $exists: true } } });
 }
 return p;
}
export async function aggregate(model: any, stages: any[], session?: mongoose.ClientSession): Promise<any[]> {
 const query = model.aggregate(stages as PipelineStage[]).option({ maxTimeMS: 10000 }); if (session) query.session(session); return query.exec();
}
const statusGroup = [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }];
export function percentage(n: number, d: number) { return d > 0 ? Math.round(n / d * 10000) / 100 : 0; }
async function execute(tasks: (() => Promise<any[]>)[], session?: mongoose.ClientSession) {
 if (!session) return Promise.all(tasks.map(task => task()));
 const result: any[][] = []; for (const task of tasks) result.push(await task()); return result;
}
export async function overview(user: any, f: AnalyticsFilters, session?: mongoose.ClientSession) {
 await analyticsScope(user, f);
 const [institutions = [], offerings = [], allocation = [], enrolments = [], uploads = [], conflicts = [], students = [], reservations = []] = await execute([
  () => aggregate(m.Institution, [...institutionStages(f), { $group: { _id: null, summary: { $first: { pid: '$pid', name: '$name', state: '$state', status: '$status' } }, registered: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } } } }], session),
  () => aggregate(m.InstitutionProgram, [{ $set: { offering: '$_id' } }, ...offeringStages(f), { $count: 'count' }], session),
  () => aggregate(m.IntakeAllocation, [...allocationStages(f), { $group: { _id: '$kind', approved: { $sum: '$approvedSeats' }, occupied: { $sum: '$occupiedSeats' }, allocationCount: { $sum: 1 } } }], session),
  () => aggregate(m.Enrolment, [...enrolmentStages(f), ...statusGroup], session),
  () => aggregate(m.UploadJob, [...uploadStages(f), { $group: { _id: '$status', count: { $sum: 1 }, totalRows: { $sum: '$totalRows' }, invalidRows: { $sum: '$invalidRows' }, committedRows: { $sum: '$committedRows' } } }], session),
  () => aggregate(m.EnrolmentConflict, [...conflictStages(f), ...statusGroup], session),
  () => aggregate(m.Enrolment, [...enrolmentStages(f), { $group: { _id: '$student' } }, { $lookup: { from: m.Student.collection.name, localField: '_id', foreignField: '_id', as: '_student' } }, { $unwind: '$_student' }, { $group: { _id: '$_student.identityStatus', count: { $sum: 1 } } }], session),
  () => aggregate(m.SeatReservation, [{ $match: { status: 'ACTIVE' } }, { $lookup: { from: m.IntakeAllocation.collection.name, localField: 'allocation', foreignField: '_id', as: '_allocation' } }, { $unwind: '$_allocation' }, { $replaceRoot: { newRoot: '$_allocation' } }, ...allocationStages(f), { $count: 'count' }], session),
 ], session);
 const approved = allocation.reduce((sum, a) => sum + a.approved, 0), occupied = allocation.reduce((sum, a) => sum + a.occupied, 0);
 return { label: 'Data currently registered in SatyaID; not national population statistics', observedAt: new Date().toISOString(), filters: f, consistency: session ? 'Caller session; report generation uses snapshot transaction' : 'Live queries; not a transactionally consistent snapshot', institutionSummary: f.institution ? institutions[0]?.summary ?? null : undefined, registeredInstitutions: institutions[0]?.registered ?? 0, activeInstitutions: institutions[0]?.active ?? 0, offerings: offerings[0]?.count ?? 0, approvedBaseIntake: allocation.find(a => a._id === 'BASE')?.approved ?? 0, approvedSupernumeraryIntake: allocation.find(a => a._id === 'SUPERNUMERARY')?.approved ?? 0, approvedSeats: approved, occupiedSeats: occupied, availableSeats: Math.max(0, approved - occupied), utilizationPercentage: percentage(occupied, approved), allocationBreakdown: allocation, activeReservations: reservations[0]?.count ?? 0, enrolmentsByStatus: enrolments, uniqueStudents: students.reduce((sum, a) => sum + a.count, 0), identityStatusDistribution: students, uploads, conflicts, openConflicts: conflicts.filter(c => !['RESOLVED', 'DISMISSED'].includes(c._id)).reduce((sum, c) => sum + c.count, 0), denominatorNotes: { utilization: 'Occupied allocation counters / approved BASE + SUPERNUMERARY seats', identity: 'Distinct students with selected enrolments, not enrolment count', entityCounts: 'Institution/offering counts ignore academic-year/category/date filters; seats use year/category; enrolment dates use admissionDate', uploads: 'Institution/state/createdAt filters only; encrypted upload jobs have no intrinsic program/year/category fields', conflicts: 'Cases involving selected scope; each case counted once; date filters use detection time' } };
}
export async function breakdown(user: any, f: AnalyticsFilters, page: number, limit: number) {
 await analyticsScope(user, f);
 const result = await aggregate(m.IntakeAllocation, [...allocationStages(f), { $group: { _id: { offering: '$offering', academicYear: '$academicYear', category: '$category', kind: '$kind' }, approvedSeats: { $sum: '$approvedSeats' }, occupiedSeats: { $sum: '$occupiedSeats' } } }, { $sort: { '_id.offering': 1, '_id.academicYear': 1, '_id.category': 1, '_id.kind': 1 } }, { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'count' }] } }]);
 return { items: result[0]?.items.map((r: any) => ({ ...r, availableSeats: Math.max(0, r.approvedSeats - r.occupiedSeats), utilizationPercentage: percentage(r.occupiedSeats, r.approvedSeats) })) ?? [], total: result[0]?.total[0]?.count ?? 0, page, limit, observedAt: new Date().toISOString() };
}
export async function trends(user: any, f: AnalyticsFilters) {
 await analyticsScope(user, f);
 return { items: await aggregate(m.Enrolment, [...enrolmentStages(f), { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$admissionDate', timezone: 'UTC' } }, status: '$status' }, count: { $sum: 1 } } }, { $sort: { '_id.month': -1, '_id.status': 1 } }, { $limit: 120 }]), observedAt: new Date().toISOString(), limit: 120, note: 'Admissions grouped by admission month and current state, not historical state transitions' };
}
