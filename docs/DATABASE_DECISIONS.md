# Database decisions

**IMPLEMENTED:** MongoDB/Mongoose replaces all active Prisma/MySQL configuration. No existing live data required conversion. Every document has an ObjectId; a missing APAAR vault is permitted. Unique institution PID, offering institution/program pairs, allocation offering/year/category/kind, and versioned rule scope are indexed. Multiple enrolments are allowed; overlap assessment is deferred.

Base allocations are disjoint approved seat pools; supernumerary pools are separate. NRI/OCI/FN/CIWG codes do not imply eligibility, percentages, or additional seats. Quota results are ceilings relative to explicitly approved base allocations; they do not mutate capacity. Approved rules cannot overlap for the same scoped category/kind/time period. Corrections use a new rule version and explicit retirement.

Important writes and audit insertion share one transaction. A duplicate index failure aborts both. Capacity edits use version matching and an occupiedSeats predicate; callers cannot write occupiedSeats through HTTP. Future admissions must use conditional atomic allocation updates, history/audit, and idempotency within a transaction. Replica sets are mandatory for these operations.

**PLANNED:** production database-level JSON-schema validators, least-privilege grants, immutable audit retention, backup/restore drills, identity-key rotation, and full future workflow models. Mongoose validation applies through this application; it does not prevent a privileged database operator writing invalid data. No schema model itself supplies authorization or official identity assurance.
