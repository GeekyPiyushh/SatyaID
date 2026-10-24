import type { Endpoint } from './inventory';
export const allRoles = ['AICTE_ADMIN','INSTITUTION_ADMIN','INSTITUTION_STAFF','STUDENT','EMPLOYER'];
const writers = allRoles.slice(0, 3);
export function policy(e: Endpoint) {
 let roles = e.roles ?? allRoles, scope = 'Authenticated account; additional object permissions enforced server-side.';
 const p = e.path, method = e.method;
 if (!e.authenticated) { roles = []; scope = p.includes('/browser/') ? 'Exact configured Origin; cookie/CSRF transport. csrf is bootstrap; login/refresh/logout require X-CSRF-Token.' : p.includes('/auth/') ? 'Non-browser JSON transport: Origin and Sec-Fetch headers forbidden; browser refresh cookie forbidden.' : 'Public service status; no student records.'; }
 else if (p.includes('/certificate-print')) { roles = e.roles ?? []; scope = p.endsWith('/certificate-print-authorization') ? 'AICTE operator-reviewed institution print permission only; degree-awarding powers are not independently validated.' : p.includes('/certificate-print-consent') ? 'Owning active linked STUDENT only; grant for ACTIVE enrolment, expiry up to86400sec; revoke all own grants for enrolment, history retained.' : 'Active own INSTITUTION_ADMIN and membership, ACTIVE institution/profile/enrolment/offering/reservation. Default REDACTED. FULL needs current regulator print authorization and explicit unexpired enrolment-bound consentId from the current linked student; audit and no-store. Not degree issuance.'; }
 else if (p.includes('/auth/me')) scope = 'Current active account only.';
 else if (/\/(analytics|intelligence)\//.test(p)) { roles = e.roles ?? writers; scope = 'AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.'; }
 else if (/\/(audit|reports)(\/|$)/.test(p)) { roles = e.roles ?? writers.slice(0,2); scope = 'AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.'; }
 else if (p.includes('/consents') || p.endsWith('/verification/invitations') || p === '/api/v1/credentials' || p.endsWith('/credentials/{id}/revoke')) { roles = ['STUDENT']; scope = 'Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.'; }
 else if (p.includes('/verification/requests') || p.endsWith('/credentials/verify')) { roles = ['EMPLOYER']; scope = 'Active account and APPROVED employer profile; employer-bound invitation/request/credential only.'; }
 else if (p === '/api/v1/credentials/{id}') { roles = ['STUDENT','EMPLOYER']; scope = 'Owning linked student or bound approved employer; metadata only.'; }
 else if (p.includes('/verification/employers')) scope = 'AICTE governs an existing active EMPLOYER account; no employer directory or account creation endpoint.';
 else if (/\/(students|enrolments)(\/|$)/.test(p)) { const ownRead = method === 'get' && p.includes('{id}'); roles = e.roles ?? (ownRead ? [...writers,'STUDENT'] : writers); scope = ownRead ? 'Regulator, owning linked student, or writer with active institution membership and association. Student read requires institution query for institutional callers.' : 'Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.'; }
 else if (/\/(uploads|transfers|conflicts)(\/|$)/.test(p)) { roles = e.roles ?? (p.endsWith('/uploads/template') ? allRoles : writers); scope = 'Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.'; }
 else if (!e.roles) {
  if (method !== 'get' && /institutions/.test(p)) { roles = writers.slice(0,2); scope = 'AICTE or active own institution admin membership. Only AICTE changes institution status or appoints admins; staff accounts must already exist.'; }
  else scope = /programs|academic-years|seat-categories/.test(p) ? 'All authenticated roles can read these bounded global master lists (first 100).' : 'AICTE or active institution membership; institution list returns own memberships for non-regulators.';
 }
 return { roles, scope };
}
export function successStatus(e: Endpoint) {
 if (e.method === 'post' && e.path.endsWith('/certificate-print-consent')) return 201;
 if (e.method === 'post' && (e.path === '/api/v1/reports' || /\/uploads\/(students|\{id\}\/(commit|retry))$/.test(e.path))) return 202;
 if (e.method === 'post' && ['/institutions','/programs','/academic-years','/seat-categories','/offerings','/intakes','/quota-rules','/students','/enrolments','/transfers','/verification/invitations','/verification/requests','/credentials'].some(p => e.path === '/api/v1' + p) || e.method === 'post' && e.path.endsWith('/memberships')) return 201;
 return 200;
}
