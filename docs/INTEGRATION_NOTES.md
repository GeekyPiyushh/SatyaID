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
