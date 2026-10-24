import Decimal from 'decimal.js';
import mongoose, { Model } from 'mongoose';
import { AuditEvent, InstitutionProgram, InstitutionMembership, Institution, Program, AcademicYear, SeatCategory, IntakeAllocation, QuotaRule } from '../models';
import { institutionScope } from '../middlewares/auth';
import { AppError } from '../utils/app-error';
export async function exists(model: Model<any>, id: string) { if (!await model.exists({ _id: id })) throw new AppError(404, 'NOT_FOUND', 'Referenced record was not found'); }
export async function auditedWrite(model: Model<any>, data: any, user: any, id?: string) {
 return mongoose.connection.transaction(async session => {
 let result;
 if (['IntakeAllocation', 'QuotaRule'].includes(model.modelName)) {
  const previous = id ? await model.findById(id).session(session) : null;
  const offering = data.offering ?? previous?.offering;
  if (offering) await InstitutionProgram.updateOne({ _id: offering }, { $inc: { __v: 1 } }, { session });
 }

 if (model.modelName === 'QuotaRule' && data.approvalStatus === 'APPROVED') {
  await InstitutionProgram.updateOne({ _id: data.offering }, { $inc: { __v: 1 } }, { session });
  const overlap = await QuotaRule.exists({ offering: data.offering, academicYear: data.academicYear, category: data.category, kind: data.kind, approvalStatus: 'APPROVED', effectiveFrom: { $lt: new Date(data.effectiveUntil) }, effectiveUntil: { $gt: new Date(data.effectiveFrom) } }).session(session);
  if (overlap) throw new AppError(409, 'QUOTA_OVERLAP', 'An approved rule already covers this period');
 }

 if (id) { result = await model.findOneAndUpdate({ _id: id, ...(data.version !== undefined ? { version: data.version, occupiedSeats: { $lte: data.approvedSeats } } : {}) }, { $set: Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'version')), ...(data.version !== undefined ? { $inc: { version: 1 } } : {}) }, { returnDocument: 'after', runValidators: true, session }); if (!result) throw new AppError(409, 'WRITE_CONFLICT', 'Record changed or does not exist'); }
 else { [result] = await model.create([data], { session }); }
 await AuditEvent.create([{ actor: user._id, action: id ? 'UPDATE' : 'CREATE', resourceType: model.modelName, resourceId: result!._id, institution: data.institution }], { session });
 return result;
 });
}
export async function scopeOffering(user: any, offeringId: string) { const offering = await InstitutionProgram.findById(offeringId); if (!offering) throw new AppError(404, 'NOT_FOUND', 'Offering was not found'); await institutionScope(user, String(offering.institution)); return offering; }
export function calculateQuota(rule: { method: string; value: number; rounding: string }, base: number) {
 const raw = rule.method === 'FIXED' ? new Decimal(rule.value) : new Decimal(base).mul(rule.value).div(100);
 const rounding = rule.rounding === 'FLOOR' ? Decimal.ROUND_FLOOR : rule.rounding === 'CEILING' ? Decimal.ROUND_CEIL : Decimal.ROUND_HALF_UP;
 return raw.toDecimalPlaces(0, rounding).toNumber();
}
export async function capacity(user: any, offeringId: string, year: string) {
 await scopeOffering(user, offeringId);
 const allocations = await IntakeAllocation.find({ offering: offeringId, academicYear: year }).lean();
 const baseSeats = allocations.filter(a => a.kind === 'BASE').reduce((sum, a) => sum + Number(a.approvedSeats), 0);
 const rules = await QuotaRule.find({ offering: offeringId, academicYear: year, approvalStatus: 'APPROVED', effectiveFrom: { $lte: new Date() }, effectiveUntil: { $gt: new Date() } }).lean();
 return { offering: offeringId, academicYear: year, baseSeats, allocations: allocations.map(a => ({ ...a, availableSeats: Number(a.approvedSeats) - Number(a.occupiedSeats) })), configuredQuotas: rules.map(r => ({ ruleId: r._id, category: r.category, kind: r.kind, seats: calculateQuota(r as any, baseSeats) })), note: 'Quota ceilings do not add seats to approved allocations. Admissions use transactional seat reservations.' };
}
