import { ClientSession } from 'mongoose';
import * as m from '../models';
import { AppError } from '../utils/app-error';
import { audit } from './student';
export const overlapExplanation = 'Potential overlapping enrolment: the same internal protected student identity has active enrolments at different institutions during intersecting date ranges. Review is required; no fraud classification is made.';
export function datesOverlap(a: { startsOn?: Date | null; endsOn?: Date | null }, b: { startsOn?: Date | null; endsOn?: Date | null }) {
 return (a.startsOn?.getTime() ?? 0) <= (b.endsOn?.getTime() ?? Infinity) && (b.startsOn?.getTime() ?? 0) <= (a.endsOn?.getTime() ?? Infinity);
}
export async function detectConflicts(enrolment: any, actor: any, session: ClientSession) {
 const others = await m.Enrolment.find({ student: enrolment.student, _id: { $ne: enrolment._id }, institution: { $ne: enrolment.institution }, status: 'ACTIVE' }).session(session);
 for (const other of others) {
  if (!datesOverlap(enrolment, other)) continue;
  const [firstEnrolment, secondEnrolment] = [enrolment._id, other._id].sort((a, b) => String(a).localeCompare(String(b)));
  const ruleCode = enrolment.entryType === 'TRANSFER' || other.entryType === 'TRANSFER' ? 'POTENTIAL_TRANSFER_OVERLAP_V1' : 'CROSS_INSTITUTION_OVERLAP_V1';
  const previous = await m.EnrolmentConflict.findOne({ firstEnrolment, secondEnrolment, ruleCode }).session(session);
  if (previous) continue;
  const [conflict] = await m.EnrolmentConflict.create([{ student: enrolment.student, firstEnrolment, secondEnrolment, institutions: [enrolment.institution, other.institution], ruleCode }], { session });
  await m.ConflictHistory.create([{ conflict: conflict!._id, actor: actor._id, action: 'DETECTED', reasonCode: ruleCode }], { session });
  await audit(actor, 'CONFLICT_DETECTED', 'EnrolmentConflict', conflict!._id, session);
 }
}
export async function conflictFilter(user: any) {
 if (user.role === 'AICTE_ADMIN') return {};
 if (!['INSTITUTION_ADMIN', 'INSTITUTION_STAFF'].includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Conflict access denied');
 const memberships = await m.InstitutionMembership.find({ user: user._id, active: true });
 return { institutions: { $in: memberships.map(x => x.institution) } };
}
export async function conflictAccess(user: any, id: string) {
 const filter = await conflictFilter(user); const conflict = await m.EnrolmentConflict.findOne({ _id: id, ...filter });
 if (!conflict) throw new AppError(404, 'NOT_FOUND', 'Conflict not found'); return conflict;
}
export function conflictView(user: any, conflict: any) {
 if (user.role === 'AICTE_ADMIN') return { ...conflict.toObject(), explanation: overlapExplanation };
 return { _id: conflict._id, ruleCode: conflict.ruleCode, status: conflict.status, severity: conflict.severity, resolution: conflict.resolution, createdAt: conflict.createdAt, version: conflict.version, explanation: overlapExplanation };
}
