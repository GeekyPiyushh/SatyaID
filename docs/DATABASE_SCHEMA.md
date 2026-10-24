# MongoDB schema catalog

**IMPLEMENTED:** Mongoose schemas and declared indexes. References are ObjectIds, not database-enforced foreign keys. Growing histories use separate collections. Timestamps are automatic.

## StudentInstitution

Collection: `studentinstitutions`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| institution | ObjectId → Institution | true | included |
| institutionStudentId | String | true | included |
| displayName | String | true | included |
| dateOfBirth | Date | false | included |
| nriStatus | String | false | included |
| ociStatus | String | false | included |
| foreignNationalStatus | String | false | included |
| status | String | false | included |
| version | Number | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "student": 1,
      "institution": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "institution": 1,
      "institutionStudentId": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "institution": 1,
      "status": 1,
      "_id": 1
    },
    {
      "unique": false
    }
  ]
]
```

## IdentityVerificationEvent

Collection: `identityverificationevents`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| institution | ObjectId → Institution | false | included |
| student | ObjectId → Student | true | included |
| actor | ObjectId → User | true | included |
| status | String | true | included |
| provider | String | false | included |
| providerVersion | String | false | included |
| reasonCode | String | false | included |
| traceId | String | false | included |
| keyVersion | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "student": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "institution": 1,
      "createdAt": -1,
      "reasonCode": 1
    },
    {
      "unique": false
    }
  ]
]
```

## UploadRowResult

Collection: `uploadrowresults`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| job | ObjectId → UploadJob | true | included |
| rowNumber | Number | true | included |
| status | String | true | included |
| errorCodes | Array | false | included |
| warnings | Array | false | included |
| payload | Buffer | false | hidden |
| student | ObjectId → Student | false | included |
| enrolment | ObjectId → Enrolment | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "job": 1,
      "rowNumber": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "job": 1,
      "status": 1,
      "rowNumber": 1
    },
    {
      "unique": false
    }
  ]
]
```

## ConflictEvidence

Collection: `conflictevidences`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| conflict | ObjectId → EnrolmentConflict | true | included |
| actor | ObjectId → User | true | included |
| institution | ObjectId → Institution | false | included |
| typeCode | String | true | included |
| protectedObjectReference | String | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "conflict": 1,
      "createdAt": 1
    },
    {
      "unique": false
    }
  ]
]
```

## ConflictHistory

Collection: `conflicthistories`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| conflict | ObjectId → EnrolmentConflict | true | included |
| actor | ObjectId → User | true | included |
| action | String | true | included |
| reasonCode | String | false | included |
| resolution | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "conflict": 1,
      "createdAt": 1
    },
    {
      "unique": false
    }
  ]
]
```

## SeatReservation

Collection: `seatreservations`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| enrolment | ObjectId → Enrolment | true | included |
| allocation | ObjectId → IntakeAllocation | true | included |
| status | String | false | included |
| quotaRule | ObjectId → QuotaRule | false | included |
| releasedAt | Date | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "enrolment": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "allocation": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ]
]
```

## TransferRequest

Collection: `transferrequests`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| sourceEnrolment | ObjectId → Enrolment | true | included |
| sourceInstitution | ObjectId → Institution | true | included |
| targetAllocation | ObjectId → IntakeAllocation | true | included |
| targetInstitution | ObjectId → Institution | true | included |
| targetInstitutionStudentId | String | true | included |
| requestedBy | ObjectId → User | true | included |
| idempotencyKey | String | true | included |
| fingerprint | String | true | hidden |
| status | String | false | included |
| startsOn | Date | true | included |
| admissionDate | Date | true | included |
| reasonCode | String | false | included |
| reviewedBy | ObjectId → User | false | included |
| targetEnrolment | ObjectId → Enrolment | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "sourceEnrolment": 1,
      "idempotencyKey": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "sourceInstitution": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "targetInstitution": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ]
]
```

## VerificationInvitation

Collection: `verificationinvitations`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| enrolment | ObjectId → Enrolment | true | included |
| employer | ObjectId → User | true | included |
| digest | String | true | hidden |
| maxClaims | Array | false | included |
| expiresAt | Date | true | included |
| usedAt | Date | false | included |
| tokenPurgedAt | Date | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "digest": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "student": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ]
]
```

## VerificationEvent

Collection: `verificationevents`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| request | ObjectId → VerificationRequest | true | included |
| actor | ObjectId → User | true | included |
| eventCode | String | true | included |
| claimTypes | Array | false | included |
| credential | ObjectId → DigitalCredential | false | included |
| outcome | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "request": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ]
]
```

## DigitalCredential

Collection: `digitalcredentials`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| request | ObjectId → VerificationRequest | true | included |
| consentGrant | ObjectId → ConsentGrant | true | included |
| student | ObjectId → Student | true | included |
| requester | ObjectId → User | true | included |
| enrolment | ObjectId → Enrolment | true | included |
| claimTypes | Array | false | included |
| tokenDigest | String | true | hidden |
| expiresAt | Date | true | included |
| revokedAt | Date | false | included |
| tokenPurgedAt | Date | false | included |
| source | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "tokenDigest": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "student": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "requester": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ]
]
```

## ReportJob

Collection: `reportjobs`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| requestedBy | ObjectId → User | true | included |
| institution | ObjectId → Institution | false | included |
| filters | Mixed | true | included |
| reportType | String | true | included |
| format | String | true | included |
| status | String | false | included |
| attempts | Number | false | included |
| leaseToken | String | false | included |
| leaseUntil | Date | false | included |
| failureCode | String | false | included |
| generatedAt | Date | false | included |
| expiresAt | Date | true | included |
| metadata | Mixed | false | included |
| content | Buffer | false | hidden |
| contentDigest | String | false | included |
| payloadPurgedAt | Date | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "status": 1,
      "leaseUntil": 1,
      "createdAt": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "institution": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "requestedBy": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ]
]
```

## IdentityRegistryLock

Collection: `identityregistrylocks`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| _id | String | false | included |
| version | Number | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[]
```

## CertificatePrintAuthorization

Collection: `certificateprintauthorizations`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| institution | ObjectId → Institution | true | included |
| status | String | true | included |
| authorityReference | String | true | included |
| expiresAt | Date | true | included |
| authorizedBy | ObjectId → User | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "institution": 1
    },
    {
      "unique": true
    }
  ]
]
```

## CertificatePrintConsent

Collection: `certificateprintconsents`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| enrolment | ObjectId → Enrolment | true | included |
| institution | ObjectId → Institution | true | included |
| student | ObjectId → Student | true | included |
| grantedBy | ObjectId → User | true | included |
| expiresAt | Date | true | included |
| revokedAt | Date | false | included |
| purpose | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "enrolment": 1,
      "grantedBy": 1,
      "expiresAt": 1
    },
    {}
  ]
]
```

## User

Collection: `users`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| email | String | true | included |
| passwordHash | String | true | hidden |
| role | String | true | included |
| active | Boolean | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "email": 1
    },
    {
      "unique": true
    }
  ]
]
```

## Institution

Collection: `institutions`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| pid | String | true | included |
| name | String | true | included |
| state | String | true | included |
| status | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "pid": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "state": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ]
]
```

## InstitutionMembership

Collection: `institutionmemberships`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| institution | ObjectId → Institution | true | included |
| user | ObjectId → User | true | included |
| role | String | true | included |
| active | Boolean | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "institution": 1,
      "user": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "user": 1,
      "active": 1
    },
    {
      "unique": false
    }
  ]
]
```

## EmployerProfile

Collection: `employerprofiles`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| user | ObjectId → User | true | included |
| organization | String | true | included |
| status | String | false | included |
| approvalReference | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "user": 1
    },
    {
      "unique": true
    }
  ]
]
```

## Student

Collection: `students`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| displayName | String | true | included |
| user | ObjectId → User | false | included |
| lockVersion | Number | false | included |
| identityStatus | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "user": 1
    },
    {}
  ],
  [
    {
      "user": 1
    },
    {
      "unique": true,
      "partialFilterExpression": {
        "user": {
          "$type": "objectId"
        }
      },
      "name": "student_account_unique"
    }
  ]
]
```

## ApaarIdentityVault

Collection: `apaaridentityvaults`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| ciphertext | Buffer | true | hidden |
| nonce | Buffer | true | hidden |
| tag | Buffer | true | hidden |
| lookupDigest | Buffer | true | hidden |
| keyVersion | String | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "student": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "keyVersion": 1,
      "lookupDigest": 1
    },
    {
      "unique": true
    }
  ]
]
```

## Program

Collection: `programs`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| code | String | true | included |
| name | String | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "code": 1
    },
    {
      "unique": true
    }
  ]
]
```

## InstitutionProgram

Collection: `institutionprograms`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| institution | ObjectId → Institution | true | included |
| program | ObjectId → Program | true | included |
| active | Boolean | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "institution": 1,
      "program": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "program": 1
    },
    {}
  ]
]
```

## AcademicYear

Collection: `academicyears`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| code | String | true | included |
| startsOn | Date | true | included |
| endsOn | Date | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "code": 1
    },
    {
      "unique": true
    }
  ]
]
```

## SeatCategory

Collection: `seatcategories`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| code | String | true | included |
| name | String | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "code": 1
    },
    {
      "unique": true
    }
  ]
]
```

## IntakeAllocation

Collection: `intakeallocations`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| offering | ObjectId → InstitutionProgram | true | included |
| academicYear | ObjectId → AcademicYear | true | included |
| category | ObjectId → SeatCategory | true | included |
| kind | String | true | included |
| approvedSeats | Number | true | included |
| occupiedSeats | Number | false | included |
| sourceReference | String | true | included |
| version | Number | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "offering": 1,
      "academicYear": 1,
      "category": 1,
      "kind": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "academicYear": 1
    },
    {}
  ],
  [
    {
      "category": 1
    },
    {}
  ]
]
```

## QuotaRule

Collection: `quotarules`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| offering | ObjectId → InstitutionProgram | true | included |
| academicYear | ObjectId → AcademicYear | true | included |
| category | ObjectId → SeatCategory | true | included |
| version | Number | true | included |
| kind | String | true | included |
| method | String | true | included |
| value | Number | true | included |
| rounding | String | true | included |
| effectiveFrom | Date | true | included |
| effectiveUntil | Date | true | included |
| sourceReference | String | true | included |
| approvalStatus | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "offering": 1,
      "academicYear": 1,
      "category": 1,
      "version": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "academicYear": 1
    },
    {}
  ],
  [
    {
      "category": 1
    },
    {}
  ]
]
```

## Enrolment

Collection: `enrolments`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| allocation | ObjectId → IntakeAllocation | true | included |
| status | String | false | included |
| admissionDate | Date | false | included |
| institutionStudentId | String | false | included |
| entryType | String | false | included |
| startsOn | Date | false | included |
| endsOn | Date | false | included |
| transferFrom | ObjectId → Enrolment | false | included |
| institution | ObjectId → Institution | false | included |
| offering | ObjectId → InstitutionProgram | false | included |
| academicYear | ObjectId → AcademicYear | false | included |
| category | ObjectId → SeatCategory | false | included |
| idempotencyKey | String | false | included |
| requestFingerprint | String | false | included |
| version | Number | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "student": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "institution": 1,
      "academicYear": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "allocation": 1,
      "institutionStudentId": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "transferFrom": 1
    },
    {}
  ],
  [
    {
      "offering": 1
    },
    {}
  ],
  [
    {
      "academicYear": 1
    },
    {}
  ],
  [
    {
      "category": 1
    },
    {}
  ],
  [
    {
      "institution": 1,
      "idempotencyKey": 1
    },
    {
      "unique": true,
      "partialFilterExpression": {
        "idempotencyKey": {
          "$type": "string"
        }
      }
    }
  ]
]
```

## EnrolmentHistory

Collection: `enrolmenthistories`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| enrolment | ObjectId → Enrolment | true | included |
| actor | ObjectId → User | true | included |
| fromStatus | String | false | included |
| toStatus | String | true | included |
| reasonCode | String | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "enrolment": 1
    },
    {}
  ],
  [
    {
      "actor": 1
    },
    {}
  ]
]
```

## UploadJob

Collection: `uploadjobs`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| institution | ObjectId → Institution | true | included |
| idempotencyKey | String | true | included |
| status | String | false | included |
| fingerprint | String | false | hidden |
| leaseToken | String | false | included |
| commitRequested | Boolean | false | included |
| submittedBy | ObjectId → User | false | included |
| payload | Buffer | false | hidden |
| format | String | false | included |
| totalRows | Number | false | included |
| validRows | Number | false | included |
| invalidRows | Number | false | included |
| committedRows | Number | false | included |
| leaseUntil | Date | false | included |
| attempts | Number | false | included |
| failureCode | String | false | included |
| payloadPurgedAt | Date | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "institution": 1,
      "idempotencyKey": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "submittedBy": 1
    },
    {}
  ]
]
```

## ValidationIssue

Collection: `validationissues`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| job | ObjectId → UploadJob | true | included |
| rowNumber | Number | false | included |
| errorCode | String | true | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "job": 1
    },
    {}
  ]
]
```

## EnrolmentConflict

Collection: `enrolmentconflicts`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| firstEnrolment | ObjectId → Enrolment | true | included |
| secondEnrolment | ObjectId → Enrolment | true | included |
| institutions | Array | false | included |
| ruleCode | String | true | included |
| status | String | false | included |
| resolution | String | false | included |
| reasonCode | String | false | included |
| assignedReviewer | ObjectId → User | false | included |
| severity | String | false | included |
| version | Number | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "firstEnrolment": 1,
      "secondEnrolment": 1,
      "ruleCode": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "institutions": 1,
      "status": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "student": 1
    },
    {}
  ],
  [
    {
      "secondEnrolment": 1
    },
    {}
  ],
  [
    {
      "assignedReviewer": 1
    },
    {}
  ]
]
```

## StudentCorrectionRequest

Collection: `studentcorrectionrequests`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| requestedBy | ObjectId → User | true | included |
| fieldCode | String | true | included |
| protectedObjectReference | String | true | included |
| status | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "student": 1
    },
    {}
  ],
  [
    {
      "requestedBy": 1
    },
    {}
  ]
]
```

## VerificationRequest

Collection: `verificationrequests`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| student | ObjectId → Student | true | included |
| requester | ObjectId → User | true | included |
| purposeCode | String | true | included |
| expiresAt | Date | true | included |
| enrolment | ObjectId → Enrolment | true | included |
| invitation | ObjectId → VerificationInvitation | true | included |
| requestedClaims | Array | false | included |
| status | String | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "student": 1
    },
    {}
  ],
  [
    {
      "requester": 1
    },
    {}
  ],
  [
    {
      "enrolment": 1
    },
    {}
  ],
  [
    {
      "invitation": 1
    },
    {
      "name": "verification_invitation_unique",
      "unique": true,
      "partialFilterExpression": {
        "invitation": {
          "$type": "objectId"
        }
      }
    }
  ],
  [
    {
      "requester": 1,
      "createdAt": -1
    },
    {}
  ],
  [
    {
      "student": 1,
      "createdAt": -1
    },
    {}
  ]
]
```

## ConsentRequest

Collection: `consentrequests`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| verificationRequest | ObjectId → VerificationRequest | true | included |
| status | String | false | included |
| version | Number | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "verificationRequest": 1
    },
    {
      "unique": true,
      "name": "consent_request_unique"
    }
  ]
]
```

## ConsentGrant

Collection: `consentgrants`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| request | ObjectId → ConsentRequest | true | included |
| fields | Array | true | included |
| expiresAt | Date | true | included |
| revokedAt | Date | false | included |
| grantedBy | ObjectId → User | true | included |
| disclosureCount | Number | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "grantedBy": 1
    },
    {}
  ],
  [
    {
      "request": 1
    },
    {
      "unique": true,
      "name": "consent_grant_unique"
    }
  ]
]
```

## AuditEvent

Collection: `auditevents`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| actor | ObjectId → User | true | included |
| action | String | true | included |
| resourceType | String | true | included |
| resourceId | ObjectId | true | included |
| institution | ObjectId → Institution | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| actorRole | String | false | included |
| occurredAt | Date | false | included |
| outcome | String | false | included |
| reasonCode | String | false | included |
| correlationId | String | false | included |
| integrityVersion | String | false | included |
| integrityKeyVersion | String | false | included |
| integrityTag | String | false | hidden |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "institution": 1,
      "createdAt": -1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "actor": 1
    },
    {}
  ],
  [
    {
      "occurredAt": -1,
      "_id": -1
    },
    {}
  ]
]
```

## RefreshSession

Collection: `refreshsessions`.

| Field | Type | Required | Default selection |
|---|---|---|---|
| user | ObjectId → User | true | included |
| digest | String | true | hidden |
| family | String | true | included |
| transport | String | false | included |
| browserOrigin | String | false | included |
| csrfDigest | String | false | hidden |
| familyExpiresAt | Date | false | included |
| expiresAt | Date | true | included |
| revokedAt | Date | false | included |
| _id | ObjectId | false | included |
| createdAt | Date | false | included |
| updatedAt | Date | false | included |
| __v | Number | false | included |

Indexes (plus automatic unique `_id`):

```json
[
  [
    {
      "digest": 1
    },
    {
      "unique": true
    }
  ],
  [
    {
      "family": 1
    },
    {
      "unique": false
    }
  ],
  [
    {
      "user": 1
    },
    {}
  ]
]
```

## Identity and privacy

Student `_id` is the stable identity; institution-owned demographics/roll numbers live in StudentInstitution. A missing vault is permitted. Identity status distinguishes UNVERIFIED, MOCK_VERIFIED, OFFICIALLY_VERIFIED and VERIFICATION_FAILED. No endpoint sets official status. Vault ciphertext uses AES-256-GCM with a fresh 12-byte nonce, 16-byte tag and student-ID AAD. Lookup uses HMAC-SHA256 with an independent key. Never expose lookup tokens or plaintext in logs. Keep keys in a secret manager; use keyVersion to identify an encryption/lookup key pair. Rotation must support old key reads, dual lookups and transactional re-encryption before retiring old keys; rotation services are PLANNED. Select:false is defense in depth, not access control. No official identity-provider API or real-student fixture exists.

## Implemented and future collections

StudentInstitution, UploadJob/UploadRowResult, Enrolment/EnrolmentHistory, SeatReservation, TransferRequest, EnrolmentConflict/ConflictEvidence/ConflictHistory and IdentityVerificationEvent support implemented Batch 2 workflows. Batch 3 expands EmployerProfile, ConsentRequest/ConsentGrant and VerificationRequest for controlled sharing; VerificationInvitation, VerificationEvent and DigitalCredential implement invitation/consent/disclosure references. ReportJob persists bounded regulatory-readiness artifacts. ValidationIssue and StudentCorrectionRequest remain future scaffolding. IdentityVerificationEvent records APAAR provider checks; VerificationEvent separately records consent and academic-claim disclosure metadata. No official government adapter exists. API validation complements schemas; MongoDB foreign-key and regulatory enforcement still belong in services. AuditEvent contains actors and opaque resource references, not free-form PII payloads. Audit immutability requires restricted database privileges; Mongoose schemas alone do not make logs immutable.
