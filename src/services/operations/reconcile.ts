import mongoose from 'mongoose';
import * as m from '../../models';
export async function reconcileAdmissions(limit = 500) {
 if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Limit 1–500 required');
 return mongoose.connection.transaction(async session => {
  const findings: any[] = [], add = (code: string, id: unknown) => findings.push({ code, objectId: String(id) });
  // Bounded diagnostic scan; truncated=true requires an operator-led full scoped reconciliation.
  let allocationCount = 0, enrolmentCount = 0, reservationCount = 0;
  const scanLimit = 500;
  for await (const a of m.IntakeAllocation.find().sort({ _id: 1 }).limit(scanLimit + 1).maxTimeMS(10000).session(session).cursor()) {
   if (++allocationCount > scanLimit) break;
   const count = await m.SeatReservation.countDocuments({ allocation: a._id, status: 'ACTIVE' }).session(session);
   if (count !== Number(a.occupiedSeats)) add('OCCUPIED_COUNTER_MISMATCH', a._id);
   if (Number(a.occupiedSeats) > Number(a.approvedSeats) || Number(a.occupiedSeats) < 0) add('ALLOCATION_COUNTER_INVALID', a._id);
   if (!await m.InstitutionProgram.exists({ _id: a.offering }).session(session) || !await m.AcademicYear.exists({ _id: a.academicYear }).session(session) || !await m.SeatCategory.exists({ _id: a.category }).session(session)) add('ALLOCATION_REFERENCE_MISSING', a._id);
   if (findings.length > limit) break;
  }
  for await (const e of m.Enrolment.find({ status: { $in: ['ACTIVE', 'ACCEPTED'] } }).sort({ _id: 1 }).limit(scanLimit + 1).maxTimeMS(10000).session(session).cursor()) {
   if (++enrolmentCount > scanLimit) break;
   if (e.status === 'ACCEPTED') add('LEGACY_ACCEPTED_REVIEW', e._id);
   if (e.status === 'ACTIVE' && !await m.SeatReservation.exists({ enrolment: e._id, allocation: e.allocation, status: 'ACTIVE' }).session(session)) add('MISSING_ACTIVE_RESERVATION', e._id);
   if (findings.length > limit) break;
  }
  for await (const r of m.SeatReservation.find({ status: 'ACTIVE' }).sort({ _id: 1 }).limit(scanLimit + 1).maxTimeMS(10000).session(session).cursor()) {
   if (++reservationCount > scanLimit) break;
   const e = await m.Enrolment.findById(r.enrolment).session(session);
   const a = await m.IntakeAllocation.findById(r.allocation).session(session);
   if (!e || !a) add('ORPHANED_RESERVATION', r._id);
   else {
    if (e.status !== 'ACTIVE') add('INACTIVE_ENROLMENT_RESERVATION', r._id);
    if (String(e.allocation) !== String(a._id) || String(e.offering) !== String(a.offering) || String(e.academicYear) !== String(a.academicYear)) add('RESERVATION_MAPPING_MISMATCH', r._id);
   }
   if (findings.length > limit) break;
  }
  return { readOnly: true, consistency: 'MongoDB snapshot', checkedAllocations: allocationCount, scanLimitPerCollection: scanLimit, truncated: findings.length > limit || [allocationCount, enrolmentCount, reservationCount].some(n => n > scanLimit), findings: findings.slice(0, limit), repairPerformed: false };
 }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });
}
