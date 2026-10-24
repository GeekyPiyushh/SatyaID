# APAAR simulation — MOCKED, never official

`ApaarVerificationProvider` accepts a protected service's decrypted identifier and returns a typed result. `MockApaarVerificationProvider` is registered as MOCK_APAAR version 1; there is no official provider or government HTTP call. Production mode refuses mock verification. Unknown provider names return a safe unavailable error.

The project-local fixture registry is deterministic:

| Synthetic test value | Outcome | Student status |
|---|---|---|
| 000000000001 | MATCH | MOCK_VERIFIED |
| 000000000002 | MISMATCH | VERIFICATION_FAILED |
| 000000000003 | NOT_FOUND | VERIFICATION_FAILED |
| 000000000004 | TIMEOUT | Preserve current status; event UNVERIFIED |
| 000000000005 | UNAVAILABLE | Preserve current status; event UNVERIFIED |
| Any other structurally valid value | NOT_FOUND | VERIFICATION_FAILED |

These numbers are **not officially reserved national identifiers**. They are only synthetic project fixtures and must never be used with a real identity service. A twelve-digit format check establishes neither issuance nor authenticity. A mock match performs no government identity check or proof of name/DOB.

## API

POST `/api/v1/students/:id/verify-apaar`, authenticated institution admin/staff with student institution ownership or AICTE_ADMIN. Body:

```json
{"institution":"<institutionId>"}
```

Response example:

```json
{"success":true,"message":"Success","data":{"verificationStatus":"MOCK_VERIFIED","outcome":"MATCH","provider":"MOCK_APAAR","providerVersion":"1","official":false,"traceId":"<opaqueUuid>"}}
```

The service decrypts inside the backend, checks key version, calls the injected registry provider, then writes status/event/audit in a transaction after checking that the vault is unchanged. No identifier is returned or logged. Events retain provider/version, outcome code, actor, timestamp, key version and trace ID, never the raw identifier. Timeout/unavailable are explicit outcomes, not false mismatches. Rate limit: 10/minute/IP. Errors include 403 FORBIDDEN, 409 IDENTITY_NOT_LINKED/IDENTITY_CHANGED, 429 RATE_LIMITED, 503 MOCK_PROVIDER_DISABLED/PROVIDER_UNAVAILABLE/IDENTITY_KEYS_UNAVAILABLE/IDENTITY_KEY_VERSION_UNAVAILABLE/IDENTITY_DECRYPTION_FAILED.

## Authorized integration — PLANNED

Obtain an authorized provider specification, legal basis/consent rules, approved identity claims, sandbox fixtures, client authentication, trusted issuer/certificate configuration, rate limits, data-retention obligations and audit requirements. Implement a separately reviewed adapter with bounded timeouts/retries and minimal response storage. Perform external network calls outside long-lived database transactions and validate subject/version before applying results. Credentials belong in a supported secret manager; never fabricate an endpoint or token.

An official status must be available only from a reviewed authorized adapter. The current result type/provider cannot emit OFFICIALLY_VERIFIED. No government approval, partnership, live API access or official validation is claimed.
