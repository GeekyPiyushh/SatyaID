import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import * as m from '../../models';
import { AppError } from '../../utils/app-error';
import { linkedStudent, authorizedEmployer, tokenDigest, disclosureContext, verificationEvent, claimSource } from './consent';
import { regulatoryConfig } from '../../config/regulatory';
const unavailable = () => new AppError(404, 'CREDENTIAL_UNAVAILABLE', 'Credential reference is unavailable');
export async function issueCredential(user: any, input: any) {
 const student = await linkedStudent(user); const c = regulatoryConfig();
 if (input.expiresInSeconds > c.CREDENTIAL_MAX_SECONDS) throw new AppError(422, 'LIFETIME_EXCEEDED', 'Credential exceeds configured lifetime');
 const token = randomBytes(48).toString('base64url');
 return mongoose.connection.transaction(async session => {
  const request = await m.VerificationRequest.findOne({ _id: input.request, student: student._id, status: 'APPROVED', expiresAt: { $gt: new Date() } }).session(session);
  const consent = request ? await m.ConsentRequest.findOne({ verificationRequest: request._id, status: 'APPROVED' }).session(session) : null;
  const grant = consent ? await m.ConsentGrant.findOneAndUpdate({ request: consent._id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $inc: { __v: 1 } }, { session, returnDocument: 'after' }) : null;
  if (!request || !grant) throw unavailable();
  const claims = input.claims ?? grant.fields;
  if (!claims.every((f: string) => (grant.fields as string[]).includes(f))) throw new AppError(422, 'CLAIM_SCOPE_DENIED', 'Credential cannot expand consent');
  const enrolment = await m.Enrolment.findOne({ _id: request.enrolment, student: student._id }).session(session);
  if (!enrolment || enrolment.status === 'COMPLETED') throw new AppError(409, 'UNSUPPORTED_CREDENTIAL_STATE', 'Completion credentials are not supported');
  const [credential] = await m.DigitalCredential.create([{ request: request._id, consentGrant: grant._id, student: student._id, requester: request.requester, enrolment: request.enrolment, claimTypes: claims, tokenDigest: tokenDigest(token), expiresAt: new Date(Math.min(request.expiresAt!.getTime(), grant.expiresAt!.getTime(), Date.now() + input.expiresInSeconds * 1000)) }], { session });
  await verificationEvent(user, request, 'CREDENTIAL_ISSUED', session, claims, credential!._id);
  return { credentialId: credential!._id, expiresAt: credential!.expiresAt, token, qrReference: `satyaid://verify#token=${token}`, source: claimSource, governmentCertified: false, notice: 'Reference only; intended employer must authenticate to obtain authorized current claims' };
 });
}
export async function credentialMetadata(user: any, id: string) {
 const credential = await m.DigitalCredential.findById(id).select('-tokenDigest'); if (!credential) throw unavailable();
 if (user.role === 'STUDENT') { const student = await linkedStudent(user); if (String(student._id) !== String(credential.student)) throw unavailable(); }
 else { await authorizedEmployer(user); if (String(user._id) !== String(credential.requester)) throw unavailable(); }
 const grant = await m.ConsentGrant.findById(credential.consentGrant);
 return { credentialId: credential._id, claimTypes: credential.claimTypes, expiresAt: credential.expiresAt, revoked: Boolean(credential.revokedAt || grant?.revokedAt), expired: credential.expiresAt! <= new Date() || !grant || grant.expiresAt! <= new Date(), source: credential.source };
}
export async function revokeCredential(user: any, id: string) {
 const student = await linkedStudent(user);
 return mongoose.connection.transaction(async session => {
  const credential = await m.DigitalCredential.findOneAndUpdate({ _id: id, student: student._id }, { $set: { revokedAt: new Date() } }, { session, returnDocument: 'after' }); if (!credential) throw unavailable();
  const request = await m.VerificationRequest.findById(credential.request).session(session); if (!request) throw unavailable();
  await verificationEvent(user, request, 'CREDENTIAL_REVOKED', session, [], credential._id); return { revoked: true };
 });
}
export async function verifyCredential(user: any, token: string) {
 await authorizedEmployer(user);
 return mongoose.connection.transaction(async session => {
  const credential = await m.DigitalCredential.findOneAndUpdate({ tokenDigest: tokenDigest(token), requester: user._id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $inc: { __v: 1 } }, { session, returnDocument: 'after' }); if (!credential) throw unavailable();
  const context = await disclosureContext(user, String(credential.request), session, credential.claimTypes as string[]);
  if (String(context.grant._id) !== String(credential.consentGrant) || String(context.enrolment._id) !== String(credential.enrolment)) throw unavailable();
  if (credential.expiresAt!.getTime() <= Date.now() || context.request.expiresAt!.getTime() <= Date.now() || context.grant.expiresAt!.getTime() <= Date.now()) throw unavailable();
  await verificationEvent(user, context.request, 'CREDENTIAL_CLAIMS_DISCLOSED', session, context.fields, credential._id);
  return { credentialId: credential._id, claims: context.claims, source: claimSource, governmentCertified: false, observedAt: new Date().toISOString(), expiresAt: credential.expiresAt };
 });
}
