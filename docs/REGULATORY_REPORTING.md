# Regulatory readiness reports and audit — IMPLEMENTED

Reports are **SatyaID regulatory readiness reports**, not official AICTE filings. JSON and CSV are supported; PDF and government submission are PLANNED/not implemented.

## APIs

| Method | Route | Roles / input |
|---|---|---|
| POST | `/api/v1/reports` | AICTE_ADMIN or own INSTITUTION_ADMIN; reportType, format JSON/CSV, filters |
| GET | `/api/v1/reports` | Same roles/scope; institution, academicYear, page/limit |
| GET | `/api/v1/reports/:id` | Scoped job metadata only |
| GET | `/api/v1/reports/:id/download` | Current authorized scope, completed/unexpired report, matching content digest |
| GET | `/api/v1/reports/prevalidation` | Same report roles/scope; analytics filter schema |
| GET | `/api/v1/audit/events` | AICTE broad view or own institution administrator; institution/from/to/page/limit |
| GET | `/api/v1/audit/integrity` | AICTE_ADMIN only; same bounded filter/page schema |

Institution staff, students and employers have no report or audit-administration access. An institution admin must supply own institution; a guessed inaccessible report ID returns 404. Download revalidates scope even if permission existed at generation time. No unauthenticated static file route exists.

Report types: ENROLMENT_SUMMARY, INTAKE_UTILIZATION, CATEGORY_UTILIZATION, UPLOAD_ERRORS, OVERLAP_CASES, IDENTITY_STATUS, ACADEMIC_YEAR_COMPLIANCE. Report filters reuse analytics filters and their source-specific semantics. Upload errors count current row error-code occurrences (one row can have multiple codes); jobs are not inherently year/program/category scoped. Overlap rows contain safe case metadata, not another institution's private student data.

```json
{"reportType":"INTAKE_UTILIZATION","format":"JSON","filters":{"institution":"<id>","academicYear":"<id>"}}
```

POST returns HTTP 202:

```json
{"success":true,"message":"Success","data":{"reportId":"<id>","status":"PENDING","expiresAt":"<UTC timestamp>"}}
```

Run the existing `npm run worker`: each poll can process one upload and one report. `--once` does one pass for both queues. Report leases are persisted for 120 seconds; interrupted work can be reclaimed, with three attempts before FAILED. Reports expire after 24 hours; source/runtime authorization and unsupported-type failures are recorded with safe failure codes. No arbitrary filesystem paths or private static downloads are used.

## Provenance and consistency

Artifact metadata includes title, type, generatorVersion, filters, institution/year context, generation time, source label, truncation status and applicable quota versions. Source reads execute sequentially in one MongoDB snapshot transaction. Report completion/artifact/audit write commits with the snapshot computation. generatedAt is a completion marker, not an exact historical event cutoff. Reports read current counters/current states; they do not reconstruct past student populations. Pending permission checks are separate from the source snapshot and are rechecked on access.

Detailed allocation/case/finding rows cap at 500; truncation is explicit. Aggregate summaries may cover the whole selected scope even when detail rows are capped. Allocation rows use the existing decimal quota formula, all base pools in the offering/year, approved effective rule versions, and approval caps. The report never authorizes seats or changes admissions. CSV carries provenance columns and quotes/formula-neutralizes cells, including whitespace-prefixed formulas. Content SHA-256 is checked at download; it detects accidental content modification, not privileged rewrites of both content and digest.

Report metadata and protected artifacts remain in MongoDB; production storage encryption/access/retention and cleanup must be configured. Expiry denies downloads but is not an automatic deletion guarantee.

Errors: 401 auth; 403 forbidden creation/list/scope; 404 REPORT_UNAVAILABLE for inaccessible IDs; 409 REPORT_NOT_READY for incomplete/expired downloads; 409 REPORT_CONTENT_MISMATCH for altered artifacts; 422 invalid report/filter schema. Worker failures expose stable codes (e.g. REQUESTER_UNAUTHORIZED, UNSUPPORTED_REPORT_TYPE, REPORT_GENERATION_FAILED, REPORT_RETRY_EXHAUSTED, REPORT_EXPIRED), not query diagnostics or private payloads.

## Explainable compliance prevalidation

Findings have ruleId, severity, explanation, affectedReference, evidenceCategory and recommendedAction. INFO/WARNING/ERROR/BLOCKING are project readiness labels, not regulatory penalties. No finding mutates or automatically blocks a legitimate admission.

- CAPACITY_BOUND_V1: counter outside approved bounds.
- COUNTER_RECONCILIATION_V1: counter, active reservations and active enrolments disagree.
- MISSING_ALLOCATION_V1 / ACADEMIC_MAPPING_V1: missing approval or inconsistent offering/institution/year/category references.
- UNRESOLVED_OVERLAP_V1: review needed; not proven misconduct.
- IDENTITY_ASSURANCE_V1: distinct students with unverified/mock/failed assurance; mocks do not become official and do not prohibit admission.
- PROFILE_COMPLETENESS_V1: mandatory name/roll/student reference missing; optional DOB/contact data is not penalized.
- CONFIGURED_QUOTA_REVIEW_V1: rules exist but no currently approved effective version; no new unverified regulatory quota requirement is inferred.

Detail cap 500, with explicit truncation. Profile checks are institution/state-wide because profiles are not academic-year documents. Enrolment/allocation/conflict filters apply where stored; date filters cannot reconstruct historical counters.

## Audit guarantees and limitations

New AuditEvent records include actor, captured actorRole, institution scope when attributable, action, target, occurredAt, outcome, safe optional reason metadata and generated correlationId. HTTP responses expose X-Request-ID; arbitrary client token/PII headers are not copied into it. Worker events receive independent correlation IDs and link by resource reference. Existing direct audit writes use the same schema hook; normal API routes expose no audit update/delete.

Optional AUDIT_HMAC_KEY is an independent base64 32-byte secret with AUDIT_KEY_VERSION. When absent, records are explicitly UNSIGNED; historical unsigned data is not retroactively certified. Signed events use HMAC-SHA256 over fixed-order canonical values of _id, actor, actorRole, institution, action, resourceType, resourceId, occurredAt, outcome, reasonCode, correlationId and integrityKeyVersion. Reference values become strings, dates ISO timestamps, missing fields null. Signatures are hidden from ordinary audit responses.

The integrity API reports VALID, INVALID, UNSIGNED or KEY_UNAVAILABLE per event on the requested page (max 100). Changing a signed field without the trusted key is detected; unavailable historic key versions are not falsely called valid. This is **per-event signing, not a hash chain**. It does not detect deletion, reordered history, downgrading a record to unsigned, or rewriting content with access to the signing key. MongoDB remains administratively mutable. Independently secured checkpoints, append-only storage and approved production cleanup are PLANNED. Batch 4 adds historic audit keyring reads and guarded synthetic payload retention; signatures still have the stated per-event limitations. No blockchain/immutability/government-proof claim is made.

## PS compliance extension

New reportType STUDENT_STATUS_DISTRIBUTION groups current institution-profile NRI/OCI/FN declarations and enrolmentStatus from selected authoritative enrolments. Independent YES/NO/UNKNOWN statuses never change approved capacity or categories. enrolmentCount counts selected records, distinctStudents deduplicates within each group (not additive across groups). Same institution/year/program/category/state/date filters, snapshot generation, JSON/CSV, provenance,24h expiry and access controls apply. Historical profile declarations absent from old data become UNKNOWN; current declarations are not admission-time snapshots. IDENTITY_STATUS adds summary.identifierPresence groups LINKED/MISSING and admissionIdentityPolicy; no raw APAAR. IDENTITY_STATUS CSV repeats the safe aggregate in an explicit identifierPresence provenance column. Prevalidation adds aggregate MISSING_APAAR_V1 warning without modifying admissions.
