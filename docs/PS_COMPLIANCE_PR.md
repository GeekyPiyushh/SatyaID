The backend recorded NRI/OCI/FN only as seat-category labels and lacked secure APAAR-plus-student-ID print support. This change adds independent institution-submitted tri-state declarations across profiles/imports/reports, explicit missing-identity lifecycle assessment and read-only APAAR reconciliation, and a minimal authenticated certificate print-data interface.

Print data defaults to redacted. Full APAAR requires an active own institution administrator, valid institution print authorization, current linked-student print consent and eligible ACTIVE records. It never issues a degree, asserts government verification, broadens employer claims or changes seat/quota accounting. Legacy profiles and10-column imports remain compatible with the new13-column template.

Validation:135 tests pass (all105 previous plus30 added), TypeScript and clean production build pass, OpenAPI3.1 and local Postman contract parity cover102 operations, npm audit reports0 vulnerabilities. See docs/FINAL_PS_COMPLIANCE_AUDIT.md and the updated FRONTEND_INTEGRATION_MASTER.md for exact evidence, source changes, privacy boundaries and demo steps.

Review target: PIYUSH. No direct changes to PIYUSH/main and no automatic merge. Official APAAR connectivity and independent degree-awarding authority validation remain external prerequisites.
