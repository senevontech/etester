# Etester Tech Stack Documentation

Last audited: 2026-05-18

## 1. Project Architecture

This repository is a JavaScript/TypeScript monorepo using npm workspaces:

- Root workspace manager: `npm` workspaces (`package.json` at repo root)
- Frontend app: `frontend/` (React + Vite)
- Backend API: `backend/` (Node.js HTTP server + PostgreSQL via `pg`)
- Frontend build output: `dist/`

## 2. Active Runtime Stack (Currently Used)

### 2.1 Frontend (Active)

Core:
- React `19.x`
- React DOM `19.x`
- TypeScript `5.x`
- Vite `7.x`
- React Router DOM `7.x`

UI and UX:
- Lucide React (icon set)
- Framer Motion (animations)
- Custom CSS (no Tailwind/Bootstrap/MUI)
- Google Fonts import (`Manrope`, `JetBrains Mono`) in `frontend/src/index.css`

Assessment and editor features:
- Monaco Editor (`@monaco-editor/react`) for code editing
- `xlsx` for spreadsheet imports
- `pdfjs-dist` for PDF parsing
- `mammoth` for DOCX text extraction

Proctoring and browser capabilities:
- `face-api.js` for face detection/landmark analysis
- `@tensorflow/tfjs-core` (dependency for face-api runtime)
- Browser APIs used directly:
  - `MediaDevices.getUserMedia` (camera/mic)
  - `MediaDevices.getDisplayMedia` (screen sharing)
  - Fullscreen API
  - Visibility API / focus tracking
  - WebRTC (`RTCPeerConnection`, ICE candidates)
  - `fetch`, `localStorage`, `crypto.randomUUID`

External client-side assets:
- Face model weights loaded from jsDelivr CDN:
  - `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights`

### 2.2 Backend (Active)

Core:
- Node.js runtime
- TypeScript source run directly with Node (`node src/index.ts`)
- ES modules (`"type": "module"`)
- Native Node HTTP server (`node:http`) without Express/Nest in active entrypoint

Database:
- PostgreSQL
- `pg` (`Pool`) as DB driver
- SQL-first schema management and migrations handled in app startup (`backend/src/services/db.ts`)

Security/auth in active code:
- Password hashing: Node `crypto.pbkdf2Sync`
- Session token and IDs: Node `crypto.randomBytes` / `crypto.randomUUID`
- CORS handling: custom logic in controller
- Rate limiting: in-memory map-based limiter in controller

Code execution subsystem:
- Provider modes via env: `disabled`, `local`, `http`
- Local JS/TS execution through spawned Node process
- TS transpilation for execution using `esbuild`
- Optional local Python execution via configured interpreter
- Optional remote execution over HTTP (`fetch` to external execution service)

### 2.3 Data and Domain Features (Active)

Database tables and feature areas implemented in active backend include:
- Users, sessions, organizations, org members
- Groups, tests, questions, assignments
- Attempts, submissions, audit logs
- Interview rooms, participants, signaling events
- Attempt evidence / integrity tracking

## 3. Tooling and Developer Stack

Package/tooling:
- npm workspaces at root
- Lockfiles present at root and backend

Build and lint:
- Frontend bundling: Vite
- Frontend linting: ESLint 9 flat config (`frontend/eslint.config.js`)
- Backend lint config file exists (`backend/eslint.config.js`)
- Backend type checking: TypeScript compiler (`tsc --noEmit`)

TypeScript configuration:
- Frontend TS config targets modern browser ESM with bundler resolution
- Backend TS config targets Node (`module: NodeNext`)
- Backend TS config explicitly excludes Nest/Prisma folders from active typecheck

## 3.1 Direct Dependency Versions (Current Manifests)

Frontend `frontend/package.json` dependencies:
- `@monaco-editor/react`: `^4.7.0`
- `@tensorflow/tfjs-core`: `^1.7.0`
- `face-api.js`: `^0.22.2`
- `framer-motion`: `^12.34.3`
- `lucide-react`: `^0.575.0`
- `mammoth`: `^1.12.0`
- `pdfjs-dist`: `^5.5.207`
- `react`: `^19.2.0`
- `react-dom`: `^19.2.0`
- `react-router-dom`: `^7.13.1`
- `react-webcam`: `^7.2.0`
- `xlsx`: `^0.18.5`

Frontend `frontend/package.json` devDependencies:
- `@eslint/js`: `^9.39.1`
- `@types/react`: `^19.2.14`
- `@types/react-dom`: `^19.2.3`
- `@vitejs/plugin-react`: `^5.1.1`
- `eslint`: `^9.39.1`
- `eslint-plugin-react-hooks`: `^7.0.1`
- `eslint-plugin-react-refresh`: `^0.4.24`
- `globals`: `^16.5.0`
- `typescript`: `^5.9.3`
- `vite`: `^7.3.1`

Backend `backend/package.json` dependencies:
- `esbuild`: `^0.27.2`
- `pg`: `^8.20.0`

Backend `backend/package.json` devDependencies:
- `@types/node`: `^25.3.2`
- `typescript`: `^5.9.3`

## 4. Environment and Configuration

### 4.1 Active env variables (from active code + root .env example)

Backend/runtime:
- `DATABASE_URL`
- `PORT`
- `NODE_ENV`
- `ALLOWED_ORIGINS`
- `SESSION_TTL_HOURS`
- `ATTEMPT_HEARTBEAT_GRACE_SECONDS`

Code execution:
- `CODE_EXECUTION_PROVIDER`
- `CODE_EXECUTION_TIMEOUT_MS`
- `CODE_EXECUTION_MAX_OUTPUT_BYTES`
- `CODE_EXECUTION_MAX_STDIN_BYTES`
- `CODE_EXECUTION_API_URL`
- `CODE_EXECUTION_API_TOKEN`
- `CODE_EXECUTION_PYTHON_BIN`

Superadmin bootstrap:
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`
- `SUPERADMIN_NAME`

Frontend:
- `VITE_API_BASE_URL`
- `VITE_INTERVIEW_ICE_SERVERS` (optional, JSON or comma-separated ICE server list)

## 5. Legacy / Inactive Stack Present in Repository

The repo still contains legacy NestJS + Prisma code, but this is not the active startup path right now.

Evidence of inactive status:
- Active entrypoint is `backend/src/index.ts` (custom Node HTTP server)
- Backend scripts run `node src/index.ts`
- `backend/tsconfig.json` excludes legacy Nest/Prisma module directories

Legacy technologies present in files and old lock data:
- NestJS modules (`@nestjs/*`)
- Prisma schema/client (`prisma/`, `@prisma/client`)
- Swagger (`@nestjs/swagger`)
- Passport JWT, class-validator, zod
- Socket.IO gateway code
- AWS S3 SDK storage service code

Important note:
- `backend/package-lock.json` still contains many legacy dependencies not reflected by current `backend/package.json`.

## 6. Summary Stack List (Quick View)

Primary active stack:
- Monorepo/package manager: npm workspaces
- Frontend: React, TypeScript, Vite, React Router
- Backend: Node.js native HTTP + TypeScript + pg
- Database: PostgreSQL
- Code editor/import stack: Monaco, xlsx, pdfjs-dist, mammoth
- Proctoring/video stack: face-api.js, tfjs-core, WebRTC, browser media APIs
- Build/lint/type tools: Vite, ESLint, TypeScript

Secondary/legacy stack present in codebase but inactive:
- NestJS, Prisma, Swagger, Passport JWT, Socket.IO gateways, AWS S3 SDK
