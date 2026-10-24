# Deployment and operations runbook

IMPLEMENTED: Node24 API, compiled persisted worker, local development Compose, readiness, initial indexes, guarded synthetic seeds, retention and read-only reconciliation. Cloud deployment is PLANNED pending authorized infrastructure and operator credentials. Unauthenticated development MongoDB is never a production recommendation.

## Local native workflow

Use the existing checkout; do not create another Git worktree for setup. Node24 and Mongo8 are required. `npm ci`; copy only `.env.example` to a private ignored `.env` and fill the required settings locally. `npm run typecheck && npm run build`.

A local single-node replica set is sufficient for transactions, not high availability. Start a dedicated Mongo container with `docker run -d --name satyaid-local-mongo -p 127.0.0.1:27028:27017 mongo:8 --replSet rs0 --bind_ip_all`, then initialize once with `docker exec satyaid-local-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'`. Do not reinitialize an existing unknown set. Wait for `db.hello().isWritablePrimary` true.

For host API/test tools use `mongodb://127.0.0.1:27028/satyaid_local_demo?directConnection=true&replicaSet=rs0`. directConnection is a local port-mapping workaround; production members must advertise hostnames reachable from API and worker. Use a separate database ending `_test` for tests and `_demo` for seeds. Never point tests at real student data.

Set MONGODB_URI, JWT_SECRET, CSRF_SECRET, CORS_ORIGINS and independent identity/upload keys as described in SECURITY_HARDENING. Run `npm run db:indexes` (creates missing indexes, does not drop unexpected indexes), `npm run db:seed` and optional `npm run db:seed:governance` only with private demo credentials/explicit seed opt-in. Run `npm run dev` plus `npm run worker` in separate terminals. Compiled runtime: `npm start`, `npm run worker:start`.

GET `/api/health` proves HTTP liveness; GET `/api/ready` requires a connected writable replica primary. Never log a credential-bearing URI. API port defaults3000; frontend5173. Configure exact origins and same-site cookie settings. No localhost preview link is needed for cloud onboarding.

## Docker Compose development deployment

Generate keys in your private shell/secret manager, set JWT_SECRET,CSRF_SECRET,UPLOAD_ENCRYPTION_KEY,APAAR_ENCRYPTION_KEY,APAAR_LOOKUP_KEY. Use separate random values; binary keys are base64 of32 bytes. Compose deliberately refuses missing values. No secrets are hardcoded in compose.yaml. `docker compose up --build -d --wait`. Services: mongo → replica-init → indexes → api and worker. Internal replica hostname is mongo:27017. Mongo has no host-published port; API binds loopback3000 (API_PORT override).

The runtime image installs production dependencies only, uses the node user, and runs compiled JS. API/worker use read-only filesystems, tmpfs, no added capabilities and no-new-privileges. Mongo persists in the named development volume. `docker compose stop` preserves it. Do not run `down -v` against data you need.

For this cloud runner, Docker build needs the existing trusted egress proxy: pass `--build-arg HTTPS_PROXY --build-arg HTTP_PROXY --build-arg NO_PROXY` plus a reachable proxy-host mapping and `--secret id=build_ca,src="$NODE_EXTRA_CA_CERTS"`. The optional BuildKit certificate secret is mounted only for npm installation, never copied into the image. Do not disable TLS/checksums. Standard networks may build without these runner-specific options. If Docker configuration home is read-only, use `DOCKER_CONFIG=/tmp/satyaid-docker-config`.

`npm run compose:smoke` uses a separate satyaid-batch4-smoke project/port3034 and ephemeral process-only random keys. Build `satyaid:batch4` from the final Dockerfile first; the smoke script tags its service images automatically; it verifies health/readiness, browser bootstrap and worker --once, then stops only that project without deleting volumes. This is verified local development behavior, not an authenticated production database deployment.

## Production/Atlas checklist — required before deployment

Use a private authenticated Mongo8 replica set/authorized Atlas cluster with TLS, least-privilege database accounts, reachable advertised hosts and transaction support. Do not copy development unauthenticated Compose into production. Configure separate API and worker process/service identities, raw signing/encryption secrets, explicit HTTPS CORS origins, Secure cookies, correct SameSite/domain/path, and explicitly trusted ingress IPs/CIDRs. Set NODE_ENV=production; mocks are disabled. Build immutable images, pin/review deployment digests, apply reviewed indexes once, and use a tested distributed rate-limit store before multiple API replicas.

Verify probes, database permissions, worker permissions, encrypted storage/backup, key custody, clock sync, logs/metrics, access reviews and consent/privacy notices. No cloud account changes or public deployment were performed by Batch4.

## Worker recovery and graceful shutdown

Uploads claim60-second leases, reports120-second leases; persisted lease token/attempt guards allow another worker to reclaim after expiry. Up to3 attempts, then FAILED. Upload rows commit student/admission/reservation/history/audit and payload removal in transactions. Repeated row/job execution is possible; idempotent committed effects prevent double reservation. Never describe worker execution as exactly-once.

SIGTERM/SIGINT stops claiming new work after current processing returns; it will not start a report after finishing an upload once stopping is set. The API closes HTTP connections and disconnects Mongo with a10-second deadline. Compose gives worker30 seconds; a longer upload can be terminated by the supervisor and recovered by lease expiry. Do not shorten lease/retry periods casually. Monitor stale leases, attempts and queue age; no HTTP worker heartbeat is implemented.

For an upload FAILED state, review failureCode (missing historic key, uploader permission, parse error, retry exhaustion), correct the cause, then authorized POST retry. PARTIAL can reconfirm failed rows; invalid rows require corrected files. Purged payloads require a new file/key. Reports have no retry endpoint: request a new job after correction; wall-clock expiry denies old downloads.

## Reconciliation and retention

`npm run reconcile` / `node dist/cli/reconcile.js` performs snapshot reads only. It reports counter mismatches, missing active reservations, orphan references, inactive reservation holders, mapping/reference errors and legacy ACCEPTED records. It scans at most500 entries per source collection and returns at most500 findings; truncated=true requires a separately reviewed full scoped investigation. No “zero findings” claim should imply full coverage when truncated. Never repair through analytics/simulation. Any repair requires a separate approved audited transaction plan with backup evidence.

Retention: see DATA_RETENTION_POLICY. Default dry-run with explicit RETENTION_CUTOFF≥30 days old. Apply only to opted-in synthetic databases with active AICTE operator. Production apply is disabled. Schedule bounded dry-runs/purges through an external scheduler; TTL is not used to delete audit/consent/history.

## Backups, keys and restore

Back up the database using an authenticated Mongo-compatible backup mechanism with encryption/access controls, version metadata, integrity checks, retention and restoration scope. Coordinate full replica backups or snapshots; ad hoc mongodump of one changing database is not a point-in-time disaster-recovery guarantee. Back up identity/upload/audit key versions separately under controlled custody; ciphertext without those keys is unrecoverable. JWT/CSRF restoration may intentionally require new login.

Restore first into an isolated **new** database/cluster and validate replica support, indexes, source counts, protected decryption, referential/counter reconciliation, current authorization and worker leases. Restore does not imply old consent is valid: enforce stored expiry/revocation/current accounts. Quarantine jobs until keys/permissions are confirmed. Compare dry-run reconciliation; never blindly resume stale jobs into a production repository.

`npm run recovery:smoke` with a local `_test` URI and RECOVERY_MONGO_CONTAINER pointing to a dedicated satyaid-* test container creates uniquely named synthetic databases, dumps/restores encrypted identity fixtures with namespace mapping, checks decryption and unique indexes, and removes only its own temporary namespaces/archive. It refuses production/nonlocal URIs. That smoke passed; full disaster-recovery certification is NOT IMPLEMENTED.

## Diagnostics and monitoring

Safe startup failures show generic configuration/database messages. Inspect variable presence, purpose/version metadata, primary health, index errors, queue states and correlation IDs through controlled operator access; do not print env values, tokens or student payloads. Logs currently provide startup/fatal/shutdown diagnostics, not a full structured telemetry system. Recommended alerts: readiness loss, p95/error rates, 429 pressure, admission transaction conflicts, oldest queue age, stale leases/retry exhaustion, report expiry backlog, missing historic keys, invalid audit signatures, reconciliation findings, backup/restore failures. Validate any thresholds against actual workloads.

## PS compliance diagnostics and print interface

Run `npm run db:indexes` after deployment for new institution print-authorization unique index and enrolment/student/expiry consent lookup. Existing institution profiles need no data rewrite: missing declarations read UNKNOWN. Create-only indexing never drops unrelated indexes. Test new13-column and legacy10-column imports before switching templates.

`npm run reconcile -- --identity` (compiled `node dist/cli/reconcile.js --identity`) is a read-only snapshot diagnostic. It scans at most500 vaults plus500 stale-assurance candidates, checks canonical references, stored-version availability, authenticated decryption/format, lookup consistency and cross-version duplicate identities in the scanned set. It emits only finding codes/internal IDs, never identifiers/digests/ciphertext. Missing keys or truncation limit completeness. It never repairs/rekeys data; retain JSON only in controlled operator logs. Admission reconciliation remains the default command.

Full certificate print data requires operator-recorded institution authorization and a separate current student's scoped print consent. This does not verify degree-awarding authority, confer qualifications or issue a certificate. No new environment secrets or external services are needed; historic identity key custody remains mandatory. No frontend pages, production cleanup rules or official connections were added.
