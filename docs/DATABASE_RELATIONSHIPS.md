# Database relationships

**IMPLEMENTED:** referenced documents and indexes; MongoDB does not enforce relational foreign keys.

```mermaid
erDiagram
 User ||--o{ InstitutionMembership : holds
 Institution ||--o{ InstitutionMembership : owns
 Institution ||--o{ InstitutionProgram : offers
 Program ||--o{ InstitutionProgram : describes
 InstitutionProgram ||--o{ IntakeAllocation : receives
 AcademicYear ||--o{ IntakeAllocation : scopes
 SeatCategory ||--o{ IntakeAllocation : categorizes
 InstitutionProgram ||--o{ QuotaRule : scopes
 AcademicYear ||--o{ QuotaRule : scopes
 SeatCategory ||--o{ QuotaRule : categorizes
 Student ||--o| ApaarIdentityVault : protects
 Student ||--o{ Enrolment : attends
 IntakeAllocation ||--o{ Enrolment : allocates
 Enrolment ||--o{ EnrolmentHistory : records
 User ||--o{ RefreshSession : authenticates
 User ||--o{ AuditEvent : acts
 Student ||--o{ VerificationRequest : concerns
 VerificationRequest ||--o{ ConsentRequest : requests
 ConsentRequest ||--o{ ConsentGrant : authorizes
 Institution ||--o{ UploadJob : owns
 UploadJob ||--o{ ValidationIssue : reports
```

Ownership of an allocation/enrolment derives through offering → institution; it is not accepted from a caller's self-asserted tenant claim. Cross-institution conflicts may exist intentionally, but future responses must not disclose another institution's private records.

## Batch 2 additions — IMPLEMENTED

```mermaid
erDiagram
 Student ||--o{ StudentInstitution : has_private_profile
 Institution ||--o{ StudentInstitution : owns
 Student ||--o{ IdentityVerificationEvent : records
 Enrolment ||--o| SeatReservation : consumes
 IntakeAllocation ||--o{ SeatReservation : counts
 UploadJob ||--o{ UploadRowResult : stages_encrypted_rows
 Student ||--o{ EnrolmentConflict : investigated
 EnrolmentConflict ||--o{ ConflictEvidence : references
 EnrolmentConflict ||--o{ ConflictHistory : records
 Enrolment ||--o{ TransferRequest : source
 IntakeAllocation ||--o{ TransferRequest : target
```

Unique indexes protect student/institution associations, institution roll numbers, linked user accounts (partial index), job/row positions, institution admission idempotency keys (partial index), enrolment reservations, transfer idempotency and canonical conflict pairs/rules. No global one-active-enrolment constraint is introduced. Tenant fields on enrolments are derived from validated allocations in services; they are indexed query projections, not client authority.
