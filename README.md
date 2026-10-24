# SatyaID backend — Batch 2

Node.js 24, Express 5, TypeScript, MongoDB 8, Mongoose, Zod, JWT and bcrypt. The former MySQL/Prisma configuration and unfinished relational schema have been removed. No existing database was migrated: there was no deployed application data.

## Windows / PowerShell

Install Node.js 24 and a MongoDB replica set (or use an authorized Atlas deployment). From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env privately: MONGODB_URI and a strong random JWT_SECRET.
npm run db:check
npm run db:indexes
npm run typecheck
npm test
npm run build
npm run dev
```

Do not overwrite an existing `.env`. `npm start` runs the compiled server. `GET /api/health` works without MongoDB; `GET /api/ready` returns 503 without a connection. Database APIs require MongoDB. Audited writes and refresh rotation require replica-set transactions, not standalone MongoDB.

For a disposable local Docker replica set:

```powershell
docker run -d --name satyaid-mongo -p 127.0.0.1:27017:27017 mongo:8 --replSet rs0 --bind_ip_all
docker exec satyaid-mongo mongosh --quiet --eval 'rs.initiate()'
# Local URI: mongodb://127.0.0.1:27017/satyaid_demo?directConnection=true&replicaSet=rs0
```

This localhost-only unauthenticated container is for synthetic development data. Production needs authentication, TLS, private networking, backups, restricted database users, managed secrets and a reviewed deployment.

## Configuration

- `MONGODB_URI`: MongoDB connection URI; optional for liveness only.
- `JWT_SECRET`: independent random signing secret, at least 32 characters; required for authentication.
- `JWT_ISSUER` / `JWT_AUDIENCE`: default `satyaid` / `satyaid-api`.
- `NODE_ENV`, `PORT`, `CORS_ORIGINS`: existing server settings. Origins are exact comma-separated URLs.
- `APAAR_ENCRYPTION_KEY`, `APAAR_LOOKUP_KEY`: optional separate base64 32-byte keys for future vault services; never required for liveness. Crypto helpers accept keys explicitly; there is no identity API.
- `APAAR_KEY_VERSION`: future key-management reference; never a secret key value.
- Demo provisioning: `ALLOW_DEMO_SEED=true`, `DEMO_ADMIN_EMAIL` ending in `@example.invalid`, `DEMO_ADMIN_PASSWORD` of 16–72 bytes. Seed refuses production and databases whose name does not end `_demo`.

Run `npm run db:seed` for fictional institutions, a program, categories, separate base/extra pools, a synthetic student and deliberate reviewable cross-institution overlap. No seeded student is officially verified. Identity-vault seeding is optional and requires configured private identity keys. Existing values are preserved. No public registration or real identities are used. No quota percentages are seeded.

## Verification

`npm test` runs independent tests and explicitly skips database tests unless configured. To run database integration tests against a dedicated database whose name ends `_test`:

```powershell
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27017/satyaid_batch1_test?directConnection=true&replicaSet=rs0'
npm test
```

Tests create uniquely named synthetic records and do not drop the database. Batch 2 removes only its own encrypted vault fixtures using a unique per-run key version; it requires an isolated test database with no unrelated vault key versions. Batch 2 integration tests also cover identity isolation, concurrency, bulk uploads, mock verification and transfer review. Index creation is explicit (`db:indexes`); automatic index builds are disabled in runtime connections.

See [API reference](docs/API_REFERENCE.md), [roles](docs/AUTH_AND_ROLES.md), [database](docs/DATABASE_SCHEMA.md), [architecture](docs/BACKEND_ARCHITECTURE.md), and [progress](docs/DEVELOPMENT_PROGRESS.md). `OPERATIONS.md` is an earlier, aspirational blueprint; its Python/PostgreSQL proposal is superseded.

## Batch 2 operation

Set independent stable keys before identity/upload work. In PowerShell, for a **new local synthetic demo only**, generate them into the process environment (do not regenerate keys for an existing vault/queue):

```powershell
$env:JWT_SECRET = node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
$env:APAAR_ENCRYPTION_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
$env:APAAR_LOOKUP_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
$env:APAAR_KEY_VERSION = 'local-v1'
$env:UPLOAD_ENCRYPTION_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
$env:APAAR_PROVIDER = 'MOCK_APAAR'
```

Keep actual keys in private runtime configuration/secret management. API and worker must receive the same stable keys. Never put them in React, Git, sample files, logs or chat. An existing vault encrypted under another key/version cannot be decrypted by newly generated keys. Keyring rotation and production transport/privacy hardening are not finished.

Use a dedicated `_demo` MongoDB database for the guarded seed. Set ALLOW_DEMO_SEED=true, DEMO_ADMIN_EMAIL and a private DEMO_ADMIN_PASSWORD, then:

```powershell
npm run db:indexes
npm run db:seed
npm run demo:samples
npm run dev
# In another terminal with identical MongoDB/crypto configuration:
npm run worker
```

Generated CSV/XLSX files are under `samples/generated/` and ignored by Git. Template examples are synthetic and do not represent officially reserved national identifiers. `npm run worker -- --once` runs one queued job. Development processing does not require an official identity service.

New API families: `/api/v1/students`, `/enrolments`, `/uploads`, `/conflicts`, `/transfers`. See [student/admission contracts](docs/STUDENT_DATA_CONTRACT.md), [bulk format/worker](docs/BULK_UPLOAD_FORMAT.md), [mock verification](docs/APAAR_MOCK_VERIFICATION.md), and [Batch 2 evidence](docs/BATCH2_IMPLEMENTATION.md). Mock matches remain MOCK_VERIFIED and official:false; production mode refuses the mock provider.

Batch 3 dependencies: production browser-session/MFA/invitation hardening, approved privacy/retention and consent policies, official provider authorization, completion/graduation lifecycle, protected evidence storage, key rotation, production recovery/load evidence, and later authorized employer verification. Dashboards, AI and frontend remain outside this batch.
