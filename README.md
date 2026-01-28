# Auto-Flow

Auto-Flow is a small orchestration service that connects **Asana** (tasks) with **GitHub** (issues/PR/CI) and helps run an automated delivery loop via **OpenCode**.

RU: Auto-Flow — оркестратор, который связывает **Asana** и **GitHub** и помогает запускать выполнение задач через **OpenCode**.

## The key idea / Ключевая идея

The server **does not run AI** and does not execute code. It only:

- receives webhooks from Asana + GitHub
- stores state in Postgres
- creates/updates GitHub issues
- tracks PR + GitHub Actions results
- updates the source task in Asana

OpenCode can run on a developer machine or via the server-runner. It reacts to a GitHub Issue comment like:

```
/opencode implement
```

## How it works (MVP v1)

1) A task appears in Asana (or gets updated) and is marked as “auto” (via custom field / rules).
2) Auto-Flow receives an Asana webhook and fetches full task details via Asana API.
3) Auto-Flow generates a **TaskSpec** (Markdown) and stores a versioned copy in Postgres.
4) Auto-Flow creates a **GitHub Issue** with TaskSpec + `/opencode implement`.
5) OpenCode (server-runner or client-side) picks up the Issue and creates a PR.
6) Auto-Flow receives GitHub webhooks for PR and GitHub Actions (`workflow_run`).
7) When **PR merged + CI success** → task becomes `DEPLOYED` (and the Asana task is marked complete).

Task statuses (source of truth: `src/db/tasks-v2.ts`):

- `RECEIVED`
- `TASKSPEC_CREATED`
- `ISSUE_CREATED`
- `PR_CREATED`
- `WAITING_CI`
- `DEPLOYED`
- `FAILED`

## What’s inside

- Express server entrypoint: `src/server.ts`
- Postgres + SQL migrations: `src/db/migrations.ts`, `src/db/sql/*.sql`
- Webhooks:
  - Asana: `POST /webhooks/asana` (+ per-project `POST /webhooks/asana/:projectId`)
  - GitHub: `POST /webhooks/github` (+ per-project `POST /webhooks/github/:projectId`)
- UI (React SPA, source in `ui/`, built into `public/ui`):
  - `/`, `/login`, `/init`, `/invite/:token`, `/projects`, `/p/:slug/*`
  - legacy `/admin` (Basic Auth)
- Public endpoints:
  - `GET /health`
  - `GET /metrics` (protected; see `METRICS_TOKEN`)
  - `GET /api/v1/openapi.json` (OpenAPI 3.0)

## Quick start (local)

Prereqs:

- Node.js 20+
- Docker (for local Postgres)

Run Postgres:

```
docker compose up -d
```

Install deps:

```
npm ci
cd ui && npm ci
```

Build UI (outputs to `public/ui`):

```
cd ui && npm run build
```

Create env file:

```
cp .env.example .env
```

Start dev server:

```
npm run dev
```

The server runs SQL migrations automatically on startup.

## First-time setup (UI)

1) Set `INIT_ADMIN_TOKEN` (in `.env` or in deploy env).
2) Open `http://localhost:3000/init?token=<INIT_ADMIN_TOKEN>` and create the first admin.
3) Login at `http://localhost:3000/login`.
4) Create a project in `/projects`.
5) In project settings (`/p/<slug>/settings`) configure:
   - Asana secrets + custom fields
   - GitHub token
   - GitHub repos list (and default repo)
   - optional mappings (status mapping, repo mapping)
6) In `/p/<slug>/webhooks`:
   - set up Asana webhooks
   - validate GitHub webhooks

Tip: there is a built-in “Docs” page with quick links and curl snippets: `GET /docs`.

## Webhooks configuration (high level)

GitHub webhook:

- Target URL: `https://<PUBLIC_BASE_URL>/webhooks/github`
- Secret: `GITHUB_WEBHOOK_SECRET`
- Events (recommended): `issues`, `pull_request`, `issue_comment`, `workflow_run`, `ping`

Asana webhook:

- Target URL: `https://<PUBLIC_BASE_URL>/webhooks/asana` (or per-project endpoints)
- Handshake uses `X-Hook-Secret`.
- Signature header: `X-Hook-Signature` (HMAC-SHA256 of raw body).

## API

OpenAPI spec:

- `GET /api/v1/openapi.json`

The API is token-protected per project (`Authorization: Bearer <token>`). Tokens are managed in the project UI.

## Deploy

Production-ish Docker + Caddy setup lives in `deploy/`.

- See `docs/deploy.md` and `docs/ci-cd.md`.

## Security notes (read this)

- Secrets are stored in Postgres **encrypted**. The encryption master key is stored at `data/master.key` (or in a Docker volume mounted at `/app/data`). If you lose it, you cannot decrypt stored secrets.
- `docs/apikeys.md` may contain real secrets in some environments. If this ever happened for your repo, assume compromise and rotate tokens (see `docs/security.md`).

## More docs

- `docs/wiki/Overview.md`
- `docs/wiki/Architecture.md`
- `docs/wiki/Webhooks.md`
- `docs/wiki/Database.md`
- `docs/wiki/Runbook.md`
- `docs/wiki/HTTP-API.md`
- `docs/ui-inventory.md`

## Development

- `npm run dev` – dev server (ts-node-dev)
- `npm run build` – TypeScript build (`dist/`)
- `npm start` – run compiled server
- `cd ui && npm run build` – build SPA into `public/ui`
