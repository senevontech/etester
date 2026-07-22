# Data Protection Policy (Draft)

Version: 1.0 (Draft)  
Date: 2026-05-18  
Applies to: Etester platform (frontend, backend, database, operational logs)

## 1. Policy Purpose

Define how Etester collects, processes, stores, secures, retains, and disposes of personal and assessment-related data.

## 2. Scope

This policy applies to:

- User profile and account data
- Authentication/session data
- Organization and membership data
- Test, attempt, submission, and integrity records
- Interview and signaling records
- Audit logs and operational logs

## 3. Data Classification

Class A - Sensitive:
- Password hashes
- Session tokens
- Integrity evidence payloads

Class B - Personal:
- Name, email
- IP address and user agent (where collected)

Class C - Operational:
- Test metadata, assignment metadata
- Audit logs and system telemetry

## 4. Data Processing Principles

- Lawfulness and purpose limitation: collect only data needed for assessment/interview operations and security.
- Data minimization: avoid collecting unnecessary PII fields.
- Accuracy: provide correction workflows through admin operations.
- Storage limitation: enforce retention windows and deletion workflows.
- Integrity and confidentiality: protect data in transit and at rest.

## 5. Data Collection and Use

Etester processes data for:

- Account authentication and access control
- Organization and membership operations
- Assessment lifecycle execution and scoring
- Proctoring/integrity monitoring
- Interview participation and signaling
- Security monitoring and auditability

## 6. Security Controls

Technical controls:

- Passwords stored as derived hashes (no plaintext storage).
- Role-based authorization for protected resources.
- Configurable CORS allowlist and origin checks.
- Endpoint-level rate limiting on sensitive flows.
- Database-level constraints and indexed access paths.
- Optional remote code execution isolation via external provider.

Operational controls:

- Restricted production DB access based on least privilege.
- Environment variables managed through secure secrets channels.
- Change management and deployment approvals for security-impacting updates.

## 7. Retention and Deletion (Recommended Baseline)

- Sessions: 30 days maximum inactivity window.
- Audit logs: 12 months default retention.
- Attempts/submissions: 24 months (or per customer contract/policy).
- Interview signaling records: 90 days unless required longer for investigation.
- Integrity evidence (images/events): 90-180 days unless legal hold applies.

Retention periods must be finalized by legal/compliance requirements in target jurisdiction.

## 8. Data Subject Rights Workflow (If Applicable)

Where required by applicable law, Etester shall support:

- Access request
- Correction request
- Deletion request
- Processing restriction request

Requests should be logged and fulfilled within policy/regulatory timelines.

## 9. Incident Response

On suspected data breach:

1. Identify and contain affected systems.
2. Preserve relevant logs and forensic evidence.
3. Assess impacted data classes and user populations.
4. Notify internal stakeholders and legal/compliance immediately.
5. Notify customers/regulators within legally required timelines.
6. Perform post-incident corrective action and control hardening.

## 10. Vendor and Third-Party Considerations

- Verify security posture for external execution providers and infrastructure vendors.
- Use contractual controls for data handling, confidentiality, and breach notification.
- Evaluate cross-border data transfer implications where applicable.

## 11. Policy Governance

- Owner: Product + Engineering + Compliance stakeholders.
- Review frequency: at least every 6 months or after major architecture change.
- Approval: legal/compliance sign-off required before external policy publication.

## 12. Important Note

This document is an operational draft for the current repository and is not legal advice. Final policy language must be reviewed by qualified legal counsel for applicable jurisdictions.
