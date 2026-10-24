# Bulk student upload — IMPLEMENTED

Two-stage pipeline: upload → worker validation → review row results → explicit commit confirmation → worker per-row transactions. HTTP upload/confirmation return 202; neither response claims processing succeeded. Both CSV and XLSX use exactly these ordered columns:

| Column | Type / requirement |
|---|---|
| institutionStudentId | Required institution roll code; 1–80 letters/digits/underscore/dot/colon/hyphen |
| displayName | Required trimmed name, max 160 characters |
| dateOfBirth | Optional YYYY-MM-DD text |
| apaarId | Optional exactly twelve digits as **text**; preserve leading zeros |
| allocation | Required internal allocation ObjectId |
| academicYear | Required ObjectId; must match allocation |
| admissionDate | Required YYYY-MM-DD text, inside academic year |
| startsOn | Required YYYY-MM-DD text, inside academic year |
| endsOn | Optional YYYY-MM-DD text, not earlier than startsOn |
| entryType | Required REGULAR, LATERAL_ENTRY or TRANSFER |

Only one text worksheet is supported. Dates/identifiers must be text, not Excel serial dates or numeric identifiers. No formulas, hyperlinks, macros, drawings, comments, merged rich-text objects or external worksheet relationships. CSV is strict UTF-8 with optional BOM. Header names/order and column counts must match. Limits: 2 MiB/file, 1,000 data rows, 8 KiB CSV record, 500 characters/cell. XLSX archive preflight limits expanded bytes to 8 MiB, entries to 100, XML element counts, shared strings, column addresses A–J, and rows. DTDs and unsupported archive entries are rejected. Parsing remains in memory; no user-controlled filesystem path or plaintext worksheet spool is used.

## Endpoints

All paths start `/api/v1/uploads`; all require an institution writer with active ownership, or AICTE_ADMIN. There is no public upload or student/employer upload access. Limit: 60 requests/minute/IP, in memory.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/template` | None; authenticated | CSV header download |
| POST | `/students` | Multipart fields institution, idempotencyKey; exactly one `file` part | 202; queued job metadata |
| GET | `/:id` | None; job institution ownership | Job status/counts, never file/row payload |
| GET | `/:id/results` | page/limit | Safe row outcomes, codes, internal own-record references |
| POST | `/:id/commit` | `{}` | 202; queues valid/failed eligible rows |
| POST | `/:id/retry` | `{}` | 202; requeues a FAILED job after operator diagnosis |
| GET | `/:id/error-report` | None | CSV of rowNumber/errorCodes only |

Example queued response:

```json
{"success":true,"message":"Success","data":{"_id":"<uploadId>","status":"PENDING","totalRows":0,"validRows":0,"invalidRows":0,"committedRows":0}}
```

A validated mixed preview might return `status: VALIDATED, totalRows: 4, validRows: 1, invalidRows: 3, committedRows: 0`. A commit with one accepted row and three invalid rows yields PARTIAL and committedRows 1. `validRows`/`invalidRows` are preview counts; inspect current row statuses for later commit failures. Errors never echo row values. Error-report cells are quoted and formula-neutralized.

## Worker and recovery

Run `npm run worker` in a separate terminal with the same MongoDB/crypto configuration as the API. `npm run worker -- --once` processes one available persisted job, useful for smoke checks. Replica sets are required. The worker claims a 60-second persisted lease and renews it per row. Preview writes check/lock the active lease transactionally. A stale worker cannot overwrite a committed row. After three expired attempts a stale job is marked FAILED; an authorized operator may diagnose and retry it.

File and row staging are AES-256-GCM encrypted with a dedicated `UPLOAD_ENCRYPTION_KEY`. Format is version byte, 12-byte nonce, 16-byte tag, ciphertext; job/row references are authenticated AAD. File fingerprints are keyed; they are not exposed. Keep the staging key stable while jobs exist; rotation/keyring support is PLANNED. Never copy this key into code or logs.

Commit rechecks mutable ownership, academic mapping and capacity. Each row's student/profile creation, draft, activation/reservation, audit/history/conflicts, and COMMITTED marker share one transaction. Successful row payloads are removed. Invalid rows are skipped; failed commit rows may be retried through confirmation of a PARTIAL job. Each row has a stable admission key. A crash after commit cannot create a second admission when the worker resumes.

Matching existing institution profiles may be reused only when supplied details/identity agree; cross-institution identity matches require regulator review, without exposing the matched record. Missing APAAR is a warning, not invented identity. In-file roll and protected-identity repeats are errors. Same-identity cross-institution activity is a review warning; final activation produces a case where applicable. Preview capacity is advisory, rechecked atomically during commit.

Important codes: INVALID_ROW_FIELDS, INVALID_APAAR_FORMAT, DUPLICATE_ROW, DUPLICATE_IDENTITY_IN_FILE, CONFLICTING_STUDENT_DETAILS, IDENTITY_REVIEW_REQUIRED, INVALID_INSTITUTION_MAPPING, ACADEMIC_YEAR_MISMATCH, INVALID_ADMISSION_DATE, CAPACITY_EXHAUSTED, DUPLICATE_SUBMISSION, ROW_PROCESSING_FAILED. Job/parser codes include INVALID_COLUMNS, ROW_LIMIT_EXCEEDED, INVALID_XLSX, XLSX_LIMIT_EXCEEDED, INVALID_UPLOAD, UNSUPPORTED_XLSX_CELL and WORKER_RETRY_EXHAUSTED. HTTP auth/scope failures are 401/403, limits 413, body/type errors 422, idempotency/state conflicts 409, missing keys 503.

## Samples and retention

`samples/students-synthetic.csv` is a documented placeholder example. Run guarded `npm run db:seed`, then `npm run demo:samples` to generate usable CSV/XLSX with IDs from your dedicated demo database. Generated files are ignored by Git. Values are project synthetic fixtures, not officially reserved national IDs.

Encrypted invalid/failed row payloads and failed source files are retained for investigation/retry. Automated retention/deletion, malware scanning, isolated parsing resource quotas, and production storage/key rotation are PLANNED; establish an approved retention policy and operational cleanup before using real student information. Boundaries are enforced, but this development worker has not been certified as a hostile-document sandbox.
