# Etester

Etester now uses a local Node.js API backed by PostgreSQL.

## Prerequisites

- Node.js
- PostgreSQL running locally
- a database created for the app, for example `etester`

## Environment

Set the backend connection string in [.env](e:\s15\PROJECT_7\snv\project\Etester\.env):

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/etester
VITE_API_BASE_URL=http://localhost:3001/api
ALLOWED_ORIGINS=http://localhost:5173
SESSION_TTL_HOURS=168
CODE_EXECUTION_PROVIDER=disabled
CODE_EXECUTION_API_URL=
CODE_EXECUTION_API_TOKEN=
```

The backend auto-creates its tables on startup.

## Run

Open two terminals in the project root.

Start the API server:

```powershell
cmd /c npm run dev:server
```

Start the Vite frontend:

```powershell
cmd /c npm run dev:client
```

## Notes

- The frontend still talks only to the Node API.
- The Node API now persists users, sessions, orgs, tests, questions, and submissions in PostgreSQL.
- If PostgreSQL is not running or the database does not exist, the backend will fail on startup.
- `CODE_EXECUTION_PROVIDER=disabled` is the safe default. Only enable `local` for trusted development environments.
- `CODE_EXECUTION_PROVIDER=http` is the production integration point for an external judge/sandbox service. Set `CODE_EXECUTION_API_URL` and, if needed, `CODE_EXECUTION_API_TOKEN`.
- Published coding tests must include at least one hidden judge case per coding question. Hidden cases stay admin-only and are used for server-side scoring.
