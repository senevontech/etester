# Business Requirements Document (BRD)

Date: 2026-05-18  
Product: Etester

## 1. Purpose

Define business requirements for an online assessment and interview management platform serving multi-tenant organizations.

## 2. Business Objectives

- Reduce effort required to create, assign, and monitor technical tests.
- Improve assessment integrity and auditability.
- Provide centralized role-based governance across organizations.
- Enable integrated interview scheduling and real-time participation workflows.
- Support scalable operations for multiple institutions/companies.

## 3. Stakeholders

- Super Admin: global governance, admin account oversight.
- Admin: organization owner and management.
- Subadmin: day-to-day test and student operations.
- Student/Candidate: test-taking and interview participation.
- Proctor/Operations team: monitoring, integrity review.
- Engineering/DevOps: implementation and reliability.

## 4. In Scope

- User authentication and session management.
- Organization lifecycle: creation, switching, membership management.
- Role management: superadmin/admin/subadmin/student.
- Test lifecycle: create, update, publish, assign, attempt, submit.
- Question handling: MCQ, code, text, numeric; bulk import support.
- Integrity monitoring events and attempt logs.
- Interview lifecycle and signaling.
- Audit logging for key administrative actions.

## 5. Out of Scope (Current Phase)

- Native mobile apps.
- Offline exam mode.
- AI grading beyond existing rule-based scoring.
- External LMS integrations (Moodle/Canvas/etc.) in this phase.
- Payment/billing workflows.

## 6. Business Requirements

BR-1 Multi-tenant Organizations  
- The system shall support multiple organizations with isolated data boundaries.

BR-2 Role-Based Governance  
- The system shall enforce role-specific capabilities for superadmin, admin, subadmin, and student.

BR-3 Assessment Management  
- Authorized roles shall create tests, add questions, assign tests, and monitor completion.

BR-4 Integrity and Monitoring  
- The platform shall capture and persist integrity-related activity (attempt events, violations, and evidence where available).

BR-5 Interview Operations  
- The platform shall support interview entities and candidate/interviewer joining via interview code and signaling.

BR-6 Auditability  
- The platform shall maintain audit logs for important administrative and examination actions.

BR-7 Security and Data Protection  
- The platform shall protect authentication credentials, role data, submissions, and monitoring data with least-privilege access and documented retention controls.

## 7. Business KPIs

- Average test setup time per organization.
- Percentage of test attempts with complete integrity event capture.
- Mean time from submission to result availability.
- Number of admin actions traceable through audit logs.
- Interview join success rate.

## 8. Risks and Dependencies

Risks:
- Misconfigured code execution provider may create security exposure.
- Incomplete retention practices for proctoring/evidence data.
- TURN/STUN/ICE misconfiguration may impact interview connectivity.

Dependencies:
- PostgreSQL availability.
- Stable frontend-backend network connectivity.
- Secure environment variable management.

## 9. Assumptions

- Organizations accept browser-based test/interview flows.
- Users have supported modern browsers with media permissions.
- Compliance/legal policies will be reviewed and finalized by responsible stakeholders.
