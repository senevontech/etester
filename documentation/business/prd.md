# Product Requirements Document (PRD)

Date: 2026-05-18  
Product: Etester

## 1. Product Vision

Etester provides organizations a unified platform for secure online technical assessments and interview operations with role-based administration and integrity-focused workflows.

## 2. User Personas

- Super Admin: manages global admin accounts and governance.
- Admin: owns organization setup, members, tests, and operations.
- Subadmin: manages tests, groups, assignments, and monitoring.
- Student/Candidate: participates in tests and interviews.

## 3. User Journeys

Journey A: Organization Onboarding  
1. Admin signs up and creates organization.  
2. Members are added or invited.  
3. Roles are set for operations.

Journey B: Assessment Lifecycle  
1. Subadmin/admin creates test and questions.  
2. Test is published and assigned.  
3. Student starts attempt and sends heartbeats/integrity events.  
4. Student submits; score and submission records are stored.

Journey C: Interview Lifecycle  
1. Interview is scheduled with code and rules.  
2. Participant joins with code and client identity.  
3. Signaling events are exchanged and tracked.

Journey D: Governance  
1. Superadmin reviews admin users and analytics.  
2. Superadmin updates roles, credentials, or removes accounts.

## 4. Functional Requirements

FR-1 Authentication and Session
- Signup, login, session fetch, and logout must be supported.

FR-2 Organization and Membership
- Create organization, switch org context, list members, change roles, remove members.

FR-3 Tests and Questions
- Create/update/delete tests.
- Support MCQ, code, text, numeric questions.
- Support question reorder and bulk import pathways.

FR-4 Assignments and Attempts
- Assign tests to student/group.
- Create/manage attempts.
- Capture attempt heartbeat and integrity events.

FR-5 Submissions and Results
- Submit attempt responses.
- Calculate score and integrity metrics.
- Expose org and student-level submission listings.

FR-6 Interviews
- Create/update/list interviews by org.
- Join interviews by code.
- Post and fetch interview signaling messages.

FR-7 Audit and Monitoring
- Persist audit logs for key actions.
- Provide org-level monitoring views for live attempts.

FR-8 Superadmin Controls
- Manage admin/superadmin accounts (create, role update, password reset, delete).

## 5. Non-Functional Requirements

- Availability target: 99.5% monthly for production deployment baseline.
- API response target: P95 under 500ms for standard read operations under normal load.
- Security: role-based authorization on protected resources.
- Scalability: support multi-organization growth with indexed PostgreSQL access paths.
- Observability: actionable service logs and audit records for admin-sensitive flows.

## 6. Release Priorities

P0
- Auth, org/member roles, core test lifecycle, attempts/submissions, superadmin controls.

P1
- Interview scheduling/join/signaling stabilization and TURN/STUN hardening.

P2
- Extended reporting dashboards and export capabilities.

## 7. Acceptance Criteria (Product Level)

- A new organization can onboard and run at least one complete exam cycle.
- A student can complete a test attempt with persisted submission and integrity metadata.
- A superadmin can manage admin accounts end to end.
- Interview participants can join by code and exchange signaling payloads.
- Audit logs are queryable for org-level administrative actions.
