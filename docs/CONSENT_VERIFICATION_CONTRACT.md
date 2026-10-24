# Consent, employer verification and QR references — IMPLEMENTED

This is controlled sharing of current institution-submitted claims, not official APAAR verification or a government-certified degree. Existing canonical Student.user account linkage is authoritative. No national student directory or employer lookup by Student ObjectId is introduced.

## Endpoints

All paths use `/api/v1`, JWTs, strict Zod bodies and the existing envelopes. Each verification/consent/credential router limits requests to 60/minute/IP in memory. Maximum page size is 100.

| Method | Route | Principal / body / result |
|---|---|---|
| POST | `/verification/employers` | AICTE_ADMIN; user, organization, status APPROVED/SUSPENDED, approvalReference; returns employer authorization metadata |
| POST | `/verification/invitations` | Linked STUDENT; own enrolment, employer, claims, expiresInSeconds; returns invitationId/token/expiresAt once |
| POST | `/verification/requests` | APPROVED EMPLOYER; invitationToken, purposeCode, claims, expiresInSeconds; returns requestId/consentRequestId/PENDING/expiry |
| GET | `/verification/requests` | Approved employer; own request metadata only; page/limit |
| GET | `/verification/requests/:id/result` | Intended approved employer; current authorized claim intersection only |
| GET | `/consents/requests` | Linked student; own pending/decided requests with purpose, employer organization, requested/authorized claims, request/consent expiry and revocation metadata; page/limit |
| POST | `/consents/:id/approve` | Owning linked STUDENT only; claims subset and expiresInSeconds |
| POST | `/consents/:id/reject` | Owning linked STUDENT only; `{}` |
| POST | `/consents/:id/revoke` | Owning linked STUDENT only; `{}`; repeat revocation is idempotent |
| GET | `/consents/history` | Owning linked STUDENT; safe event/claim-type metadata; page/limit |
| POST | `/credentials` | Linked student owning an active approved request; request, optional claims subset, expiresInSeconds |
| GET | `/credentials/:id` | Owning student or bound approved employer; metadata only, never token or claims |
| POST | `/credentials/:id/revoke` | Owning linked STUDENT; `{}` |
| POST | `/credentials/verify` | Intended approved employer; `{ "token":"<opaque-token>" }`; returns live authorized claims |

Institution administrators and regulators cannot silently approve or revoke student consent through these endpoints. Employer authorization is an application governance decision with an approval reference; it does not establish government/company accreditation or official identity authenticity. No public employer registration exists; account provisioning remains controlled.

## Invitation and consent flow

1. Student authenticates through their previously regulator-linked account and chooses an own enrolment and approved employer account.
2. Student creates a one-use invitation. It bounds maximum claim types and intended employer; **it is not consent**.
3. Student privately shares the token. Only the bound employer may consume it, once, while unexpired. Tokens are 48 random bytes; only SHA-256 digests are persisted. Plain SHA-256 is appropriate for these high-entropy tokens, not for APAAR identity lookup.
4. Employer states an immutable purpose and requested claim subset. A pending request/consent record is created transactionally.
5. The student reviews and explicitly approves a subset, or rejects. Consent lifetime cannot exceed request expiry or configured maximum.
6. Each disclosure checks current employer account/approval, request owner/state/expiry, student account linkage/active status, consent state/expiry/revocation, enrolment binding and claim intersection. Wall-clock expiry is checked again immediately before recording/returning the authorized disclosure. Denial is the default.
7. Consent revocation blocks future direct and credential disclosures. It cannot retract a copy already downloaded or a response authorized before revocation committed.

Example invitation body:

```json
{"enrolment":"<ownEnrolmentId>","employer":"<approvedEmployerUserId>","claims":["INSTITUTION","PROGRAM"],"expiresInSeconds":900}
```

Example employer request:

```json
{"invitationToken":"<64-character-token>","purposeCode":"EMPLOYMENT_SCREENING","claims":["INSTITUTION","PROGRAM"],"expiresInSeconds":86400}
```

Example student approval:

```json
{"claims":["INSTITUTION"],"expiresInSeconds":3600}
```

A single approved claim does not authorize a full academic profile. The corresponding result contains:

```json
{"success":true,"message":"Success","data":{"requestId":"<id>","claims":{"INSTITUTION":{"name":"Fictional Institute","pid":"DEMO-001"}},"source":"Current institution-submitted records held in SatyaID; not government-certified","governmentCertified":false,"observedAt":"<UTC timestamp>"}}
```

Allowed claim types: INSTITUTION, PROGRAM, ENROLMENT_STATUS, ACADEMIC_YEAR, START_DATE, ADMISSION_DATE. There is no name, DOB, roll-number, APAAR, vault, document, evidence, grade, degree or completion claim. A stored unsupported COMPLETED state is labelled COMPLETION_NOT_SUPPORTED in live status disclosure; issuing a completion-state credential is refused.

## QR-compatible credential design

`POST /credentials` returns credentialId, expiry, a random opaque token and `qrReference: satyaid://verify#token=<token>`. This is a reference string for a verifier frontend to encode/scan, not a generated QR image, public website, signed offline diploma or government credential. The frontend reads the reference and makes an authenticated POST to credentials/verify. The token is never a URL path/query parameter to the backend.

Token digests are stored, not raw bearer values. Credentials are bound to one request, grant, student, enrolment, employer and claim subset. Expiry is capped by grant/request/configuration. Repeated verification is allowed until expiry/revocation and each actual disclosure is logged. A copied token alone grants no protected claim access. Metadata access returns no token or claim payload. Credential revocation and consent revocation both invalidate subsequent verification; the latter need not rewrite every credential document.

Consent disclosure transactions update/lock the grant; revocation updates the same grant. Credential checks lock the reference as well. This orders concurrent operations at transaction commit. Approved live claims are read within that transaction and actual disclosure events/audits commit with the authorization decision. There is no cached long-lived claim payload.

## Limits and errors

Defaults: invitation 900 seconds, consent/request maximum 604800 seconds, credential maximum 3600 seconds. Environment settings INVITATION_MAX_SECONDS (60–86400), CONSENT_MAX_SECONDS (60–2592000), CREDENTIAL_MAX_SECONDS (60–86400) may tighten limits. Body defaults are invitation 900, request 86400, approval/credential 3600; send an explicit shorter value when configured caps are lower. All bodies enforce at least 60 seconds.

Malformed inputs: 422 VALIDATION_ERROR; excessive lifetime: 422 LIFETIME_EXCEEDED; expanded claims: 422 CLAIM_SCOPE_DENIED; non-pending/closed consent: 409 CONSENT_STATE_CONFLICT; unsupported completion credentials: 409 UNSUPPORTED_CREDENTIAL_STATE. Invalid/used/expired/wrong-employer invitation and unavailable request results use the same 404 VERIFICATION_UNAVAILABLE. Invalid/expired/revoked/wrong-employer credential references use 404 CREDENTIAL_UNAVAILABLE. Forbidden principal/unauthorized employer: 403 FORBIDDEN. Missing JWT: 401. No response discloses whether a guessed student identity exists.

## Trust and remaining work

The trust root is existing account linkage and institution submissions, not official APAAR access. Legal-basis/privacy notices, employer onboarding proof, MFA, distributed abuse controls and an approved production retention policy remain deployment prerequisites. Batch 4 implements explicit browser cookie/CSRF transport and guarded synthetic retention; see SECURITY_HARDENING.md and DATA_RETENTION_POLICY.md. Do not log invitations, QR tokens, authorization headers or actual claim payloads. Audit/VerificationEvent store actor/claim-type/outcome metadata, not the claims themselves.
