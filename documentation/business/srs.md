# Software Requirements Specification (SRS)

Date: 2026-05-18  
System: Etester

## 1. Introduction

This SRS defines software behavior for the active Etester implementation (React frontend + Node.js API + PostgreSQL).

## 2. System Context

- Client: Browser-based SPA frontend.
- API: Node HTTP service exposing JSON REST endpoints.
- Data store: PostgreSQL.
- External: Optional code execution provider and ICE/TURN infrastructure.

## 3. User Roles

- `superadmin`
- `admin`
- `subadmin`
- `student`

## 4. Functional Requirements by Module

### 4.1 Authentication

SRS-AUTH-1  
- System shall allow user signup with required profile fields and password.

SRS-AUTH-2  
- System shall issue session token on successful login.

SRS-AUTH-3  
- System shall validate token for protected routes.

### 4.2 Organization Management

SRS-ORG-1  
- System shall create organizations with unique slug/invite code behavior.

SRS-ORG-2  
- System shall return memberships for authenticated users.

SRS-ORG-3  
- System shall enforce role checks for member and role management operations.

### 4.3 Test and Question Management

SRS-TEST-1  
- System shall support test CRUD with metadata including visibility and security settings.

SRS-TEST-2  
- System shall support question CRUD with types: `mcq`, `code`, `text`, `numeric`.

SRS-TEST-3  
- System shall support bulk question ingestion and question reordering.

### 4.4 Attempts, Integrity, and Submission

SRS-ATT-1  
- System shall create and track test attempts with status transitions.

SRS-ATT-2  
- System shall capture heartbeats and integrity event payloads.

SRS-ATT-3  
- System shall compute submission scores and persist integrity summary fields.

SRS-ATT-4  
- System shall prevent invalid duplicate submission states.

### 4.5 Interviews and Signaling

SRS-INT-1  
- System shall create and list interviews per organization.

SRS-INT-2  
- System shall resolve interview metadata by interview code.

SRS-INT-3  
- System shall accept and serve signaling messages with payload size limits.

### 4.6 Superadmin

SRS-SA-1  
- System shall allow superadmin listing of admin/superadmin accounts.

SRS-SA-2  
- System shall allow superadmin account creation, role changes, password reset, and deletion.

### 4.7 Audit Logs

SRS-AUD-1  
- System shall persist audit logs for key actions with actor, action, entity, metadata, and timestamp.

## 5. Non-Functional Requirements

NFR-1 Security
- Enforce origin checks and authenticated access controls on protected routes.
- Store passwords only as derived hashes, never plaintext.

NFR-2 Performance
- Handle standard list/read operations with indexed SQL plans.
- Apply rate limiting on sensitive endpoints.

NFR-3 Reliability
- Startup shall initialize required schema objects if missing.
- Graceful shutdown shall close DB pool.

NFR-4 Maintainability
- TypeScript codebase with module-level separation (controller/service/utils).

NFR-5 Compatibility
- Modern Chromium/Firefox/Safari browser support for frontend core flows.

## 6. Data Requirements

Primary entities:
- users, sessions, organizations, org_members
- groups, group_members
- tests, questions, test_assignments
- test_attempts, attempt_logs, attempt_evidence
- submissions
- interviews, interview_participants, interview_signals
- audit_logs

## 7. Constraints

- Requires PostgreSQL connectivity.
- Browser media permission is required for webcam/mic dependent workflows.
- Local code execution mode must only run in trusted environments.

## 8. Traceability (High-Level)

- Auth/session routes satisfy SRS-AUTH-*.
- Org/member routes satisfy SRS-ORG-*.
- Test/question/attempt/submission routes satisfy SRS-TEST-* and SRS-ATT-*.
- Interview routes satisfy SRS-INT-*.
- Superadmin routes satisfy SRS-SA-*.
- Audit log persistence satisfies SRS-AUD-*.
