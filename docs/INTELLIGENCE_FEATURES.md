# Explainable intelligence — IMPLEMENTED, no mandatory ML

All results are project operational signals, not government ratings, fraud judgments or automated admission decisions. Source data comes from actual SatyaID collections. No model is trained on synthetic records and no predictive accuracy is claimed.

| Method | Route | Scope / input |
|---|---|---|
| GET | `/api/v1/intelligence/anomalies` | Own institution membership or regulator; institution + academicYear required, optional from/to |
| GET | `/api/v1/intelligence/institutions/:id/health` | Own institution or regulator; academicYear required, optional from/to |
| GET | `/api/v1/intelligence/institutions/:id/quality-score` | Same scope and filters |
| POST | `/api/v1/intelligence/policy-simulations` | AICTE_ADMIN only; explicit scenario below |

STUDENT and EMPLOYER are forbidden. Rate limit: 60/minute/IP in memory. Event windows default to the last 30 UTC days. Explicit ranges must be ordered and at most 366 days. Current cohort/counter data is not a historical snapshot; event windows apply to upload/audit/attributed verification evidence. Profile completeness is institution-wide. Identity events without institution attribution are excluded from institution mismatch signals.

## A. Deterministic anomaly rules

Every alert includes ruleId/severity/explanation/evidence/institution/academicYear/window/recommendedAction. Evidence contains counts and appropriate scoped references, never raw identity values.

| Rule | Exact trigger | Interpretation |
|---|---|---|
| UPLOAD_REJECTION_PRESSURE_V1 | At least 10 observed rows and invalid+failed fraction ≥20% | Review source formatting/process |
| UNRESOLVED_OVERLAP_PRESSURE_V1 | At least 5 active enrolments, at least 3 open cases, cases/active ≥25% | Review evidence; overlaps may be legitimate |
| CAPACITY_RECONCILIATION_V1 | Any approved-bound/counter/reservation inconsistency | Reconcile administratively; no silent repair |
| CAPACITY_ATTEMPT_PRESSURE_V1 | At least 5 audited standalone capacity rejections | Demand/configuration pressure, not misconduct |
| AMENDMENT_VOLUME_V1 | At least 10 audited profile/admission amendments | Review correction workload, not a claim of errors |
| IDENTITY_MISMATCH_REVIEW_V1 | At least 5 attributed verification attempts and 3 mismatches | Review source/provider; MOCK_APAAR outcomes remain simulations |

Example evidence: `{ "rejectedRows":5, "observedRows":10, "percentage":50 }`. Thresholds/version are project-defined, not AICTE rules. No protected characteristics enter the rules. Coverage/truncation and observation time are disclosed.

## B. Read-only policy simulator

```json
{"institution":"<id>","academicYear":"<id>","category":"<id>","asOf":"2026-10-24T00:00:00Z","hypothetical":{"kind":"BASE","method":"PERCENTAGE","value":70,"rounding":"CEILING"}}
```

Optional institution/program/state scope is regulator-only. asOf must fall in the selected academic year. Fixed values must be nonnegative integers; percentages are 0–100. Rounding supports FLOOR, CEILING, HALF_UP using the shared Decimal quota implementation.

Results are labelled HYPOTHETICAL. For each selected allocation pool:

- Current configured ceiling = min(approvedSeats, applicable approved rule ceilings at asOf), defaulting to approvedSeats when no applicable configured quota exists.
- Hypothetical quota ceiling = supplied fixed value or rounded baseSeats × percentage /100.
- Hypothetical effective ceiling = min(existing approvedSeats, hypothetical quota ceiling).
- Difference = hypothetical effective minus current configured ceiling.
- Potential shortfall = max(0, current occupiedSeats minus hypothetical effective ceiling).
- Extra approval needed = max(0, hypothetical quota ceiling minus existing approvedSeats).

A fixed scenario of 100 on an approved pool of 10 still has an effective ceiling of 10; it does not authorize 90 extra seats. Occupancy is current, not forecast or historical asOf occupancy. Zero hypothetical capacity produces null utilization percentage and an explicit shortfall, not Infinity. Outputs include affected offering count, version/assumption notes and current rule references. Scope is capped at 500 queried allocation pools; narrow filters on SIMULATION_SCOPE_TOO_LARGE. No allocations, quota rules, admissions, reservations or audit records are written by the simulator.

## C. Transparent operational scorecard

Version satyaid-quality-v1. Components are clamped 0–100; weights sum to 100:

| Component | Weight | Numerator / denominator |
|---|---:|---|
| profileCompleteness | 20 | Active profiles with mandatory name/roll/student ref / active institution profiles |
| identityAssurance | 15 | OFFICIALLY_VERIFIED distinct selected students / distinct selected students |
| uploadValidity | 20 | Non-invalid/non-failed observed rows / all observed current row outcomes |
| overlapReview | 15 | max(0, active enrolments − open cases) / active enrolments |
| intakeConfiguration | 15 | Active offerings with a selected-year allocation / active offerings |
| reconciliation | 15 | max(0, observed allocation+active-enrolment count − ERROR/BLOCKING findings) / that observation count |

Overall score = sum(component score × weight/100), rounded to two decimals, **only** if every non-configuration component has ≥5 observations, configuration has ≥1 offering, and prevalidation detail is not truncated. Otherwise score is null, insufficientData is true and explicit reasons/component coverage are returned. There is no ranking endpoint. Missing uploads do not become a zero official rating. Mock identities do not count as official assurance; this is explicitly a verification-readiness component and does not restrict admission or imply wrongdoing.

Example healthy formula fixture: components 90/50/75/95/75/90 yield 79.5 at published weights. Small demo datasets return insufficient data rather than a fabricated authoritative score. Health composes the rule outputs, scorecard and prevalidation; it does not certify compliance.

Errors: 401 authentication; 403 wrong role/scope; 422 invalid filters/range/scenario, INVALID_ACADEMIC_YEAR, SIMULATION_PERIOD_INVALID, SIMULATION_SCOPE_TOO_LARGE. Empty datasets remain explainable without divide-by-zero values.
