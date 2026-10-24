# SatyaID — frontend integration master

For Members 2 and 3 building React + Vite + Tailwind. IMPLEMENTED contracts for all 15 phases; source is authoritative. APAAR verification is MOCKED. This is a college/hackathon system, with institution-submitted records and no government certification. Read sections 1–4 together before integrating screens.

## 1. Overview and local setup

Local API origin: `http://localhost:3000`. Versioned routes begin `/api/v1`; public probes are `/api/health` and `/api/ready`. Set `VITE_API_BASE_URL=http://localhost:3000` in the frontend's local configuration. This value contains no secret. Never put JWT signing/encryption keys in VITE variables.

Required backend: Node 24, `npm ci`, MongoDB 8 replica set, indexes, private server configuration. Run `npm run db:indexes`, `npm run dev`, and **in a separate process** `npm run worker`. Compiled equivalents: `npm run build`, `npm start`, `npm run worker:start`. Detailed local Compose/Atlas setup is in [DEPLOYMENT_RUNBOOK](docs/DEPLOYMENT_RUNBOOK.md). Readiness requires a writable replica primary; liveness alone does not establish transactional readiness.

Supported roles: AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. Institution membership and canonical student account linkage are independent of role labels. Backend checks current active accounts, scope and consent; a client route guard is only navigation UX.

Authentication uses a short-lived access JWT in memory plus an HttpOnly browser refresh cookie. No public signup, account directory, reset-password or MFA endpoint exists. Non-browser JSON auth exists separately. Access tokens expire after 600 seconds; refresh families have an absolute seven-day lifetime. A production deployment needs reviewed HTTPS, private authenticated database access, real operator key custody, distributed abuse controls and privacy policies.

## 2. Role and page mapping

All routes below begin `/api/v1`. `:id` means a saved internal ObjectId, never an APAAR identifier. See the complete catalog in section 3 for exact inputs and output schemas.

| Role / page | Actual endpoints and permissions |
|---|---|
| All roles — Login/account | POST `/auth/browser/csrf`, `/auth/browser/login`, `/auth/browser/refresh`, `/auth/browser/logout`; GET `/auth/me` |
| AICTE — National dashboard/analytics | GET `/analytics/national/overview`, `/analytics/enrolments/trends`, `/analytics/intake-utilization`, `/analytics/conflicts/summary`, `/analytics/uploads/summary` |
| AICTE — Institutions | GET/POST `/institutions`; GET/PATCH `/institutions/:id`; POST `/institutions/:id/memberships`; PATCH `/institutions/:id/memberships/:membershipId` |
| AICTE — Programs/offerings | GET/POST `/programs`; PATCH `/programs/:id`; POST `/offerings`; PATCH `/offerings/:id`; GET `/institutions/:id/offerings` |
| AICTE — Academic years | GET/POST `/academic-years`; PATCH `/academic-years/:id` (full code/start/end body) |
| AICTE — Approved intake/categories | GET/POST `/seat-categories`; PATCH `/seat-categories/:id`; POST `/intakes`; PATCH `/intakes/:id`; GET `/offerings/:id/capacity`, `/institutions/:id/intake-report` |
| AICTE — Quota rules | POST `/quota-rules`; GET `/offerings/:id/quota-rules`; PATCH `/quota-rules/:id/retire` |
| AICTE — Students | GET/POST `/students`; GET/PATCH `/students/:id`; GET `/students/:id/identity-status`; POST `/students/:id/apaar/link`, `/students/:id/verify-apaar`, `/students/:id/account-link` |
| AICTE — Enrolments | GET/POST `/enrolments`; GET/PATCH `/enrolments/:id`; GET `/enrolments/:id/history`; POST `/enrolments/:id/activate`, `/enrolments/:id/withdraw` |
| AICTE — Conflicts/investigations | GET `/conflicts`, `/conflicts/:id`, `/conflicts/:id/history`; PATCH `/conflicts/:id`; POST `/conflicts/:id/evidence`, `/conflicts/:id/resolve` |
| AICTE — Transfers | POST `/transfers`; GET `/transfers/:id`; POST `/transfers/:id/approve`, `/transfers/:id/reject` |
| AICTE — Reports/audit | GET/POST `/reports`; GET `/reports/prevalidation`, `/reports/:id`, `/reports/:id/download`, `/audit/events`, `/audit/integrity` |
| AICTE — Anomalies/quality/simulation | GET `/intelligence/anomalies`, `/intelligence/institutions/:id/health`, `/intelligence/institutions/:id/quality-score`; POST `/intelligence/policy-simulations` |
| AICTE — Print integration authorization | POST `/institutions/:id/certificate-print-authorization`; operator-reviewed authority reference/status/expiry, not government confirmation |
| Institution administrator — Print data | POST `/students/:id/certificate-print-data`; REDACTED default. FULL requires own active record, regulator print authorization and student consent. Structured data only, no degree/PDF issuance |
| Student — Print consent | POST `/enrolments/:id/certificate-print-consent`; POST `/enrolments/:id/certificate-print-consent/revoke`; own linked active enrolment; separate from employer consent |
| AICTE — Employer governance | POST `/verification/employers` for existing account authorization. Employer directory, account creation and onboarding UI APIs: **NOT IMPLEMENTED** |
| Institution administrator — Dashboard/intake | GET `/analytics/institutions/:id/overview`, `/analytics/intake-utilization`, `/analytics/enrolments/trends`, `/analytics/uploads/summary`, `/analytics/conflicts/summary`, `/institutions/:id/intake-report`, `/offerings/:id/capacity` with own institution scope |
| Institution administrator — Students/admissions | Student/enrolment CRUD and lifecycle routes above within own institution. Account linking and reviewed existingStudent attachment: regulator only |
| Institution administrator — Program offerings | GET `/institutions/:id/offerings`, `/programs`, `/academic-years`, `/seat-categories`, `/offerings/:id/quota-rules`. Create/change offering/intake/quota: **NOT IMPLEMENTED for this role** |
| Institution administrator — Uploads | GET `/uploads/template`; POST `/uploads/students`; GET `/uploads/:id`, `/uploads/:id/results`, `/uploads/:id/error-report`; POST `/uploads/:id/commit`, `/uploads/:id/retry` |
| Institution administrator — Conflict review | GET `/conflicts`, `/conflicts/:id`, `/conflicts/:id/history`; POST `/conflicts/:id/evidence` with own institution. Regulatory resolution/assignment unavailable |
| Institution administrator — Reports/quality | GET/POST `/reports`; GET `/reports/:id`, `/reports/:id/download`, `/reports/prevalidation`, `/audit/events`; GET `/intelligence/anomalies`, `/intelligence/institutions/:id/health`, `/intelligence/institutions/:id/quality-score` |
| Institution administrator — Own configuration | PATCH `/institutions/:id` excluding status; POST `/institutions/:id/memberships` only existing INSTITUTION_STAFF. No user provisioning API |
| Institution staff — Student records/admission submissions | Same scoped student/enrolment writer routes; no intake/approval/master mutations |
| Institution staff — Uploads | Same own-institution upload routes; worker rechecks active user/membership |
| Institution staff — Analytics/conflicts | Same own-institution analytics/intelligence and redacted conflict reads/evidence routes. Reports, audit admin, resolve and simulation denied |
| Student — Profile/account | GET `/auth/me`; GET `/students/:id`, `/students/:id/identity-status` for linked canonical student |
| Student — Own enrolments | GET `/enrolments/:id`, `/enrolments/:id/history` for known own IDs. A student enrolment listing or `/me/student` discovery endpoint: **NOT IMPLEMENTED**. Supply authorized IDs from onboarding; do not use institution directories |
| Student — Invitations/consents | POST `/verification/invitations`; GET `/consents/requests`, `/consents/history`; POST `/consents/:id/approve`, `/consents/:id/reject`, `/consents/:id/revoke` |
| Student — Credentials | POST `/credentials`; GET `/credentials/:id`; POST `/credentials/:id/revoke`. Credential list: **NOT IMPLEMENTED**; retain safe IDs, never persist bearer reference tokens |
| Employer — Pending requests/claims | POST `/verification/requests`; GET `/verification/requests`, `/verification/requests/:id/result` |
| Employer — Scanned references | POST `/credentials/verify`; GET `/credentials/:id` if bound. Public lookup, student enumeration, employer directory: **NOT IMPLEMENTED** |

Other unsupported actions: graduation/completion, certificate PDF printing, government submission, official APAAR verification, public QR verification, general transfer listing, upload job listing, WebSocket updates. Build polling and known-ID navigation only. NRI/OCI/FN seat pools remain separate from the new institution profile declarations nriStatus/ociStatus/foreignNationalStatus (YES/NO/UNKNOWN). These declarations do not grant seats or certify eligibility.

## 3. Complete API catalog

The following catalog is generated from the **102 actual Express method/path pairs**, attached Zod input schemas and reviewed service response projections. [OpenAPI 3.1](docs/openapi.yaml) is validated by SwaggerParser; generated types are in [shared/api-types.ts](shared/api-types.ts). Run `npm run api:generate` after changing routes, then `npm run api:check`.

Conventions: internal IDs are 24 hexadecimal characters; pagination defaults page=1/limit=20 and caps limit=100 unless the exact schema below says otherwise. Strict input objects reject unknown fields. Query parameters are URL encoded. Success normally uses `{success:true,message:"Success",data:...}`; downloads return raw JSON/CSV. Samples illustrate response shapes using synthetic values, not valid credentials or existing records. Use the schemas for optional fields and replace example resource IDs with IDs from your environment.

All protected calls require `Authorization: Bearer <accessToken>`; JSON mutations also need `Content-Type: application/json`. Browser auth alone uses `credentials:include`, exact browser-sent Origin, matching CSRF header/cookies as specified. All other calls use `credentials:omit`. Do not set Content-Type manually for multipart.

Common errors for each catalog entry: 401 UNAUTHENTICATED/INVALID_TOKEN, 403 FORBIDDEN, 404 NOT_FOUND (or concealed unavailable reference), 422 VALIDATION_ERROR, 429 RATE_LIMITED, 500 INTERNAL_SERVER_ERROR. Middleware can reject malformed JSON with 400, oversized requests with 413, bad CORS origins with 403 CORS_ORIGIN_DENIED, and unavailable services with 503. See section 10 for handling and family-specific errors. UI must never infer another student's existence from error differences.

<!-- API_CATALOG_START -->

### 1. GET `/api/health`

**Roles:** Public/session transport as described. **Scope:** Public service status; no student records.

**Headers:**

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "service": "satyaid-backend"
  }
}
```

**Response contract:** `{"type":"object","properties":{"service":{"const":"satyaid-backend"}},"required":["service"]}`. See `docs/openapi.yaml` operation `get_api_health` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 2. GET `/api/ready`

**Roles:** Public/session transport as described. **Scope:** Public service status; no student records.

**Headers:**

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "database": "ready"
  }
}
```

**Response contract:** `{"type":"object","properties":{"database":{"const":"ready"}},"required":["database"]}`. See `docs/openapi.yaml` operation `get_api_ready` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 3. GET `/api/v1/academic-years`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** All authenticated roles can read these bounded global master lists (first 100).

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"code":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","startsOn","endsOn","_id"]}}`. See `docs/openapi.yaml` operation `get_api_v1_academic_years` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 4. POST `/api/v1/academic-years`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "startsOn": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "endsOn": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "code",
    "startsOn",
    "endsOn"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "code": "Synthetic example",
    "startsOn": "2026-08-01T00:00:00Z",
    "endsOn": "2027-12-31T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"code":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","startsOn","endsOn","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_academic_years` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 5. PATCH `/api/v1/academic-years/{id}`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "startsOn": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "endsOn": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "code",
    "startsOn",
    "endsOn"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "code": "Synthetic example",
    "startsOn": "2026-08-01T00:00:00Z",
    "endsOn": "2027-12-31T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"code":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","startsOn","endsOn","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_academic_years_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 6. GET `/api/v1/analytics/conflicts/summary`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "observedAt": "2026-08-01T00:00:00Z",
    "filters": {},
    "applicableFilters": [],
    "items": []
  }
}
```

**Response contract:** `{"type":"object","properties":{"observedAt":{"type":"string","format":"date-time"},"filters":{"type":"object"},"applicableFilters":{"type":"array","items":{"type":"string"}},"items":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}}},"required":["observedAt","filters","applicableFilters","items"]}`. See `docs/openapi.yaml` operation `get_api_v1_analytics_conflicts_summary` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 7. GET `/api/v1/analytics/enrolments/trends`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "observedAt": "2026-08-01T00:00:00Z",
    "limit": 1,
    "note": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"object","properties":{"month":{"anyOf":[{"type":"string"},{"type":"null"}]},"status":{"type":"string"}},"required":["month","status"]},"count":{"type":"number"}},"required":["_id","count"]}},"observedAt":{"type":"string","format":"date-time"},"limit":{"type":"number"},"note":{"type":"string"}},"required":["items","observedAt","limit","note"]}`. See `docs/openapi.yaml` operation `get_api_v1_analytics_enrolments_trends` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 8. GET `/api/v1/analytics/institutions/{id}/overview`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "label": "Synthetic example",
    "observedAt": "2026-08-01T00:00:00Z",
    "approvedSeats": 1,
    "occupiedSeats": 1,
    "utilizationPercentage": 1,
    "uniqueStudents": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"label":{"type":"string"},"observedAt":{"type":"string","format":"date-time"},"filters":{"type":"object"},"consistency":{"type":"string"},"institutionSummary":{"anyOf":[{"type":"object","properties":{"pid":{"type":"string"},"name":{"type":"string"},"state":{"type":"string"},"status":{"type":"string"}},"required":["pid","name","state","status"]},{"type":"null"}]},"registeredInstitutions":{"type":"number"},"activeInstitutions":{"type":"number"},"offerings":{"type":"number"},"approvedBaseIntake":{"type":"number"},"approvedSupernumeraryIntake":{"type":"number"},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"availableSeats":{"type":"number"},"utilizationPercentage":{"type":"number"},"allocationBreakdown":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"approved":{"type":"number"},"occupied":{"type":"number"},"allocationCount":{"type":"number"}},"required":["_id","approved","occupied","allocationCount"]}},"activeReservations":{"type":"number"},"enrolmentsByStatus":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}},"uniqueStudents":{"type":"number"},"identityStatusDistribution":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}},"uploads":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"},"totalRows":{"type":"number"},"invalidRows":{"type":"number"},"committedRows":{"type":"number"}},"required":["_id","count","totalRows","invalidRows","committedRows"]}},"conflicts":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}},"openConflicts":{"type":"number"},"denominatorNotes":{"type":"object","additionalProperties":{"type":"string"}},"utilization":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string"}},"required":["offering","academicYear","category","kind"]},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"availableSeats":{"type":"number"},"utilizationPercentage":{"type":"number"}},"required":["_id","approvedSeats","occupiedSeats","availableSeats","utilizationPercentage"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"},"observedAt":{"type":"string","format":"date-time"}},"required":["items","total","page","limit","observedAt"]},"breakdownLimit":{"type":"number"}},"required":["label","observedAt","approvedSeats","occupiedSeats","utilizationPercentage","uniqueStudents"]}`. See `docs/openapi.yaml` operation `get_api_v1_analytics_institutions_id_overview` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 9. GET `/api/v1/analytics/intake-utilization`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1,
    "observedAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string"}},"required":["offering","academicYear","category","kind"]},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"availableSeats":{"type":"number"},"utilizationPercentage":{"type":"number"}},"required":["_id","approvedSeats","occupiedSeats","availableSeats","utilizationPercentage"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"},"observedAt":{"type":"string","format":"date-time"}},"required":["items","total","page","limit","observedAt"]}`. See `docs/openapi.yaml` operation `get_api_v1_analytics_intake_utilization` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 10. GET `/api/v1/analytics/national/overview`

**Roles:** AICTE_ADMIN. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "label": "Synthetic example",
    "observedAt": "2026-08-01T00:00:00Z",
    "approvedSeats": 1,
    "occupiedSeats": 1,
    "utilizationPercentage": 1,
    "uniqueStudents": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"label":{"type":"string"},"observedAt":{"type":"string","format":"date-time"},"filters":{"type":"object"},"consistency":{"type":"string"},"institutionSummary":{"anyOf":[{"type":"object","properties":{"pid":{"type":"string"},"name":{"type":"string"},"state":{"type":"string"},"status":{"type":"string"}},"required":["pid","name","state","status"]},{"type":"null"}]},"registeredInstitutions":{"type":"number"},"activeInstitutions":{"type":"number"},"offerings":{"type":"number"},"approvedBaseIntake":{"type":"number"},"approvedSupernumeraryIntake":{"type":"number"},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"availableSeats":{"type":"number"},"utilizationPercentage":{"type":"number"},"allocationBreakdown":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"approved":{"type":"number"},"occupied":{"type":"number"},"allocationCount":{"type":"number"}},"required":["_id","approved","occupied","allocationCount"]}},"activeReservations":{"type":"number"},"enrolmentsByStatus":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}},"uniqueStudents":{"type":"number"},"identityStatusDistribution":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}},"uploads":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"},"totalRows":{"type":"number"},"invalidRows":{"type":"number"},"committedRows":{"type":"number"}},"required":["_id","count","totalRows","invalidRows","committedRows"]}},"conflicts":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}},"openConflicts":{"type":"number"},"denominatorNotes":{"type":"object","additionalProperties":{"type":"string"}}},"required":["label","observedAt","approvedSeats","occupiedSeats","utilizationPercentage","uniqueStudents"]}`. See `docs/openapi.yaml` operation `get_api_v1_analytics_national_overview` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 11. GET `/api/v1/analytics/uploads/summary`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "observedAt": "2026-08-01T00:00:00Z",
    "filters": {},
    "applicableFilters": [],
    "items": []
  }
}
```

**Response contract:** `{"type":"object","properties":{"observedAt":{"type":"string","format":"date-time"},"filters":{"type":"object"},"applicableFilters":{"type":"array","items":{"type":"string"}},"items":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string"},"count":{"type":"number"}},"required":["_id","count"]}}},"required":["observedAt","filters","applicableFilters","items"]}`. See `docs/openapi.yaml` operation `get_api_v1_analytics_uploads_summary` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 12. GET `/api/v1/audit/events`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"actor":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"action":{"type":"string"},"resourceType":{"type":"string"},"resourceId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"actorRole":{"type":"string"},"occurredAt":{"type":"string","format":"date-time"},"outcome":{"type":"string","enum":["SUCCESS","DENIED","FAILED"]},"reasonCode":{"type":"string"},"correlationId":{"type":"string"},"integrityVersion":{"type":"string"},"integrityKeyVersion":{"type":"string"},"__v":{"type":"number"}},"required":["actor","action","resourceType","resourceId","_id","occurredAt","outcome"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_audit_events` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 13. GET `/api/v1/audit/integrity`

**Roles:** AICTE_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "checks": [],
    "checked": 1,
    "page": 1,
    "limit": 1,
    "guarantee": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"checks":{"type":"array","items":{"type":"object","properties":{"eventId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["VALID","INVALID","UNSIGNED","KEY_UNAVAILABLE"]}},"required":["eventId","status"]}},"checked":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"},"guarantee":{"type":"string"}},"required":["checks","checked","page","limit","guarantee"]}`. See `docs/openapi.yaml` operation `get_api_v1_audit_integrity` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 14. POST `/api/v1/auth/browser/csrf`

**Roles:** Public/session transport as described. **Scope:** Exact configured Origin; cookie/CSRF transport. csrf is bootstrap; login/refresh/logout require X-CSRF-Token.

**Headers:** Origin required. Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "csrfToken": "<runtime-token-only>",
    "expiresAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"csrfToken":{"type":"string"},"expiresAt":{"type":"string","format":"date-time"}},"required":["csrfToken","expiresAt"]}`. See `docs/openapi.yaml` operation `post_api_v1_auth_browser_csrf` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409. Use credentials include and latest CSRF nonce; no refresh token JSON.

### 15. POST `/api/v1/auth/browser/login`

**Roles:** Public/session transport as described. **Scope:** Exact configured Origin; cookie/CSRF transport. csrf is bootstrap; login/refresh/logout require X-CSRF-Token.

**Headers:** Origin required. X-CSRF-Token required. Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    },
    "password": {
      "type": "string",
      "minLength": 1,
      "maxLength": 72
    }
  },
  "required": [
    "email",
    "password"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "accessToken": "<runtime-token-only>",
    "expiresIn": 600,
    "tokenType": "Bearer",
    "csrfToken": "<runtime-token-only>",
    "sessionExpiresAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"accessToken":{"type":"string"},"expiresIn":{"const":600},"tokenType":{"const":"Bearer"},"csrfToken":{"type":"string"},"sessionExpiresAt":{"type":"string","format":"date-time"}},"required":["accessToken","expiresIn","tokenType","csrfToken","sessionExpiresAt"]}`. See `docs/openapi.yaml` operation `post_api_v1_auth_browser_login` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409. Use credentials include and latest CSRF nonce; no refresh token JSON.

### 16. POST `/api/v1/auth/browser/logout`

**Roles:** Public/session transport as described. **Scope:** Exact configured Origin; cookie/CSRF transport. csrf is bootstrap; login/refresh/logout require X-CSRF-Token.

**Headers:** Origin required. X-CSRF-Token required. Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": null
}
```

**Response contract:** `{"type":"null"}`. See `docs/openapi.yaml` operation `post_api_v1_auth_browser_logout` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409. Use credentials include and latest CSRF nonce; no refresh token JSON.

### 17. POST `/api/v1/auth/browser/refresh`

**Roles:** Public/session transport as described. **Scope:** Exact configured Origin; cookie/CSRF transport. csrf is bootstrap; login/refresh/logout require X-CSRF-Token.

**Headers:** Origin required. X-CSRF-Token required. Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "accessToken": "<runtime-token-only>",
    "expiresIn": 600,
    "tokenType": "Bearer",
    "csrfToken": "<runtime-token-only>",
    "sessionExpiresAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"accessToken":{"type":"string"},"expiresIn":{"const":600},"tokenType":{"const":"Bearer"},"csrfToken":{"type":"string"},"sessionExpiresAt":{"type":"string","format":"date-time"}},"required":["accessToken","expiresIn","tokenType","csrfToken","sessionExpiresAt"]}`. See `docs/openapi.yaml` operation `post_api_v1_auth_browser_refresh` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409. Use credentials include and latest CSRF nonce; no refresh token JSON.

### 18. POST `/api/v1/auth/login`

**Roles:** Public/session transport as described. **Scope:** Non-browser JSON transport: Origin and Sec-Fetch headers forbidden; browser refresh cookie forbidden.

**Headers:**  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    },
    "password": {
      "type": "string",
      "minLength": 1,
      "maxLength": 72
    }
  },
  "required": [
    "email",
    "password"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "accessToken": "<runtime-token-only>",
    "refreshToken": "<runtime-token-only>",
    "expiresIn": 600,
    "tokenType": "Bearer"
  }
}
```

**Response contract:** `{"type":"object","properties":{"accessToken":{"type":"string"},"refreshToken":{"type":"string"},"expiresIn":{"const":600},"tokenType":{"const":"Bearer"}},"required":["accessToken","refreshToken","expiresIn","tokenType"]}`. See `docs/openapi.yaml` operation `post_api_v1_auth_login` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 19. POST `/api/v1/auth/logout`

**Roles:** Public/session transport as described. **Scope:** Non-browser JSON transport: Origin and Sec-Fetch headers forbidden; browser refresh cookie forbidden.

**Headers:**  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "refreshToken": {
      "type": "string",
      "minLength": 32,
      "maxLength": 256
    }
  },
  "required": [
    "refreshToken"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": null
}
```

**Response contract:** `{"type":"null"}`. See `docs/openapi.yaml` operation `post_api_v1_auth_logout` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 20. GET `/api/v1/auth/me`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** Current active account only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "_id": "000000000000000000000001",
    "email": "synthetic@example.invalid",
    "role": "AICTE_ADMIN"
  }
}
```

**Response contract:** `{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"email":{"type":"string","format":"email"},"role":{"type":"string","enum":["AICTE_ADMIN","INSTITUTION_ADMIN","INSTITUTION_STAFF","STUDENT","EMPLOYER"]}},"required":["_id","email","role"]}`. See `docs/openapi.yaml` operation `get_api_v1_auth_me` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 21. POST `/api/v1/auth/refresh`

**Roles:** Public/session transport as described. **Scope:** Non-browser JSON transport: Origin and Sec-Fetch headers forbidden; browser refresh cookie forbidden.

**Headers:**  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "refreshToken": {
      "type": "string",
      "minLength": 32,
      "maxLength": 256
    }
  },
  "required": [
    "refreshToken"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "accessToken": "<runtime-token-only>",
    "refreshToken": "<runtime-token-only>",
    "expiresIn": 600,
    "tokenType": "Bearer"
  }
}
```

**Response contract:** `{"type":"object","properties":{"accessToken":{"type":"string"},"refreshToken":{"type":"string"},"expiresIn":{"const":600},"tokenType":{"const":"Bearer"}},"required":["accessToken","refreshToken","expiresIn","tokenType"]}`. See `docs/openapi.yaml` operation `post_api_v1_auth_refresh` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, CSRF_INVALID, BROWSER_ORIGIN_DENIED, BROWSER_TRANSPORT_REQUIRED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 22. GET `/api/v1/conflicts`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  {
    "name": "status",
    "required": false,
    "schema": {
      "type": "string",
      "enum": [
        "OPEN",
        "UNDER_REVIEW",
        "AWAITING_EVIDENCE",
        "RESOLVED",
        "DISMISSED",
        "ESCALATED"
      ]
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"firstEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"secondEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutions":{"type":"array","items":{"type":"string"}},"ruleCode":{"type":"string"},"status":{"type":"string","enum":["OPEN","UNDER_REVIEW","AWAITING_EVIDENCE","RESOLVED","DISMISSED","ESCALATED"]},"resolution":{"type":"string"},"reasonCode":{"type":"string"},"assignedReviewer":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"severity":{"type":"string","enum":["WARNING","HIGH"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"},"explanation":{"type":"string"}},"required":["student","firstEnrolment","secondEnrolment","ruleCode","status","severity","version","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"ruleCode":{"type":"string"},"status":{"type":"string"},"severity":{"type":"string"},"resolution":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"version":{"type":"number"},"explanation":{"type":"string"}},"required":["_id","ruleCode","status","severity","version","explanation"]}]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_conflicts` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 23. GET `/api/v1/conflicts/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "firstEnrolment": "000000000000000000000001",
    "secondEnrolment": "000000000000000000000001",
    "ruleCode": "Synthetic example",
    "status": "OPEN",
    "severity": "WARNING",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"firstEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"secondEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutions":{"type":"array","items":{"type":"string"}},"ruleCode":{"type":"string"},"status":{"type":"string","enum":["OPEN","UNDER_REVIEW","AWAITING_EVIDENCE","RESOLVED","DISMISSED","ESCALATED"]},"resolution":{"type":"string"},"reasonCode":{"type":"string"},"assignedReviewer":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"severity":{"type":"string","enum":["WARNING","HIGH"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"},"explanation":{"type":"string"}},"required":["student","firstEnrolment","secondEnrolment","ruleCode","status","severity","version","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"ruleCode":{"type":"string"},"status":{"type":"string"},"severity":{"type":"string"},"resolution":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"version":{"type":"number"},"explanation":{"type":"string"}},"required":["_id","ruleCode","status","severity","version","explanation"]}]}`. See `docs/openapi.yaml` operation `get_api_v1_conflicts_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 24. PATCH `/api/v1/conflicts/{id}`

**Roles:** AICTE_ADMIN. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "UNDER_REVIEW",
        "AWAITING_EVIDENCE",
        "ESCALATED"
      ]
    },
    "assignedReviewer": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "version": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "status",
    "version"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "firstEnrolment": "000000000000000000000001",
    "secondEnrolment": "000000000000000000000001",
    "ruleCode": "Synthetic example",
    "status": "OPEN",
    "severity": "WARNING",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"firstEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"secondEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutions":{"type":"array","items":{"type":"string"}},"ruleCode":{"type":"string"},"status":{"type":"string","enum":["OPEN","UNDER_REVIEW","AWAITING_EVIDENCE","RESOLVED","DISMISSED","ESCALATED"]},"resolution":{"type":"string"},"reasonCode":{"type":"string"},"assignedReviewer":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"severity":{"type":"string","enum":["WARNING","HIGH"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"},"explanation":{"type":"string"}},"required":["student","firstEnrolment","secondEnrolment","ruleCode","status","severity","version","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"ruleCode":{"type":"string"},"status":{"type":"string"},"severity":{"type":"string"},"resolution":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"version":{"type":"number"},"explanation":{"type":"string"}},"required":["_id","ruleCode","status","severity","version","explanation"]}]}`. See `docs/openapi.yaml` operation `patch_api_v1_conflicts_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 25. POST `/api/v1/conflicts/{id}/evidence`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "typeCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "protectedObjectReference": {
      "type": "string",
      "pattern": "^evidence:[a-zA-Z0-9_.-]{1,100}$"
    }
  },
  "required": [
    "typeCode",
    "protectedObjectReference"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "_id": "000000000000000000000001",
    "recorded": true
  }
}
```

**Response contract:** `{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"recorded":{"const":true}},"required":["_id","recorded"]}`. See `docs/openapi.yaml` operation `post_api_v1_conflicts_id_evidence` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 26. GET `/api/v1/conflicts/{id}/history`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"conflict":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"actor":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"action":{"type":"string"},"reasonCode":{"type":"string"},"resolution":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["conflict","actor","action","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"action":{"type":"string"},"resolution":{"type":"string"},"createdAt":{"type":"string","format":"date-time"}},"required":["action","createdAt"]}]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_conflicts_id_history` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 27. POST `/api/v1/conflicts/{id}/resolve`

**Roles:** AICTE_ADMIN. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "resolution": {
      "type": "string",
      "enum": [
        "CONFIRMED_TRANSFER",
        "LEGITIMATE_OVERLAP",
        "DUPLICATE_SUBMISSION",
        "DATA_ENTRY_ERROR",
        "POLICY_VIOLATION_CONFIRMED",
        "INSUFFICIENT_EVIDENCE"
      ]
    },
    "reasonCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "version": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "resolution",
    "reasonCode",
    "version"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "firstEnrolment": "000000000000000000000001",
    "secondEnrolment": "000000000000000000000001",
    "ruleCode": "Synthetic example",
    "status": "OPEN",
    "severity": "WARNING",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"firstEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"secondEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutions":{"type":"array","items":{"type":"string"}},"ruleCode":{"type":"string"},"status":{"type":"string","enum":["OPEN","UNDER_REVIEW","AWAITING_EVIDENCE","RESOLVED","DISMISSED","ESCALATED"]},"resolution":{"type":"string"},"reasonCode":{"type":"string"},"assignedReviewer":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"severity":{"type":"string","enum":["WARNING","HIGH"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"},"explanation":{"type":"string"}},"required":["student","firstEnrolment","secondEnrolment","ruleCode","status","severity","version","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"ruleCode":{"type":"string"},"status":{"type":"string"},"severity":{"type":"string"},"resolution":{"type":"string"},"createdAt":{"type":"string","format":"date-time"},"version":{"type":"number"},"explanation":{"type":"string"}},"required":["_id","ruleCode","status","severity","version","explanation"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_conflicts_id_resolve` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CONFLICT_STATE_CHANGED, INVALID_REVIEWER. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 28. POST `/api/v1/consents/{id}/approve`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "claims": {
      "minItems": 1,
      "maxItems": 6,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "INSTITUTION",
          "PROGRAM",
          "ENROLMENT_STATUS",
          "ACADEMIC_YEAR",
          "START_DATE",
          "ADMISSION_DATE"
        ]
      }
    },
    "expiresInSeconds": {
      "default": 3600,
      "type": "integer",
      "minimum": 60,
      "maximum": 2592000
    }
  },
  "required": [
    "claims"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "consentRequestId": "000000000000000000000001",
    "requestId": "000000000000000000000001",
    "status": "Synthetic example",
    "authorizedClaims": [],
    "consentExpiresAt": "2026-08-01T00:00:00Z",
    "revokedAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"consentRequestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"requestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"authorizedClaims":{"type":"array","items":{"type":"string"}},"consentExpiresAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"revokedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}},"required":["consentRequestId","requestId","status","authorizedClaims","consentExpiresAt","revokedAt"]},{"type":"object","properties":{"status":{"const":"REVOKED"}},"required":["status"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_consents_id_approve` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 29. POST `/api/v1/consents/{id}/reject`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "consentRequestId": "000000000000000000000001",
    "requestId": "000000000000000000000001",
    "status": "Synthetic example",
    "authorizedClaims": [],
    "consentExpiresAt": "2026-08-01T00:00:00Z",
    "revokedAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"consentRequestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"requestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"authorizedClaims":{"type":"array","items":{"type":"string"}},"consentExpiresAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"revokedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}},"required":["consentRequestId","requestId","status","authorizedClaims","consentExpiresAt","revokedAt"]},{"type":"object","properties":{"status":{"const":"REVOKED"}},"required":["status"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_consents_id_reject` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 30. POST `/api/v1/consents/{id}/revoke`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "consentRequestId": "000000000000000000000001",
    "requestId": "000000000000000000000001",
    "status": "Synthetic example",
    "authorizedClaims": [],
    "consentExpiresAt": "2026-08-01T00:00:00Z",
    "revokedAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"consentRequestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"requestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"authorizedClaims":{"type":"array","items":{"type":"string"}},"consentExpiresAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"revokedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]}},"required":["consentRequestId","requestId","status","authorizedClaims","consentExpiresAt","revokedAt"]},{"type":"object","properties":{"status":{"const":"REVOKED"}},"required":["status"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_consents_id_revoke` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 31. GET `/api/v1/consents/history`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"request":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"eventCode":{"type":"string"},"claimTypes":{"type":"array","items":{"type":"string"}},"outcome":{"type":"string","enum":["SUCCESS","DENIED"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"}},"required":["request","eventCode","outcome","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_consents_history` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 32. GET `/api/v1/consents/requests`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"consentRequestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"authorizedClaims":{"type":"array","items":{"type":"string"}},"consentExpiresAt":{"type":"string","format":"date-time"},"revokedAt":{"type":"string","format":"date-time"},"purposeCode":{"type":"string"},"requestedClaims":{"type":"array","items":{"type":"string"}},"expiresAt":{"type":"string","format":"date-time"},"enrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"employerOrganization":{"type":"string"}},"required":["_id","consentRequestId","status","authorizedClaims","purposeCode","requestedClaims","expiresAt","enrolment"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_consents_requests` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 33. POST `/api/v1/credentials`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "request": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "claims": {
      "minItems": 1,
      "maxItems": 6,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "INSTITUTION",
          "PROGRAM",
          "ENROLMENT_STATUS",
          "ACADEMIC_YEAR",
          "START_DATE",
          "ADMISSION_DATE"
        ]
      }
    },
    "expiresInSeconds": {
      "default": 3600,
      "type": "integer",
      "minimum": 60,
      "maximum": 2592000
    }
  },
  "required": [
    "request"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "credentialId": "000000000000000000000001",
    "expiresAt": "2026-08-01T00:00:00Z",
    "token": "<runtime-token-only>",
    "qrReference": "Synthetic example",
    "source": "Synthetic example",
    "governmentCertified": false,
    "notice": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"credentialId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"expiresAt":{"type":"string","format":"date-time"},"token":{"type":"string"},"qrReference":{"type":"string"},"source":{"type":"string"},"governmentCertified":{"const":false},"notice":{"type":"string"}},"required":["credentialId","expiresAt","token","qrReference","source","governmentCertified","notice"]}`. See `docs/openapi.yaml` operation `post_api_v1_credentials` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 34. GET `/api/v1/credentials/{id}`

**Roles:** STUDENT, EMPLOYER. **Scope:** Owning linked student or bound approved employer; metadata only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "credentialId": "000000000000000000000001",
    "claimTypes": [],
    "expiresAt": "2026-08-01T00:00:00Z",
    "revoked": false,
    "expired": false,
    "source": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"credentialId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"claimTypes":{"type":"array","items":{"type":"string"}},"expiresAt":{"type":"string","format":"date-time"},"revoked":{"type":"boolean"},"expired":{"type":"boolean"},"source":{"type":"string"}},"required":["credentialId","claimTypes","expiresAt","revoked","expired","source"]}`. See `docs/openapi.yaml` operation `get_api_v1_credentials_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 35. POST `/api/v1/credentials/{id}/revoke`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "revoked": true
  }
}
```

**Response contract:** `{"type":"object","properties":{"revoked":{"const":true}},"required":["revoked"]}`. See `docs/openapi.yaml` operation `post_api_v1_credentials_id_revoke` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 36. POST `/api/v1/credentials/verify`

**Roles:** EMPLOYER. **Scope:** Active account and APPROVED employer profile; employer-bound invitation/request/credential only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "token": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{64}$"
    }
  },
  "required": [
    "token"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "credentialId": "000000000000000000000001",
    "claims": {},
    "source": "Synthetic example",
    "governmentCertified": false,
    "observedAt": "2026-08-01T00:00:00Z",
    "expiresAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"credentialId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"claims":{"type":"object","properties":{"INSTITUTION":{"type":"object","properties":{"name":{"type":"string"},"pid":{"type":"string"}},"required":["name","pid"]},"PROGRAM":{"type":"object","properties":{"name":{"type":"string"},"code":{"type":"string"}},"required":["name","code"]},"ENROLMENT_STATUS":{"type":"string"},"ACADEMIC_YEAR":{"type":"string"},"START_DATE":{"type":"string","format":"date"},"ADMISSION_DATE":{"type":"string","format":"date"}},"required":[]},"source":{"type":"string"},"governmentCertified":{"const":false},"observedAt":{"type":"string","format":"date-time"},"expiresAt":{"type":"string","format":"date-time"}},"required":["credentialId","claims","source","governmentCertified","observedAt","expiresAt"]}`. See `docs/openapi.yaml` operation `post_api_v1_credentials_verify` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 37. GET `/api/v1/enrolments`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "status",
    "required": false,
    "schema": {
      "type": "string",
      "enum": [
        "DRAFT",
        "PENDING_VALIDATION",
        "ACTIVE",
        "UNDER_REVIEW",
        "TRANSFERRED",
        "WITHDRAWN",
        "COMPLETED",
        "REJECTED"
      ]
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"allocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["DRAFT","PENDING_VALIDATION","ACTIVE","UNDER_REVIEW","TRANSFERRED","WITHDRAWN","COMPLETED","REJECTED","ACCEPTED"]},"admissionDate":{"type":"string","format":"date-time"},"institutionStudentId":{"type":"string"},"entryType":{"type":"string","enum":["REGULAR","LATERAL_ENTRY","TRANSFER"]},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"transferFrom":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","allocation","status","entryType","version","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_enrolments` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 38. POST `/api/v1/enrolments`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "student": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "allocation": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "institutionStudentId": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "admissionDate": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "startsOn": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "endsOn": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "entryType": {
      "default": "REGULAR",
      "type": "string",
      "enum": [
        "REGULAR",
        "LATERAL_ENTRY",
        "TRANSFER"
      ]
    },
    "idempotencyKey": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    }
  },
  "required": [
    "student",
    "allocation",
    "institutionStudentId",
    "admissionDate",
    "startsOn",
    "idempotencyKey"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "allocation": "000000000000000000000001",
    "status": "DRAFT",
    "entryType": "REGULAR",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"allocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["DRAFT","PENDING_VALIDATION","ACTIVE","UNDER_REVIEW","TRANSFERRED","WITHDRAWN","COMPLETED","REJECTED","ACCEPTED"]},"admissionDate":{"type":"string","format":"date-time"},"institutionStudentId":{"type":"string"},"entryType":{"type":"string","enum":["REGULAR","LATERAL_ENTRY","TRANSFER"]},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"transferFrom":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","allocation","status","entryType","version","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_enrolments` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 39. GET `/api/v1/enrolments/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT. **Scope:** Regulator, owning linked student, or writer with active institution membership and association. Student read requires institution query for institutional callers.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "allocation": "000000000000000000000001",
    "status": "DRAFT",
    "entryType": "REGULAR",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"allocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["DRAFT","PENDING_VALIDATION","ACTIVE","UNDER_REVIEW","TRANSFERRED","WITHDRAWN","COMPLETED","REJECTED","ACCEPTED"]},"admissionDate":{"type":"string","format":"date-time"},"institutionStudentId":{"type":"string"},"entryType":{"type":"string","enum":["REGULAR","LATERAL_ENTRY","TRANSFER"]},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"transferFrom":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","allocation","status","entryType","version","_id"]}`. See `docs/openapi.yaml` operation `get_api_v1_enrolments_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 40. PATCH `/api/v1/enrolments/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "endsOn": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "status": {
      "type": "string",
      "enum": [
        "PENDING_VALIDATION",
        "UNDER_REVIEW",
        "REJECTED"
      ]
    },
    "reasonCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "version": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "reasonCode",
    "version"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "allocation": "000000000000000000000001",
    "status": "DRAFT",
    "entryType": "REGULAR",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"allocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["DRAFT","PENDING_VALIDATION","ACTIVE","UNDER_REVIEW","TRANSFERRED","WITHDRAWN","COMPLETED","REJECTED","ACCEPTED"]},"admissionDate":{"type":"string","format":"date-time"},"institutionStudentId":{"type":"string"},"entryType":{"type":"string","enum":["REGULAR","LATERAL_ENTRY","TRANSFER"]},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"transferFrom":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","allocation","status","entryType","version","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_enrolments_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 41. POST `/api/v1/enrolments/{id}/activate`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "allocation": "000000000000000000000001",
    "status": "DRAFT",
    "entryType": "REGULAR",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"allocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["DRAFT","PENDING_VALIDATION","ACTIVE","UNDER_REVIEW","TRANSFERRED","WITHDRAWN","COMPLETED","REJECTED","ACCEPTED"]},"admissionDate":{"type":"string","format":"date-time"},"institutionStudentId":{"type":"string"},"entryType":{"type":"string","enum":["REGULAR","LATERAL_ENTRY","TRANSFER"]},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"transferFrom":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","allocation","status","entryType","version","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_enrolments_id_activate` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 42. POST `/api/v1/enrolments/{id}/certificate-print-consent`

**Roles:** STUDENT. **Scope:** Owning active linked STUDENT only; grant for ACTIVE enrolment, expiry up to86400sec; revoke all own grants for enrolment, history retained.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "expiresInSeconds": {
      "default": 900,
      "type": "integer",
      "minimum": 60,
      "maximum": 86400
    }
  },
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "consentId": "000000000000000000000001",
    "enrolment": "000000000000000000000001",
    "institution": "000000000000000000000001",
    "expiresAt": "2026-08-01T00:00:00Z",
    "purpose": "CERTIFICATE_PRINT_PREPARATION",
    "notice": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"consentId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"enrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"expiresAt":{"type":"string","format":"date-time"},"purpose":{"const":"CERTIFICATE_PRINT_PREPARATION"},"notice":{"type":"string"}},"required":["consentId","enrolment","institution","expiresAt","purpose","notice"]}`. See `docs/openapi.yaml` operation `post_api_v1_enrolments_id_certificate_print_consent` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus PRINT_RECORD_UNAVAILABLE, PRINT_AUTHORIZATION_REQUIRED, PRINT_CONSENT_REQUIRED, IDENTITY_NOT_LINKED, IDENTITY_KEY_VERSION_UNAVAILABLE, IDENTITY_DECRYPTION_FAILED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 43. POST `/api/v1/enrolments/{id}/certificate-print-consent/revoke`

**Roles:** STUDENT. **Scope:** Owning active linked STUDENT only; grant for ACTIVE enrolment, expiry up to86400sec; revoke all own grants for enrolment, history retained.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "revoked": true
  }
}
```

**Response contract:** `{"type":"object","properties":{"revoked":{"const":true}},"required":["revoked"]}`. See `docs/openapi.yaml` operation `post_api_v1_enrolments_id_certificate_print_consent_revoke` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus PRINT_RECORD_UNAVAILABLE, PRINT_AUTHORIZATION_REQUIRED, PRINT_CONSENT_REQUIRED, IDENTITY_NOT_LINKED, IDENTITY_KEY_VERSION_UNAVAILABLE, IDENTITY_DECRYPTION_FAILED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 44. GET `/api/v1/enrolments/{id}/history`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT. **Scope:** Regulator, owning linked student, or writer with active institution membership and association. Student read requires institution query for institutional callers.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"enrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"actor":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"fromStatus":{"type":"string"},"toStatus":{"type":"string"},"reasonCode":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["enrolment","actor","toStatus","reasonCode","_id"]}}`. See `docs/openapi.yaml` operation `get_api_v1_enrolments_id_history` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 45. POST `/api/v1/enrolments/{id}/withdraw`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "allocation": "000000000000000000000001",
    "status": "DRAFT",
    "entryType": "REGULAR",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"allocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["DRAFT","PENDING_VALIDATION","ACTIVE","UNDER_REVIEW","TRANSFERRED","WITHDRAWN","COMPLETED","REJECTED","ACCEPTED"]},"admissionDate":{"type":"string","format":"date-time"},"institutionStudentId":{"type":"string"},"entryType":{"type":"string","enum":["REGULAR","LATERAL_ENTRY","TRANSFER"]},"startsOn":{"type":"string","format":"date-time"},"endsOn":{"type":"string","format":"date-time"},"transferFrom":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","allocation","status","entryType","version","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_enrolments_id_withdraw` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 46. GET `/api/v1/institutions`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** AICTE or active institution membership; institution list returns own memberships for non-regulators.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  {
    "name": "status",
    "required": false,
    "schema": {
      "type": "string",
      "enum": [
        "ACTIVE",
        "INACTIVE"
      ]
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "search",
    "required": false,
    "schema": {
      "type": "string",
      "maxLength": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"pid":{"type":"string"},"name":{"type":"string"},"state":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["pid","name","state","status","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_institutions` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 47. POST `/api/v1/institutions`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "pid": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "state": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "status": {
      "default": "ACTIVE",
      "type": "string",
      "enum": [
        "ACTIVE",
        "INACTIVE"
      ]
    }
  },
  "required": [
    "pid",
    "name",
    "state"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "pid": "Synthetic example",
    "name": "Synthetic example",
    "state": "Synthetic example",
    "status": "ACTIVE",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"pid":{"type":"string"},"name":{"type":"string"},"state":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["pid","name","state","status","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_institutions` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 48. GET `/api/v1/institutions/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** AICTE or active institution membership; institution list returns own memberships for non-regulators.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "pid": "Synthetic example",
    "name": "Synthetic example",
    "state": "Synthetic example",
    "status": "ACTIVE",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"pid":{"type":"string"},"name":{"type":"string"},"state":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["pid","name","state","status","_id"]}`. See `docs/openapi.yaml` operation `get_api_v1_institutions_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 49. PATCH `/api/v1/institutions/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE or active own institution admin membership. Only AICTE changes institution status or appoints admins; staff accounts must already exist.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "state": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "status": {
      "default": "ACTIVE",
      "type": "string",
      "enum": [
        "ACTIVE",
        "INACTIVE"
      ]
    }
  },
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "pid": "Synthetic example",
    "name": "Synthetic example",
    "state": "Synthetic example",
    "status": "ACTIVE",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"pid":{"type":"string"},"name":{"type":"string"},"state":{"type":"string"},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["pid","name","state","status","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_institutions_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 50. POST `/api/v1/institutions/{id}/certificate-print-authorization`

**Roles:** AICTE_ADMIN. **Scope:** AICTE operator-reviewed institution print permission only; degree-awarding powers are not independently validated.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "APPROVED",
        "SUSPENDED"
      ]
    },
    "authorityReference": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "expiresAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "status",
    "authorityReference",
    "expiresAt"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "authorizationId": "000000000000000000000001",
    "institution": "000000000000000000000001",
    "status": "APPROVED",
    "expiresAt": "2026-08-01T00:00:00Z",
    "authorityReference": "Synthetic example",
    "degreeAwardingStatus": "NOT_INDEPENDENTLY_VERIFIED",
    "notice": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"authorizationId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["APPROVED","SUSPENDED"]},"expiresAt":{"type":"string","format":"date-time"},"authorityReference":{"type":"string"},"degreeAwardingStatus":{"const":"NOT_INDEPENDENTLY_VERIFIED"},"notice":{"type":"string"}},"required":["authorizationId","institution","status","expiresAt","authorityReference","degreeAwardingStatus","notice"]}`. See `docs/openapi.yaml` operation `post_api_v1_institutions_id_certificate_print_authorization` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus PRINT_RECORD_UNAVAILABLE, PRINT_AUTHORIZATION_REQUIRED, PRINT_CONSENT_REQUIRED, IDENTITY_NOT_LINKED, IDENTITY_KEY_VERSION_UNAVAILABLE, IDENTITY_DECRYPTION_FAILED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 51. GET `/api/v1/institutions/{id}/intake-report`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** AICTE or active institution membership; institution list returns own memberships for non-regulators.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "academicYear",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"baseSeats":{"type":"number"},"allocations":{"type":"array","items":{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"sourceReference":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"},"availableSeats":{"type":"number"}},"required":["offering","academicYear","category","kind","approvedSeats","occupiedSeats","sourceReference","version","_id"]}},"configuredQuotas":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string"},"seats":{"type":"number"}},"required":["ruleId","category","kind","seats"]}},"note":{"type":"string"}},"required":["offering","academicYear","baseSeats","allocations","configuredQuotas","note"]}}`. See `docs/openapi.yaml` operation `get_api_v1_institutions_id_intake_report` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 52. POST `/api/v1/institutions/{id}/memberships`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE or active own institution admin membership. Only AICTE changes institution status or appoints admins; staff accounts must already exist.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "role": {
      "type": "string",
      "enum": [
        "INSTITUTION_ADMIN",
        "INSTITUTION_STAFF"
      ]
    },
    "active": {
      "default": true,
      "type": "boolean"
    }
  },
  "required": [
    "user",
    "role"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "user": "000000000000000000000001",
    "role": "INSTITUTION_ADMIN",
    "active": false,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"user":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"role":{"type":"string","enum":["INSTITUTION_ADMIN","INSTITUTION_STAFF"]},"active":{"type":"boolean"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["institution","user","role","active","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_institutions_id_memberships` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 53. PATCH `/api/v1/institutions/{id}/memberships/{membershipId}`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "active": {
      "type": "boolean"
    }
  },
  "required": [
    "active"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "user": "000000000000000000000001",
    "role": "INSTITUTION_ADMIN",
    "active": false,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"user":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"role":{"type":"string","enum":["INSTITUTION_ADMIN","INSTITUTION_STAFF"]},"active":{"type":"boolean"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["institution","user","role","active","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_institutions_id_memberships_membershipId_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 54. GET `/api/v1/institutions/{id}/offerings`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** AICTE or active institution membership; institution list returns own memberships for non-regulators.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"program":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"active":{"type":"boolean"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["institution","program","active","_id"]}}`. See `docs/openapi.yaml` operation `get_api_v1_institutions_id_offerings` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 55. POST `/api/v1/intakes`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "offering": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "academicYear": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "category": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "kind": {
      "type": "string",
      "enum": [
        "BASE",
        "SUPERNUMERARY"
      ]
    },
    "approvedSeats": {
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "sourceReference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "offering",
    "academicYear",
    "category",
    "kind",
    "approvedSeats",
    "sourceReference"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "offering": "000000000000000000000001",
    "academicYear": "000000000000000000000001",
    "category": "000000000000000000000001",
    "kind": "BASE",
    "approvedSeats": 1,
    "occupiedSeats": 1,
    "sourceReference": "Synthetic example",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"sourceReference":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["offering","academicYear","category","kind","approvedSeats","occupiedSeats","sourceReference","version","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_intakes` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 56. PATCH `/api/v1/intakes/{id}`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "approvedSeats": {
      "type": "integer",
      "minimum": 0,
      "maximum": 1000000
    },
    "sourceReference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "approvedSeats",
    "sourceReference"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "offering": "000000000000000000000001",
    "academicYear": "000000000000000000000001",
    "category": "000000000000000000000001",
    "kind": "BASE",
    "approvedSeats": 1,
    "occupiedSeats": 1,
    "sourceReference": "Synthetic example",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"sourceReference":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["offering","academicYear","category","kind","approvedSeats","occupiedSeats","sourceReference","version","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_intakes_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 57. GET `/api/v1/intelligence/anomalies`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "version": "Synthetic example",
    "alerts": [],
    "observedAt": "2026-08-01T00:00:00Z",
    "filters": {},
    "dataSource": "Synthetic example",
    "coverage": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"version":{"type":"string"},"alerts":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string"},"severity":{"type":"string"},"explanation":{"type":"string"},"evidence":{"type":"object","additionalProperties":true},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"window":{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"}},"required":["from","to"]},"recommendedAction":{"type":"string"}},"required":["ruleId","severity","explanation","evidence","institution","academicYear","window","recommendedAction"]}},"observedAt":{"type":"string","format":"date-time"},"filters":{"type":"object"},"dataSource":{"type":"string"},"coverage":{"type":"string"}},"required":["version","alerts","observedAt","filters","dataSource","coverage"]}`. See `docs/openapi.yaml` operation `get_api_v1_intelligence_anomalies` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_ACADEMIC_YEAR, SIMULATION_PERIOD_INVALID, SIMULATION_SCOPE_TOO_LARGE. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 58. GET `/api/v1/intelligence/institutions/{id}/health`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "academicYear",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "academicYear": "000000000000000000000001",
    "observation": "Synthetic example",
    "anomalies": {
      "version": "Synthetic example",
      "alerts": [],
      "observedAt": "2026-08-01T00:00:00Z",
      "filters": {},
      "dataSource": "Synthetic example",
      "coverage": "Synthetic example"
    },
    "quality": {
      "calculationVersion": "Synthetic example",
      "label": "Synthetic example",
      "score": 1,
      "insufficientData": false,
      "reasons": [],
      "components": [],
      "minimumObservations": "Synthetic example"
    },
    "prevalidation": {
      "findings": [],
      "truncated": false,
      "detailLimit": 1,
      "observedAt": "2026-08-01T00:00:00Z",
      "ruleVersion": "Synthetic example",
      "definition": "Synthetic example",
      "coverage": "Synthetic example"
    }
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"observation":{"type":"string"},"anomalies":{"type":"object","properties":{"version":{"type":"string"},"alerts":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string"},"severity":{"type":"string"},"explanation":{"type":"string"},"evidence":{"type":"object","additionalProperties":true},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"window":{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"}},"required":["from","to"]},"recommendedAction":{"type":"string"}},"required":["ruleId","severity","explanation","evidence","institution","academicYear","window","recommendedAction"]}},"observedAt":{"type":"string","format":"date-time"},"filters":{"type":"object"},"dataSource":{"type":"string"},"coverage":{"type":"string"}},"required":["version","alerts","observedAt","filters","dataSource","coverage"]},"quality":{"type":"object","properties":{"calculationVersion":{"type":"string"},"label":{"type":"string"},"score":{"anyOf":[{"type":"number"},{"type":"null"}]},"insufficientData":{"type":"boolean"},"reasons":{"type":"array","items":{"type":"string"}},"components":{"type":"array","items":{"type":"object","properties":{"dimension":{"type":"string"},"weight":{"type":"number"},"score":{"anyOf":[{"type":"number"},{"type":"null"}]},"numerator":{"type":"number"},"denominator":{"type":"number"}},"required":["dimension","weight","score","numerator","denominator"]}},"minimumObservations":{"type":"string"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"observedAt":{"type":"string","format":"date-time"},"coverage":{"type":"object"}},"required":["calculationVersion","label","score","insufficientData","reasons","components","minimumObservations"]},"prevalidation":{"type":"object","properties":{"findings":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string"},"severity":{"type":"string"},"explanation":{"type":"string"},"affectedReference":{"type":"string"},"evidenceCategory":{"type":"string"},"recommendedAction":{"type":"string"}},"required":["ruleId","severity","explanation","affectedReference","evidenceCategory","recommendedAction"]}},"truncated":{"type":"boolean"},"detailLimit":{"type":"number"},"observedAt":{"type":"string","format":"date-time"},"ruleVersion":{"type":"string"},"definition":{"type":"string"},"coverage":{"type":"string"}},"required":["findings","truncated","detailLimit","observedAt","ruleVersion","definition","coverage"]}},"required":["institution","academicYear","observation","anomalies","quality","prevalidation"]}`. See `docs/openapi.yaml` operation `get_api_v1_intelligence_institutions_id_health` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_ACADEMIC_YEAR, SIMULATION_PERIOD_INVALID, SIMULATION_SCOPE_TOO_LARGE. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 59. GET `/api/v1/intelligence/institutions/{id}/quality-score`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "academicYear",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "calculationVersion": "Synthetic example",
    "label": "Synthetic example",
    "score": 1,
    "insufficientData": false,
    "reasons": [],
    "components": [],
    "minimumObservations": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"calculationVersion":{"type":"string"},"label":{"type":"string"},"score":{"anyOf":[{"type":"number"},{"type":"null"}]},"insufficientData":{"type":"boolean"},"reasons":{"type":"array","items":{"type":"string"}},"components":{"type":"array","items":{"type":"object","properties":{"dimension":{"type":"string"},"weight":{"type":"number"},"score":{"anyOf":[{"type":"number"},{"type":"null"}]},"numerator":{"type":"number"},"denominator":{"type":"number"}},"required":["dimension","weight","score","numerator","denominator"]}},"minimumObservations":{"type":"string"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"observedAt":{"type":"string","format":"date-time"},"coverage":{"type":"object"}},"required":["calculationVersion","label","score","insufficientData","reasons","components","minimumObservations"]}`. See `docs/openapi.yaml` operation `get_api_v1_intelligence_institutions_id_quality_score` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_ACADEMIC_YEAR, SIMULATION_PERIOD_INVALID, SIMULATION_SCOPE_TOO_LARGE. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 60. POST `/api/v1/intelligence/policy-simulations`

**Roles:** AICTE_ADMIN. **Scope:** AICTE global or institution writers with active membership; explicit institution filter required except institution path. State filtering regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "academicYear": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "category": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "program": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "state": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "asOf": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "hypothetical": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "BASE",
            "SUPERNUMERARY"
          ]
        },
        "method": {
          "type": "string",
          "enum": [
            "FIXED",
            "PERCENTAGE"
          ]
        },
        "value": {
          "type": "number",
          "minimum": 0,
          "maximum": 1000000
        },
        "rounding": {
          "type": "string",
          "enum": [
            "FLOOR",
            "CEILING",
            "HALF_UP"
          ]
        }
      },
      "required": [
        "kind",
        "method",
        "value",
        "rounding"
      ],
      "additionalProperties": false
    }
  },
  "required": [
    "academicYear",
    "category",
    "asOf",
    "hypothetical"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "label": "Synthetic example",
    "calculationVersion": "Synthetic example",
    "asOf": "2026-08-01T00:00:00Z",
    "observedAt": "2026-08-01T00:00:00Z",
    "assumptions": [],
    "affectedOfferingCount": 1,
    "rows": []
  }
}
```

**Response contract:** `{"type":"object","properties":{"label":{"type":"string"},"calculationVersion":{"type":"string"},"asOf":{"type":"string","format":"date-time"},"observedAt":{"type":"string","format":"date-time"},"assumptions":{"type":"array","items":{"type":"string"}},"affectedOfferingCount":{"type":"number"},"rows":{"type":"array","items":{"type":"object","properties":{"allocationId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"currentConfiguredCeiling":{"type":"number"},"hypotheticalQuotaCeiling":{"type":"number"},"hypotheticalEffectiveCeiling":{"type":"number"},"difference":{"type":"number"},"potentialShortfall":{"type":"number"},"additionalApprovalNeededForFullHypotheticalQuota":{"type":"number"},"hypotheticalUtilizationPercentage":{"anyOf":[{"type":"number"},{"type":"null"}]},"currentRuleVersions":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"version":{"type":"number"}},"required":["ruleId","version"]}},"ambiguousCurrentRules":{"type":"boolean"}},"required":["allocationId","offering","approvedSeats","occupiedSeats","currentConfiguredCeiling","hypotheticalQuotaCeiling","hypotheticalEffectiveCeiling","difference","potentialShortfall","additionalApprovalNeededForFullHypotheticalQuota","hypotheticalUtilizationPercentage","currentRuleVersions","ambiguousCurrentRules"]}}},"required":["label","calculationVersion","asOf","observedAt","assumptions","affectedOfferingCount","rows"]}`. See `docs/openapi.yaml` operation `post_api_v1_intelligence_policy_simulations` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus INVALID_ACADEMIC_YEAR, SIMULATION_PERIOD_INVALID, SIMULATION_SCOPE_TOO_LARGE. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 61. POST `/api/v1/offerings`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "program": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  "required": [
    "institution",
    "program"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "program": "000000000000000000000001",
    "active": false,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"program":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"active":{"type":"boolean"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["institution","program","active","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_offerings` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 62. PATCH `/api/v1/offerings/{id}`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "active": {
      "type": "boolean"
    }
  },
  "required": [
    "active"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "program": "000000000000000000000001",
    "active": false,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"program":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"active":{"type":"boolean"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["institution","program","active","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_offerings_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 63. GET `/api/v1/offerings/{id}/capacity`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** AICTE or active institution membership; institution list returns own memberships for non-regulators.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "academicYear",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "offering": "000000000000000000000001",
    "academicYear": "000000000000000000000001",
    "baseSeats": 1,
    "allocations": [],
    "configuredQuotas": [],
    "note": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"baseSeats":{"type":"number"},"allocations":{"type":"array","items":{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"approvedSeats":{"type":"number"},"occupiedSeats":{"type":"number"},"sourceReference":{"type":"string"},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"},"availableSeats":{"type":"number"}},"required":["offering","academicYear","category","kind","approvedSeats","occupiedSeats","sourceReference","version","_id"]}},"configuredQuotas":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"kind":{"type":"string"},"seats":{"type":"number"}},"required":["ruleId","category","kind","seats"]}},"note":{"type":"string"}},"required":["offering","academicYear","baseSeats","allocations","configuredQuotas","note"]}`. See `docs/openapi.yaml` operation `get_api_v1_offerings_id_capacity` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 64. GET `/api/v1/offerings/{id}/quota-rules`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** AICTE or active institution membership; institution list returns own memberships for non-regulators.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"version":{"type":"number"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"method":{"type":"string","enum":["FIXED","PERCENTAGE"]},"value":{"type":"number"},"rounding":{"type":"string","enum":["FLOOR","CEILING","HALF_UP"]},"effectiveFrom":{"type":"string","format":"date-time"},"effectiveUntil":{"type":"string","format":"date-time"},"sourceReference":{"type":"string"},"approvalStatus":{"type":"string","enum":["DRAFT","APPROVED","RETIRED"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["offering","academicYear","category","version","kind","method","value","rounding","effectiveFrom","effectiveUntil","sourceReference","approvalStatus","_id"]}}`. See `docs/openapi.yaml` operation `get_api_v1_offerings_id_quota_rules` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 65. GET `/api/v1/programs`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** All authenticated roles can read these bounded global master lists (first 100).

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","name","_id"]}}`. See `docs/openapi.yaml` operation `get_api_v1_programs` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 66. POST `/api/v1/programs`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "code",
    "name"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "code": "Synthetic example",
    "name": "Synthetic example",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","name","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_programs` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 67. PATCH `/api/v1/programs/{id}`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "code",
    "name"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "code": "Synthetic example",
    "name": "Synthetic example",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","name","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_programs_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 68. POST `/api/v1/quota-rules`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "offering": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "academicYear": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "category": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "version": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "kind": {
      "type": "string",
      "enum": [
        "BASE",
        "SUPERNUMERARY"
      ]
    },
    "method": {
      "type": "string",
      "enum": [
        "FIXED",
        "PERCENTAGE"
      ]
    },
    "value": {
      "type": "number",
      "minimum": 0,
      "maximum": 1000000
    },
    "rounding": {
      "type": "string",
      "enum": [
        "FLOOR",
        "CEILING",
        "HALF_UP"
      ]
    },
    "effectiveFrom": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "effectiveUntil": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "sourceReference": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "approvalStatus": {
      "default": "DRAFT",
      "type": "string",
      "enum": [
        "DRAFT",
        "APPROVED",
        "RETIRED"
      ]
    }
  },
  "required": [
    "offering",
    "academicYear",
    "category",
    "version",
    "kind",
    "method",
    "value",
    "rounding",
    "effectiveFrom",
    "effectiveUntil",
    "sourceReference"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "offering": "000000000000000000000001",
    "academicYear": "000000000000000000000001",
    "category": "000000000000000000000001",
    "version": 1,
    "kind": "BASE",
    "method": "FIXED",
    "value": 1,
    "rounding": "FLOOR",
    "effectiveFrom": "2026-08-01T00:00:00Z",
    "effectiveUntil": "2027-12-31T00:00:00Z",
    "sourceReference": "Synthetic example",
    "approvalStatus": "DRAFT",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"version":{"type":"number"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"method":{"type":"string","enum":["FIXED","PERCENTAGE"]},"value":{"type":"number"},"rounding":{"type":"string","enum":["FLOOR","CEILING","HALF_UP"]},"effectiveFrom":{"type":"string","format":"date-time"},"effectiveUntil":{"type":"string","format":"date-time"},"sourceReference":{"type":"string"},"approvalStatus":{"type":"string","enum":["DRAFT","APPROVED","RETIRED"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["offering","academicYear","category","version","kind","method","value","rounding","effectiveFrom","effectiveUntil","sourceReference","approvalStatus","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_quota_rules` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 69. PATCH `/api/v1/quota-rules/{id}/retire`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "offering": "000000000000000000000001",
    "academicYear": "000000000000000000000001",
    "category": "000000000000000000000001",
    "version": 1,
    "kind": "BASE",
    "method": "FIXED",
    "value": 1,
    "rounding": "FLOOR",
    "effectiveFrom": "2026-08-01T00:00:00Z",
    "effectiveUntil": "2027-12-31T00:00:00Z",
    "sourceReference": "Synthetic example",
    "approvalStatus": "DRAFT",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"offering":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"academicYear":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"category":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"version":{"type":"number"},"kind":{"type":"string","enum":["BASE","SUPERNUMERARY"]},"method":{"type":"string","enum":["FIXED","PERCENTAGE"]},"value":{"type":"number"},"rounding":{"type":"string","enum":["FLOOR","CEILING","HALF_UP"]},"effectiveFrom":{"type":"string","format":"date-time"},"effectiveUntil":{"type":"string","format":"date-time"},"sourceReference":{"type":"string"},"approvalStatus":{"type":"string","enum":["DRAFT","APPROVED","RETIRED"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["offering","academicYear","category","version","kind","method","value","rounding","effectiveFrom","effectiveUntil","sourceReference","approvalStatus","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_quota_rules_id_retire` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 70. GET `/api/v1/reports`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"requestedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"filters":{"type":"object","additionalProperties":true},"reportType":{"type":"string","enum":["ENROLMENT_SUMMARY","INTAKE_UTILIZATION","CATEGORY_UTILIZATION","UPLOAD_ERRORS","OVERLAP_CASES","IDENTITY_STATUS","ACADEMIC_YEAR_COMPLIANCE","STUDENT_STATUS_DISTRIBUTION"]},"format":{"type":"string","enum":["JSON","CSV"]},"status":{"type":"string","enum":["PENDING","PROCESSING","COMPLETED","FAILED"]},"attempts":{"type":"number"},"failureCode":{"type":"string"},"generatedAt":{"type":"string","format":"date-time"},"expiresAt":{"type":"string","format":"date-time"},"metadata":{"type":"object","additionalProperties":true},"contentDigest":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}},"required":["requestedBy","filters","reportType","format","status","attempts","expiresAt","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_reports` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus REPORT_UNAVAILABLE, REPORT_NOT_READY, REPORT_CONTENT_MISMATCH. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 71. POST `/api/v1/reports`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "reportType": {
      "type": "string",
      "enum": [
        "ENROLMENT_SUMMARY",
        "INTAKE_UTILIZATION",
        "CATEGORY_UTILIZATION",
        "UPLOAD_ERRORS",
        "OVERLAP_CASES",
        "IDENTITY_STATUS",
        "ACADEMIC_YEAR_COMPLIANCE",
        "STUDENT_STATUS_DISTRIBUTION"
      ]
    },
    "format": {
      "type": "string",
      "enum": [
        "JSON",
        "CSV"
      ]
    },
    "filters": {
      "type": "object",
      "properties": {
        "institution": {
          "type": "string",
          "pattern": "^[a-f\\d]{24}$"
        },
        "academicYear": {
          "type": "string",
          "pattern": "^[a-f\\d]{24}$"
        },
        "program": {
          "type": "string",
          "pattern": "^[a-f\\d]{24}$"
        },
        "category": {
          "type": "string",
          "pattern": "^[a-f\\d]{24}$"
        },
        "state": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "from": {
          "type": "string",
          "format": "date",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
        },
        "to": {
          "type": "string",
          "format": "date",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
        }
      },
      "additionalProperties": false
    }
  },
  "required": [
    "reportType",
    "format",
    "filters"
  ],
  "additionalProperties": false
}
```

**HTTP 202 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "reportId": "000000000000000000000001",
    "status": "PENDING",
    "expiresAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"reportId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"const":"PENDING"},"expiresAt":{"type":"string","format":"date-time"}},"required":["reportId","status","expiresAt"]}`. See `docs/openapi.yaml` operation `post_api_v1_reports` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus REPORT_UNAVAILABLE, REPORT_NOT_READY, REPORT_CONTENT_MISMATCH. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Queued, not complete: save job ID, poll, review status and expiry.

### 72. GET `/api/v1/reports/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "requestedBy": "000000000000000000000001",
    "filters": {},
    "reportType": "ENROLMENT_SUMMARY",
    "format": "JSON",
    "status": "PENDING",
    "attempts": 1,
    "expiresAt": "2026-08-01T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"requestedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"filters":{"type":"object","additionalProperties":true},"reportType":{"type":"string","enum":["ENROLMENT_SUMMARY","INTAKE_UTILIZATION","CATEGORY_UTILIZATION","UPLOAD_ERRORS","OVERLAP_CASES","IDENTITY_STATUS","ACADEMIC_YEAR_COMPLIANCE","STUDENT_STATUS_DISTRIBUTION"]},"format":{"type":"string","enum":["JSON","CSV"]},"status":{"type":"string","enum":["PENDING","PROCESSING","COMPLETED","FAILED"]},"attempts":{"type":"number"},"failureCode":{"type":"string"},"generatedAt":{"type":"string","format":"date-time"},"expiresAt":{"type":"string","format":"date-time"},"metadata":{"type":"object","additionalProperties":true},"contentDigest":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}},"required":["requestedBy","filters","reportType","format","status","attempts","expiresAt","_id"]}`. See `docs/openapi.yaml` operation `get_api_v1_reports_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus REPORT_UNAVAILABLE, REPORT_NOT_READY, REPORT_CONTENT_MISMATCH. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 73. GET `/api/v1/reports/{id}/download`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
"Raw JSON/CSV artifact: metadata, summary, rows; no success envelope."
```

**Response contract:** `{"type":"object","properties":{"metadata":{"type":"object","additionalProperties":true},"summary":{"type":"object","additionalProperties":true},"rows":{"type":"array","items":{"type":"object","additionalProperties":true}}},"required":["metadata","summary","rows"]}`. See `docs/openapi.yaml` operation `get_api_v1_reports_id_download` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus REPORT_UNAVAILABLE, REPORT_NOT_READY, REPORT_CONTENT_MISMATCH. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 74. GET `/api/v1/reports/prevalidation`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN. **Scope:** AICTE broad scope or institution administrator with active admin membership and explicit institution. Downloads recheck current scope; inaccessible report IDs return 404.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "academicYear",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "program",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "category",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "state",
    "required": false,
    "schema": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  },
  {
    "name": "from",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  {
    "name": "to",
    "required": false,
    "schema": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "findings": [],
    "truncated": false,
    "detailLimit": 1,
    "observedAt": "2026-08-01T00:00:00Z",
    "ruleVersion": "Synthetic example",
    "definition": "Synthetic example",
    "coverage": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"findings":{"type":"array","items":{"type":"object","properties":{"ruleId":{"type":"string"},"severity":{"type":"string"},"explanation":{"type":"string"},"affectedReference":{"type":"string"},"evidenceCategory":{"type":"string"},"recommendedAction":{"type":"string"}},"required":["ruleId","severity","explanation","affectedReference","evidenceCategory","recommendedAction"]}},"truncated":{"type":"boolean"},"detailLimit":{"type":"number"},"observedAt":{"type":"string","format":"date-time"},"ruleVersion":{"type":"string"},"definition":{"type":"string"},"coverage":{"type":"string"}},"required":["findings","truncated","detailLimit","observedAt","ruleVersion","definition","coverage"]}`. See `docs/openapi.yaml` operation `get_api_v1_reports_prevalidation` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus REPORT_UNAVAILABLE, REPORT_NOT_READY, REPORT_CONTENT_MISMATCH. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 75. GET `/api/v1/seat-categories`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** All authenticated roles can read these bounded global master lists (first 100).

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": []
}
```

**Response contract:** `{"type":"array","items":{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","name","_id"]}}`. See `docs/openapi.yaml` operation `get_api_v1_seat_categories` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 76. POST `/api/v1/seat-categories`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "code",
    "name"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "code": "Synthetic example",
    "name": "Synthetic example",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","name","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_seat_categories` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 77. PATCH `/api/v1/seat-categories/{id}`

**Roles:** AICTE_ADMIN. **Scope:** Authenticated account; additional object permissions enforced server-side.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  },
  "required": [
    "code",
    "name"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "code": "Synthetic example",
    "name": "Synthetic example",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"code":{"type":"string"},"name":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["code","name","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_seat_categories_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_CONFLICT, DUPLICATE_RECORD. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 78. GET `/api/v1/students`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": true,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  {
    "name": "search",
    "required": false,
    "schema": {
      "type": "string",
      "maxLength": 80
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutionStudentId":{"type":"string"},"displayName":{"type":"string"},"dateOfBirth":{"type":"string","format":"date-time"},"nriStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"ociStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"foreignNationalStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","institution","institutionStudentId","displayName","nriStatus","ociStatus","foreignNationalStatus","status","version","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_students` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 79. POST `/api/v1/students`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "institutionStudentId": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "displayName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "dateOfBirth": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "nriStatus": {
      "type": "string",
      "enum": [
        "YES",
        "NO",
        "UNKNOWN"
      ]
    },
    "ociStatus": {
      "type": "string",
      "enum": [
        "YES",
        "NO",
        "UNKNOWN"
      ]
    },
    "foreignNationalStatus": {
      "type": "string",
      "enum": [
        "YES",
        "NO",
        "UNKNOWN"
      ]
    },
    "apaarId": {
      "type": "string",
      "pattern": "^\\d{12}$"
    },
    "existingStudent": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  "required": [
    "institution",
    "institutionStudentId",
    "displayName"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "studentId": "000000000000000000000001",
    "identityStatus": "Synthetic example",
    "identityAssessment": {
      "policy": "ALLOW_WITH_REVIEW_FLAGS_V1",
      "identifierPresence": "LINKED",
      "formatStatus": "VALID_AT_LINK",
      "verificationStatus": "Synthetic example",
      "officialVerificationAvailable": false,
      "reviewRequired": false,
      "warnings": []
    },
    "profile": {
      "student": "000000000000000000000001",
      "institution": "000000000000000000000001",
      "institutionStudentId": "Synthetic example",
      "displayName": "Synthetic example",
      "nriStatus": "YES",
      "ociStatus": "YES",
      "foreignNationalStatus": "YES",
      "status": "ACTIVE",
      "version": 1,
      "_id": "000000000000000000000001"
    }
  }
}
```

**Response contract:** `{"type":"object","properties":{"studentId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"identityStatus":{"type":"string"},"identityAssessment":{"type":"object","properties":{"policy":{"const":"ALLOW_WITH_REVIEW_FLAGS_V1"},"identifierPresence":{"type":"string","enum":["LINKED","MISSING"]},"formatStatus":{"type":"string","enum":["VALID_AT_LINK","NOT_PROVIDED"]},"verificationStatus":{"type":"string"},"officialVerificationAvailable":{"const":false},"reviewRequired":{"type":"boolean"},"warnings":{"type":"array","items":{"type":"string"}}},"required":["policy","identifierPresence","formatStatus","verificationStatus","officialVerificationAvailable","reviewRequired","warnings"]},"profile":{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutionStudentId":{"type":"string"},"displayName":{"type":"string"},"dateOfBirth":{"type":"string","format":"date-time"},"nriStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"ociStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"foreignNationalStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","institution","institutionStudentId","displayName","nriStatus","ociStatus","foreignNationalStatus","status","version","_id"]}},"required":["studentId","identityStatus","identityAssessment","profile"]}`. See `docs/openapi.yaml` operation `post_api_v1_students` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 80. GET `/api/v1/students/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT. **Scope:** Regulator, owning linked student, or writer with active institution membership and association. Student read requires institution query for institutional callers.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "studentId": "000000000000000000000001",
    "identityStatus": "Synthetic example",
    "identityAssessment": {
      "policy": "ALLOW_WITH_REVIEW_FLAGS_V1",
      "identifierPresence": "LINKED",
      "formatStatus": "VALID_AT_LINK",
      "verificationStatus": "Synthetic example",
      "officialVerificationAvailable": false,
      "reviewRequired": false,
      "warnings": []
    },
    "profiles": []
  }
}
```

**Response contract:** `{"type":"object","properties":{"studentId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"identityStatus":{"type":"string"},"identityAssessment":{"type":"object","properties":{"policy":{"const":"ALLOW_WITH_REVIEW_FLAGS_V1"},"identifierPresence":{"type":"string","enum":["LINKED","MISSING"]},"formatStatus":{"type":"string","enum":["VALID_AT_LINK","NOT_PROVIDED"]},"verificationStatus":{"type":"string"},"officialVerificationAvailable":{"const":false},"reviewRequired":{"type":"boolean"},"warnings":{"type":"array","items":{"type":"string"}}},"required":["policy","identifierPresence","formatStatus","verificationStatus","officialVerificationAvailable","reviewRequired","warnings"]},"profiles":{"type":"array","items":{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutionStudentId":{"type":"string"},"displayName":{"type":"string"},"dateOfBirth":{"type":"string","format":"date-time"},"nriStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"ociStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"foreignNationalStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","institution","institutionStudentId","displayName","nriStatus","ociStatus","foreignNationalStatus","status","version","_id"]}}},"required":["studentId","identityStatus","identityAssessment","profiles"]}`. See `docs/openapi.yaml` operation `get_api_v1_students_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 81. PATCH `/api/v1/students/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "displayName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "dateOfBirth": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "status": {
      "type": "string",
      "enum": [
        "ACTIVE",
        "INACTIVE"
      ]
    },
    "nriStatus": {
      "type": "string",
      "enum": [
        "YES",
        "NO",
        "UNKNOWN"
      ]
    },
    "ociStatus": {
      "type": "string",
      "enum": [
        "YES",
        "NO",
        "UNKNOWN"
      ]
    },
    "foreignNationalStatus": {
      "type": "string",
      "enum": [
        "YES",
        "NO",
        "UNKNOWN"
      ]
    },
    "version": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    }
  },
  "required": [
    "institution",
    "version"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "student": "000000000000000000000001",
    "institution": "000000000000000000000001",
    "institutionStudentId": "Synthetic example",
    "displayName": "Synthetic example",
    "nriStatus": "YES",
    "ociStatus": "YES",
    "foreignNationalStatus": "YES",
    "status": "ACTIVE",
    "version": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutionStudentId":{"type":"string"},"displayName":{"type":"string"},"dateOfBirth":{"type":"string","format":"date-time"},"nriStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"ociStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"foreignNationalStatus":{"type":"string","enum":["YES","NO","UNKNOWN"]},"status":{"type":"string","enum":["ACTIVE","INACTIVE"]},"version":{"type":"number"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["student","institution","institutionStudentId","displayName","nriStatus","ociStatus","foreignNationalStatus","status","version","_id"]}`. See `docs/openapi.yaml` operation `patch_api_v1_students_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 82. POST `/api/v1/students/{id}/account-link`

**Roles:** AICTE_ADMIN. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  "required": [
    "user"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "linked": true
  }
}
```

**Response contract:** `{"type":"object","properties":{"linked":{"const":true}},"required":["linked"]}`. See `docs/openapi.yaml` operation `post_api_v1_students_id_account_link` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 83. POST `/api/v1/students/{id}/apaar/link`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "apaarId": {
      "type": "string",
      "pattern": "^\\d{12}$"
    }
  },
  "required": [
    "institution",
    "apaarId"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "linked": true
  }
}
```

**Response contract:** `{"type":"object","properties":{"linked":{"const":true}},"required":["linked"]}`. See `docs/openapi.yaml` operation `post_api_v1_students_id_apaar_link` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 84. POST `/api/v1/students/{id}/certificate-print-data`

**Roles:** INSTITUTION_ADMIN. **Scope:** Active own INSTITUTION_ADMIN and membership, ACTIVE institution/profile/enrolment/offering/reservation. Default REDACTED. FULL needs current regulator print authorization and explicit unexpired enrolment-bound consentId from the current linked student; audit and no-store. Not degree issuance.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "enrolment": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "disclosure": {
      "default": "REDACTED",
      "type": "string",
      "enum": [
        "REDACTED",
        "FULL"
      ]
    },
    "consentId": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "purposeCode": {
      "type": "string",
      "const": "CERTIFICATE_PRINT_PREPARATION"
    }
  },
  "required": [
    "institution",
    "enrolment",
    "purposeCode"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "purpose": "CERTIFICATE_PRINT_PREPARATION",
    "disclosure": "REDACTED",
    "institution": {
      "id": "000000000000000000000001",
      "name": "Synthetic example",
      "pid": "Synthetic example"
    },
    "studentId": "000000000000000000000001",
    "enrolmentId": "000000000000000000000001",
    "institutionStudentId": "Synthetic example",
    "apaarId": null,
    "apaarDisplay": "************",
    "identityAssessment": {
      "policy": "ALLOW_WITH_REVIEW_FLAGS_V1",
      "identifierPresence": "LINKED",
      "formatStatus": "VALID_AT_LINK",
      "verificationStatus": "Synthetic example",
      "officialVerificationAvailable": false,
      "reviewRequired": false,
      "warnings": []
    },
    "eligibility": "ACTIVE_RECORD_PRINT_PREPARATION_ONLY",
    "degreeAwardingStatus": "NOT_INDEPENDENTLY_VERIFIED",
    "officialCertificate": false,
    "qualificationCertified": false,
    "generatedAt": "2026-08-01T00:00:00Z",
    "notice": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"purpose":{"const":"CERTIFICATE_PRINT_PREPARATION"},"disclosure":{"type":"string","enum":["REDACTED","FULL"]},"institution":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"name":{"type":"string"},"pid":{"type":"string"}},"required":["id","name","pid"]},"studentId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"enrolmentId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"institutionStudentId":{"type":"string"},"apaarId":{"anyOf":[{"type":"string","pattern":"^\\d{12}$"},{"type":"null"}],"example":null},"apaarDisplay":{"type":"string","example":"************"},"identityAssessment":{"type":"object","properties":{"policy":{"const":"ALLOW_WITH_REVIEW_FLAGS_V1"},"identifierPresence":{"type":"string","enum":["LINKED","MISSING"]},"formatStatus":{"type":"string","enum":["VALID_AT_LINK","NOT_PROVIDED"]},"verificationStatus":{"type":"string"},"officialVerificationAvailable":{"const":false},"reviewRequired":{"type":"boolean"},"warnings":{"type":"array","items":{"type":"string"}}},"required":["policy","identifierPresence","formatStatus","verificationStatus","officialVerificationAvailable","reviewRequired","warnings"]},"eligibility":{"const":"ACTIVE_RECORD_PRINT_PREPARATION_ONLY"},"degreeAwardingStatus":{"const":"NOT_INDEPENDENTLY_VERIFIED"},"officialCertificate":{"const":false},"qualificationCertified":{"const":false},"generatedAt":{"type":"string","format":"date-time"},"notice":{"type":"string"}},"required":["purpose","disclosure","institution","studentId","enrolmentId","institutionStudentId","apaarId","apaarDisplay","identityAssessment","eligibility","degreeAwardingStatus","officialCertificate","qualificationCertified","generatedAt","notice"]}`. See `docs/openapi.yaml` operation `post_api_v1_students_id_certificate_print_data` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus PRINT_RECORD_UNAVAILABLE, PRINT_AUTHORIZATION_REQUIRED, PRINT_CONSENT_REQUIRED, IDENTITY_NOT_LINKED, IDENTITY_KEY_VERSION_UNAVAILABLE, IDENTITY_DECRYPTION_FAILED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 85. GET `/api/v1/students/{id}/identity-status`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT. **Scope:** Regulator, owning linked student, or writer with active institution membership and association. Student read requires institution query for institutional callers.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "institution",
    "required": false,
    "schema": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "identityStatus": "Synthetic example",
    "latestEvent": {
      "status": "UNVERIFIED",
      "_id": "000000000000000000000001"
    },
    "official": false,
    "identityAssessment": {
      "policy": "ALLOW_WITH_REVIEW_FLAGS_V1",
      "identifierPresence": "LINKED",
      "formatStatus": "VALID_AT_LINK",
      "verificationStatus": "Synthetic example",
      "officialVerificationAvailable": false,
      "reviewRequired": false,
      "warnings": []
    }
  }
}
```

**Response contract:** `{"type":"object","properties":{"identityStatus":{"type":"string"},"latestEvent":{"anyOf":[{"type":"object","properties":{"status":{"type":"string","enum":["UNVERIFIED","MOCK_VERIFIED","VERIFICATION_FAILED"]},"provider":{"type":"string"},"providerVersion":{"type":"string"},"reasonCode":{"type":"string"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"}},"required":["status","_id"]},{"type":"null"}]},"official":{"const":false},"identityAssessment":{"type":"object","properties":{"policy":{"const":"ALLOW_WITH_REVIEW_FLAGS_V1"},"identifierPresence":{"type":"string","enum":["LINKED","MISSING"]},"formatStatus":{"type":"string","enum":["VALID_AT_LINK","NOT_PROVIDED"]},"verificationStatus":{"type":"string"},"officialVerificationAvailable":{"const":false},"reviewRequired":{"type":"boolean"},"warnings":{"type":"array","items":{"type":"string"}}},"required":["policy","identifierPresence","formatStatus","verificationStatus","officialVerificationAvailable","reviewRequired","warnings"]}},"required":["identityStatus","latestEvent","official","identityAssessment"]}`. See `docs/openapi.yaml` operation `get_api_v1_students_id_identity_status` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 86. POST `/api/v1/students/{id}/verify-apaar`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    }
  },
  "required": [
    "institution"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "verificationStatus": "Synthetic example",
    "outcome": "Synthetic example",
    "provider": "Synthetic example",
    "providerVersion": "Synthetic example",
    "official": false,
    "traceId": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"verificationStatus":{"type":"string"},"outcome":{"type":"string"},"provider":{"type":"string"},"providerVersion":{"type":"string"},"official":{"const":false},"traceId":{"type":"string"}},"required":["verificationStatus","outcome","provider","providerVersion","official","traceId"]}`. See `docs/openapi.yaml` operation `post_api_v1_students_id_verify_apaar` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409. MOCKED, never government-certified.

### 87. POST `/api/v1/transfers`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "sourceEnrolment": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "targetAllocation": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "targetInstitutionStudentId": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "startsOn": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "admissionDate": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "idempotencyKey": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "reasonCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    }
  },
  "required": [
    "sourceEnrolment",
    "targetAllocation",
    "targetInstitutionStudentId",
    "startsOn",
    "admissionDate",
    "idempotencyKey",
    "reasonCode"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "sourceEnrolment": "000000000000000000000001",
    "sourceInstitution": "000000000000000000000001",
    "targetAllocation": "000000000000000000000001",
    "targetInstitution": "000000000000000000000001",
    "targetInstitutionStudentId": "Synthetic example",
    "requestedBy": "000000000000000000000001",
    "idempotencyKey": "Synthetic example",
    "status": "REQUESTED",
    "startsOn": "2026-08-01T00:00:00Z",
    "admissionDate": "2026-08-01T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"sourceEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"sourceInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetAllocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitutionStudentId":{"type":"string"},"requestedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"status":{"type":"string","enum":["REQUESTED","APPROVED","REJECTED"]},"startsOn":{"type":"string","format":"date-time"},"admissionDate":{"type":"string","format":"date-time"},"reasonCode":{"type":"string"},"reviewedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["sourceEnrolment","sourceInstitution","targetAllocation","targetInstitution","targetInstitutionStudentId","requestedBy","idempotencyKey","status","startsOn","admissionDate","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"createdAt":{"type":"string","format":"date-time"}},"required":["_id","status","startsOn","createdAt"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_transfers` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 88. GET `/api/v1/transfers/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "sourceEnrolment": "000000000000000000000001",
    "sourceInstitution": "000000000000000000000001",
    "targetAllocation": "000000000000000000000001",
    "targetInstitution": "000000000000000000000001",
    "targetInstitutionStudentId": "Synthetic example",
    "requestedBy": "000000000000000000000001",
    "idempotencyKey": "Synthetic example",
    "status": "REQUESTED",
    "startsOn": "2026-08-01T00:00:00Z",
    "admissionDate": "2026-08-01T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"sourceEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"sourceInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetAllocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitutionStudentId":{"type":"string"},"requestedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"status":{"type":"string","enum":["REQUESTED","APPROVED","REJECTED"]},"startsOn":{"type":"string","format":"date-time"},"admissionDate":{"type":"string","format":"date-time"},"reasonCode":{"type":"string"},"reviewedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["sourceEnrolment","sourceInstitution","targetAllocation","targetInstitution","targetInstitutionStudentId","requestedBy","idempotencyKey","status","startsOn","admissionDate","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"createdAt":{"type":"string","format":"date-time"}},"required":["_id","status","startsOn","createdAt"]}]}`. See `docs/openapi.yaml` operation `get_api_v1_transfers_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 89. POST `/api/v1/transfers/{id}/approve`

**Roles:** AICTE_ADMIN. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "reasonCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    }
  },
  "required": [
    "reasonCode"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "sourceEnrolment": "000000000000000000000001",
    "sourceInstitution": "000000000000000000000001",
    "targetAllocation": "000000000000000000000001",
    "targetInstitution": "000000000000000000000001",
    "targetInstitutionStudentId": "Synthetic example",
    "requestedBy": "000000000000000000000001",
    "idempotencyKey": "Synthetic example",
    "status": "REQUESTED",
    "startsOn": "2026-08-01T00:00:00Z",
    "admissionDate": "2026-08-01T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"sourceEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"sourceInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetAllocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitutionStudentId":{"type":"string"},"requestedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"status":{"type":"string","enum":["REQUESTED","APPROVED","REJECTED"]},"startsOn":{"type":"string","format":"date-time"},"admissionDate":{"type":"string","format":"date-time"},"reasonCode":{"type":"string"},"reviewedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["sourceEnrolment","sourceInstitution","targetAllocation","targetInstitution","targetInstitutionStudentId","requestedBy","idempotencyKey","status","startsOn","admissionDate","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"createdAt":{"type":"string","format":"date-time"}},"required":["_id","status","startsOn","createdAt"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_transfers_id_approve` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 90. POST `/api/v1/transfers/{id}/reject`

**Roles:** AICTE_ADMIN. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "reasonCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    }
  },
  "required": [
    "reasonCode"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "sourceEnrolment": "000000000000000000000001",
    "sourceInstitution": "000000000000000000000001",
    "targetAllocation": "000000000000000000000001",
    "targetInstitution": "000000000000000000000001",
    "targetInstitutionStudentId": "Synthetic example",
    "requestedBy": "000000000000000000000001",
    "idempotencyKey": "Synthetic example",
    "status": "REQUESTED",
    "startsOn": "2026-08-01T00:00:00Z",
    "admissionDate": "2026-08-01T00:00:00Z",
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"anyOf":[{"type":"object","properties":{"sourceEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"sourceInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetAllocation":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetInstitutionStudentId":{"type":"string"},"requestedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"idempotencyKey":{"type":"string"},"status":{"type":"string","enum":["REQUESTED","APPROVED","REJECTED"]},"startsOn":{"type":"string","format":"date-time"},"admissionDate":{"type":"string","format":"date-time"},"reasonCode":{"type":"string"},"reviewedBy":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"targetEnrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"},"__v":{"type":"number"}},"required":["sourceEnrolment","sourceInstitution","targetAllocation","targetInstitution","targetInstitutionStudentId","requestedBy","idempotencyKey","status","startsOn","admissionDate","_id"]},{"type":"object","properties":{"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"startsOn":{"type":"string","format":"date-time"},"createdAt":{"type":"string","format":"date-time"}},"required":["_id","status","startsOn","createdAt"]}]}`. See `docs/openapi.yaml` operation `post_api_v1_transfers_id_reject` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus CAPACITY_EXHAUSTED, INVALID_STATE_TRANSITION, IDEMPOTENCY_CONFLICT, DUPLICATE_SUBMISSION, RESERVATION_INCONSISTENT, INVALID_STUDENT_ASSOCIATION. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 91. GET `/api/v1/uploads/{id}`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "status": "PENDING",
    "totalRows": 1,
    "validRows": 1,
    "invalidRows": 1,
    "committedRows": 1,
    "attempts": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["PENDING","VALIDATING","VALIDATED","COMMITTING","COMPLETED","PARTIAL","FAILED"]},"totalRows":{"type":"number"},"validRows":{"type":"number"},"invalidRows":{"type":"number"},"committedRows":{"type":"number"},"attempts":{"type":"number"},"failureCode":{"type":"string"},"payloadPurgedAt":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}},"required":["institution","status","totalRows","validRows","invalidRows","committedRows","attempts","_id"]}`. See `docs/openapi.yaml` operation `get_api_v1_uploads_id_` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 92. POST `/api/v1/uploads/{id}/commit`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 202 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "status": "PENDING",
    "totalRows": 1,
    "validRows": 1,
    "invalidRows": 1,
    "committedRows": 1,
    "attempts": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["PENDING","VALIDATING","VALIDATED","COMMITTING","COMPLETED","PARTIAL","FAILED"]},"totalRows":{"type":"number"},"validRows":{"type":"number"},"invalidRows":{"type":"number"},"committedRows":{"type":"number"},"attempts":{"type":"number"},"failureCode":{"type":"string"},"payloadPurgedAt":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}},"required":["institution","status","totalRows","validRows","invalidRows","committedRows","attempts","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_uploads_id_commit` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Queued, not complete: save job ID, poll, review status and expiry.

### 93. GET `/api/v1/uploads/{id}/error-report`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
"rowNumber,errorCodes\n"
```

**Response contract:** `Raw file response`. See `docs/openapi.yaml` operation `get_api_v1_uploads_id_error_report` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 94. GET `/api/v1/uploads/{id}/results`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"rowNumber":{"type":"number"},"status":{"type":"string","enum":["VALID","INVALID","COMMITTED","FAILED"]},"errorCodes":{"type":"array","items":{"type":"string"}},"warnings":{"type":"array","items":{"type":"string"}},"student":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"enrolment":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"}},"required":["rowNumber","status","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_uploads_id_results` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 95. POST `/api/v1/uploads/{id}/retry`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

**HTTP 202 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "status": "PENDING",
    "totalRows": 1,
    "validRows": 1,
    "invalidRows": 1,
    "committedRows": 1,
    "attempts": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["PENDING","VALIDATING","VALIDATED","COMMITTING","COMPLETED","PARTIAL","FAILED"]},"totalRows":{"type":"number"},"validRows":{"type":"number"},"invalidRows":{"type":"number"},"committedRows":{"type":"number"},"attempts":{"type":"number"},"failureCode":{"type":"string"},"payloadPurgedAt":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}},"required":["institution","status","totalRows","validRows","invalidRows","committedRows","attempts","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_uploads_id_retry` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Queued, not complete: save job ID, poll, review status and expiry.

### 96. POST `/api/v1/uploads/students`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF. **Scope:** Institution writers need active membership and student association; regulator broad access. existingStudent association/account-link restricted to regulator.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: multipart/form-data (browser sets boundary).

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "institution": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "idempotencyKey": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "file": {
      "type": "string",
      "format": "binary",
      "description": "CSV or XLSX, maximum 2 MiB / 1000 rows; exact legacy ten-column or extended thirteen-column template."
    }
  },
  "required": [
    "institution",
    "idempotencyKey",
    "file"
  ],
  "additionalProperties": false
}
```

**HTTP 202 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "institution": "000000000000000000000001",
    "status": "PENDING",
    "totalRows": 1,
    "validRows": 1,
    "invalidRows": 1,
    "committedRows": 1,
    "attempts": 1,
    "_id": "000000000000000000000001"
  }
}
```

**Response contract:** `{"type":"object","properties":{"institution":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string","enum":["PENDING","VALIDATING","VALIDATED","COMMITTING","COMPLETED","PARTIAL","FAILED"]},"totalRows":{"type":"number"},"validRows":{"type":"number"},"invalidRows":{"type":"number"},"committedRows":{"type":"number"},"attempts":{"type":"number"},"failureCode":{"type":"string"},"payloadPurgedAt":{"type":"string","format":"date-time"},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"},"updatedAt":{"type":"string","format":"date-time"}},"required":["institution","status","totalRows","validRows","invalidRows","committedRows","attempts","_id"]}`. See `docs/openapi.yaml` operation `post_api_v1_uploads_students` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus IDENTITY_REVIEW_REQUIRED, IDENTITY_ALREADY_LINKED, WRITE_CONFLICT, INVALID_STUDENT_ACCOUNT, IDENTITY_KEY_VERSION_UNAVAILABLE, MOCK_PROVIDER_DISABLED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Queued, not complete: save job ID, poll, review status and expiry.

### 97. GET `/api/v1/uploads/template`

**Roles:** AICTE_ADMIN, INSTITUTION_ADMIN, INSTITUTION_STAFF, STUDENT, EMPLOYER. **Scope:** Own job institution or involved institution membership; AICTE sees regulatory details, institution transfer/conflict views are redacted. Reviews/resolution regulator-only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
"institutionStudentId,displayName,dateOfBirth,apaarId,allocation,academicYear,admissionDate,startsOn,endsOn,entryType,nriStatus,ociStatus,foreignNationalStatus\n"
```

**Response contract:** `Raw file response`. See `docs/openapi.yaml` operation `get_api_v1_uploads_template` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus UPLOAD_NOT_VALIDATED, UPLOAD_NOT_FAILED, UPLOAD_PAYLOAD_EXPIRED, IDEMPOTENCY_CONFLICT, FILE_REQUIRED, UNSUPPORTED_UPLOAD_TYPE; row failures INVALID_STUDENT_STATUS, CONFLICTING_STUDENT_STATUS, STUDENT_STATUS_CHANGED. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 98. POST `/api/v1/verification/employers`

**Roles:** AICTE_ADMIN. **Scope:** AICTE governs an existing active EMPLOYER account; no employer directory or account creation endpoint.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "user": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "organization": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "status": {
      "type": "string",
      "enum": [
        "APPROVED",
        "SUSPENDED"
      ]
    },
    "approvalReference": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    }
  },
  "required": [
    "user",
    "organization",
    "status",
    "approvalReference"
  ],
  "additionalProperties": false
}
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "employerId": "000000000000000000000001",
    "organization": "Synthetic example",
    "status": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"employerId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"organization":{"type":"string"},"status":{"type":"string"}},"required":["employerId","organization","status"]}`. See `docs/openapi.yaml` operation `post_api_v1_verification_employers` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 99. POST `/api/v1/verification/invitations`

**Roles:** STUDENT. **Scope:** Canonical student account linkage required; own consent request, enrolment or credential only. Regulators cannot grant consent.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "enrolment": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "employer": {
      "type": "string",
      "pattern": "^[a-f\\d]{24}$"
    },
    "claims": {
      "minItems": 1,
      "maxItems": 6,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "INSTITUTION",
          "PROGRAM",
          "ENROLMENT_STATUS",
          "ACADEMIC_YEAR",
          "START_DATE",
          "ADMISSION_DATE"
        ]
      }
    },
    "expiresInSeconds": {
      "default": 900,
      "type": "integer",
      "minimum": 60,
      "maximum": 2592000
    }
  },
  "required": [
    "enrolment",
    "employer",
    "claims"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "invitationId": "000000000000000000000001",
    "token": "<runtime-token-only>",
    "expiresAt": "2026-08-01T00:00:00Z",
    "notice": "Synthetic example"
  }
}
```

**Response contract:** `{"type":"object","properties":{"invitationId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"token":{"type":"string"},"expiresAt":{"type":"string","format":"date-time"},"notice":{"type":"string"}},"required":["invitationId","token","expiresAt","notice"]}`. See `docs/openapi.yaml` operation `post_api_v1_verification_invitations` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 100. GET `/api/v1/verification/requests`

**Roles:** EMPLOYER. **Scope:** Active account and APPROVED employer profile; employer-bound invitation/request/credential only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[
  {
    "name": "page",
    "required": false,
    "schema": {
      "default": 1,
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    }
  },
  {
    "name": "limit",
    "required": false,
    "schema": {
      "default": 20,
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  }
]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "items": [],
    "total": 1,
    "page": 1,
    "limit": 1
  }
}
```

**Response contract:** `{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"purposeCode":{"type":"string"},"expiresAt":{"type":"string","format":"date-time"},"requestedClaims":{"type":"array","items":{"type":"string"}},"status":{"type":"string","enum":["PENDING","APPROVED","REJECTED","REVOKED"]},"_id":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"createdAt":{"type":"string","format":"date-time"}},"required":["purposeCode","expiresAt","status","_id"]}},"total":{"type":"number"},"page":{"type":"number"},"limit":{"type":"number"}},"required":["items","total","page","limit"]}`. See `docs/openapi.yaml` operation `get_api_v1_verification_requests` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

### 101. POST `/api/v1/verification/requests`

**Roles:** EMPLOYER. **Scope:** Active account and APPROVED employer profile; employer-bound invitation/request/credential only.

**Headers:** Authorization: Bearer <accessToken>.  Content-Type: application/json.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
{
  "type": "object",
  "properties": {
    "invitationToken": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{64}$"
    },
    "purposeCode": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.:-]{1,80}$"
    },
    "claims": {
      "minItems": 1,
      "maxItems": 6,
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "INSTITUTION",
          "PROGRAM",
          "ENROLMENT_STATUS",
          "ACADEMIC_YEAR",
          "START_DATE",
          "ADMISSION_DATE"
        ]
      }
    },
    "expiresInSeconds": {
      "default": 86400,
      "type": "integer",
      "minimum": 60,
      "maximum": 2592000
    }
  },
  "required": [
    "invitationToken",
    "purposeCode",
    "claims"
  ],
  "additionalProperties": false
}
```

**HTTP 201 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "requestId": "000000000000000000000001",
    "consentRequestId": "000000000000000000000001",
    "status": "Synthetic example",
    "expiresAt": "2026-08-01T00:00:00Z",
    "purposeCode": "Synthetic example",
    "requestedClaims": []
  }
}
```

**Response contract:** `{"type":"object","properties":{"requestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"consentRequestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"status":{"type":"string"},"expiresAt":{"type":"string","format":"date-time"},"purposeCode":{"type":"string"},"requestedClaims":{"type":"array","items":{"type":"string"}}},"required":["requestId","consentRequestId","status","expiresAt","purposeCode","requestedClaims"]}`. See `docs/openapi.yaml` operation `post_api_v1_verification_requests` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Submit once; preserve idempotency key if applicable, reload state/version on 409.

### 102. GET `/api/v1/verification/requests/{id}/result`

**Roles:** EMPLOYER. **Scope:** Active account and APPROVED employer profile; employer-bound invitation/request/credential only.

**Headers:** Authorization: Bearer <accessToken>.

**Query schema:**
```json
[]
```

**Request body schema:**
```json
null
```

**HTTP 200 success example (synthetic):**
```json
{
  "success": true,
  "message": "Synthetic example",
  "data": {
    "requestId": "000000000000000000000001",
    "claims": {},
    "source": "Synthetic example",
    "governmentCertified": false,
    "observedAt": "2026-08-01T00:00:00Z"
  }
}
```

**Response contract:** `{"type":"object","properties":{"requestId":{"type":"string","pattern":"^[a-fA-F0-9]{24}$","example":"000000000000000000000001"},"claims":{"type":"object","properties":{"INSTITUTION":{"type":"object","properties":{"name":{"type":"string"},"pid":{"type":"string"}},"required":["name","pid"]},"PROGRAM":{"type":"object","properties":{"name":{"type":"string"},"code":{"type":"string"}},"required":["name","code"]},"ENROLMENT_STATUS":{"type":"string"},"ACADEMIC_YEAR":{"type":"string"},"START_DATE":{"type":"string","format":"date"},"ADMISSION_DATE":{"type":"string","format":"date"}},"required":[]},"source":{"type":"string"},"governmentCertified":{"const":false},"observedAt":{"type":"string","format":"date-time"}},"required":["requestId","claims","source","governmentCertified","observedAt"]}`. See `docs/openapi.yaml` operation `get_api_v1_verification_requests_id_result` and generated `paths` types for nested fields/optional projections.

**Relevant errors:** common errors above plus VERIFICATION_UNAVAILABLE, CREDENTIAL_UNAVAILABLE, CLAIM_SCOPE_DENIED, LIFETIME_EXCEEDED, CONSENT_STATE_CONFLICT. These family lists include service possibilities; inspect status/code, never infer identity existence.

**Frontend handling:** Show scoped loading/empty/error state; clear previous account/institution data on scope change.

<!-- API_CATALOG_END -->

## 4. Browser authentication and working TypeScript client

Use [shared/browser-client.ts](shared/browser-client.ts), a framework-independent fetch client compiled by the backend typecheck. It keeps access/CSRF nonces in closure memory and refresh tokens only in HttpOnly cookies. It implements single-flight refresh and one retry after 401; it does not retry business errors or arbitrary network failures. CSRF_INVALID on browser auth bootstraps once, then retries once. Multiple tabs share cookies; a tab may need to bootstrap after another rotates them. A replayed refresh token revokes that token family.

Exact sequence:

1. POST `/auth/browser/csrf` with `{}`, credentials include. Browser sends Origin automatically. Response `data.csrfToken` is the nonce; an HttpOnly signed CSRF cookie is also set.
2. POST `/auth/browser/login` with email/password, nonce header `X-CSRF-Token`, credentials include. Response includes accessToken/expiresIn/tokenType/**new csrfToken**/sessionExpiresAt. Refresh and new CSRF cookies are set. Always replace the in-memory nonce after login/refresh.
3. GET `/auth/me` with Bearer access token and credentials omit. It returns `_id,email,role`; no memberships or studentId. Obtain known role resources from scoped APIs/onboarding.
4. Normal calls use the short access token in memory. Never put refresh tokens in localStorage/sessionStorage, query strings, route paths or analytics. Never decode JWT payload as authorization proof.
5. On reload, bootstrap then browser refresh; recover the current session from cookies. An expired access token returns 401; refresh once and retry once. Refresh 401 means clear memory, return to login. Disabled accounts fail current-account checks. Do not enter an infinite refresh loop.
6. POST `/auth/browser/logout` with `{}`, current nonce, credentials include. It revokes the refresh family and clears both cookies at their configured path/domain. Clear local memory even if the network fails; explain that server logout remains unconfirmed on network failure. Existing JWTs remain valid until their 10-minute expiry unless the account becomes inactive.

```ts
import { createBrowserClient } from './shared/browser-client';
import type { components } from './shared/api-types';
const api = createBrowserClient(import.meta.env.VITE_API_BASE_URL);
await api.login(form.email, form.password);
const me = await api.request<components['schemas']['User']>('/api/v1/auth/me');
const summary = await api.request<components['schemas']['AnalyticsSummary']>(
  `/api/v1/analytics/institutions/${institutionId}/overview?academicYear=${yearId}`);
await api.request(`/api/v1/enrolments/${enrolmentId}/activate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
});
await api.logout();
```

React initialization: call `restore()` once in an auth provider; show an initialization state while pending. Fetch me after success. Use `me.role` to select navigation; use known membership context for institution selection. A 403 shows a permission page rather than attempting another role. A 401 after refresh returns to login. Do not restore a stale account from persistent client state.

Cookie configuration: defaults `Path=/api/v1/auth/browser`, host-only domain, SameSite=Lax, HttpOnly. Local HTTP uses `COOKIE_SECURE=false` and an exact allowlisted origin `CORS_ORIGINS=http://localhost:5173`. Keep both apps on localhost rather than mixing localhost/127.0.0.1. Ports are different origins but the same site. Production requires HTTPS, Secure cookies and strong separate JWT/CSRF secrets. For genuinely cross-site frontend/API, SameSite=None requires Secure; browser third-party cookie policy can still block it. Prefer same-site deployment. Set COOKIE_DOMAIN only for a reviewed shared domain; default host-only is safer. COOKIE_PATH must cover browser routes.

CORS credentials are enabled only on browser-auth paths. Wildcard credentialed origins are forbidden; no trailing slash in configured origins. Frontend cannot read Set-Cookie and does not need to. Reverse-proxy trust uses explicit trusted IP/CIDR only. POST requests must reach Express with Origin intact; never manufacture a caller-controlled forwarded Origin policy.

Non-browser clients use POST `/auth/login`, `/auth/refresh`, `/auth/logout` with JSON refreshToken. These routes reject Origin, Sec-Fetch-Site and browser refresh cookies; browser and JSON sessions cannot redeem each other's refresh tokens. Existing browser callers using JSON auth must migrate to the explicit browser routes. `me` remains compatible.

## 5. Student and admission forms

Use exact generated input schemas in section 3; trim only where specified. Dates in student/admission bodies are YYYY-MM-DD calendar dates; academic-year management uses full ISO datetime. IDs come from saved resources. Never place raw APAAR in URLs. Avoid analytics/session replay on sensitive form fields.

| Form | Route / fields / lifecycle | UI handling |
|---|---|---|
| Student registration | POST `/students`: institution, institutionStudentId, displayName required; dateOfBirth, apaarId, existingStudent, nriStatus, ociStatus, foreignNationalStatus optional. Declaration values YES/NO/UNKNOWN; omitted legacy values read UNKNOWN. apaarId is structurally 12 digits only. existingStudent is regulator-only association after review | 201 gives studentId/profile/identityStatus. Missing APAAR allowed; show UNVERIFIED without blocking admission. Duplicate roll/identity requires review, not a new identity guessed from another record |
| Own institution profile update | PATCH `/students/:id`: institution and integer version required; optional displayName/dateOfBirth/status ACTIVE or INACTIVE and nriStatus/ociStatus/foreignNationalStatus; version concurrency enforced | Save returned profile/version. 409 WRITE_CONFLICT → refetch and show compare UI. No overwrite of another institution's profile |
| Protected APAAR link | POST `/students/:id/apaar/link`: institution, apaarId. Repeat identical link is idempotent; different value requires reviewed correction | Only linked:true returned. Never display ciphertext/HMAC or assume ID format proves authenticity |
| Mock verification | POST `/students/:id/verify-apaar`: institution | Explicit **MOCKED** badge; outcome and verificationStatus describe simulation. Production refuses mock provider |
| Draft admission | POST `/enrolments`: student, allocation, institutionStudentId, admissionDate, startsOn, idempotencyKey required; entryType defaults REGULAR; optional endsOn | Allocation determines institution/offering/year/category. Dates must fit year; endsOn≥startsOn. Keep one key for exact retry; new edited request needs a new key |
| Edit unactivated admission | PATCH `/enrolments/:id`: version, reasonCode; optional endsOn/status | DRAFT→PENDING_VALIDATION/REJECTED; PENDING_VALIDATION→UNDER_REVIEW/REJECTED; UNDER_REVIEW→PENDING_VALIDATION/REJECTED. Current version required |
| Activation | POST `/enrolments/:id/activate`: `{}` | DRAFT/PENDING_VALIDATION→ACTIVE; atomic seat reservation. Repeat ACTIVE is idempotent. Show capacity errors, never silently pick another category |
| Withdrawal | POST `/enrolments/:id/withdraw`: `{}` | ACTIVE→WITHDRAWN; one reservation released. Repeat withdrawal idempotent. Confirm user intent in UI |
| Transfer request | POST `/transfers`: sourceEnrolment,targetAllocation,targetInstitutionStudentId,startsOn,admissionDate,idempotencyKey,reasonCode | Source ACTIVE; different target institution. Target association must be regulator-established before approval |
| Transfer review | POST `/transfers/:id/approve` or `/reject`: reasonCode | AICTE only. Approval atomically transfers source and activates target; capacity failure rolls back both. REQUESTED→APPROVED/REJECTED; final decisions cannot be reversed |

Example registration: `{"institution":"<institutionId>","institutionStudentId":"DEMO-101","displayName":"Synthetic Student","dateOfBirth":"2005-01-15"}`.

Example draft: `{"student":"<studentId>","allocation":"<allocationId>","institutionStudentId":"DEMO-101","admissionDate":"2026-08-01","startsOn":"2026-08-01","idempotencyKey":"demo-admission-unique-101"}`.

No general admission delete exists. UNDER_REVIEW cannot be activated directly. COMPLETED is reserved in storage; graduation workflow is NOT IMPLEMENTED. Legacy ACCEPTED requires operator reconciliation. NRI/OCI/FN profile declarations and category labels are not proof of eligibility; configured approvals govern seat pools. Missing APAAR does not become verified on activation: identityAssessment explicitly reports presence, format-at-link, verificationStatus and reviewRequired under ALLOW_WITH_REVIEW_FLAGS_V1.

## 6. Bulk upload UI state machine

`SELECT FILE → PENDING → VALIDATING → VALIDATED → REVIEW RESULTS → COMMIT CONFIRMATION → COMMITTING → COMPLETED / PARTIAL / FAILED`.

GET `/uploads/template` returns a header-only CSV. The new template has13 exact ordered headers; the original10-column header/rows ending at entryType are also accepted for compatibility:

```csv
institutionStudentId,displayName,dateOfBirth,apaarId,allocation,academicYear,admissionDate,startsOn,endsOn,entryType,nriStatus,ociStatus,foreignNationalStatus
DEMO-UP-1,Synthetic Upload Student,,,<allocationId>,<yearId>,2026-08-01,2026-08-01,,REGULAR,YES,UNKNOWN,NO
```

Maximum 2 MiB, 1000 data rows, CSV text/csv or application/csv with .csv extension; XLSX MIME application/vnd.openxmlformats-officedocument.spreadsheetml.sheet and .xlsx. No extra sheets, hidden payloads, macros or formula expressions; server performs archive/XML/file checks. Plain spreadsheet cell values only. Required values: roll/name/allocation/year/admission/start/entryType. DOB/APAAR/end may be blank. Extended status cells accept exact uppercase YES/NO/UNKNOWN; blank means unknown on a new profile, and leaves an existing declaration unspecified. Other values produce INVALID_STUDENT_STATUS. Existing-profile conflicting declarations produce CONFLICTING_STUDENT_STATUS; uploads never overwrite them. Correct the scoped profile through the versioned PATCH first. A declaration changed after preview causes STUDENT_STATUS_CHANGED at commit; reload and explicitly review the source/profile before retrying. Every row must belong to the upload's institution. Validation is a preview; capacity/permissions are checked again when committing.

```ts
const form = new FormData();
form.set('institution', institutionId);
form.set('idempotencyKey', uploadKey); // retain for retry of the exact same file
form.set('file', file);
const job = await api.request<components['schemas']['UploadJob']>('/api/v1/uploads/students', {
  method: 'POST', body: form
});
// HTTP 202 is queued. Save job._id and poll its status.
```

Poll GET `/uploads/:id` every 2–3 seconds while PENDING/VALIDATING/COMMITTING, back off to 10 seconds on slow jobs, pause when hidden/unmounted, respect 429 Retry-After. Stop automatic processing polling at VALIDATED (show review), COMPLETED, PARTIAL, FAILED. Delayed worker availability has no dedicated HTTP error; an old pending timestamp is a support signal, not success.

At VALIDATED, page GET `/uploads/:id/results?page=1&limit=100`; display rowNumber/status/errorCodes/warnings only. Row states: VALID, INVALID, COMMITTED, FAILED. Payloads/APAAR are never returned. GET `/uploads/:id/error-report` returns safe CSV with row number/codes; use authenticated blob download. Warning MISSING_APAAR does not prevent import.

After explicit review POST `/uploads/:id/commit` `{}`; HTTP 202 transitions to COMMITTING. Poll again. COMPLETED means all committed; PARTIAL includes invalid/failed rows. Committed rows never recommit. To retry failed commit rows in PARTIAL, POST commit again; invalid rows need a corrected file with a new idempotency key. FAILED job: POST `/uploads/:id/retry` `{}` after fixing operational cause; attempts reset. Repeated confirmation while COMMITTING/COMPLETED is idempotent. File key reuse with different content/format returns IDEMPOTENCY_CONFLICT. Expired/purged staging cannot retry/commit: upload a new file/key.

A combined worker must be running. Leases are 60 seconds for uploads; up to three claims before a stale exhausted job becomes FAILED. Effects are transactional and row-idempotent; this is not exactly-once worker execution. Do not render queue acceptance as imported records.

## 7. Dashboard integration and metric definitions

All analytics routes accept institution, academicYear, program, category, state, from/to unless their exact catalog schema differs. Non-regulators must supply own institution; state is regulator-only. Dates are inclusive UTC days. No student names/raw identity values are returned. Label figures **“Data registered in SatyaID”**, never national population.

| GET route under `/analytics` | Shape / chart / filter caveat |
|---|---|
| `/national/overview` | AnalyticsSummary: registered/active institutions, offerings, approvedBaseIntake/approvedSupernumeraryIntake/approvedSeats, occupiedSeats/availableSeats, utilizationPercentage, activeReservations, uniqueStudents, enrolmentsByStatus, identityStatusDistribution, uploads, conflicts, openConflicts. AICTE only; KPI cards/status bars |
| `/institutions/:id/overview` | Same totals plus institutionSummary, utilization page and breakdownLimit=100. Institution path controls scope. Capacity table: fetch further pages separately |
| `/enrolments/trends` | items[{_id:{month,status},count}], observedAt,limit=120,note. Month/current-state chart; these are not state-transition history counts |
| `/intake-utilization` | items[{_id:{offering,academicYear,category,kind},approvedSeats,occupiedSeats,availableSeats,utilizationPercentage}],total,page,limit,observedAt. Page max100; allocation pool table |
| `/conflicts/summary` | observedAt,filters,applicableFilters,items[{_id:status,count}]. Case status chart; date means detection time; a case counted once |
| `/uploads/summary` | Same group shape. Only institution/state/from/to(createdAt) apply; encrypted upload jobs have no intrinsic academicYear/program/category. Never display the ignored filters as upload cohort filters |

Percentage denominator: occupied stored allocation counters / approved BASE+SUPERNUMERARY seats ×100, two decimals; zero approved produces 0. Available=max(0,approved−occupied); aggregate spare capacity cannot move between pools. ActiveReservations is independent and exposes reconciliation disagreements. Distinct selected students count once across their selected enrolments; identity distribution is over those canonical students. Entity counts ignore year/category/date, seat counts use year/category, enrolment dates mean admissionDate. Counters/current states do not reconstruct a historical population. Live metrics are independent queries, not one snapshot; show observedAt. Reports use a snapshot separately.

Intelligence: GET `/intelligence/anomalies?institution=&academicYear=` gives alerts/version/coverage; GET `/intelligence/institutions/:id/health?academicYear=` composes anomalies/quality/prevalidation; GET `.../quality-score` gives calculationVersion,score,insufficientData,reasons,components. Components have **dimension**,weight,numerator,denominator,score. Display null score as “insufficient observations”, not zero/rank. Minimum five observations for non-configuration dimensions, one offering for configuration, no truncated prevalidation. Weights: profileCompleteness20,identityAssurance15,uploadValidity20,overlapReview15,intakeConfiguration15,reconciliation15. Mock identities never count as official assurance. Exact formulas/triggers are in [INTELLIGENCE_FEATURES](docs/INTELLIGENCE_FEATURES.md).

POST `/intelligence/policy-simulations` is regulator-only and read-only. Pass academicYear/category/asOf/hypothetical kind/method/value/rounding and optional institution/program/state. Label every output HYPOTHETICAL. Existing approvedSeats caps effective ceilings; shortfall/extra-approval indicators grant no seats. Scope cap500; narrow filters on SIMULATION_SCOPE_TOO_LARGE.

For every dashboard, loading is distinct from zero data. Empty authorized scope renders zeros/empty arrays with scope labels. On 403 show permission state; 422 show filter errors; 429 back off; 503 show retry/support. Do not retain a previous institution's data when switching context.

## 8. Consent, selective verification and QR flow

Claim enum: INSTITUTION, PROGRAM, ENROLMENT_STATUS, ACADEMIC_YEAR, START_DATE, ADMISSION_DATE. No name/DOB/roll/APAAR/grades/degree/completion document claim exists. Claims response values: INSTITUTION={name,pid}, PROGRAM={name,code}, ACADEMIC_YEAR=code string, ENROLMENT_STATUS=status string, dates=YYYY-MM-DD. Unsupported COMPLETED state is labelled COMPLETION_NOT_SUPPORTED in disclosure.

1. Linked STUDENT obtains an authorized own enrolment ID and approved employer User ID through controlled onboarding. Employer directory is NOT IMPLEMENTED; do not fake a searchable national student/employer directory.
2. Student POST `/verification/invitations`: `{"enrolment":"<ownId>","employer":"<employerUserId>","claims":["INSTITUTION","PROGRAM"],"expiresInSeconds":900}`. Save invitationId; token is returned once. Invitation is not consent.
3. Share 64-character opaque token privately with the intended employer. It is one-use, expiring and employer-bound; do not put it in analytics or URLs to the API.
4. Approved EMPLOYER POST `/verification/requests`: `{"invitationToken":"<token>","purposeCode":"EMPLOYMENT_SCREENING","claims":["INSTITUTION","PROGRAM"],"expiresInSeconds":3600}`. Response includes requestId and consentRequestId. Keep those identities distinct.
5. STUDENT GET `/consents/requests?page=1&limit=20`: show employerOrganization/purposeCode/requestedClaims/status/expiry and consentRequestId. Read history separately at `/consents/history`.
6. STUDENT POST `/consents/<consentRequestId>/approve`: `{"claims":["INSTITUTION"],"expiresInSeconds":3600}`; approve only a subset. Reject with POST `.../reject` `{}`. No regulator impersonation.
7. Bound EMPLOYER GET `/verification/requests/<requestId>/result`; data includes requestId,claims,source,governmentCertified:false,observedAt. Pending/revoked/expired/foreign requests return generic unavailable. Never render the unapproved requested claims as verified.
8. STUDENT optionally POST `/credentials`: `{"request":"<requestId>","claims":["INSTITUTION"],"expiresInSeconds":600}`. Response credentialId/token/qrReference/expiresAt/source/notice. The backend returns a reference, **not a QR image**.
9. Frontend may encode the exact `satyaid://verify#token=...` reference in a QR. No third-party QR URL service; use a local library. Do not persist the token or include it in telemetry.
10. Verifier frontend scans/validates the custom URI, reads only the fragment token, authenticates the employer, then removes sensitive fragment/navigation state. For a future HTTPS landing page, strip fragments before analytics initializes. Tokens must never become query/path parameters or external referrers.
11. EMPLOYER POST `/credentials/verify`: `{"token":"<scanned-token>"}` with normal Bearer auth. A copied QR alone gives no access. Bound employer and current grant/account/linkage/expiry are rechecked transactionally.
12. STUDENT POST `/consents/<consentRequestId>/revoke` `{}` or `/credentials/<credentialId>/revoke` `{}`. Future disclosures are denied. Prior disclosed copies cannot be technically recalled. GET `/credentials/:id` returns safe metadata, not a token re-export.

Defaults: invitation900, request86400, approval3600, credential3600 seconds. Server caps can be lower; send explicit values within configured caps. Every lifetime input minimum60. Expiry is bounded by request/grant/server maximum. Store only safe IDs if building resume navigation; a credential list endpoint does not exist.

## 9. Reporting UI

AICTE_ADMIN or active own INSTITUTION_ADMIN only. POST `/reports` with `{"reportType":"INTAKE_UTILIZATION","format":"JSON","filters":{"institution":"<id>","academicYear":"<id>"}}`. Allowed types: ENROLMENT_SUMMARY,INTAKE_UTILIZATION,CATEGORY_UTILIZATION,UPLOAD_ERRORS,OVERLAP_CASES,IDENTITY_STATUS,ACADEMIC_YEAR_COMPLIANCE,STUDENT_STATUS_DISTRIBUTION. Format JSON or CSV; PDF and official filing are NOT IMPLEMENTED.

HTTP 202 returns reportId/status=PENDING/expiresAt. Poll GET `/reports/:id` every 2–3 seconds with backoff; stop at COMPLETED/FAILED or expiry. List GET `/reports?institution=&academicYear=&page=&limit=` gives bounded metadata. States PENDING→PROCESSING→COMPLETED/FAILED. Worker report lease120 seconds, three stale attempts before exhaustion. No worker heartbeat endpoint exists; pending age is an operational signal.

On COMPLETED download with authenticated GET `/reports/:id/download` as a blob. JSON is the **raw artifact** `{metadata,summary,rows}`, without the API envelope; CSV includes provenance columns and formula-safe cells. Use `api.download()` and a local object URL, revoke it after save; never add JWT to download URLs. Inaccessible jobs return REPORT_UNAVAILABLE; download checks current scope and SHA256 content digest. Reports expire24h after queuing, even if processing is delayed; REPORT_NOT_READY covers incomplete/expired reports. Poll metadata to explain which condition applies.

Artifacts describe registered institution-submitted data. metadata carries generatorVersion/generatedAt/filters/source/officialFiling:false/truncated/consistency and applicable rule versions. Detailed rows cap500; a summary can cover more than the detail. Snapshot means consistent source reads during generation, not a historical population reconstruction or government acceptance.

Failure codes: REPORT_EXPIRED,REPORT_RETRY_EXHAUSTED,REQUESTER_UNAUTHORIZED,UNSUPPORTED_REPORT_TYPE,REPORT_GENERATION_FAILED,REPORT_LEASE_LOST. Explain safe operator action; do not offer a nonexistent report retry endpoint. Submit a new report after operational correction. GET `/reports/prevalidation` is read-only findings, not regulatory certification.

## 10. Errors and UI actions

Error envelope is `{success:false,error:{code,message}}`. Validation does not expose private input details. `X-Request-ID` is a generated support correlation ID. Map stable code/status; do not expose raw server objects/stack traces. Keep a safe generic fallback for unknown codes. Rate limits are per-IP/per-process in memory; honor Retry-After and avoid aggressive polling.

| HTTP / code | User-facing message | UI action |
|---|---|---|
| 401 UNAUTHENTICATED / INVALID_TOKEN | Session expired or account unavailable | Refresh once; if still denied clear memory/login. Disabled accounts need administrator help |
| 401 INVALID_CREDENTIALS | Email or password not accepted | Stay on login, generic message |
| 401 INVALID_REFRESH_TOKEN | Session ended | Clear memory, login; never replay old refresh tokens |
| 403 BROWSER_TRANSPORT_REQUIRED | Browser sign-in route required | Migrate to browser client; no JSON downgrade |
| 403 CSRF_INVALID | Sign-in protection expired | Bootstrap once/retry browser auth once |
| 403 BROWSER_ORIGIN_DENIED / CORS_ORIGIN_DENIED | App origin is not configured | Check backend CORS/Origin/HTTPS configuration; never wildcard credentials |
| 403 FORBIDDEN | You cannot access this record/action | Stop; verify role/membership/scope, do not auto-retry |
| 404 NOT_FOUND / VERIFICATION_UNAVAILABLE / CREDENTIAL_UNAVAILABLE / REPORT_UNAVAILABLE | Record or authorization unavailable | Hide claims, show generic unavailable; do not enumerate |
| 409 DUPLICATE_RECORD / DUPLICATE_SUBMISSION | A matching record already exists | Review existing scoped submission; do not create a new identity blindly |
| 409 IDENTITY_REVIEW_REQUIRED / IDENTITY_ALREADY_LINKED | Identity needs authorized review | Stop automated linking; regulated correction, no cross-institution disclosure |
| 409 WRITE_CONFLICT / CONFLICT_STATE_CHANGED | Record changed while editing | Reload current version and compare |
| 409 CAPACITY_EXHAUSTED / CAPACITY_CONFLICT | Approved seat capacity unavailable | Refresh capacity; reviewed adjustment only |
| 409 INVALID_STATE_TRANSITION / CONSENT_STATE_CONFLICT | Action is no longer available | Reload current state and available actions |
| 409 IDEMPOTENCY_CONFLICT | Retry key refers to another request | Keep old key for exact retry; explicit edited/new submission uses new key |
| 409 UPLOAD_NOT_VALIDATED / UPLOAD_NOT_FAILED | Upload is not in the required state | Poll/review current state |
| 409 UPLOAD_PAYLOAD_EXPIRED | Staging expired | New file and new idempotency key required |
| 409 REPORT_NOT_READY | Report incomplete or expired | Inspect status/expiry; re-request if expired |
| 409 REPORT_CONTENT_MISMATCH | Download integrity check failed | Do not open artifact; operator investigation/new report |
| 413 PAYLOAD_TOO_LARGE / UPLOAD_LIMIT_EXCEEDED | File/request too large | Reduce to documented limits |
| 422 VALIDATION_ERROR / FILE_REQUIRED / UNSUPPORTED_UPLOAD_TYPE | Check required fields or file type | Highlight local validation; preserve safe input |
| 422 CLAIM_SCOPE_DENIED / LIFETIME_EXCEEDED | Requested sharing exceeds allowed limits | Restrict claim subset/lifetime; require explicit student approval |
| 422 INVALID_ALLOCATION / INVALID_STUDENT_ASSOCIATION / INVALID_ADMISSION_DATE / ACADEMIC_YEAR_MISMATCH | Admission references/dates do not match approvals | Reload scope/year/pool; correct data |
| 422 INVALID_ACADEMIC_YEAR / SIMULATION_PERIOD_INVALID / SIMULATION_SCOPE_TOO_LARGE | Scenario scope/period invalid | Correct year/asOf or narrow filters |
| 429 RATE_LIMITED | Too many requests | Respect Retry-After; exponential backoff, no loop |
| 503 *_KEY_UNAVAILABLE / *_KEY_VERSION_UNAVAILABLE / *_DECRYPTION_FAILED | Protected service temporarily unavailable | Operator restores correct key/version; never re-upload to bypass identity uniqueness |
| 503 MOCK_PROVIDER_DISABLED / PROVIDER_UNAVAILABLE | Verification provider unavailable | Label unavailable/mock; no official verification claim |
| 503 DATABASE_UNAVAILABLE | Database not ready | Retry with backoff; operator checks replica primary |
| 500 INTERNAL_SERVER_ERROR | Request could not be completed | Show correlation ID; preserve safe retry key; do not blindly retry financial/admission-like effects |
| Worker job FAILED / stable failureCode | Background processing failed | Display safe code, inspect current job; upload retry if supported; report re-request |

No dedicated WORKER_UNAVAILABLE HTTP endpoint/code exists. Do not fabricate one; delayed processing should show “Waiting for worker” with a support threshold. Consent expiry/revocation deliberately shares unavailable errors with guessed references; never suggest a token grants consent automatically.

## 11. Shared types and API client

[shared/api-types.ts](shared/api-types.ts) is generated by openapi-typescript from validated OpenAPI. `paths` includes every request/query/response contract; `components['schemas']` provides User,Institution,Program,AcademicYear,Student,InstitutionStudentProfile,Enrolment,IntakeAllocation,UploadJob,ConflictCase,AnalyticsSummary,EmployerVerificationRequest,ConsentGrant,Credential,RegulatoryReport,AnomalyAlert,QualityScore,PolicySimulation. These are wire projections, not ORM objects. Dates/IDs are strings, optional fields may be absent, score can be null. For exact operation inputs prefer the `paths` type rather than reconstructing a DTO from a database diagram.

```ts
import type { paths, components } from './shared/api-types';
type Student = components['schemas']['Student'];
type RegistrationBody = paths['/api/v1/students']['post']['requestBody']['content']['application/json'];
type Enrolment = components['schemas']['Enrolment'];
```

Copy the shared client/types into a frontend shared folder, or import them through an agreed workspace package; do not import server Mongoose modules into Vite. The client returns decoded `data`; `download()` returns Blob. Send JSON.stringify bodies and explicit Content-Type for JSON. The client retries one 401 because authentication rejects before route mutation, never arbitrary 409/5xx/network failure. Use backend idempotency keys for admission/upload/transfer retries. Streaming request bodies are not supported by this retry helper; FormData is replayable. Serialize login/logout with session transitions; cancel pending UI work before logout.

## 12. Members 2 and 3 checklist

Member 2 owns regulator/institution screens; Member 3 owns student/employer sharing/auth shell. Agree on the shared client and role context first.

- [ ] Configure VITE_API_BASE_URL; exact CORS origin; API ready and worker running.
- [ ] Generate private synthetic users; login/restore/refresh/logout tested without token persistence.
- [ ] Implement all five role navigation guards plus server-side 401/403 handling.
- [ ] Connect national and institution dashboard metrics with documented filters/denominators.
- [ ] Connect institution/program/year/intake/quota pages and preserve restricted write actions.
- [ ] Student forms use strict fields, version handling, privacy-safe APAAR inputs and no identifier URLs.
- [ ] Draft/activate/withdraw/transfer workflows handle capacity, idempotency and conflicts.
- [ ] Upload queued/validation/review/commit/partial/retry states and error downloads work.
- [ ] Conflict views preserve institution redaction; regulator reviews remain separate actions.
- [ ] Reports poll/download raw JSON/CSV; expiry/truncation/provenance shown.
- [ ] Student-owned invitations and subset approval/rejection/revocation work.
- [ ] Bound employer request list/result and credential scan/verification work.
- [ ] QR library runs locally; tokens stay out of URLs to API, analytics and persistent storage.
- [ ] Loading/empty/error/permission/expired states render on mobile and desktop.
- [ ] Unsupported pages/actions are labelled NOT IMPLEMENTED, never mocked as live backend capabilities.
- [ ] Test synthetic demo across two institutions and two employers; verify isolation and revocation.
- [ ] Run integration smoke: admin approvals → admission/upload → conflict → consent → employer result → revoke → report → read-only simulation → logout.

## 13. Synthetic demo accounts and credentials

No working passwords are published. Set local private environment values for DEMO_ADMIN_EMAIL (must end `@example.invalid`), DEMO_ADMIN_PASSWORD, DEMO_STUDENT_PASSWORD, DEMO_EMPLOYER_PASSWORD; each password16–72 UTF-8 bytes. Set NODE_ENV=development, ALLOW_DEMO_SEED=true and a dedicated Mongo database name ending `_demo`. Provide independent server cryptographic keys; never commit an actual .env.

Run `npm run db:seed`, then `npm run db:seed:governance`. The first creates the chosen AICTE admin and fictional institutions/approvals/student/overlap. The second provisions `student@example.invalid` and `employer@example.invalid`, links the synthetic student account and approves a fictional employer. Existing passwords and governance decisions are preserved; rerunning with a different password does not reset accounts. Consent is never silently granted.

Institution admin and staff accounts are **not automatically provisioned** by these existing seed commands. An authorized operator must create those controlled synthetic User accounts (bcrypt hash) and then use the actual membership API. There is no public registration endpoint. Frontend must obtain private test credentials through the team's secure local configuration, not this document/chat. Login failures after a seed rerun may mean an existing account preserved its original password.

Use only fictional names and reserved example.invalid emails. The optional seed APAAR value is an explicit zero-padded synthetic fixture, never a genuine student's identity. Demo seeds and tests do not prove national scale or official data authenticity.


## PS compliance handoff — statuses, identity review and secure print preparation

### Profile form and reporting changes

Add three independent selects to student registration/profile correction: `nriStatus`, `ociStatus`, `foreignNationalStatus`, each `YES | NO | UNKNOWN`. NRI means the institution declares an NRI classification for this student profile; OCI means it declares OCI cardholder/status; foreignNationalStatus means it declares foreign-national status. These are institution-submitted declarations, not legally verified citizenship/residency/immigration determinations. Do not infer one from another or force mutual exclusion. Different institutions keep their own recorded declarations. Do not change allocation selection or calculate quotas from these fields. Existing records require no migration; reads normalize absent fields to UNKNOWN. STUDENT can read linked profiles; only scoped institution writers/regulator can edit; employers receive none of these fields through their claim APIs.

For regulatory dashboards use the existing report workflow with `reportType: "STUDENT_STATUS_DISTRIBUTION"`, JSON/CSV and normal scoped filters. Rows contain nriStatus/ociStatus/foreignNationalStatus/enrolmentStatus/enrolmentCount/distinctStudents. Counts derive from selected authoritative enrolments joined to their institution profile. Enrolment counts are additive across rows; distinctStudents is deduplicated within each row and can repeat across declaration groups/institutions. UNKNOWN includes old/missing profile fields; no optimistic default NO. Current profile declarations are not a historical admission-time citizenship snapshot. IDENTITY_STATUS reports now include `summary.identifierPresence` groups LINKED/MISSING plus the explicit admission policy. Neither report returns raw APAAR.

Student creation, reading and identity-status responses now include `identityAssessment`:

```json
{"policy":"ALLOW_WITH_REVIEW_FLAGS_V1","identifierPresence":"MISSING","formatStatus":"NOT_PROVIDED","verificationStatus":"UNVERIFIED","officialVerificationAvailable":false,"reviewRequired":true,"warnings":["MISSING_APAAR","IDENTITY_NOT_OFFICIALLY_VERIFIED"]}
```

LINKED means protected vault presence; VALID_AT_LINK means the protected link workflow checked12-digit format, not identity authenticity. MOCK_VERIFIED is always simulated; mismatch/timeout retain distinct outcomes. Drafts and activation remain allowed with review flags to preserve the prototype's documented policy; missing-link activations append ADMISSION_IDENTITY_MISSING_REVIEW audit metadata. Prevalidation adds MISSING_APAAR_V1. No mock result or anomaly alone prohibits admission. Operators can run `npm run reconcile -- --identity` for bounded read-only key/ciphertext/duplicate/stale-assurance findings; no automatic correction is performed.

### Structured certificate print support — no PDF or degree issuance

Member2 integrates issuer/regulator actions; Member3 integrates student print consent. Do not reuse employer invitations/consent grants or add APAAR to employer claim types. Eligibility here means an ACTIVE institution/profile/program/enrolment and active seat reservation for administrative print preparation. Graduation/completion/marks/qualifications and genuine degree-awarding powers are not established by SatyaID.

1. AICTE operator reviews external institutional authority outside SatyaID, then POST `/api/v1/institutions/<institutionId>/certificate-print-authorization`:

```json
{"status":"APPROVED","authorityReference":"SYNTHETIC_OPERATOR_REVIEW","expiresAt":"2027-01-01T00:00:00Z"}
```

Approval must expire in the future, within366 days. Use a suitable current date during the demo. SUSPENDED denies future full disclosure. This is an operator-attested integration permission; `degreeAwardingStatus` remains NOT_INDEPENDENTLY_VERIFIED. No ordinary institution actor can authorize itself.

2. Linked STUDENT POST `/api/v1/enrolments/<ownActiveEnrolmentId>/certificate-print-consent` with `{"expiresInSeconds":900}` (60–86400, default900). Save consentId/expiry and share the safe reference with the intended institution through controlled onboarding. Every grant appends a new record. POST `/enrolments/<id>/certificate-print-consent/revoke` `{}` revokes all own grants for that enrolment, idempotently, including after withdrawal. Consent history is retained. There is no print-consent listing endpoint; this minimal contract uses known enrolment/grant IDs. Existing student enrolment discovery limitations still apply.

3. Active own INSTITUTION_ADMIN POST `/api/v1/students/<studentId>/certificate-print-data`:

```json
{"institution":"<ownInstitutionId>","enrolment":"<ownActiveEnrolmentId>","purposeCode":"CERTIFICATE_PRINT_PREPARATION"}
```

Default REDACTED response includes institutionStudentId, `apaarId:null`, apaarDisplay=************ (or NOT_LINKED), identityAssessment, eligibility=ACTIVE_RECORD_PRINT_PREPARATION_ONLY, officialCertificate:false, qualificationCertified:false and notice. A redacted view does not require a full-disclosure grant/print authorization, but ownership and active-record eligibility still apply. AICTE/staff/students/employers do not call this issuer-only endpoint.

4. FULL request adds `"disclosure":"FULL","consentId":"<currentOwnStudentPrintConsentId>"`. Only then can apaarId/apaarDisplay contain the12-digit identifier, after current regulator authorization, student linkage/account/consent, record and key checks. Unverified or MOCK_VERIFIED identifiers remain explicitly unverified/simulated in identityAssessment; they do not become certified. Missing identity returns409 IDENTITY_NOT_LINKED; unavailable keys/decryption fail closed503. Ineligible or mismatched records use404 PRINT_RECORD_UNAVAILABLE; cross-institution roles use403; absent/suspended/expired authorization uses403 PRINT_AUTHORIZATION_REQUIRED; missing/revoked/expired/wrong-student consent uses403 PRINT_CONSENT_REQUIRED.

All print-support responses set no-store; the data endpoint also sets private, Pragma:no-cache and Expires:0. Fetch only on explicit user action, keep the payload in memory, exclude the page/body from session replay/analytics/APM, clear DOM/state after print/cancel, and never use a bearer URL or persistent client cache. No unencrypted server export/PDF is stored. Authorized printing creates a disclosed copy that revocation cannot recall. Audit records capture actor/action/enrolment/institution metadata, never plaintext identifiers. Render the disclaimer: **“Administrative print-support data; institution independently issues and validates any certificate.”**

Frontend checklist additions: independent tri-state selects;13-column upload/review errors and legacy support; linked/missing/mock badges; declaration distribution report and denominator notes; student print grant/revoke UI; operator print-authorization UI; institution redacted preview and explicitly consented full display; no fake graduation/certificate validity claim. No actual frontend files are changed by this backend patch.
