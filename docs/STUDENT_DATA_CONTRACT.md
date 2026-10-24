# Student and admission contracts — Batch 2

All paths below start `/api/v1`. IMPLEMENTED unless marked MOCKED. All use authenticated Bearer JWTs and the existing success/error envelope. ObjectId placeholders must be replaced with actual 24-character hexadecimal IDs. Never place APAAR identifiers in URLs.

## Student ownership

A canonical `Student` identifies one internal person and optional linked account. `StudentInstitution` stores the institution's own name, DOB, roll number and status. A student can have many institution associations. Institution edits affect only their profile; they do not rewrite another institution's profile or a shared national identity.

AICTE_ADMIN can regulate all records; institutional admins/staff need active membership plus that student's association with the specified institution. STUDENT can read their linked records, but cannot use the directory or mutation APIs. EMPLOYER has no directory access. All record reads and important changes are audited. Linking a user account and attaching an existing student to another institution are regulator-only operations, to be used after authorized review.

| Method | Route | Body / query | Successful data |
|---|---|---|---|
| POST | `/students` | Registration example below | studentId, profile, identityStatus; HTTP 201 |
| GET | `/students` | institution required; page/limit; optional search is exact institution roll number | items, total, page, limit |
| GET | `/students/:id` | institution query required for institution users | studentId, identityStatus, profiles |
| PATCH | `/students/:id` | institution/version required; optional displayName/dateOfBirth/status | Updated own profile |
| GET | `/students/:id/identity-status` | Same read scope | identityStatus, latestEvent, official:false |
| POST | `/students/:id/apaar/link` | institution/apaarId | linked:true; never returns identifier |
| POST | `/students/:id/account-link` | user ObjectId; AICTE_ADMIN only | linked:true |
| POST | `/students/:id/verify-apaar` | institution; authorized institution writer or regulator | MOCKED; see APAAR_MOCK_VERIFICATION.md |

Registration:

```json
{"institution":"<institutionId>","institutionStudentId":"DEMO-101","displayName":"Synthetic Student","dateOfBirth":"2005-01-15"}
```

Optional registration `apaarId` must be exactly twelve digits; this is a structural check only. AICTE can supply `existingStudent` to create an institution association after review. All other callers are forbidden from choosing an existing canonical identity. Missing APAAR is supported. Contact data/gender are not collected because this phase has no operational need for them.

Successful registration:

```json
{"success":true,"message":"Success","data":{"studentId":"<id>","profile":{"student":"<id>","institution":"<institutionId>","institutionStudentId":"DEMO-101","displayName":"Synthetic Student","status":"ACTIVE","version":1},"identityStatus":"UNVERIFIED"}}
```

Profile correction:

```json
{"institution":"<institutionId>","displayName":"Synthetic Corrected","version":1}
```

Use status INACTIVE for soft deactivation. No destructive delete exists. Identity corrections cannot overwrite a linked vault through this API. Only a single active key version is supported. New identity links fail closed if vaults with another version exist; reconcile through an authorized rekey procedure before rotating. A repeat of the same current identity link succeeds; a different identifier requires regulatory review. HMAC collisions/existing matches return a generic review-required error without identifying another student.

Principal errors: 401 UNAUTHENTICATED/INVALID_TOKEN, 403 FORBIDDEN, 404 NOT_FOUND, 409 WRITE_CONFLICT/IDENTITY_ALREADY_LINKED/IDENTITY_REVIEW_REQUIRED/DUPLICATE_RECORD, 422 VALIDATION_ERROR/INVALID_STUDENT_ACCOUNT, 503 IDENTITY_KEYS_UNAVAILABLE. No raw identifiers, lookup digests, ciphertext or cryptographic keys appear in ordinary student responses.

## Admissions

Institution writers can create, edit and transition only their own admissions. AICTE can operate across institutions. Linked STUDENT users can read their own individual enrolment/history but cannot activate or withdraw it through these administrative routes. List queries require institution scope. EMPLOYER cannot access these records.

| Method | Route | Body / query | Successful data |
|---|---|---|---|
| POST | `/enrolments` | Draft example below | Enrolment; HTTP 201, including idempotent replay |
| GET | `/enrolments` | institution required; page/limit; optional program/academicYear/category/status | items, total, page, limit |
| GET | `/enrolments/:id` | None | Scoped enrolment; fingerprint omitted |
| PATCH | `/enrolments/:id` | version/reasonCode; optional endsOn/status | Updated unactivated enrolment |
| POST | `/enrolments/:id/activate` | `{}` | ACTIVE enrolment; repeat is idempotent |
| POST | `/enrolments/:id/withdraw` | `{}` | WITHDRAWN enrolment; repeat is idempotent |
| GET | `/enrolments/:id/history` | None | At most 100 chronological transition records |

```json
{"student":"<studentId>","allocation":"<allocationId>","institutionStudentId":"DEMO-101","admissionDate":"2026-08-01","startsOn":"2026-08-01","entryType":"REGULAR","idempotencyKey":"admission-demo-101"}
```

Optional endsOn is ISO YYYY-MM-DD. Entry types REGULAR/LATERAL_ENTRY/TRANSFER are labels, not proof of regulatory eligibility. Institution, offering, academic year and category derive from the approved allocation and are validated, not trusted from duplicated request fields. Admission/start dates must fall inside that academic year. The active private profile must match the supplied roll number.

Example activation response:

```json
{"success":true,"message":"Success","data":{"_id":"<enrolmentId>","student":"<studentId>","allocation":"<allocationId>","status":"ACTIVE","version":2}}
```

States implemented by services: DRAFT → PENDING_VALIDATION or REJECTED; PENDING_VALIDATION → UNDER_REVIEW or REJECTED; UNDER_REVIEW → PENDING_VALIDATION or REJECTED. Activation accepts DRAFT/PENDING_VALIDATION only. ACTIVE → WITHDRAWN, or TRANSFERRED through reviewed transfer. Other arbitrary status mutations are rejected. COMPLETED is reserved in the schema; a completion/graduation workflow is PLANNED. Legacy ACCEPTED records need reconciliation before production use and are not silently migrated into active counters.

Idempotency keys are institution-scoped. Reuse with a different normalized request returns 409 IDEMPOTENCY_CONFLICT. Duplicate program/year submissions by the same student are rejected while earlier submissions remain live; this is not a universal single-enrolment rule across programs or institutions.

Capacity checks apply explicitly approved allocation sizes and effective, approved category quota ceilings as of activation time. Quota ceilings cannot create new approved seats. An atomic occupiedSeats predicate, unique SeatReservation, enrolment transition, history, conflict detection and audit are in one replica-set transaction. Withdrawal releases exactly one reservation and seat. A repeat does not increment/decrement again. Crashes roll back uncommitted changes. Transient transaction errors use Mongoose/driver transaction retry semantics; persistent errors return a safe failure.

Errors include INVALID_ALLOCATION, INVALID_OFFERING, INVALID_ALLOCATION_REFERENCE, INVALID_STUDENT_ASSOCIATION, ACADEMIC_YEAR_MISMATCH (422); CAPACITY_EXHAUSTED, DUPLICATE_SUBMISSION, IDEMPOTENCY_CONFLICT, INVALID_STATE_TRANSITION, RESERVATION_INCONSISTENT (409); and standard auth/scope errors.

## Reviewed transfers

These are project administrative records, not university/government transfer approvals.

| Method | Route | Role/scope | Body / successful data |
|---|---|---|---|
| POST | `/transfers` | Source institution writer or regulator | Source/target request below; HTTP 201 |
| GET | `/transfers/:id` | Involved institution membership or regulator | Limited institution view; regulator sees administrative details |
| POST | `/transfers/:id/approve` | AICTE_ADMIN only | reasonCode; approved transfer |
| POST | `/transfers/:id/reject` | AICTE_ADMIN only | reasonCode; rejected transfer |

```json
{"sourceEnrolment":"<sourceId>","targetAllocation":"<targetPoolId>","targetInstitutionStudentId":"DEMO-TARGET-101","startsOn":"2026-09-01","admissionDate":"2026-09-01","idempotencyKey":"transfer-demo-101","reasonCode":"DOCUMENTED_REVIEW"}
```

Approval requires an active source, a different target institution, and a regulator-established target student association. It creates/activates a target admission, releases the source reservation, marks source TRANSFERRED with an end date, and stores the target linkage/history/audit in one transaction. Full target capacity or invalid association rolls the whole operation back. Repeated identical approvals/rejections return the existing decision; reversing a final decision is rejected. A duplicate concurrent initiation may return a controlled 409; replaying the same key returns its existing transfer.

Limited view example: `{ "_id":"<transferId>", "status":"REQUESTED", "startsOn":"2026-09-01T00:00:00.000Z" }`. Errors: INVALID_TRANSFER (422), INVALID_STATE_TRANSITION/CAPACITY_EXHAUSTED/IDEMPOTENCY_CONFLICT/DUPLICATE_RECORD (409), and standard auth/scope/reference errors.
