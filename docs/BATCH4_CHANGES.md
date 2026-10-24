# Batch 4 changes and migration notes

IMPLEMENTED: browser-auth routes/security helpers; refresh schema transport/origin/CSRF/family expiry; centralized rate-limit factory; explicit trusted proxies; purpose-separated key parsing and old-version reads; identity registry serialization; upload v2 envelope; safe membership checks; retention/reconciliation commands; compiled worker/index CLI; replica-primary readiness; Docker/Compose; API contract inventory/generation; generated wire types/fetch client; synthetic operational/security tests and complete handoff docs.

Deliberate changes:

- Browser Origin/Sec-Fetch requests to old JSON token mutators now return BROWSER_TRANSPORT_REQUIRED. Use explicit cookie/CSRF routes. No refresh JSON leak/downgrade.
- Refresh rotation no longer extends a family's seven-day lifetime. Existing access JWTs are not synchronously invalidated by logout.
- Unknown historic identity key versions pause linking; old upload keys must remain available under their original binding. No migration rewrites ciphertext.
- Institution account role must match the requested membership role; stale role/membership mismatch does not authorize access.
- Retention-marked upload jobs return UPLOAD_PAYLOAD_EXPIRED when confirming/retrying; submit a new file/key. Metadata/history survive cleanup.
- Readiness now requires a writable replica-set primary, not only a connected socket.

No third-party broker/database/ML stack introduced. Optional official integrations, production distributed storage/rate limits, bulk rekey, legal retention and certification remain unimplemented. Existing APIs and72 previous tests remain covered.

Exact changed-file inventory is recorded below at final review. It includes safe source, tests, documentation, package lock, requested generated API artifacts and development configuration; local secrets/dependencies/build outputs/database artifacts are excluded.

<!-- CHANGED_FILES_START -->

- `.dockerignore`
- `.env.example`
- `Dockerfile`
- `FRONTEND_INTEGRATION_MASTER.md`
- `README.md`
- `compose.yaml`
- `docs/API_REFERENCE.md`
- `docs/AUTH_AND_ROLES.md`
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/BATCH4_CHANGES.md`
- `docs/BATCH4_IMPLEMENTATION.md`
- `docs/CONSENT_VERIFICATION_CONTRACT.md`
- `docs/DATABASE_RELATIONSHIPS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/DATA_RETENTION_POLICY.md`
- `docs/DEPLOYMENT_RUNBOOK.md`
- `docs/DEVELOPMENT_PROGRESS.md`
- `docs/INTEGRATION_NOTES.md`
- `docs/REGULATORY_REPORTING.md`
- `docs/SECURITY_HARDENING.md`
- `docs/STUDENT_DATA_CONTRACT.md`
- `docs/TEST_AND_QUALITY_REPORT.md`
- `docs/evidence/batch4-http-measurements.json`
- `docs/evidence/batch4-query-plan.json`
- `docs/openapi.yaml`
- `docs/postman/SatyaID_API.postman_collection.json`
- `docs/postman/SatyaID_Local.postman_environment.json`
- `package-lock.json`
- `package.json`
- `scripts/generate-api.ts`
- `scripts/local-compose-smoke.py`
- `scripts/recovery-smoke.ts`
- `scripts/seed-repeatability.ts`
- `scripts/upload-worker.ts`
- `shared/api-types.ts`
- `shared/browser-client.ts`
- `src/app.ts`
- `src/cli/indexes.ts`
- `src/cli/reconcile.ts`
- `src/cli/retention.ts`
- `src/config/database.ts`
- `src/config/env.ts`
- `src/contracts/inventory.ts`
- `src/contracts/policies.ts`
- `src/contracts/responses.ts`
- `src/middlewares/auth.ts`
- `src/middlewares/validate.ts`
- `src/models/batch3.ts`
- `src/models/batch4.ts`
- `src/models/index.ts`
- `src/routes/auth.ts`
- `src/routes/browser-auth.ts`
- `src/routes/conflicts.ts`
- `src/routes/enrolments.ts`
- `src/routes/index.ts`
- `src/routes/management.ts`
- `src/routes/regulatory/analytics.ts`
- `src/routes/regulatory/audit.ts`
- `src/routes/regulatory/consent.ts`
- `src/routes/regulatory/intelligence.ts`
- `src/routes/regulatory/reports.ts`
- `src/routes/students.ts`
- `src/routes/transfers.ts`
- `src/routes/uploads.ts`
- `src/security/browser-auth.ts`
- `src/security/keys.ts`
- `src/services/auth.ts`
- `src/services/operations/reconcile.ts`
- `src/services/operations/retention.ts`
- `src/services/student.ts`
- `src/services/upload-crypto.ts`
- `src/services/uploads.ts`
- `src/services/verification.ts`
- `src/utils/audit-integrity.ts`
- `src/utils/rate-limit.ts`
- `src/worker.ts`
- `tests/api-contract.test.ts`
- `tests/batch4-e2e.test.ts`
- `tests/browser-auth.test.ts`
- `tests/identity-rotation.test.ts`
- `tests/key-management.test.ts`
- `tests/operations.test.ts`
- `tsconfig.json`

<!-- CHANGED_FILES_END -->
