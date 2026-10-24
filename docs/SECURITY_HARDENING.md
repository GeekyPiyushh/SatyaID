# Security hardening — Batch 4

IMPLEMENTED for documented development/demo use, with tests. No security certification or official government integration is claimed.

## Sessions and transport

Explicit POST browser routes `/api/v1/auth/browser/{csrf,login,refresh,logout}`. Exact allowlisted Origin is mandatory. Bootstrap returns a random nonce and sets a signed HttpOnly CSRF cookie; login/refresh/logout require that nonce in X-CSRF-Token. The HMAC binds nonce, expiry, origin and cookie path; refresh sessions additionally store the expected nonce digest and origin. Bootstrap may rebind a live cookie to a new nonce for reload recovery. No SameSite-only CSRF assumption.

Login and refresh set HttpOnly refresh cookies, rotate the nonce, and return only a 10-minute access JWT plus session metadata. Family absolute expiry is7 days; rotation does not extend it. Replay of a revoked same-transport refresh token revokes its family. Refresh cookies cannot be redeemed as JSON sessions, or vice versa. JSON auth rejects browser Origin/Sec-Fetch-Site/browser refresh-cookie transport. This intentionally changes previous browser JSON-login consumers: migrate to the browser client.

Default cookie path `/api/v1/auth/browser`, SameSite=Lax, host-only. Production requires Secure and HTTPS origins. SameSite=None requires Secure. Logout clears both cookies using matching path/domain options and revokes refresh family. Access JWTs remain valid up to10 minutes; disabled account checks reject sooner. There is no access-token denylist or MFA. Keep access/CSRF only in memory; no bearer URL parameters. Responses are no-store. CORS credentials apply only to browser auth, never wildcard origins. Multi-tab rotations may require nonce bootstrap.

## Authorization and request review

JWT algorithm/issuer/audience/expiry/subject checked; malformed subject rejected before a Mongo lookup. Every authenticated request reloads the active User. InstitutionScope now requires an institution account role as well as active membership; admin-only operations require both admin role and membership. Membership provisioning requires an active existing account whose role matches the requested membership. Existing inconsistent memberships therefore stop granting access and require review.

Strict Zod input prevents arbitrary document updates. Object IDs, body/file size, MIME/archive/XML/formulas, content digest downloads and scope are checked. Cross-institution profiles, employer-bound references, student linkage and claims remain restricted. Disclosure rechecks live consent/account/employer/expiry inside its transaction. Errors omit input payloads, stack traces and database diagnostics. Helmet remains enabled; correlation IDs are server-generated. API keys, invitation/QR tokens, cookies, passwords and student payloads must never enter application/proxy/APM logs.

## Replaceable abuse controls

`src/utils/rate-limit.ts` creates an isolated store per limiter namespace. Default MemoryStore is process-local; restart clears counters. Auth/browser login, refresh/logout, protected identity checks, student/admission mutations, upload, consent/credential, report, analytics/audit/intelligence and management operations are limited. Deploying multiple instances requires a tested distributed Store adapter configured before routers are imported; do not claim aggregate protection with MemoryStore. TRUST_PROXY accepts explicit IP/CIDR only; never enable blanket proxy trust or trust attacker-controlled forwarded headers.

## Keys and compatibility

Generate independent random keys: JWT_SECRET/CSRF_SECRET≥32 characters; all AES/HMAC keys canonical base64 of32 bytes. Configuration rejects cross-purpose reuse, malformed keyrings/versions and weak production placeholders. Secrets are read from runtime configuration, never logged or committed. A deployment must manage raw process secrets through its secret manager; proxy-only network placeholders cannot sign/decrypt local data.

APAAR_KEYRING_JSON maps version→{encryptionKey,lookupKey}; APAAR_KEY_VERSION chooses new writes. Existing APAAR_ENCRYPTION_KEY/APAAR_LOOKUP_KEY bind to the active version and remain supported. Old vault records decrypt using their stored keyVersion. Lookup queries check all loaded versions; a transactional global registry mutex serializes identity linkage so different active key versions cannot create duplicate links. Any stored unknown vault version pauses new linking. Missing/wrong old key never silently decrypts or overwrites records. This mutex is appropriate for the bounded demonstration; national throughput and sharding require a separately benchmarked registry design.

UPLOAD_KEYRING_JSON maps version→base64 key; UPLOAD_KEY_VERSION chooses v2 envelopes. Version ID, nonce/tag/ciphertext and job/row binding are authenticated with AES256GCM AAD. Legacy v1 envelopes read only through explicit UPLOAD_ENCRYPTION_KEY. When a ring is configured, that raw legacy key binds to UPLOAD_LEGACY_KEY_VERSION (default legacy); never repoint it at the new key while v1 payloads remain. Version-aware fingerprint candidates preserve identical upload retries across configured key versions. Wrong AAD/tampering fails closed. Keep lookup/fingerprint keys needed by retained idempotency records.

AUDIT_KEYRING_JSON maps versions to independent HMAC keys; AUDIT_KEY_VERSION chooses new signatures, optional AUDIT_HMAC_KEY binds that version. Historic signatures select stored versions. Per-event HMAC detects selected field tampering; it is not a chain and cannot prove absence/deletion/order or resist a privileged holder of signing keys. Missing audit signing configuration leaves explicitly UNSIGNED events.

## Operator-assisted rotation

1. Securely back up data AND the exact historic key versions through separate custodians. Test restore on a synthetic copy.
2. Inventory vault.keyVersion, upload envelopes and audit.integrityKeyVersion without exporting plaintext identifiers.
3. Add new keys to the ring while retaining old bindings; deploy readers to every API/worker before selecting a new active version. Validate no version is missing.
4. Pause identity writes during deployment coordination; switch active version, run controlled new-link/old-read tests, then resume. Never run different incomplete keyrings concurrently.
5. No bulk re-encryption command is implemented. Old vaults remain encrypted under old versions. A future reviewed migration must decrypt/authenticate/re-encrypt in transactions, recompute lookup digests, preserve uniqueness and audit progress. Do not edit keyVersion alone.
6. Retain historic keys until every dependent ciphertext, fingerprint and signature/backup obligation is resolved. Upload retention reduces staged payload exposure but does not retire historical vault/audit keys. JWT/CSRF rotation currently invalidates existing tokens/cookies; coordinated re-login is required. Their verification keyrings are NOT IMPLEMENTED.

Remaining production prerequisites: independent penetration/security/privacy review, lawful basis and notices, authorized official provider onboarding, MFA/account recovery, trusted TLS ingress, authenticated private Mongo/Atlas, tested distributed limits, managed secret custody/rotation, backup schedules/restore drills, durable monitoring and approved retention/holds. Optional mechanisms here do not certify production security.


## PS compliance sensitive print boundary

Full APAAR is still absent from ordinary student/employer/report/credential APIs. The explicit new POST student certificate-print-data route is limited to active own institution administrators and eligible ACTIVE records, approved current institution print permission and current linked student's enrolment-bound print consent. Default REDACTED returns null/mask; FULL requires consentId and an exact print-preparation purpose. Historical identity key versions decrypt through existing helpers; format and GCM authentication are checked. Responses are no-store/private and no plaintext exports are retained. Degree-awarding authority is not independently validated, and no degree/completion claim is created. Institution print authorization and consent revocation contend with full disclosure updates in Mongo transactions; previously disclosed copies cannot be recalled. Read-only operator identity reconciliation reports only codes/internal references and never repairs or publishes identifiers.
