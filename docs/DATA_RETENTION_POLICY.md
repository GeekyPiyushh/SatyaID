# Data retention — IMPLEMENTED synthetic policy controls

This is a conservative engineering policy for development/demo, not a legal retention schedule. A privacy/legal owner must approve actual production periods and legal holds before any production cleanup. Apply mode **refuses NODE_ENV=production and every database without a _test or _demo suffix**, regardless of flags. No production cleanup bypass is provided.

| Category | Current behavior / candidate policy | Cleanup effect |
|---|---|---|
| Uploaded source file | Removed immediately after successful validation; otherwise eligible when job unchanged ≥30 days and no live lease | Unset encrypted bytes, preserve job metadata/fingerprint/outcome |
| Successful row staging | Removed in same transaction as successful row commit | Preserve row status/student/enrolment references |
| Invalid/failed/uncommitted rows | Eligible when parent job unchanged before explicit ≥30-day cutoff | Unset encrypted row payload; preserve row outcomes and codes |
| Pending/validated old staging | Same conservative cutoff; never VALIDATING/COMMITTING jobs | Mark FAILED/UPLOAD_PAYLOAD_EXPIRED, payloadPurgedAt; cannot confirm/retry |
| PARTIAL/COMPLETED/FAILED old staging | Payload-only cleanup with expired/no lease | Preserve outcome; refuse future confirmation/retry if marked purged |
| Report artifact | Download expiry24h after queue; bytes eligible when expiry is ≥30 days before now | Remove content; preserve provenance/contentDigest/job metadata |
| Invitation token | Wall-clock expiry and one-use enforced immediately | ≥30 days after expiry, replace digest with unguessable tombstone; preserve invitation metadata |
| Credential token | Wall-clock expiry/revocation/consent/account checks immediately | ≥30 days after expiry, replace digest with unguessable tombstone; preserve evidence and associations |
| Verification requests/events, consent requests/grants/history | RETAIN; deployment/legal policy pending | Never deleted by this utility |
| Student/vault/profile/admission/transfer/history/reservations/approvals | RETAIN; reviewed correction/lifecycle only | Never deleted by this utility |
| Signed/unsigned audit evidence | RETAIN; external archival/legal policy pending | Never modified/deleted by cleanup; append purge event |
| Refresh-session/replay-family evidence | RETAIN; separate policy pending | Never deleted by this utility; expiry/revocation checked synchronously |

No TTL index deletes history. Expiry authorization never depends on asynchronous TTL. Digest tombstones preserve existing required fields and unique indexes; they do not anonymize historical actor metadata. Revoked-but-unexpired references remain until their expiry cutoff; revocation already denies disclosure.

## Operator commands

`npm run retention` is dry-run by default. Set MONGODB_URI to the authorized database and RETENTION_CUTOFF to an explicit ISO date at least30 days old. Output: mode/cutoff/limitPerCategory/counts for uploadJobs/uploadRows/reports/invitations/credentials, academicHistoryDeleted:false. Each category processes at most500 parent documents; uploaded rows are bounded by the existing1000-row job limit. Repeat scheduled runs until counts reach zero. Dry-run can read an authorized production database but never writes an audit event or changes payloads.

Apply only to known synthetic data: set ALLOW_RETENTION_APPLY=true and RETENTION_ACTOR_ID to an active AICTE_ADMIN, then `npm run retention -- --apply`. Compiled: `node dist/cli/retention.js --apply`. Active-user authorization is reloaded; caller-supplied role text is insufficient. Run only one cleanup operator at a time. Live/processing jobs are excluded; transactional job writes fence concurrent confirmation/claiming. Repeated runs are idempotent. The entire multi-category run is not one transaction: a failure can leave earlier payload categories purged, so retain operational output and rerun safely.

Each successful apply appends RETENTION_PAYLOAD_PURGE audit metadata, never private payloads. Keep the JSON output in an access-controlled operations log. Purged payloads cannot be recovered through retry; a corrected new upload/new key is required. Fingerprints remain for idempotent content matching. Do not use cleanup as identity correction or academic-history erasure.

For future production rollout: approve a category-specific schedule, legal holds, reviewer identity and scoped change ticket; verify encrypted backup/restore and key availability; independently review an export of dry-run counts; implement separately authorized production tooling. That workflow is PLANNED, not enabled by this batch.


PS-compliance addition: CertificatePrintConsent grants/revocations are consent history and are never purged by the payload cleanup utility. CertificatePrintAuthorization and its audit events remain administrative history. Full print payloads are generated on demand, never stored as reports/jobs or plaintext exports. Authorized printed copies cannot be recalled.
