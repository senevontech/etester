# Feature Document

Date: 2026-05-18  
Product: Etester

## 1. Feature Catalog

### F1. Authentication and Sessions

Description:
- Email/password-based account creation and login.
- Session token handling for authenticated requests.

Primary users:
- All roles

Business value:
- Secure access control foundation.

### F2. Multi-Organization Management

Description:
- Organization creation, membership, role assignment, and org switching.

Primary users:
- Admin, Subadmin, Superadmin

Business value:
- Supports tenant isolation and delegated management.

### F3. Test Authoring and Publishing

Description:
- Create/edit tests with duration, visibility, scheduling window, security settings, and negative marking controls.

Primary users:
- Admin, Subadmin

Business value:
- Fast exam setup with governance controls.

### F4. Question Bank and Import

Description:
- Support MCQ, code, text, numeric questions.
- Bulk import via spreadsheet/document parsing pathways.

Primary users:
- Admin, Subadmin

Business value:
- Higher content throughput and reduced manual effort.

### F5. Assignment and Delivery

Description:
- Assign tests to groups/students with assignment codes.
- Student-specific test lists and access rules.

Primary users:
- Admin, Subadmin, Student

Business value:
- Controlled exam distribution.

### F6. Proctoring and Integrity Tracking

Description:
- Browser-based proctoring signals: tab/focus/fullscreen events, camera-based face checks, integrity event logging.
- Attempt heartbeat and violation capture.

Primary users:
- Student, Subadmin, Admin

Business value:
- Improves trust in exam outcomes.

### F7. Submission and Scoring

Description:
- Persisted answers, computed score, total points, integrity score, and event metadata.

Primary users:
- Student, Subadmin, Admin

Business value:
- Standardized and reviewable evaluation results.

### F8. Interview Management and Join

Description:
- Interview scheduling and participant join by interview code.
- Signaling channel for peer events and WebRTC negotiation payloads.

Primary users:
- Admin, Subadmin, Candidate/Student

Business value:
- Consolidates assessment and interview workflows in one platform.

### F9. Superadmin Governance

Description:
- Manage admin/superadmin users, roles, passwords, and account lifecycle.

Primary users:
- Superadmin

Business value:
- Centralized control and oversight.

### F10. Audit Logs

Description:
- Persistent logging of high-impact operations with actor and metadata.

Primary users:
- Admin, Superadmin, Compliance/Ops

Business value:
- Accountability and forensic traceability.

## 2. Prioritization

P0:
- F1, F2, F3, F5, F6, F7, F9, F10

P1:
- F4 hardening, F8 reliability and connectivity improvements

P2:
- Extended analytics, exports, enterprise compliance enhancements

## 3. Cross-Feature Dependencies

- F3 and F4 feed F5 and F7.
- F6 enriches F7 outcomes and F10 governance workflows.
- F8 depends on signaling persistence and browser media capability.
- F2 role model gates access to all admin-level features.
