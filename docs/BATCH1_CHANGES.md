# Batch 1 change inventory

Changes are local and not merged or pushed. Phase 02 MySQL work was interrupted by the explicit MongoDB architecture replacement.

## Modified

- `.env.example`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `README.md`
- `src/app.ts`
- `src/server.ts`
- `src/config/database.ts`
- `src/config/env.ts`
- `src/middlewares/error-handler.ts`
- `src/routes/index.ts`
- `scripts/check-database.ts`
- `tests/app.test.ts`
- `docs/API_REFERENCE.md`
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/DEVELOPMENT_PROGRESS.md`
- `docs/INTEGRATION_NOTES.md`

## Created

- `src/models/index.ts`
- `src/middlewares/auth.ts`
- `src/services/auth.ts`
- `src/services/management.ts`
- `src/services/identity-crypto.ts`
- `src/routes/auth.ts`
- `src/routes/management.ts`
- `scripts/create-indexes.ts`
- `scripts/seed.ts`
- `scripts/document-schema.ts`
- `tests/security.test.ts`
- `tests/database.test.ts`
- `docs/AUTH_AND_ROLES.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/DATABASE_RELATIONSHIPS.md`
- `docs/DATABASE_DECISIONS.md`
- `docs/BATCH1_CHANGES.md`

## Removed

- `prisma.config.ts`
- `prisma/schema.prisma` and unfinished relational migration artifacts under `prisma/`
- Prisma/MySQL dependencies and package scripts

`OPERATIONS.md` is preserved as a historical aspirational blueprint, with its obsolete stack explicitly superseded in README. No user data or live database was deleted.
