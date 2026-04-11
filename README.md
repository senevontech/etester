# Etester

Etester is moving to a production backend stack built around:

- frontend: existing Vite app for now
- backend: NestJS in [backend](./backend)
- database: PostgreSQL, suitable for Supabase or self-hosted Postgres
- auth: JWT via the NestJS API
- realtime: Socket.IO gateways for monitoring and signaling
- storage: S3-compatible abstraction for Supabase Storage or AWS S3

## Backend Package

The new backend lives in [backend](./backend) and includes:

- NestJS application shell with validated environment config
- Prisma schema for users, orgs, groups, tests, questions, assignments, attempts, submissions, logs, and evidence
- JWT auth module
- organization, group, and test management modules
- Socket.IO monitoring gateway
- WebRTC signaling gateway
- storage abstraction with presigned upload/download URLs

## Run The New Backend

Install backend dependencies:

```powershell
cd backend
cmd /c npm install
cmd /c npm run prisma:generate
```

Start the backend:

```powershell
cd backend
cmd /c npm run start:dev
```

Backend env template:

```text
backend/.env.example
```

## Current Status

The new NestJS backend is compiled and linted. The implemented production foundation currently covers:

- auth
- organization management
- groups and memberships
- tests, questions, and assignments
- realtime gateway foundation
- storage foundation

Still to migrate from the legacy server:

- attempt lifecycle and submissions
- code execution pipeline
- proctoring evidence flows
- full frontend cutover to the NestJS API
- optional Next.js frontend migration

## Verification

Verified in this repo:

- root frontend: `npm run lint`, `npm run build`
- backend: `npm run prisma:generate`, `npm run build`, `npm run lint`
