# Etester

Etester is now split into two clear parts:

- `frontend/` - React + Vite app
- `backend/` - TypeScript Node.js API with PostgreSQL using `pg`

Main folders:

```text
Etester/
  frontend/
    src/
    public/
    package.json
    vite.config.js
    tsconfig.json
    .env
  backend/
    src/
      controllers/
      routes/
      services/
      utils/
      index.ts
    package.json
    tsconfig.json
    .env
  package.json
  package-lock.json
  README.md
```

There is no Supabase backend code in this project now. The old Supabase schema and migration SQL files were removed; the Node backend creates and updates its own PostgreSQL tables on startup.

## Prerequisites

- Node.js
- PostgreSQL running locally
- A database created for the app, for example `etester`

## Environment

Backend settings live in `backend/.env`:

```text
DATABASE_URL=postgresql://postgres:12345@localhost:5432/etester
CODE_EXECUTION_PROVIDER=local
```

Frontend settings live in `frontend/.env`:

```text
VITE_API_BASE_URL=http://localhost:3001/api
```

## Install

From the project root:

```powershell
cmd /c npm install
```

## Run

Open two terminals in the project root.

Start the Node API:

```powershell
cmd /c npm run dev:backend
```

The backend source code is in `backend/src/` and runs directly as TypeScript.

Backend structure:

- `backend/src/index.ts` starts the HTTP server.
- `backend/src/routes/` contains the route entrypoint.
- `backend/src/controllers/` contains request handling logic.
- `backend/src/services/` contains database and code execution services.
- `backend/src/utils/` contains shared utilities like environment loading.

Start the Vite frontend:

```powershell
cmd /c npm run dev:frontend
```

The backend can sync the superadmin account from environment variables at startup:

```text
SUPERADMIN_EMAIL=owner@example.com
SUPERADMIN_PASSWORD=your-secure-password
SUPERADMIN_NAME=Super Admin
```

When these values are set, the backend creates or updates that account as a superadmin. The password is never printed in logs.

Check backend TypeScript:

```powershell
cmd /c npm run typecheck:backend
```

## Notes

- The frontend talks only to the Node API.
- The backend persists users, sessions, orgs, tests, questions, attempts, and submissions in PostgreSQL.
- If PostgreSQL is not running or the database does not exist, the backend will fail on startup.
- `CODE_EXECUTION_PROVIDER=disabled` is safest for production unless you have a sandboxed judge service.
- `CODE_EXECUTION_PROVIDER=local` should only be used in trusted development environments.

## Deployment Checklist

- Set `DATABASE_URL` on the deployed backend to the production PostgreSQL database. Interview codes created locally will not exist in the deployed database.
- Set `ALLOWED_ORIGINS` on the backend to the deployed frontend origin, for example `https://your-frontend-domain.com`.
- Set `VITE_API_BASE_URL` before building the frontend if the API is on a different domain, for example `https://your-api-domain.com/api`.
- If the frontend and backend are served from the same domain, the production frontend can use the default `/api` fallback.
- After backend changes, redeploy/restart the backend so startup migrations add the latest interview tables and columns.
