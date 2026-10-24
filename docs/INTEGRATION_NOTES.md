# Integration notes

**IMPLEMENTED:** versioned API endpoints listed in API_REFERENCE.md. Frontend config uses an API origin and exact CORS allowlist. Send access tokens as `Authorization: Bearer <token>`. No frontend code is included. Handle status codes and the success/error envelope.

Current refresh transport is JSON, not cookies; follow AUTH_AND_ROLES.md for secure browser deployment. There is no public administrator registration; development provisioning uses a guarded CLI seed.

**PLANNED:** student CRUD, admission submission, CSV, duplicate investigation, authorized verification workflows, dashboards and AI. **MOCKED:** no official integrations. Synthetic fixtures are labeled demo data; no officially verified identity is seeded.

Batch 2 requires institution authorization on every new route, idempotent admission contracts, transaction-safe allocation updates, profile privacy controls, and reviewed regulatory policies. The final frontend integration master file remains deferred.

## Batch 2 — current frontend contracts

The earlier Batch 1 PLANNED student/admission/upload/conflict items are now implemented as documented in STUDENT_DATA_CONTRACT.md, BULK_UPLOAD_FORMAT.md and API_REFERENCE.md. Existing auth tokens/envelopes remain compatible. Configure frontend API calls to `/api/v1`; multipart upload must let the browser set its boundary.

Polling workflow: POST upload (202), poll job/results until VALIDATED, show row warnings/errors, explicitly confirm commit (202), then poll until COMPLETED/PARTIAL/FAILED. Never present a queued/validated file as accepted admissions. Display current row status alongside preview counts. Page/limit apply to directory/enrolment lists, row results, conflict lists/history. Some legacy history/master lists remain bounded to 100 and need pagination in a later batch.

Identity screens must label MOCK_VERIFIED as simulated and show official:false. Provider timeout/unavailability is distinct from a mismatch. There is no public identity lookup, official API, employer verification workflow or analytics dashboard. Completion/graduation, legal-basis/consent workflows and production browser-session hardening remain future work.

Use `.env.example`, private runtime secrets, a replica set, explicit index creation and a separate worker. Do not embed backend signing/encryption keys in React builds. The final FRONTEND_INTEGRATION_MASTER.md remains intentionally deferred.

## Batch 3 frontend-ready REST contracts

Current source/API contracts now include regulatory analytics, student-owned consent and authenticated employer claims, opaque credential references, reports/audits and explainable intelligence. Use the four new focused contract documents linked in API_REFERENCE.md. Existing Batch 1/2 tokens, envelopes and APIs remain compatible.

Frontend flow: a linked student creates a one-time employer-bound invitation, shares it privately, then reviews the employer's purpose/requested claim set and approves only selected claims. Do not represent the invitation itself as consent. Never place share tokens in analytics logs or backend URL paths. QR reference is text, not a generated image or public PII endpoint; an authenticated intended verifier must POST the token to obtain currently permitted claims.

Analytics counts registered records only. Display denominator/coverage notes, observedAt and academic-year filters. Never label a live dashboard as a historical snapshot or a quality score as an official rating. InsufficientData/null scores must remain visible rather than becoming zero/rankings.

Report creation returns 202; poll status until COMPLETED/FAILED, then request an authenticated download. Worker now processes uploads and reports. CSV/JSON artifacts are readiness reports, not official filings. Optional audit signing distinguishes unsigned/valid/invalid/key-unavailable records and checks only the requested page.

Batch 4 still needs a final frontend integration master derived from actual contracts, production cookie/BFF and abuse hardening, legal/privacy/employer onboarding review, retention/key rotation, deployment recovery/load testing and any separately authorized official adapters. Do not create the final master file yet.
