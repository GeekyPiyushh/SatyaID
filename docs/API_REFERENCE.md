# API reference — implemented Batch 1

Every success uses `{ "success": true, "message": "Success", "data": ... }`; errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. Health retains its Phase 01 message. Invalid request schemas return 422, unauthenticated requests 401, forbidden scope/roles 403, missing records 404, duplicate/state conflicts 409. Unexpected errors never return exception details.

## Public and authentication

| Method | Route | Body/behavior |
|---|---|---|
| GET | `/api/health` | Database-independent liveness |
| GET | `/api/ready` | Connection readiness; 200 or 503 |
| POST | `/api/v1/auth/login` | `{ "email": "admin@example.invalid", "password": "<private>" }` |
| POST | `/api/v1/auth/refresh` | `{ "refreshToken": "<opaque-token>" }` |
| POST | `/api/v1/auth/logout` | Same body; idempotent refresh-family revocation |
| GET | `/api/v1/auth/me` | Bearer access JWT; excludes password hash |

Login/refresh data: `{ "accessToken": "...", "refreshToken": "...", "expiresIn": 600, "tokenType": "Bearer" }`.

## Academic management — all require Bearer JWT

| Methods | Route | Permissions / input |
|---|---|---|
| POST, GET | `/api/v1/institutions` | Create: AICTE; list: scoped. Create fields pid/name/state/status |
| GET, PATCH | `/api/v1/institutions/:id` | Scoped read; own institution admin edits name/state; AICTE can edit status |
| GET, POST | `/api/v1/programs` | Read authenticated; create AICTE, code/name |
| PATCH | `/api/v1/programs/:id` | AICTE; complete code/name payload |
| GET, POST | `/api/v1/academic-years` | Read authenticated; create AICTE, code/startsOn/endsOn (ISO timestamps) |
| PATCH | `/api/v1/academic-years/:id` | AICTE; complete year payload |
| GET, POST | `/api/v1/seat-categories` | Read authenticated; create AICTE, code/name |
| PATCH | `/api/v1/seat-categories/:id` | AICTE; complete category payload |
| POST | `/api/v1/offerings` | AICTE; institution/program ObjectIds |
| PATCH | `/api/v1/offerings/:id` | AICTE; active boolean |
| GET | `/api/v1/institutions/:id/offerings` | Institution-scoped |
| POST | `/api/v1/institutions/:id/memberships` | AICTE or own admin; user/role/active; only AICTE appoints admins |
| PATCH | `/api/v1/institutions/:id/memberships/:membershipId` | AICTE; active boolean |
| POST | `/api/v1/intakes` | AICTE; allocation body below |
| PATCH | `/api/v1/intakes/:id` | AICTE; approvedSeats/sourceReference; cannot reduce below utilization |
| POST | `/api/v1/quota-rules` | AICTE; new immutable rule version |
| PATCH | `/api/v1/quota-rules/:id/retire` | AICTE; empty object body |
| GET | `/api/v1/offerings/:id/quota-rules` | Institution-scoped |
| GET | `/api/v1/offerings/:id/capacity?academicYear=<id>` | Scoped capacity and utilization |
| GET | `/api/v1/institutions/:id/intake-report?academicYear=<id>` | Scoped per-offering summaries |

Institution list query: `page` (default 1), `limit` (default 20, max 100), `status`, `state`, `program` ObjectId, `search` (escaped literal name search). Other master lists currently return at most 100 records; comprehensive pagination is pending.

Allocation body:

```json
{"offering":"<ObjectId>","academicYear":"<ObjectId>","category":"<ObjectId>","kind":"BASE","approvedSeats":60,"sourceReference":"Synthetic approval reference"}
```

Quota body: offering/academicYear/category ObjectIds, positive integer version, kind BASE or SUPERNUMERARY, method FIXED or PERCENTAGE, nonnegative value (percentage ≤100; fixed integer), rounding FLOOR/CEILING/HALF_UP, ISO effectiveFrom/effectiveUntil, sourceReference, approvalStatus DRAFT/APPROVED/RETIRED.

Capacity returns baseSeats, allocations with occupied/available seats, and currently effective approved quota ceilings. Percentage rules use the approved base intake. Quota ceilings do not automatically add seats; supernumerary capacity requires a separate approved allocation. No regulatory percentages are hardcoded. NRI/OCI/FN/CIWG are configurable category codes, not inferred legal rules.

## Batch 2 — IMPLEMENTED student/admission/transfer APIs

Exact roles, ownership rules, request bodies, response examples and errors for every student, enrolment and transfer endpoint are in [STUDENT_DATA_CONTRACT.md](STUDENT_DATA_CONTRACT.md). All preserve the existing envelopes and `/api/v1` prefix. Student/enrolment routers limit authenticated traffic to 120 requests/minute/IP. Browser-token limitations remain unchanged.

## Batch 2 — IMPLEMENTED upload APIs

See [BULK_UPLOAD_FORMAT.md](BULK_UPLOAD_FORMAT.md) for every upload endpoint, multipart fields, file/row limits, states, worker setup, body/response examples and safe error codes. Preview does not reserve seats; confirmation and worker commit are required.

## Batch 2 — IMPLEMENTED conflict investigation

Institution admins/staff may access involved cases through active membership, with a redacted view. AICTE_ADMIN has regulatory detail and resolution permissions. STUDENT/EMPLOYER have no conflict access. Unrelated institution access returns 404; prohibited roles return 403.

| Method | Route | Body/query | Response |
|---|---|---|---|
| GET | `/api/v1/conflicts` | page/limit; optional status | items,total,page,limit; institution-scoped/redacted |
| GET | `/api/v1/conflicts/:id` | None | Safe case view; read audited |
| GET | `/api/v1/conflicts/:id/history` | page/limit | items,total,page,limit; institution views omit actors/reasons |
| POST | `/api/v1/conflicts/:id/evidence` | typeCode, protectedObjectReference, institution for institutional callers | Recorded evidence ID; history/audit appended |
| PATCH | `/api/v1/conflicts/:id` | version, status UNDER_REVIEW/AWAITING_EVIDENCE/ESCALATED; optional assignedReviewer | AICTE-only updated case |
| POST | `/api/v1/conflicts/:id/resolve` | resolution, reasonCode, version | AICTE-only resolved case; no enrolment deletion |

Evidence request:

```json
{"institution":"<involvedInstitutionId>","typeCode":"TRANSFER_REVIEW","protectedObjectReference":"evidence:synthetic-document-001"}
```

Only opaque `evidence:` references are accepted; this endpoint does not upload files, dereference URLs, read filesystem paths, or grant document download permission. A future protected evidence-storage adapter must verify actual document ownership. Institutional evidence requires that the supplied institution belongs to the case and the actor's active memberships.

Resolution request:

```json
{"resolution":"LEGITIMATE_OVERLAP","reasonCode":"AUTHORIZED_DOCUMENT_REVIEW","version":1}
```

Allowed resolutions: CONFIRMED_TRANSFER, LEGITIMATE_OVERLAP, DUPLICATE_SUBMISSION, DATA_ENTRY_ERROR, POLICY_VIOLATION_CONFIRMED, INSUFFICIENT_EVIDENCE. A resolved case cannot be silently rewritten; stale or closed-case updates return 409 CONFLICT_STATE_CHANGED. Only active AICTE accounts may be assigned reviewers (422 INVALID_REVIEWER otherwise).

Institution case data example:

```json
{"_id":"<caseId>","ruleCode":"CROSS_INSTITUTION_OVERLAP_V1","status":"OPEN","severity":"WARNING","version":1,"explanation":"Potential overlapping enrolment ... Review is required; no fraud classification is made."}
```

List response example: `{ "success":true, "message":"Success", "data":{ "items":["<case views>"], "total":1, "page":1, "limit":20 } }`. Evidence data is `{ "_id":"<evidenceId>", "recorded":true }`; history data contains action/resolution/createdAt, with regulator-only actor/reason references. Regulator case responses additionally contain internal student/enrolment/institution references. No view contains an APAAR ID.

Important errors: 401 auth failures, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT_STATE_CHANGED, 422 VALIDATION_ERROR/INVALID_REVIEWER. Regulator resolution does not constitute official university transfer approval and does not automatically delete/cancel admissions.

## Batch 2 — MOCKED APAAR verification

See [APAAR_MOCK_VERIFICATION.md](APAAR_MOCK_VERIFICATION.md). The verification endpoint is operational, but all provider outcomes are simulations, explicitly official:false. Production mode refuses it. No official government adapter exists.
