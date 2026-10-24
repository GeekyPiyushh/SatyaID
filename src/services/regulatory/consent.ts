import mongoose, { ClientSession } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import * as m from '../../models';
import { AppError } from '../../utils/app-error';
import { regulatoryConfig } from '../../config/regulatory';
import { audit } from '../student';
export const claimSource = 'Current institution-submitted records held in SatyaID; not government-certified';
export const tokenDigest = (value: string) => createHash('sha256').update(value).digest('hex');
const unavailable = () => new AppError(404, 'VERIFICATION_UNAVAILABLE', 'Verification reference is unavailable');
export async function linkedStudent(user: any, session?: ClientSession) {
 if (user.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Only the linked student may manage consent');
 const student = await m.Student.findOne({ user: user._id }).session(session ?? null);
 if (!student) throw unavailable(); return student;
}
export async function authorizedEmployer(user: any, session?: ClientSession) {
 if (user.role !== 'EMPLOYER' || !await m.User.exists({ _id: user._id, role: 'EMPLOYER', active: true }).session(session ?? null) || !await m.EmployerProfile.exists({ user: user._id, status: 'APPROVED' }).session(session ?? null)) throw new AppError(403, 'FORBIDDEN', 'Approved employer account required');
}
export async function verificationEvent(user: any, request: any, eventCode: string, session: ClientSession, claimTypes: string[] = [], credential?: any) {
 await m.VerificationEvent.create([{ request: request._id, actor: user._id, eventCode, claimTypes, credential }], { session });
 const enrolment = await m.Enrolment.findById(request.enrolment).select('institution').session(session);
 await audit(user, eventCode, 'VerificationRequest', request._id, session, enrolment?.institution);
}
export async function createInvitation(user: any, input: any) {
 const student = await linkedStudent(user); const config = regulatoryConfig();
 if (input.expiresInSeconds > config.INVITATION_MAX_SECONDS) throw new AppError(422, 'LIFETIME_EXCEEDED', 'Invitation exceeds configured lifetime');
 if (!await m.Enrolment.exists({ _id: input.enrolment, student: student._id })) throw unavailable();
 if (!await m.User.exists({ _id: input.employer, role: 'EMPLOYER', active: true }) || !await m.EmployerProfile.exists({ user: input.employer, status: 'APPROVED' })) throw new AppError(422, 'EMPLOYER_UNAVAILABLE', 'Approved employer required');
 const token = randomBytes(48).toString('base64url'); const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
 const result = await mongoose.connection.transaction(async session => {
  const [invitation] = await m.VerificationInvitation.create([{ student: student._id, enrolment: input.enrolment, employer: input.employer, maxClaims: input.claims, digest: tokenDigest(token), expiresAt }], { session });
  await audit(user, 'VERIFICATION_INVITATION_CREATED', 'VerificationInvitation', invitation!._id, session); return invitation;
 });
 return { invitationId: result!._id, token, expiresAt, notice: 'Invitation is one-time and employer-bound; it does not grant consent' };
}
export async function createVerificationRequest(user: any, input: any) {
 await authorizedEmployer(user); const config = regulatoryConfig();
 if (input.expiresInSeconds > config.CONSENT_MAX_SECONDS) throw new AppError(422, 'LIFETIME_EXCEEDED', 'Request exceeds configured lifetime');
 return mongoose.connection.transaction(async session => {
  await authorizedEmployer(user, session);
  const invitation = await m.VerificationInvitation.findOneAndUpdate({ digest: tokenDigest(input.invitationToken), employer: user._id, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { session, returnDocument: 'after' });
  if (!invitation) throw unavailable();
  if (!input.claims.every((c: string) => (invitation.maxClaims as string[]).includes(c))) throw new AppError(422, 'CLAIM_SCOPE_DENIED', 'Requested claims exceed the invitation');
  const [request] = await m.VerificationRequest.create([{ student: invitation.student, enrolment: invitation.enrolment, invitation: invitation._id, requester: user._id, requestedClaims: input.claims, purposeCode: input.purposeCode, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000) }], { session });
  const [consent] = await m.ConsentRequest.create([{ verificationRequest: request!._id }], { session });
  await verificationEvent(user, request, 'VERIFICATION_REQUESTED', session, input.claims);
  return { requestId: request!._id, consentRequestId: consent!._id, status: 'PENDING', expiresAt: request!.expiresAt, purposeCode: request!.purposeCode, requestedClaims: request!.requestedClaims };
 });
}
async function ownedConsent(user: any, id: string, session: ClientSession) {
 const student = await linkedStudent(user, session);
 const consent = await m.ConsentRequest.findById(id).session(session);
 const request = consent ? await m.VerificationRequest.findOne({ _id: consent.verificationRequest, student: student._id }).session(session) : null;
 if (!request || !consent) throw unavailable(); return { student, consent, request };
}
export async function decideConsent(user: any, id: string, operation: 'approve' | 'reject' | 'revoke', input: any) {
 return mongoose.connection.transaction(async session => {
  const { student, consent, request } = await ownedConsent(user, id, session);
  await m.Student.updateOne({ _id: student._id, user: user._id }, { $inc: { lockVersion: 1 } }, { session });
  if (operation === 'revoke') {
   if (consent.status === 'REVOKED') return { status: 'REVOKED' };
   if (consent.status !== 'APPROVED') throw new AppError(409, 'CONSENT_STATE_CONFLICT', 'Only approved consent can be revoked');
   await m.ConsentGrant.updateOne({ request: consent._id }, { $set: { revokedAt: new Date() } }, { session }); consent.status = 'REVOKED'; request.status = 'REVOKED';
  } else {
   if (consent.status !== 'PENDING' || request.expiresAt! <= new Date()) throw new AppError(409, 'CONSENT_STATE_CONFLICT', 'Consent is no longer pending or has expired');
   if (operation === 'approve') {
    const config = regulatoryConfig();
    if (input.expiresInSeconds > config.CONSENT_MAX_SECONDS) throw new AppError(422, 'LIFETIME_EXCEEDED', 'Consent exceeds configured lifetime');
    if (!input.claims.every((c: string) => (request.requestedClaims as string[]).includes(c))) throw new AppError(422, 'CLAIM_SCOPE_DENIED', 'Consent cannot expand requested claims');
    await m.ConsentGrant.create([{ request: consent._id, grantedBy: user._id, fields: input.claims, expiresAt: new Date(Math.min(request.expiresAt!.getTime(), Date.now() + input.expiresInSeconds * 1000)) }], { session }); consent.status = 'APPROVED'; request.status = 'APPROVED';
   } else { consent.status = 'DENIED'; request.status = 'REJECTED'; }
  }
  consent.version = Number(consent.version) + 1; await consent.save({ session }); await request.save({ session });
  await verificationEvent(user, request, `CONSENT_${operation.toUpperCase()}`, session, input.claims ?? []);
  const grant = await m.ConsentGrant.findOne({ request: consent._id }).session(session);
  return { consentRequestId: consent._id, requestId: request._id, status: consent.status, authorizedClaims: grant?.fields ?? [], consentExpiresAt: grant?.expiresAt ?? null, revokedAt: grant?.revokedAt ?? null };
 });
}
export async function disclosureContext(user: any, requestId: string, session: ClientSession, requestedClaims?: string[]) {
 await authorizedEmployer(user, session);
 const request = await m.VerificationRequest.findOne({ _id: requestId, requester: user._id, status: 'APPROVED', expiresAt: { $gt: new Date() } }).session(session);
 if (!request) throw unavailable();
 const consent = await m.ConsentRequest.findOne({ verificationRequest: request._id, status: 'APPROVED' }).session(session);
 const grant = consent ? await m.ConsentGrant.findOneAndUpdate({ request: consent._id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $inc: { disclosureCount: 1 } }, { session, returnDocument: 'after' }) : null;
 if (!grant || !await m.Student.exists({ _id: request.student, user: grant.grantedBy }).session(session) || !await m.User.exists({ _id: grant.grantedBy, role: 'STUDENT', active: true }).session(session)) throw unavailable();
 const fields: string[] = requestedClaims ?? grant.fields as string[];
 if (!fields.every(c => (grant.fields as string[]).includes(c) && (request.requestedClaims as string[]).includes(c))) throw unavailable();
 const enrolment = await m.Enrolment.findOne({ _id: request.enrolment, student: request.student }).session(session);
 if (!enrolment) throw unavailable();
 const [institution, offering, year] = [await m.Institution.findById(enrolment.institution).session(session), await m.InstitutionProgram.findById(enrolment.offering).session(session), await m.AcademicYear.findById(enrolment.academicYear).session(session)];
 const program = offering ? await m.Program.findById(offering.program).session(session) : null;
 if (!institution || !program || !year) throw unavailable();
 const all: Record<string, unknown> = { INSTITUTION: { name: institution.name, pid: institution.pid }, PROGRAM: { name: program.name, code: program.code }, ACADEMIC_YEAR: year.code, ENROLMENT_STATUS: enrolment.status === 'COMPLETED' ? 'COMPLETION_NOT_SUPPORTED' : enrolment.status, START_DATE: enrolment.startsOn?.toISOString().slice(0, 10), ADMISSION_DATE: enrolment.admissionDate?.toISOString().slice(0, 10) };
 if (fields.some(field => all[field] === undefined || all[field] === null)) throw unavailable();
 return { request, consent, grant, enrolment, fields, claims: Object.fromEntries(fields.map(f => [f, all[f]])) };
}
export async function verificationResult(user: any, id: string) {
 return mongoose.connection.transaction(async session => {
  const context = await disclosureContext(user, id, session);
  if (context.request.expiresAt!.getTime() <= Date.now() || context.grant.expiresAt!.getTime() <= Date.now()) throw unavailable();
  await verificationEvent(user, context.request, 'CLAIMS_DISCLOSED', session, context.fields);
  return { requestId: context.request._id, claims: context.claims, observedAt: new Date().toISOString(), source: claimSource, governmentCertified: false };
 });
}
