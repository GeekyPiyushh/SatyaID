# Authentication and roles

**IMPLEMENTED:** bcrypt cost 12 development provisioning; no public registration. Access JWTs use HS256, validated issuer/audience/signature/expiry, and a 10-minute expiry. Every authenticated request reloads the active account and its current role. Refresh tokens are 48 random bytes, stored only as SHA-256 digests (appropriate for high-entropy random tokens, not APAAR identifiers), expire after seven days, rotate transactionally, and belong to revocable families. Reuse revokes the family. Logout revokes refresh capability; issued access tokens remain valid until their short expiry unless the account is disabled.

AICTE_ADMIN controls master records, offerings, allocations, quota configuration, and institutional administrators. Institution administrators can edit their own institution name/state and add staff; only AICTE can change institutional status or appoint admins. Institution staff can read their institution's records. STUDENT and EMPLOYER have no academic-management write access. Roles alone do not confer institution ownership: membership must be active. Institution lists are restricted to memberships for non-AICTE users.

Auth endpoints have an in-memory per-IP limit of 20 requests/minute. A distributed limiter and trusted-proxy configuration are **PLANNED** before multiple production instances. CORS uses explicit origins and does not allow credentials; it is not authorization.

Browser integration: keep access tokens in memory. The current API returns refresh tokens in JSON; do not persist them in localStorage. For a browser production deployment, use a trusted backend-for-frontend or implement reviewed HttpOnly/Secure/SameSite cookie transport with CSRF protection first. Do not treat this token transport as finished browser-session hardening.

**PLANNED:** password reset, MFA, invitation/user lifecycle, organization proof, key rotation, retention, and production security review. No government authorization or official identity verification is claimed.

## Batch 2 permissions

- Institution admins/staff with active membership manage only their own StudentInstitution profiles and admissions. Canonical identity association to another institution and account linking require AICTE review. No arbitrary institution writer can take over a shared identity.
- Linked STUDENT users may read their own student profiles, individual enrolments and histories; they cannot search directories, mutate institutional admissions or access conflicts.
- EMPLOYER has no student/admission directory access in this batch.
- AICTE student reads and important student/enrolment changes are audited. Institution readers specify institution scope for private profiles.
- Upload creation, results, retry, confirmation and reports use persisted institution ownership. Worker execution reloads the uploader's active account/membership.
- Conflict views for involved institutions omit the other enrolment, institution list, student reference and investigation actors/reasons. Only AICTE can assign reviewers and resolve cases. Evidence references are metadata, not a file-access capability.
- Reviewed transfer decisions are regulator-only. Institutions can initiate from their own active source record and view limited involved transfer status.

Student/enrolment APIs: 120 requests/minute/IP; upload APIs: 60/minute/IP; mock verification: 10/minute/IP, in addition to the student-router limit. Distributed rate limiting, MFA, production cookie/BFF transport, evidence-storage ownership enforcement and credential/key rotation remain PLANNED. Do not process real student identity data before a deployment/privacy review.
