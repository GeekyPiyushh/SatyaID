# Analytics API — IMPLEMENTED

Base `/api/v1/analytics`. All endpoints require JWT authentication and use the existing `{success,message,data}` envelope. No student names, roll numbers, contacts, raw APAAR IDs or vault data are returned. Figures describe **data currently registered in SatyaID**, not the national student population.

| Method | Route | Permission / result |
|---|---|---|
| GET | `/national/overview` | AICTE_ADMIN only; selected regulatory totals |
| GET | `/institutions/:id/overview` | Active own institution membership or AICTE; totals plus first 100 allocation breakdowns |
| GET | `/enrolments/trends` | Explicit own institution scope or AICTE; max 120 month/status groups |
| GET | `/intake-utilization` | Explicit own institution scope or AICTE; page/limit, max 100 |
| GET | `/conflicts/summary` | Scoped case counts by current status |
| GET | `/uploads/summary` | Scoped upload job counts by current status |

Filters: institution, academicYear, program, category (ObjectIds); state (regulator-only); from/to (YYYY-MM-DD, inclusive UTC days). Query schemas reject unknown fields. Non-regulators must provide institution, except the institution path endpoint takes it from `:id`; membership is enforced server-side. A staff role without active membership does not grant access. STUDENT and EMPLOYER have no analytics access.

Example:

```http
GET /api/v1/analytics/institutions/<institutionId>/overview?academicYear=<yearId>
Authorization: Bearer <access-token>
```

Selected data fields:

```json
{"label":"Data currently registered in SatyaID; not national population statistics","registeredInstitutions":1,"activeInstitutions":1,"offerings":1,"approvedBaseIntake":10,"approvedSupernumeraryIntake":2,"approvedSeats":12,"occupiedSeats":1,"availableSeats":11,"utilizationPercentage":8.33,"activeReservations":1,"uniqueStudents":1,"enrolmentsByStatus":[{"_id":"ACTIVE","count":1}],"identityStatusDistribution":[{"_id":"UNVERIFIED","count":1}],"openConflicts":1,"observedAt":"<UTC timestamp>"}
```

Actual responses also include filters, source/denominator notes, allocation breakdown, upload/conflict distributions, and consistency. Institution-specific responses include safe institutionSummary metadata and a bounded utilization page; fetch later pages through intake-utilization.

## Definitions and filtering

- Approved capacity sums current approved allocation pools: BASE and SUPERNUMERARY separately. Category pools are disjoint approvals, not inferred national percentages.
- Occupancy uses stored allocation occupiedSeats counters. Active reservation count is reported independently to expose reconciliation issues. Available seats = max(0, approved minus occupied); aggregate availability does not permit moving seats across pools.
- Utilization = occupied/approved ×100 rounded to two decimals; zero approved seats gives 0, not NaN/Infinity. Prevalidation flags invalid counters separately.
- Enrolment state distributions use actual current states, including historical states where stored. Trends group admissionDate month and **current** state; they are not historical state-transition time series. Results are newest 120 month/state groups, with the limit disclosed.
- Unique students group canonical student references across all selected enrolments. A shared student with two institutional enrolments counts once in a national selected cohort. Identity status distribution uses those distinct students, not enrolment count.
- Institution/offering entity counts apply institution/state/program scope, not academic-year/category/date filters. Seat/reservation metrics use academicYear/category and offering scope; dates do not retrospectively reconstruct approvals or reservations.
- Enrolment from/to filters use admissionDate. Conflict filters use detection createdAt and either involved enrolment for year/program/category; each case counts once. Open conflicts exclude RESOLVED/DISMISSED.
- Upload jobs have no intrinsic year/program/category field because pending row payloads are encrypted. Upload summaries apply only institution/state/createdAt; responses disclose applicable filter names. Other overview dimensions can use the broader filter set. Do not present upload counts as year/program-specific.
- Most metrics are live independent queries, not a single snapshot. No scoped sensitive cache is used. Report jobs may use snapshot reads separately.

All aggregation pipelines have maximum query times. Breakdown grouping/pagination is done in MongoDB, not by loading entire collections into application memory. Existing source indexes and foreign-key lookup indexes are reused; explain/load testing at national scale remains PLANNED.

Errors: 401 missing/invalid JWT; 403 forbidden role, missing institution scope or cross-institution/state access; 422 invalid/unknown filters; unexpected DB errors return the existing safe generic envelope. Empty permitted scopes return zero totals and empty arrays.
