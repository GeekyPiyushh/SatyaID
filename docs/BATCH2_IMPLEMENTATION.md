# Batch 2 implementation evidence

Batch 1 files are present on branch `work`, with no commits yet. Baseline rerun: 26 tests passed against a MongoDB 8 replica set; build passed. Changes remain local.

## Checkpoint A — student identity

IMPLEMENTED: canonical students, separate institution-owned profiles, optimistic profile edits, institution-scoped exact roll-number search, regulator-managed account linking, protected identity linkage and read/write audit events. AES-GCM and HMAC reuse existing helpers. Existing identity collisions return review-required errors without identifying another student. No institution may attach an arbitrary existing student; only AICTE can establish that association.

Identity keys are private environment inputs. This implementation accepts one active key version; a different stored version returns an unavailable-key error rather than guessing a key. Dual-read lookup rotation is PLANNED. Twelve-digit syntax is only a local structural check, never official verification. No delete route: profile status supports soft deactivation, preserving academic history.

Checkpoint A validation: 30 tests passed, typecheck/build passed.

## Checkpoint B — admissions

IMPLEMENTED: idempotent draft submission, scoped listing/detail/history, version-checked unactivated edits, explicit activation/withdrawal. SeatReservation plus atomic occupiedSeats predicates prevent overbooking. Enrolment state, counter, reservation, history and audit share a replica-set transaction. Repeated activation/withdrawal is idempotent. Mongoose transaction helpers retry transient conflicts; interrupted transactions roll back. Configured effective approved quota ceilings may lower but never create approved capacity. Activation serializes on offering and student records. Base and supernumerary pools remain separate.

Validation: 34 tests passed, including concurrent last-seat activation (one success/one 409), withdrawal release, repeated transitions, and independent supernumerary limits; typecheck/build passed. Legacy ACCEPTED records are not automatically counted/migrated: a production reconciliation is required before admitting historical data.

## Checkpoint C — persisted bulk ingestion

IMPLEMENTED: bounded CSV and single-sheet XLSX multipart uploads; encrypted persisted file/row staging; worker leases; row-level preview; explicit confirmation; per-row transactions creating/activating eligible admissions; partial success; keyed file fingerprints and institution-scoped idempotency. Successful row payloads are removed. Failed/invalid rows retain encrypted input for operational review/retry; retention controls are documented separately.

Validation: 38 tests passed, including XLSX, CSV invalid/duplicate/missing rows, partial commits/repeats, byte/row limits, unauthorized uploads and changed idempotency bodies; typecheck/build passed. Parsing and commit run in a separate persisted worker, not the HTTP request.

## Checkpoint D — conflicts

IMPLEMENTED: deterministic cross-institution active-date overlap matching under the student transaction lock; potential-transfer codes; regulator/full versus involved-institution/redacted views; pagination; evidence metadata; reviewer assignment; version-checked final decisions. No automatic fraud classification, rejection or deletion. Validation: 40 tests passed; typecheck/build passed.

## Checkpoint E — mock provider

MOCKED identity source with IMPLEMENTED adapter/service/API: fixture success, mismatch, not found, timeout and unavailable. Unknown values never become officially verified. Events and audits contain provider/version/outcome/trace, not national identifiers. Production refuses the mock provider. Validation: 42 tests passed; typecheck/build passed.

## Reviewed transfer and hardening

IMPLEMENTED: source-authorized initiation, regulator approval/rejection, target association validation, atomic source release/TRANSFERRED state and target activation, preserved history and repeat approval. Full target capacity rolls the complete operation back. Tests include successful transfer and rollback with unchanged source capacity.

Upload recovery includes expired leases and explicit failure retry. XLSX preflight checks archive expansion/XML element counts/cell addresses before in-memory workbook loading; no plaintext worksheet spool. Test coverage includes actual Excel commits, formulas, out-of-bounds row addresses, duplicate identities, invalid/missing rows, wrong academic years, user account ownership, partial acceptance and safe reports. Student/enrolment mutation traffic is rate-limited; no raw identity lookup endpoint exists.

Decimal quota arithmetic prevents floating-point rounding errors. One approved fixed supernumerary rule is tested to reduce a larger allocation to one available seat without creating capacity. Historical rules remain versioned. Configuration edits share offering locks with activation.

Final integration suite: 51 tests (18 independent + 33 database-backed), none skipped when TEST_MONGODB_URI is supplied. With no database URI, database tests must be reported as skipped, not passed. Current deployment is a development implementation; production privacy/security/retention and official identity integration remain outside the readiness claim.

## Git and review

Branch `work` is unborn; all repository files remain local/uncommitted. No remote push, commit, pull request or merge was performed. See BATCH2_CHANGES.md for exact changed/new files and DATABASE_SCHEMA.md for generated collection fields/indexes. The earlier uncommitted Batch 1 files are preserved.

## Final reproducibility and operational checks

- `npm ci` succeeded from the lockfile; typecheck/build succeeded afterward.
- Full replica-set regression rerun: 51 passed, zero skipped; 18 independent and 33 database-backed tests.
- Compiled API returned HTTP 200 for health and MongoDB readiness, then exited 0 on SIGTERM.
- Separate persisted upload worker `--once` exited 0.
- Extended synthetic seed ran twice, then generated CSV/XLSX samples successfully.
- `npm audit` reported zero vulnerabilities. ExcelJS retains deprecated transitive packages; dependency modernization remains maintenance work, not proof of an active advisory.
- Controlled standalone admission rejections are best-effort audited outside their aborted transaction; a database outage can prevent recording the rejection and emits only a safe operational message. Worker leases also recheck current uploader account/role/membership before each row.
- Cloud install instructions remain npm-ci/typecheck/test/build; startup draft now includes the API, separate worker and private stable-key requirements. Saving this draft does not apply/publish it or provision production secrets.

No external blocker remains for the synthetic development workflow. Automated payload retention/deletion, real evidence storage, production key rotation/secret management, historical counter reconciliation, completion/graduation, official APAAR authorization, and production browser-session/privacy/recovery/load reviews remain explicitly PLANNED. Never describe local synthetic tests as national-scale or production certification.
