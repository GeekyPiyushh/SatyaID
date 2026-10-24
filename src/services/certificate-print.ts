import mongoose, { type ClientSession } from 'mongoose';
import * as m from '../models';
import { audit, identityKeys } from './student';
import { revealIdentity } from './identity-crypto';
import { assessIdentity } from './identity-policy';
import { AppError } from '../utils/app-error';
const unavailable = () => new AppError(404, 'PRINT_RECORD_UNAVAILABLE', 'Eligible institution-owned print record is unavailable');
async function activeActor(user: any, role: string, session: ClientSession) {
 const fresh = await m.User.findOne({ _id: user._id, role, active: true }).session(session);
 if (!fresh) throw new AppError(403, 'FORBIDDEN', 'Print operation permission denied'); return fresh;
}
export async function authorizeCertificatePrint(user: any, institution: string, input: any) {
 return mongoose.connection.transaction(async session => {
  await activeActor(user, 'AICTE_ADMIN', session);
  if (!await m.Institution.exists({ _id: institution, status: 'ACTIVE' }).session(session)) throw unavailable();
  const approval = await m.CertificatePrintAuthorization.findOneAndUpdate({ institution }, { $set: { ...input, institution, authorizedBy: user._id } }, { upsert: true, returnDocument: 'after', runValidators: true, session });
  await audit(user, 'CERTIFICATE_PRINT_AUTHORIZATION_' + input.status, 'CertificatePrintAuthorization', approval!._id, session, institution);
  return { authorizationId: approval!._id, institution: approval!.institution, status: approval!.status, expiresAt: approval!.expiresAt, authorityReference: approval!.authorityReference, degreeAwardingStatus: 'NOT_INDEPENDENTLY_VERIFIED', notice: 'Operator-reviewed print integration permission only; not certification of degree-awarding powers' };
 });
}
async function ownStudent(user: any, enrolment: string, session: ClientSession, eligible: boolean) {
 await activeActor(user, 'STUDENT', session);
 const student = await m.Student.findOneAndUpdate({ user: user._id }, { $inc: { lockVersion: 1 } }, { session, returnDocument: 'after' });
 const e = student ? await m.Enrolment.findOne({ _id: enrolment, student: student._id, ...(eligible ? { status: 'ACTIVE' } : {}) }).session(session) : null;
 if (!e || !student) throw unavailable(); return { student, e };
}
export async function grantCertificatePrintConsent(user: any, enrolment: string, seconds: number) {
 return mongoose.connection.transaction(async session => {
  const { student, e } = await ownStudent(user, enrolment, session, true);
  if (!await m.StudentInstitution.exists({ student: student._id, institution: e.institution, status: 'ACTIVE' }).session(session) || !await m.Institution.exists({ _id: e.institution, status: 'ACTIVE' }).session(session)) throw unavailable();
  const [consent] = await m.CertificatePrintConsent.create([{ student: student._id, enrolment: e._id, institution: e.institution, grantedBy: user._id, expiresAt: new Date(Date.now() + seconds * 1000) }], { session });
  await audit(user, 'CERTIFICATE_PRINT_CONSENT_GRANTED', 'CertificatePrintConsent', consent!._id, session, e.institution);
  return { consentId: consent!._id, enrolment: e._id, institution: e.institution, expiresAt: consent!.expiresAt, purpose: consent!.purpose, notice: 'Allows a currently authorized institution administrator to retrieve full APAAR for print preparation only; does not authorize employer sharing or degree issuance' };
 });
}
export async function revokeCertificatePrintConsent(user: any, enrolment: string) {
 return mongoose.connection.transaction(async session => {
  const { student, e } = await ownStudent(user, enrolment, session, false);
  await m.CertificatePrintConsent.updateMany({ enrolment: e._id, student: student._id, grantedBy: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
  await audit(user, 'CERTIFICATE_PRINT_CONSENT_REVOKED', 'Enrolment', e._id, session, e.institution); return { revoked: true };
 });
}
export async function certificatePrintData(user: any, studentId: string, input: any) {
 return mongoose.connection.transaction(async session => {
  await activeActor(user, 'INSTITUTION_ADMIN', session);
  if (!await m.InstitutionMembership.exists({ user: user._id, institution: input.institution, role: 'INSTITUTION_ADMIN', active: true }).session(session)) throw new AppError(403, 'FORBIDDEN', 'Own institution administrator membership required');
  const e = await m.Enrolment.findOne({ _id: input.enrolment, student: studentId, institution: input.institution, status: 'ACTIVE' }).session(session);
  const profile = await m.StudentInstitution.findOne({ student: studentId, institution: input.institution, status: 'ACTIVE' }).session(session);
  const student = await m.Student.findOneAndUpdate({ _id: studentId }, { $inc: { lockVersion: 1 } }, { returnDocument: 'after', session });
  const institution = await m.Institution.findOne({ _id: input.institution, status: 'ACTIVE' }).session(session);
  if (!e || !profile || !student || !institution || e.institutionStudentId !== profile.institutionStudentId || !await m.IntakeAllocation.exists({ _id: e.allocation, offering: e.offering, academicYear: e.academicYear, category: e.category }).session(session) || !await m.AcademicYear.exists({ _id: e.academicYear }).session(session) || !await m.InstitutionProgram.exists({ _id: e.offering, institution: institution._id, active: true }).session(session) || !await m.SeatReservation.exists({ enrolment: e._id, allocation: e.allocation, status: 'ACTIVE' }).session(session)) throw unavailable();
  const assessment = await assessIdentity(studentId, String(student.identityStatus), session);
  let identifier: string | null = null;
  if (input.disclosure === 'FULL') {
   const now = new Date();
   const approval = await m.CertificatePrintAuthorization.findOneAndUpdate({ institution: institution._id, status: 'APPROVED', expiresAt: { $gt: now } }, { $inc: { __v: 1 } }, { session, returnDocument: 'after' });
   if (!approval) throw new AppError(403, 'PRINT_AUTHORIZATION_REQUIRED', 'Current institution print authorization required');
   const consent = await m.CertificatePrintConsent.findOneAndUpdate({ _id: input.consentId, enrolment: e._id, student: student._id, institution: institution._id, grantedBy: student.user, revokedAt: null, expiresAt: { $gt: now } }, { $inc: { __v: 1 } }, { session, returnDocument: 'after' });
   if (!consent || !await m.User.exists({ _id: consent.grantedBy, role: 'STUDENT', active: true }).session(session)) throw new AppError(403, 'PRINT_CONSENT_REQUIRED', 'Current linked-student print consent required');
   const vault = await m.ApaarIdentityVault.findOne({ student: student._id }).select('+ciphertext +nonce +tag').session(session);
   if (!vault) throw new AppError(409, 'IDENTITY_NOT_LINKED', 'No linked identifier available for print preparation');
   const keys = identityKeys(String(vault.keyVersion));
   try { identifier = revealIdentity({ ciphertext: Buffer.from(vault.ciphertext as any), nonce: Buffer.from(vault.nonce as any), tag: Buffer.from(vault.tag as any) }, studentId, keys.encryption); if (!/^\d{12}$/.test(identifier)) throw new Error(); }
   catch { throw new AppError(503, 'IDENTITY_DECRYPTION_FAILED', 'Protected print identifier could not be authenticated'); }
   // Revocation/authorization changes contend on the same documents; expiry is checked again before disclosure.
   if (consent.expiresAt! <= new Date() || approval.expiresAt! <= new Date()) throw new AppError(403, 'PRINT_CONSENT_REQUIRED', 'Print authorization expired');
  }
  await audit(user, input.disclosure === 'FULL' ? 'CERTIFICATE_PRINT_FULL_DISCLOSURE' : 'CERTIFICATE_PRINT_REDACTED_VIEW', 'Enrolment', e._id, session, institution._id);
  return { purpose: 'CERTIFICATE_PRINT_PREPARATION', disclosure: input.disclosure, institution: { id: institution._id, name: institution.name, pid: institution.pid }, studentId: student._id, enrolmentId: e._id, institutionStudentId: profile.institutionStudentId, apaarId: identifier, apaarDisplay: identifier ?? (assessment.identifierPresence === 'LINKED' ? '************' : 'NOT_LINKED'), identityAssessment: assessment, eligibility: 'ACTIVE_RECORD_PRINT_PREPARATION_ONLY', degreeAwardingStatus: 'NOT_INDEPENDENTLY_VERIFIED', officialCertificate: false, qualificationCertified: false, generatedAt: new Date().toISOString(), notice: 'Sensitive administrative print-support data only. Institution must independently establish authority and certificate eligibility; this payload neither issues nor certifies a degree. Do not persist, log or publicly share it.' };
 });
}
