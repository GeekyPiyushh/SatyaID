# Backend architecture

**IMPLEMENTED:** modular Express application factory and separate server, Helmet, exact-origin CORS, 100 KB JSON limit, safe errors, Zod validation, authentication middleware, institution scoping, Mongoose schemas, and transaction-backed writes with audit records.

```text
src/
  app.ts / server.ts
  config/           environment and MongoDB connection lifecycle
  controllers/      health handler
  middlewares/      auth, validation, centralized errors
  models/           Mongoose collections and indexes
  routes/           health, auth, academic management request handlers
  services/         token lifecycle, audited writes, capacity, identity cryptography
  types/ / utils/   envelopes and intentional errors
scripts/            connectivity, explicit indexes, guarded synthetic seed
tests/              HTTP, configuration, crypto, JWT, quota and database integration
```

Prisma/MySQL dependencies, schema, migrations and scripts are removed. ObjectIds identify records; APAAR never acts as a primary/foreign key. MongoDB references are not foreign-key constraints: services validate referenced master records before writes. No deletion routes are provided. Direct database access is restricted operationally.

Readiness is separate from liveness. Connection timeouts are five seconds; runtime buffering and automatic index creation are disabled. Startup connects only when a URI is configured. SIGINT/SIGTERM drain HTTP and disconnect MongoDB with the existing deadline.

Audited writes and refresh rotation use MongoDB sessions/transactions, requiring a replica set. Quota approval serializes on the offering record and rejects overlapping approved periods for the same offering/year/category/kind. New versions are created rather than rewriting regulatory history; retirement is explicit.


## Batch 2 architecture — current implementation

`models/batch2.ts`, dedicated student/admission/upload/conflict/verification services, providers/apaar.ts, validators/batch2.ts, and separate resource routers extend the existing foundation. Institution-owned profiles remain distinct from canonical Student identities. Student account linkage is regulator-controlled.

SeatReservation is unique per enrolment. Activation serializes on the student and offering records and atomically increments a bounded allocation counter; history, reservation, conflict and audit records share the transaction. Quota/intake edits lock the same offering to avoid concurrent configuration snapshots. Withdrawal and reviewed transfer release reservations transactionally. Driver transaction retries provide bounded retry behavior according to driver defaults; non-transient application conflicts are returned to the caller. Decimal quota arithmetic prevents floating-point rounding from manufacturing an extra seat.

Bulk staging uses encrypted persisted MongoDB documents, not an in-memory queue. `scripts/upload-worker.ts` claims/renews leases, validates bounded CSV/XLSX in memory, then commits each eligible row in its own transaction after confirmation. This is partial acceptance; it is not a batch-wide all-or-nothing promise. Worker recovery, repeat submissions and row commit markers are exercised in integration tests. See BULK_UPLOAD_FORMAT.md for limits and retention caveats.

Deterministic conflict detection runs inside activation while holding the student lock, preventing two concurrent same-student activations from missing each other. It compares active records across institutions and inclusive date intersections. Transfer-entry records produce a potential-transfer explanation code. Rules create review cases, not fraud judgments. No ML or universal single-active-enrolment constraint exists.

Verification decrypts only inside a scoped backend service and records provider/version/trace/outcome metadata. Only MOCK_APAAR is registered. The official-provider trust boundary and future integration steps are documented, not implemented.
