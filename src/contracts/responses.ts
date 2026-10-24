import * as m from '../models';
import type { Endpoint } from './inventory';
export const str = { type: 'string' }, num = { type: 'number' }, bool = { type: 'boolean' }, id = { type: 'string', pattern: '^[a-fA-F0-9]{24}$', example: '000000000000000000000001' }, date = { type: 'string', format: 'date-time' };
export const arr = (items: any) => ({ type: 'array', items });
export const obj = (properties: Record<string, any>, required: string[] = Object.keys(properties)) => ({ type: 'object', properties, required });
export const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
export const nullable = (schema: any) => ({ anyOf: [schema, { type: 'null' }] });
export const page = (items: any, extra = {}) => obj({ items: arr(items), total: num, page: num, limit: num, ...extra });
export const schemas: Record<string, any> = {};
function model(name: string, source: any, fields?: string[]) {
 const properties: Record<string, any> = {};
 for (const [key, p] of Object.entries(source.schema.paths) as any) {
  if (p.options.select === false || ['requestFingerprint', 'fingerprint', 'leaseToken'].includes(key) || fields && !fields.includes(key)) continue;
  const enumValues = p.enumValues?.length ? { enum: p.enumValues } : {};
  properties[key] = p.instance === 'ObjectId' ? id : p.instance === 'Date' ? date : p.instance === 'Number' ? num : p.instance === 'Boolean' ? bool : p.instance === 'Array' ? arr(p.caster?.instance === 'ObjectId' || p.$embeddedSchemaType?.instance === 'ObjectId' ? id : str) : p.instance === 'Mixed' ? { type: 'object', additionalProperties: true } : { ...str, ...enumValues };
 }
 const required = Object.entries(source.schema.paths).filter(([key, p]: any) => key in properties && (key === '_id' || p.isRequired || p.options.default !== undefined)).map(([key]) => key);
 schemas[name] = obj(properties, required); return ref(name);
}
const institution = model('Institution', m.Institution), program = model('Program', m.Program), year = model('AcademicYear', m.AcademicYear), profile = model('InstitutionStudentProfile', m.StudentInstitution), enrolment = model('Enrolment', m.Enrolment), intake = model('IntakeAllocation', m.IntakeAllocation), offering = model('Offering', m.InstitutionProgram), quota = model('QuotaRule', m.QuotaRule), category = model('SeatCategory', m.SeatCategory), history = model('EnrolmentHistory', m.EnrolmentHistory), membership = model('InstitutionMembership', m.InstitutionMembership);
const upload = model('UploadJob', m.UploadJob, ['_id', 'status', 'totalRows', 'validRows', 'invalidRows', 'committedRows', 'failureCode', 'attempts', 'institution', 'payloadPurgedAt', 'createdAt', 'updatedAt']);
const report = model('RegulatoryReport', m.ReportJob, ['_id', 'requestedBy', 'institution', 'filters', 'reportType', 'format', 'status', 'attempts', 'failureCode', 'generatedAt', 'expiresAt', 'metadata', 'contentDigest', 'createdAt', 'updatedAt']);
const statusCount = obj({ _id: str, count: num });
schemas.User = obj({ _id: id, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: [...m.roles] } });
schemas.IdentityAssessment = obj({ policy: { const: 'ALLOW_WITH_REVIEW_FLAGS_V1' }, identifierPresence: { type: 'string', enum: ['LINKED','MISSING'] }, formatStatus: { type: 'string', enum: ['VALID_AT_LINK','NOT_PROVIDED'] }, verificationStatus: str, officialVerificationAvailable: { const: false }, reviewRequired: bool, warnings: arr(str) });
schemas.Student = obj({ studentId: id, identityStatus: str, identityAssessment: ref('IdentityAssessment'), profiles: arr(profile) });
schemas.Registration = obj({ studentId: id, identityStatus: str, identityAssessment: ref('IdentityAssessment'), profile });
schemas.Tokens = obj({ accessToken: str, refreshToken: str, expiresIn: { const: 600 }, tokenType: { const: 'Bearer' } });
schemas.BrowserTokens = obj({ accessToken: str, expiresIn: { const: 600 }, tokenType: { const: 'Bearer' }, csrfToken: str, sessionExpiresAt: date });
schemas.Capacity = obj({ offering: id, academicYear: id, baseSeats: num, allocations: arr({ ...schemas.IntakeAllocation, properties: { ...schemas.IntakeAllocation.properties, availableSeats: num } }), configuredQuotas: arr(obj({ ruleId: id, category: id, kind: str, seats: num })), note: str });
schemas.AnalyticsSummary = obj({ label: str, observedAt: date, filters: { type: 'object' }, consistency: str, institutionSummary: nullable(obj({ pid: str, name: str, state: str, status: str })), registeredInstitutions: num, activeInstitutions: num, offerings: num, approvedBaseIntake: num, approvedSupernumeraryIntake: num, approvedSeats: num, occupiedSeats: num, availableSeats: num, utilizationPercentage: num, allocationBreakdown: arr(obj({ _id: str, approved: num, occupied: num, allocationCount: num })), activeReservations: num, enrolmentsByStatus: arr(statusCount), uniqueStudents: num, identityStatusDistribution: arr(statusCount), uploads: arr(obj({ _id: str, count: num, totalRows: num, invalidRows: num, committedRows: num })), conflicts: arr(statusCount), openConflicts: num, denominatorNotes: { type: 'object', additionalProperties: str } }, ['label', 'observedAt', 'approvedSeats', 'occupiedSeats', 'utilizationPercentage', 'uniqueStudents']);
schemas.Utilization = page(obj({ _id: obj({ offering: id, academicYear: id, category: id, kind: str }), approvedSeats: num, occupiedSeats: num, availableSeats: num, utilizationPercentage: num }), { observedAt: date });
schemas.ConflictCase = { anyOf: [model('RegulatorConflict', m.EnrolmentConflict), obj({ _id: id, ruleCode: str, status: str, severity: str, resolution: str, createdAt: date, version: num, explanation: str }, ['_id', 'ruleCode', 'status', 'severity', 'version', 'explanation'])] };
schemas.RegulatorConflict.properties.explanation = str;
schemas.Transfer = { anyOf: [model('RegulatorTransfer', m.TransferRequest), obj({ _id: id, status: str, startsOn: date, createdAt: date })] };
schemas.EmployerVerificationRequest = obj({ requestId: id, consentRequestId: id, status: str, expiresAt: date, purposeCode: str, requestedClaims: arr(str) });
schemas.ConsentGrant = obj({ consentRequestId: id, requestId: id, status: str, authorizedClaims: arr(str), consentExpiresAt: nullable(date), revokedAt: nullable(date) });
schemas.ConsentDecision = { anyOf: [ref('ConsentGrant'), obj({ status: { const: 'REVOKED' } })] };
schemas.Claims = obj({ INSTITUTION: obj({ name: str, pid: str }), PROGRAM: obj({ name: str, code: str }), ENROLMENT_STATUS: str, ACADEMIC_YEAR: str, START_DATE: { type: 'string', format: 'date' }, ADMISSION_DATE: { type: 'string', format: 'date' } }, []);
schemas.VerificationResult = obj({ requestId: id, claims: ref('Claims'), source: str, governmentCertified: { const: false }, observedAt: date });
schemas.Credential = obj({ credentialId: id, claimTypes: arr(str), expiresAt: date, revoked: bool, expired: bool, source: str });
schemas.CredentialIssued = obj({ credentialId: id, expiresAt: date, token: str, qrReference: str, source: str, governmentCertified: { const: false }, notice: str });
schemas.CredentialResult = obj({ credentialId: id, claims: ref('Claims'), source: str, governmentCertified: { const: false }, observedAt: date, expiresAt: date });
schemas.Finding = obj({ ruleId: str, severity: str, explanation: str, affectedReference: str, evidenceCategory: str, recommendedAction: str });
schemas.Prevalidation = obj({ findings: arr(ref('Finding')), truncated: bool, detailLimit: num, observedAt: date, ruleVersion: str, definition: str, coverage: str });
schemas.AnomalyAlert = obj({ ruleId: str, severity: str, explanation: str, evidence: { type: 'object', additionalProperties: true }, institution: id, academicYear: id, window: obj({ from: str, to: str }), recommendedAction: str });
schemas.Anomalies = obj({ version: str, alerts: arr(ref('AnomalyAlert')), observedAt: date, filters: { type: 'object' }, dataSource: str, coverage: str });
schemas.QualityScore = obj({ calculationVersion: str, label: str, score: nullable(num), insufficientData: bool, reasons: arr(str), components: arr(obj({ dimension: str, weight: num, score: nullable(num), numerator: num, denominator: num })), minimumObservations: str, institution: id, academicYear: id, observedAt: date, coverage: { type: 'object' } }, ['calculationVersion', 'label', 'score', 'insufficientData', 'reasons', 'components', 'minimumObservations']);
schemas.PolicySimulation = obj({ label: str, calculationVersion: str, asOf: date, observedAt: date, assumptions: arr(str), affectedOfferingCount: num, rows: arr(obj({ allocationId: id, offering: id, approvedSeats: num, occupiedSeats: num, currentConfiguredCeiling: num, hypotheticalQuotaCeiling: num, hypotheticalEffectiveCeiling: num, difference: num, potentialShortfall: num, additionalApprovalNeededForFullHypotheticalQuota: num, hypotheticalUtilizationPercentage: nullable(num), currentRuleVersions: arr(obj({ ruleId: id, version: num })), ambiguousCurrentRules: bool })) });
schemas.CertificatePrintAuthorization = obj({ authorizationId: id, institution: id, status: { type: 'string', enum: ['APPROVED','SUSPENDED'] }, expiresAt: date, authorityReference: str, degreeAwardingStatus: { const: 'NOT_INDEPENDENTLY_VERIFIED' }, notice: str });
schemas.CertificatePrintConsent = obj({ consentId: id, enrolment: id, institution: id, expiresAt: date, purpose: { const: 'CERTIFICATE_PRINT_PREPARATION' }, notice: str });
schemas.CertificatePrintData = obj({ purpose: { const: 'CERTIFICATE_PRINT_PREPARATION' }, disclosure: { type: 'string', enum: ['REDACTED','FULL'] }, institution: obj({ id, name: str, pid: str }), studentId: id, enrolmentId: id, institutionStudentId: str, apaarId: { ...nullable({ type: 'string', pattern: '^\\d{12}$' }), example: null }, apaarDisplay: { ...str, example: '************' }, identityAssessment: ref('IdentityAssessment'), eligibility: { const: 'ACTIVE_RECORD_PRINT_PREPARATION_ONLY' }, degreeAwardingStatus: { const: 'NOT_INDEPENDENTLY_VERIFIED' }, officialCertificate: { const: false }, qualificationCertified: { const: false }, generatedAt: date, notice: str });
export function responseContract(e: Endpoint): any {
 const p = e.path.replace('/api/v1', ''), method = e.method;
 if (p.endsWith('/certificate-print-authorization')) return ref('CertificatePrintAuthorization');
 if (p.endsWith('/certificate-print-consent')) return ref('CertificatePrintConsent');
 if (p.endsWith('/certificate-print-consent/revoke')) return obj({ revoked: { const: true } });
 if (p.endsWith('/certificate-print-data')) return ref('CertificatePrintData');
 if (p === '/api/health') return obj({ service: { const: 'satyaid-backend' } });
 if (p === '/api/ready') return obj({ database: { const: 'ready' } });
 if (p.startsWith('/auth')) {
  if (p.endsWith('/me')) return ref('User'); if (p.endsWith('/logout')) return { type: 'null' };
  if (p.endsWith('/csrf')) return obj({ csrfToken: str, expiresAt: date }); return ref(p.includes('/browser/') ? 'BrowserTokens' : 'Tokens');
 }
 for (const [root, schema] of Object.entries({ institutions: institution, programs: program, 'academic-years': year, 'seat-categories': category, intakes: intake, 'quota-rules': quota, offerings: offering })) {
  if (p === '/' + root) return method === 'get' ? root === 'institutions' ? page(schema) : arr(schema) : schema;
  if (p === '/' + root + '/{id}' || p === '/' + root + '/{id}/retire') return schema;
 }
 if (p.endsWith('/memberships') || p.endsWith('/memberships/{membershipId}')) return membership;
 if (p.endsWith('/offerings')) return arr(offering);
 if (p.endsWith('/intake-report')) return arr(ref('Capacity'));
 if (p.endsWith('/capacity')) return ref('Capacity');
 if (p.endsWith('/quota-rules')) return arr(quota);
 if (p === '/students') return method === 'post' ? ref('Registration') : page(profile);
 if (p === '/students/{id}') return method === 'get' ? ref('Student') : profile;
 if (/\/students\/.*\/(account-link|apaar\/link)$/.test(p)) return obj({ linked: { const: true } });
 if (p.endsWith('/identity-status')) return obj({ identityStatus: str, latestEvent: nullable(model('IdentityEventProjection', m.IdentityVerificationEvent, ['_id','provider','providerVersion','reasonCode','createdAt','status'])), official: { const: false }, identityAssessment: ref('IdentityAssessment') });
 if (p.endsWith('/verify-apaar')) return obj({ verificationStatus: str, outcome: str, provider: str, providerVersion: str, official: { const: false }, traceId: str });
 if (p === '/enrolments') return method === 'get' ? page(enrolment) : enrolment;
 if (p.startsWith('/enrolments/')) return p.endsWith('/history') ? arr(history) : enrolment;
 if (p.startsWith('/uploads')) return p.endsWith('/results') ? page(model('UploadRow', m.UploadRowResult, ['_id','rowNumber','status','errorCodes','warnings','student','enrolment'])) : upload;
 if (p.startsWith('/transfers')) return ref('Transfer');
 if (p.startsWith('/conflicts')) {
  if (p.endsWith('/evidence')) return obj({ _id: id, recorded: { const: true } });
  if (p.endsWith('/history')) return page({ anyOf: [model('ConflictHistory', m.ConflictHistory), obj({ _id: id, action: str, resolution: str, createdAt: date }, ['action','createdAt'])] });
  return p === '/conflicts' ? page(ref('ConflictCase')) : ref('ConflictCase');
 }
 if (p.includes('/analytics/')) {
  if (p.includes('/overview')) return p.includes('/institutions/') ? { ...schemas.AnalyticsSummary, properties: { ...schemas.AnalyticsSummary.properties, utilization: ref('Utilization'), breakdownLimit: num } } : ref('AnalyticsSummary');
  if (p.endsWith('/intake-utilization')) return ref('Utilization');
  if (p.endsWith('/trends')) return obj({ items: arr(obj({ _id: obj({ month: nullable(str), status: str }), count: num })), observedAt: date, limit: num, note: str });
  return obj({ observedAt: date, filters: { type: 'object' }, applicableFilters: arr(str), items: arr(statusCount) });
 }
 if (p === '/verification/employers') return obj({ employerId: id, organization: str, status: str });
 if (p === '/verification/invitations') return obj({ invitationId: id, token: str, expiresAt: date, notice: str });
 if (p === '/verification/requests') return method === 'post' ? ref('EmployerVerificationRequest') : page(model('EmployerRequestListItem', m.VerificationRequest, ['_id','purposeCode','requestedClaims','status','expiresAt','createdAt']));
 if (p.endsWith('/result')) return ref('VerificationResult');
 if (p === '/consents/requests') return page(obj({ _id: id, consentRequestId: id, status: str, authorizedClaims: arr(str), consentExpiresAt: date, revokedAt: date, purposeCode: str, requestedClaims: arr(str), expiresAt: date, enrolment: id, employerOrganization: str }, ['_id','consentRequestId','status','authorizedClaims','purposeCode','requestedClaims','expiresAt','enrolment']));
 if (p === '/consents/history') return page(model('VerificationHistory', m.VerificationEvent, ['_id','eventCode','claimTypes','createdAt','request','outcome']));
 if (p.startsWith('/consents/')) return ref('ConsentDecision');
 if (p === '/credentials') return ref('CredentialIssued');
 if (p === '/credentials/verify') return ref('CredentialResult');
 if (p.startsWith('/credentials/')) return p.endsWith('/revoke') ? obj({ revoked: { const: true } }) : ref('Credential');
 if (p === '/reports/prevalidation') return ref('Prevalidation');
 if (p === '/reports') return method === 'post' ? obj({ reportId: id, status: { const: 'PENDING' }, expiresAt: date }) : page(report);
 if (p === '/reports/{id}') return report;
 if (p === '/audit/events') return page(model('AuditEvent', m.AuditEvent));
 if (p === '/audit/integrity') return obj({ checks: arr(obj({ eventId: id, status: { type: 'string', enum: ['VALID','INVALID','UNSIGNED','KEY_UNAVAILABLE'] } })), checked: num, page: num, limit: num, guarantee: str });
 if (p.endsWith('/quality-score')) return ref('QualityScore');
 if (p.endsWith('/health')) return obj({ institution: id, academicYear: id, observation: str, anomalies: ref('Anomalies'), quality: ref('QualityScore'), prevalidation: ref('Prevalidation') });
 if (p.endsWith('/anomalies')) return ref('Anomalies');
 if (p.endsWith('/policy-simulations')) return ref('PolicySimulation');
 throw new Error('Missing response contract: ' + e.method + ' ' + e.path);
}
