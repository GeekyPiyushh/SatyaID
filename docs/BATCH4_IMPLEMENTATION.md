# Batch 4 implementation — Phases 14–15

Preserved Batch3 base: `6f58d9d0f20ee19f28ee9a0324e1ba2f8c58b4a4`. Baseline72 tests passed before coding. Original Batch4 work continued without resetting or overwriting earlier changes; final target branch is exactly `PIYUSH`. No main changes/merge/force push are part of this work.

| Checkpoint | Status | Evidence / scope |
|---|---|---|
| A — security | IMPLEMENTED | Browser HttpOnly refresh cookies, origin-bound signed CSRF, transport separation, absolute family expiry/replay revocation; replaceable memory rate-limit store; proxy/key validation; identity/upload/audit historic keyrings; account-role plus membership checks |
| B — retention/reliability | IMPLEMENTED | Payload-only dry-run/apply utility with synthetic-only guard; leased recovery/key-unavailable/expiry tests; compiled combined worker; bounded read-only reconciliation; no academic/audit/consent deletion |
| C — local deployment/testing | IMPLEMENTED | Node24 multi-stage image, nonroot API/worker, development Mongo8 replica Compose, index initialization, probes; complete synthetic HTTP workflow, contention, query plan, dump/restore and repeated seeds |
| D — API specification | IMPLEMENTED | OpenAPI3.1 with98 live operations and request-schema extraction, reviewed response projections, automated parity/validation; safe Postman collection/environment |
| E — frontend handoff | IMPLEMENTED | Root FRONTEND_INTEGRATION_MASTER.md with13 sections,98-endpoint catalog, five-role page mapping, exact workflows/limits/errors/unsupported actions; generated wire types and optional fetch client |
| F — final gate | IMPLEMENTED | TEST_AND_QUALITY_REPORT records exact commands, totals, audit and operational smoke evidence |
| Official APAAR provider | MOCKED | No official external integration; mock route disabled in production |
| Cloud deployment / security certification / national scale | PLANNED | Local verification is not production or government certification |
| Production destructive cleanup / silent historical repair | NOT APPLICABLE | Explicitly disabled/not provided in this batch |

Browser compatibility changes: browsers must migrate from JSON login/refresh/logout to explicit `/auth/browser/*`; regular Bearer APIs remain compatible. Refresh families now expire absolutely after7 days. Old refresh documents without transport remain JSON-only. Legacy upload v1 reads require the original explicit raw key; new envelopes record a version. Account/membership mismatches are rejected and need reviewed correction. Existing vault/ciphertext is never silently re-encrypted.

Combined worker execution is at least potentially repeated, with transaction/idempotency protection for committed row effects. Upload lease60sec/report120sec; three attempts; report expiry24h. Source-file staging removed after validation, committed row bytes removed on commit, old uncommitted bytes eligible for guarded cleanup. Cleanup never deletes institution approvals, admissions, consent/event/audit history or identity vaults.

Frontend team starts at root master sections1–4 and13. Member2: regulator/institution flows. Member3: auth/student/employer/QR flows. Unsupported discovery/provisioning/graduation/PDF actions are explicitly identified, not invented. Every source/spec/catalog change should rerun `npm run api:generate && npm run api:check` and appropriate regression checks.
