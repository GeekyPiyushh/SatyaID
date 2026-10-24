import mongoose, { ClientSession } from 'mongoose';
import { createHmac } from 'node:crypto';
import * as m from '../models';
import { institutionScope } from '../middlewares/auth';
import { AppError } from '../utils/app-error';
import { protectIdentity } from './identity-crypto';
export function identityKeys() {
 const encryption = process.env.APAAR_ENCRYPTION_KEY, lookup = process.env.APAAR_LOOKUP_KEY, version = process.env.APAAR_KEY_VERSION;
 if (!encryption || !lookup || !version || Buffer.from(encryption, 'base64').length !== 32 || Buffer.from(lookup, 'base64').length !== 32 || encryption === lookup) throw new AppError(503, 'IDENTITY_KEYS_UNAVAILABLE', 'Identity protection is not configured');
 return { encryption, lookup, version };
}
export const digestIdentity = (value: string) => { const k = identityKeys(); return createHmac('sha256', Buffer.from(k.lookup, 'base64')).update(value).digest(); };
export async function audit(actor: any, action: string, type: string, id: any, session?: ClientSession, institution?: any) {
 await m.AuditEvent.create([{ actor: actor._id, action, resourceType: type, resourceId: id, institution }], { session });
}
export async function writeScope(user: any, institution: string) {
 if (!['AICTE_ADMIN', 'INSTITUTION_ADMIN', 'INSTITUTION_STAFF'].includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Student management permission required');
 await institutionScope(user, institution);
}
export async function studentAccess(user: any, id: string, institution?: string, write = false) {
 const student = await m.Student.findById(id);
 if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
 if (user.role === 'AICTE_ADMIN') return { student, profile: institution ? await m.StudentInstitution.findOne({ student: id, institution }) : null };
 if (user.role === 'STUDENT' && !write && String(student.user) === String(user._id)) return { student, profile: null };
 if (!['INSTITUTION_ADMIN', 'INSTITUTION_STAFF'].includes(user.role) || !institution) throw new AppError(403, 'FORBIDDEN', 'Student access denied');
 await institutionScope(user, institution);
 const profile = await m.StudentInstitution.findOne({ student: id, institution });
 if (!profile) throw new AppError(403, 'FORBIDDEN', 'Student access denied');
 return { student, profile };
}
export async function linkIdentity(user: any, id: string, institution: string, identifier: string, session?: ClientSession): Promise<void> {
 if (!session) { await studentAccess(user, id, institution, true); return mongoose.connection.transaction(s => linkIdentity(user, id, institution, identifier, s)); }
 const keys = identityKeys();
 if (await m.ApaarIdentityVault.exists({ keyVersion: { $ne: keys.version } }).session(session)) throw new AppError(503, 'IDENTITY_KEY_VERSION_UNAVAILABLE', 'Identity linking is paused pending key-version reconciliation');
 const existing = await m.ApaarIdentityVault.findOne({ student: id }).select('+lookupDigest').session(session);
 if (existing) {
  if (existing.keyVersion === keys.version && Buffer.from(existing.lookupDigest as any).equals(digestIdentity(identifier))) return;
  throw new AppError(409, 'IDENTITY_ALREADY_LINKED', 'Identity correction requires regulatory review');
 }
 if (await m.ApaarIdentityVault.exists({ keyVersion: keys.version, lookupDigest: digestIdentity(identifier) }).session(session)) throw new AppError(409, 'IDENTITY_REVIEW_REQUIRED', 'Identity linkage requires authorized review');
 await m.Student.updateOne({ _id: id }, { $inc: { lockVersion: 1 } }, { session });
 await m.ApaarIdentityVault.create([{ student: id, ...protectIdentity(identifier, id, keys.encryption, keys.lookup), keyVersion: keys.version }], { session });
 await audit(user, 'IDENTITY_LINKED', 'Student', id, session, institution);
}
export async function createStudent(user: any, data: any, session?: ClientSession): Promise<any> {
 await writeScope(user, data.institution);
 if (!session) return mongoose.connection.transaction(s => createStudent(user, data, s));
 if (!await m.Institution.exists({ _id: data.institution, status: 'ACTIVE' }).session(session)) throw new AppError(422, 'INVALID_INSTITUTION', 'Institution is unavailable');
 let student;
 if (data.existingStudent) {
  if (user.role !== 'AICTE_ADMIN') throw new AppError(403, 'FORBIDDEN', 'Existing identity association requires regulatory review');
  student = await m.Student.findById(data.existingStudent).session(session);
  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
 } else { [student] = await m.Student.create([{ displayName: data.displayName }], { session }); }
 const [profile] = await m.StudentInstitution.create([{ student: student!._id, institution: data.institution, institutionStudentId: data.institutionStudentId, displayName: data.displayName, dateOfBirth: data.dateOfBirth }], { session });
 if (data.apaarId) await linkIdentity(user, String(student!._id), data.institution, data.apaarId, session);
 await audit(user, 'STUDENT_REGISTERED', 'Student', student!._id, session, data.institution);
 return { studentId: student!._id, profile, identityStatus: student!.identityStatus };
}
export async function readStudent(user: any, id: string, institution?: string) {
 const access = await studentAccess(user, id, institution);
 await audit(user, 'STUDENT_READ', 'Student', id, undefined, institution);
 return { studentId: access.student._id, identityStatus: access.student.identityStatus, profiles: access.profile ? [access.profile] : await m.StudentInstitution.find({ student: id }).select('-__v').lean() };
}
