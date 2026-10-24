# Development progress — Batch 2

## IMPLEMENTED

Batch 1 remains operational: MongoDB/Mongoose, Express security/validation, login/refresh/logout, institution/program/year management, approved allocations/quota rules, audits, health/readiness, build and guarded seed.

Batch 2 adds:

- Phase 06: canonical identity versus institution-owned student profiles, scoped CRUD/soft deactivation, exact roll search, regulator-only account/association linking, AES-GCM/HMAC vault linkage and audited reads.
- Phase 07: idempotent submissions, explicit transitions, atomic seat reservations/withdrawal, effective approved quota ceilings, history, concurrency-safe activation and reviewed transactional transfers.
- Phase 07B: CSV/XLSX upload previews, encrypted persisted staging, leased worker, explicit confirm/commit, row transactions, partial acceptance, idempotency, retries and redacted reports.
- Phase 08: deterministic overlap/potential-transfer cases, redacted institutional visibility, scoped evidence metadata, regulator assignment/resolution and append-only application history.
- Phase 09: typed mock provider registry, deterministic synthetic outcomes, verification event/trace metadata and audit. Official verification is NOT implemented.

## Verification evidence

| Checkpoint | Actual result |
|---|---|
| Baseline | 26 tests passed against MongoDB replica set; build passed |
| A | 30 tests passed; typecheck/build passed |
| B | 34 tests passed; concurrent last-seat, repeated activation/withdrawal and separate pools verified |
| C | 38 tests passed; CSV/XLSX, partial commit, retries and limits verified |
| D | 40 tests passed; overlap, redaction and resolution history verified |
| E | 42 tests passed; all mock outcomes and no official status verified |
| Reviewed transfer and seed extension | 43 tests passed; repeat approval and source/target counters verified |
| Recovery/security additions | 48 tests passed; worker lease recovery, Excel commit, account isolation and error exports verified |
| Quota/transfer rollback/hostile spreadsheet checks | 51 tests passed; typecheck/build passed |

All integration checks used isolated MongoDB 8 replica-set databases; no production credentials or real identities. Tests are explicitly skipped without TEST_MONGODB_URI. Test-owned encrypted vault fixtures are cleaned up by their unique key version; no database is dropped. Demo seed was run twice successfully and CSV/XLSX sample generation passed. Dependency audit reports zero vulnerabilities after a compatible ExcelJS uuid override, tested through spreadsheet read/write. Final clean-install and runtime smoke evidence is recorded in BATCH2_IMPLEMENTATION.md.

## MOCKED

MOCK_APAAR only. Synthetic fixture values are not officially reserved IDs. No HTTP calls to identity/government systems and no officially verified seed data. Production refuses the mock adapter.

## PLANNED / limitations

Official provider authorization and privacy/legal-basis review; keyring rotation; automated encrypted staging retention/cleanup; production hostile-document sandbox/malware scanning; protected evidence storage; browser BFF/HttpOnly-cookie hardening; MFA/invitations/reset; distributed rate limiting; completion/graduation; historical ACCEPTED/counter reconciliation; production backup/restore/load validation. Some legacy histories/master lists cap at 100. No analytics dashboards, employer verification workflow, AI or frontend.

## BLOCKED

No external prerequisite blocked the local implementation/tests. Production use and official integration remain unavailable pending the above permissions, infrastructure and review. Changes are local/uncommitted on `work`; no push, PR or merge was performed.
