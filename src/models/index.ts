import { configureAudit } from '../utils/audit-integrity';
import mongoose, { Schema } from 'mongoose';
const ref = (name: string, required = true) => ({ type: Schema.Types.ObjectId, ref: name, required });
const text = { type: String, required: true, trim: true };
const status = (values: string[], initial: string) => ({ type: String, enum: values, default: initial });
export const roles = ['AICTE_ADMIN', 'INSTITUTION_ADMIN', 'INSTITUTION_STAFF', 'STUDENT', 'EMPLOYER'] as const;
function define(name: string, fields: Record<string, unknown>, indexes: [Record<string, 1 | -1>, boolean][] = []) {
 const schema = new Schema(fields as any, { timestamps: true, strict: 'throw', bufferCommands: false });
 for (const [keys, unique] of indexes) schema.index(keys, { unique });
 for (const [name, path] of Object.entries(schema.paths)) {
  if (path.options.ref && !indexes.some(([keys]) => Object.keys(keys)[0] === name)) schema.index({ [name]: 1 });
 }
 if (name === 'AuditEvent') configureAudit(schema);
 return mongoose.model(name, schema);
}
export const User = define('User', { email: { ...text, lowercase: true }, passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: roles, required: true }, active: { type: Boolean, default: true } }, [[{ email: 1 }, true]]);
export const Institution = define('Institution', { pid: text, name: text, state: text, status: status(['ACTIVE', 'INACTIVE'], 'ACTIVE') }, [[{ pid: 1 }, true], [{ state: 1, status: 1 }, false]]);
export const InstitutionMembership = define('InstitutionMembership', { institution: ref('Institution'), user: ref('User'), role: { type: String, enum: ['INSTITUTION_ADMIN', 'INSTITUTION_STAFF'], required: true }, active: { type: Boolean, default: true } }, [[{ institution: 1, user: 1 }, true], [{ user: 1, active: 1 }, false]]);
export const EmployerProfile = define('EmployerProfile', { user: ref('User'), organization: text, status: status(['PENDING', 'APPROVED', 'SUSPENDED'], 'PENDING'), approvalReference: String }, [[{ user: 1 }, true]]);
export const Student = define('Student', { displayName: text, user: ref('User', false), lockVersion: { type: Number, default: 0 }, identityStatus: status(['UNVERIFIED', 'MOCK_VERIFIED', 'OFFICIALLY_VERIFIED', 'VERIFICATION_FAILED'], 'UNVERIFIED') });
export const ApaarIdentityVault = define('ApaarIdentityVault', { student: ref('Student'), ciphertext: { type: Buffer, required: true, select: false }, nonce: { type: Buffer, required: true, select: false }, tag: { type: Buffer, required: true, select: false }, lookupDigest: { type: Buffer, required: true, select: false }, keyVersion: text }, [[{ student: 1 }, true], [{ keyVersion: 1, lookupDigest: 1 }, true]]);
export const Program = define('Program', { code: text, name: text }, [[{ code: 1 }, true]]);
export const InstitutionProgram = define('InstitutionProgram', { institution: ref('Institution'), program: ref('Program'), active: { type: Boolean, default: true } }, [[{ institution: 1, program: 1 }, true]]);
export const AcademicYear = define('AcademicYear', { code: text, startsOn: { type: Date, required: true }, endsOn: { type: Date, required: true } }, [[{ code: 1 }, true]]);
export const SeatCategory = define('SeatCategory', { code: text, name: text }, [[{ code: 1 }, true]]);
export const IntakeAllocation = define('IntakeAllocation', { offering: ref('InstitutionProgram'), academicYear: ref('AcademicYear'), category: ref('SeatCategory'), kind: { type: String, enum: ['BASE', 'SUPERNUMERARY'], required: true }, approvedSeats: { type: Number, min: 0, required: true, validate: Number.isInteger }, occupiedSeats: { type: Number, min: 0, default: 0, validate: Number.isInteger }, sourceReference: text, version: { type: Number, default: 1 } }, [[{ offering: 1, academicYear: 1, category: 1, kind: 1 }, true]]);
export const QuotaRule = define('QuotaRule', { offering: ref('InstitutionProgram'), academicYear: ref('AcademicYear'), category: ref('SeatCategory'), version: { type: Number, min: 1, required: true }, kind: { type: String, enum: ['BASE', 'SUPERNUMERARY'], required: true }, method: { type: String, enum: ['FIXED', 'PERCENTAGE'], required: true }, value: { type: Number, min: 0, required: true }, rounding: { type: String, enum: ['FLOOR', 'CEILING', 'HALF_UP'], required: true }, effectiveFrom: { type: Date, required: true }, effectiveUntil: { type: Date, required: true }, sourceReference: text, approvalStatus: status(['DRAFT', 'APPROVED', 'RETIRED'], 'DRAFT') }, [[{ offering: 1, academicYear: 1, category: 1, version: 1 }, true]]);
export const Enrolment = define('Enrolment', { student: ref('Student'), allocation: ref('IntakeAllocation'), status: status(['DRAFT', 'PENDING_VALIDATION', 'ACTIVE', 'UNDER_REVIEW', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED', 'REJECTED', 'ACCEPTED'], 'DRAFT'), admissionDate: Date, institutionStudentId: String, entryType: { type: String, enum: ['REGULAR', 'LATERAL_ENTRY', 'TRANSFER'], default: 'REGULAR' }, startsOn: Date, endsOn: Date, transferFrom: ref('Enrolment', false), institution: ref('Institution', false), offering: ref('InstitutionProgram', false), academicYear: ref('AcademicYear', false), category: ref('SeatCategory', false), idempotencyKey: String, requestFingerprint: String, version: { type: Number, default: 1 } }, [[{ student: 1, status: 1 }, false], [{ institution: 1, academicYear: 1, status: 1 }, false], [{ allocation: 1, institutionStudentId: 1 }, false]]);
export const EnrolmentHistory = define('EnrolmentHistory', { enrolment: ref('Enrolment'), actor: ref('User'), fromStatus: String, toStatus: text, reasonCode: text });
export const UploadJob = define('UploadJob', { institution: ref('Institution'), idempotencyKey: text, status: status(['PENDING', 'VALIDATING', 'VALIDATED', 'COMMITTING', 'COMPLETED', 'PARTIAL', 'FAILED'], 'PENDING'), fingerprint: { type: String, select: false }, leaseToken: String, commitRequested: { type: Boolean, default: false }, submittedBy: ref('User', false), payload: { type: Buffer, select: false }, format: String, totalRows: { type: Number, default: 0 }, validRows: { type: Number, default: 0 }, invalidRows: { type: Number, default: 0 }, committedRows: { type: Number, default: 0 }, leaseUntil: Date, attempts: { type: Number, default: 0 }, failureCode: String, payloadPurgedAt: Date }, [[{ institution: 1, idempotencyKey: 1 }, true]]);
export const ValidationIssue = define('ValidationIssue', { job: ref('UploadJob'), rowNumber: Number, errorCode: text });
export const EnrolmentConflict = define('EnrolmentConflict', { student: ref('Student'), firstEnrolment: ref('Enrolment'), secondEnrolment: ref('Enrolment'), institutions: [{ type: Schema.Types.ObjectId, ref: 'Institution' }], ruleCode: text, status: status(['OPEN', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'RESOLVED', 'DISMISSED', 'ESCALATED'], 'OPEN'), resolution: String, reasonCode: String, assignedReviewer: ref('User', false), severity: status(['WARNING', 'HIGH'], 'WARNING'), version: { type: Number, default: 1 } }, [[{ firstEnrolment: 1, secondEnrolment: 1, ruleCode: 1 }, true], [{ institutions: 1, status: 1 }, false]]);
export const StudentCorrectionRequest = define('StudentCorrectionRequest', { student: ref('Student'), requestedBy: ref('User'), fieldCode: text, protectedObjectReference: text, status: status(['PENDING', 'APPROVED', 'REJECTED'], 'PENDING') });
export const VerificationRequest = define('VerificationRequest', { student: ref('Student'), requester: ref('User'), purposeCode: text, expiresAt: { type: Date, required: true }, enrolment: ref('Enrolment'), invitation: ref('VerificationInvitation'), requestedClaims: [{ type: String, enum: ['INSTITUTION', 'PROGRAM', 'ENROLMENT_STATUS', 'ACADEMIC_YEAR', 'START_DATE', 'ADMISSION_DATE'] }], status: status(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'], 'PENDING') });
export const ConsentRequest = define('ConsentRequest', { verificationRequest: ref('VerificationRequest'), status: status(['PENDING', 'APPROVED', 'DENIED', 'REVOKED'], 'PENDING'), version: { type: Number, default: 1 } });
export const ConsentGrant = define('ConsentGrant', { request: ref('ConsentRequest'), fields: { type: [{ type: String, enum: ['INSTITUTION', 'PROGRAM', 'ENROLMENT_STATUS', 'ACADEMIC_YEAR', 'START_DATE', 'ADMISSION_DATE'] }], required: true, validate: (values: string[]) => values.length > 0 && values.length <= 6 && new Set(values).size === values.length }, expiresAt: { type: Date, required: true }, revokedAt: Date, grantedBy: ref('User'), disclosureCount: { type: Number, default: 0 } });
export const AuditEvent = define('AuditEvent', { actor: ref('User'), action: text, resourceType: text, resourceId: { type: Schema.Types.ObjectId, required: true }, institution: ref('Institution', false) }, [[{ institution: 1, createdAt: -1 }, false]]);
export const RefreshSession = define('RefreshSession', { user: ref('User'), digest: { type: String, required: true, select: false }, family: text, transport: { type: String, enum: ['json', 'browser'], default: 'json' }, browserOrigin: String, csrfDigest: { type: String, select: false }, familyExpiresAt: Date, expiresAt: { type: Date, required: true }, revokedAt: Date }, [[{ digest: 1 }, true], [{ family: 1 }, false]]);

export * from './batch2';
Enrolment.schema.index({ institution: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
Student.schema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } }, name: 'student_account_unique' });

Enrolment.schema.set('toJSON', { transform: (_doc: unknown, ret: any) => { delete ret.requestFingerprint; return ret; } });

export * from './batch3';
VerificationRequest.schema.removeIndex({ invitation: 1 });
VerificationRequest.schema.index({ invitation: 1 }, { name: 'verification_invitation_unique', unique: true, partialFilterExpression: { invitation: { $type: 'objectId' } } });
VerificationRequest.schema.index({ requester: 1, createdAt: -1 });
VerificationRequest.schema.index({ student: 1, createdAt: -1 });
ConsentRequest.schema.removeIndex({ verificationRequest: 1 });
ConsentRequest.schema.index({ verificationRequest: 1 }, { unique: true, name: 'consent_request_unique' });
ConsentGrant.schema.removeIndex({ request: 1 });
ConsentGrant.schema.index({ request: 1 }, { unique: true, name: 'consent_grant_unique' });

export * from './batch4';

export * from './compliance';
