# Auto-Flow Tool Roadmap (Domen + Login + Projects)

This document captures the agreed plan and implementation tasks for turning the current orchestrator into a web tool:
- hosted on a domain
- login + multi-user (later) with project access
- project switching
- create/sync tasks (Asana source, plus create from UI)
- Asana -> GitHub Issue -> OpenCode -> PR -> CI -> Asana finalize

Language: mixed (RU/EN) to match incoming Asana content.

---

## 0) Current State (as-is)

Implemented now:
- Express + TypeScript backend (`src/server.ts`)
- Postgres storage (tables created in `src/db/migrations.ts`)
- Encrypted secrets stored in Postgres (`app_secrets`) with local file master key (`data/master.key`) (`src/services/secure-config.ts`, `src/security/crypto-store.ts`)
- Admin UI via Basic Auth: `/admin` (`src/routes/admin-ui.ts`) + admin API `/api/admin/*`
- Webhooks:
  - Asana: `POST /webhooks/asana` (`src/webhooks/asana-handler.ts`)
  - GitHub: `POST /webhooks/github` (`src/webhooks/github-handler.ts`)
- Basic pipeline:
  - Asana event -> create GitHub Issue with `/opencode implement` (`src/services/sync-from-asana.ts`)
  - GitHub PR/CI updates -> finalize Asana when merge + CI success (`src/services/finalize.ts`)

Known weaknesses in current state (will be addressed in the plan):
- Global config for Asana/GitHub (single project) instead of per-project
- Default admin user is created in DB with hardcoded password (`src/db/bootstrap.ts`)
- Asana idempotency is incomplete (GitHub deliveries are deduped; Asana not)
- PR-to-issue link parsing is too loose (matches any `#123`)
- CI linking by SHA is not merge-commit safe

---

## 1) Agreed Product Decisions (locked)

Auth / Users:
- UI auth: login form + cookie sessions stored in DB
- First admin bootstrap: `INIT_ADMIN_TOKEN` (one-time init flow)
- Multi-user is planned later, but MVP is 1 admin with the right schema for growth
- Invitations: invite link (TTL 7 days)
- Access model: project memberships table with roles: admin/editor/viewer
- Only project role `admin` can edit project settings

Projects:
- One tool project aggregates multiple Asana projects (list of Asana project GIDs)
- No dashboard filter by Asana project (all tasks mixed in one list)
- URL structure: `/p/:slug/...`

Asana source of tasks:
- Tasks can appear:
  - from Asana (webhooks + import sync)
  - from Tool UI (Create Task -> creates Asana task)

AutoTask:
- AutoTask marker: Asana workspace-level custom field (checkbox)
- Issue created only when AutoTask becomes true
- When AutoTask becomes false:
  - add label/comment in GitHub
  - stop further sync for this task
- When AutoTask becomes true again:
  - remove label
  - resume pipeline

Repo selection:
- Per tool project: 3–10 GitHub repos
- When creating task in UI: repo is selected in UI
- When task comes from Asana: repo is selected via Asana custom field (enum) `Repo`
- If repo missing/invalid: set status `NEEDS_REPO`, do not create issue; allow UI action “Select repo + Create issue”

Blocked/Cancelled:
- Asana Status: workspace-level enum custom field
- Mapping is configured in tool UI: Asana status option -> BLOCKED/CANCELLED/ACTIVE
- If status becomes CANCELLED:
  - close GitHub issue with `state_reason=not_planned`
  - stop sync
- If status becomes BLOCKED:
  - only mark BLOCKED in tool (no GitHub action)

Completion:
- `DEPLOYED` means: PR merged + CI success
- CI source: `workflow_run.completed`
- CI link: must be tied to merge commit SHA
- If CI failed after merge:
  - comment everywhere
  - reopen Asana only if Asana was completed by orchestrator
  - document blockers via comments (timeline)

UI requirements:
- Server-rendered UI (HTML/CSS/vanilla JS) but with a product-like look
- Mobile friendly

Webhooks:
- Per-project endpoints:
  - `POST /webhooks/asana/:projectId`
  - `POST /webhooks/github/:projectId`
- GitHub webhook secret: per project
- Asana webhook: per Asana project

Queue:
- DB queue: webhook handlers only validate + enqueue jobs
- Retries: 3 attempts with backoff
- Reconciliation job every 5 minutes

External API:
- `/api/v1` external API
- Auth: project-scoped API tokens (one token -> one project)
- Scope: full CRUD inside that project
- Token mgmt in project UI

Task IDs:
- Task page URL: `/p/:slug/t/:tasks.id` (internal PK)
- Asana GID uniqueness only within project

Knowledge / RAG:
- RAG is NOT MVP
- We still prepare for embeddings: Postgres with pgvector
- LLM + RAG will run on client (OpenCode), server stores links/notes/metadata

---

## 2) Staged Implementation Plan

### Stage 0 (Security backlog; scheduled later)
NOTE: Real secrets were found in `docs/apikeys.md`. Actions required before production:
- Rotate Asana PAT, GitHub PAT, GitHub webhook secret
- Remove secrets from repo and clean git history (filter-repo/BFG) if allowed

(We agreed to postpone this until closer to domain deployment.)

---

### Stage 1 (Foundation): versioned migrations + sessions login + projects skeleton

1. Add versioned migrations framework
- Goal: stop using a single idempotent SQL blob; introduce `schema_migrations`.
- Steps:
  - Add `schema_migrations` table
  - Create folder for migrations (e.g. `src/db/sql/` or `migrations/`)
  - Build runner that executes pending migrations in order
  - Convert current schema into initial migration

2. Replace Basic Auth admin with session-based auth
- Goal: real login page and DB sessions; remove default admin password.
- DB:
  - `users` (username, password_hash, created_at)
  - `sessions` (user_id, session_id, expires_at)
  - `invites` (token_hash, expires_at, created_by)
  - `project_memberships` (user_id, project_id, role)
- UI:
  - `/login` (username+password)
  - `/logout`
  - `/invite/:token` (set username+password)
  - `/app` (projects list)
- Bootstrap:
  - `INIT_ADMIN_TOKEN` flow: if no users, allow creating first admin once.

3. Projects skeleton
- DB:
  - `projects` (slug unique, name, created_at)
- UI:
  - `/app` list projects: name + integration status + Open
  - `/p/:slug` minimal page placeholder
  - Project navigation with 4 screens:
    - `/p/:slug/settings`
    - `/p/:slug/webhooks`
    - `/p/:slug/api`
    - `/p/:slug/knowledge`

Acceptance:
- Can log in
- Can create first admin via init token
- Can create/list/open projects

---

### Stage 2 (Project settings): integrations, rules, links/contacts, knowledge notes

4. Project settings (Integrations + Rules + Links/Contacts)
- Per-project encrypted secrets (replace global `app_secrets`):
  - Asana PAT
  - GitHub PAT
  - GitHub webhook secret (per project)
- Asana config:
  - Asana workspace gid (optional)
  - Asana projects list (GIDs)
  - Custom fields:
    - AutoTask checkbox field GID
    - Repo enum field GID
    - Status enum field GID
  - UI supports both:
    - selecting from Asana API list
    - manual paste of GID
- GitHub config:
  - repo list (owner/repo)
  - default repo
- Links/Contacts:
  - Repo docs links
  - Owner contact
  - Knowledge notes (markdown stored in DB)

DB tables (suggested):
- `project_secrets(project_id, key, encrypted_value)`
- `project_asana_projects(project_id, asana_project_gid)`
- `project_github_repos(project_id, owner, repo, is_default)`
- `project_links(project_id, kind, url, title, tags)`
- `project_contacts(project_id, role, name, handle)`
- `project_knowledge_notes(project_id, markdown)`
- `asana_field_config(project_id, auto_field_gid, repo_field_gid, status_field_gid, workspace_gid)`
- `asana_status_map(project_id, option_name, mapped_status)`

Acceptance:
- Project settings editable by admin only
- Config stored encrypted per project
- Knowledge notes exist and are editable

---

### Stage 3 (Webhooks): per-project endpoints + setup/validate UI

5. Webhooks routing
- New endpoints:
  - `POST /webhooks/asana/:projectId`
  - `POST /webhooks/github/:projectId`
- Signature verification uses secrets from project scope.

6. Webhooks UI `/p/:slug/webhooks`
- Show webhook URLs for this project
- Setup Asana webhook button:
  - creates webhook for each Asana project GID
  - stores webhook GID + target URL
- Validate GitHub webhooks button:
  - checks each repo has webhook to our URL
  - optionally create webhook if PAT permissions allow (we agreed “mixed”) 
- Secrets display: masked, never show full secrets after save
- Show webhook health:
  - last delivery timestamp
  - failures counter

Acceptance:
- Can set up Asana webhooks from UI
- Can validate GitHub webhooks from UI

---

### Stage 4 (Tasks): task list + task page timeline + import/sync from Asana

7. Tasks schema v3
- Extend tasks with project scope:
  - `project_id`, `asana_gid`, `title`
  - pipeline status: RECEIVED/TASKSPEC_CREATED/ISSUE_CREATED/PR_CREATED/WAITING_CI/DEPLOYED/FAILED
  - extra statuses: NEEDS_REPO/AUTO_DISABLED/CANCELLED/BLOCKED
  - `repo_id` (FK to project_github_repos)
  - `asana_status` (ACTIVE/BLOCKED/CANCELLED)
  - `auto_enabled` bool
  - links: issue/pr/ci
  - merge commit sha
- Keep `taskspecs` versioned.
- Add `task_events` timeline:
  - store metadata + summarized fields (no full raw payload by default)

8. Project dashboard `/p/:slug`
- Table columns (default): status + title + links Issue/PR/CI
- Sort: updated desc
- Filters: status filters
- Pagination: 25/50

9. Task page `/p/:slug/t/:id`
- Inline buttons actions (top):
  - Retry pipeline
  - Re-sync from Asana
  - Force link PR
  - Change repo
  - Add note
- Add note behavior:
  - write to DB timeline
  - also post comment to Asana
- Show TaskSpec versions list

10. Sync from Asana
- Button: “Sync from Asana project(s)”
- Imports ALL tasks updated in last 90 days
- If already in DB: update fields only (do not break links)
- Issue creation logic:
  - only when AutoTask=true and repo resolved
  - else set NEEDS_REPO

Acceptance:
- Can import tasks from Asana
- UI shows tasks and task details with timeline

---

### Stage 5 (Pipeline): AutoTask gating + repo mapping + issue creation + PR/CI finalize

11. AutoTask gating + status mapping
- Asana webhook processing must read:
  - AutoTask checkbox
  - Repo enum selection
  - Status enum selection
- Mapping configured in UI:
  - option_name -> BLOCKED/CANCELLED/ACTIVE

12. Repo mapping (Asana enum -> GitHub repo)
- UI supports:
  - auto mapping by option name `owner/repo`
  - manual mapping override in UI if name does not match
- UI action: “Sync repos to Asana field”
  - adds missing enum options to the Asana Repo field

13. GitHub Issue creation
- Only when:
  - AutoTask=true
  - repo resolved
  - status not Cancelled
- Issue body includes:
  - TaskSpec template + Asana notes
  - Project Context block (links/contacts/notes)
  - `/opencode implement`
- PR linking policy:
  - parse strictly `Fixes #<issue>`

14. CI finalize
- Use merge commit SHA for CI mapping
- `workflow_run.completed` updates CI state
- `DEPLOYED` when merged + CI success
- If CI failed:
  - comment in Asana and task timeline
  - reopen Asana only if it was closed by orchestrator

15. AUTO_DISABLED / CANCELLED rules
- AutoTask=false:
  - label+comment issue
  - stop sync
- Cancelled:
  - close issue with not_planned
  - stop sync
- Blocked:
  - just mark blocked

Acceptance:
- End-to-end pipeline works with AutoTask gating and repo mapping
- DEPLOYED and CI failure behavior matches requirements

---

### Stage 6 (Queue + reconciliation)

16. DB queue
- Webhook handlers:
  - verify signature
  - enqueue job
  - return 200 immediately
- Worker:
  - processes jobs
  - retries 3 with backoff

17. Reconciliation cron (every 5 minutes)
- Heal stuck tasks:
  - WAITING_CI without CI
  - PR without issue link
  - NEEDS_REPO
  - mismatch between Asana/GitHub statuses

Acceptance:
- Durable processing (no loss on restart)
- Statuses converge even if a webhook was missed

---

### Stage 7 (External API + docs)

18. External API `/api/v1`
- Auth: bearer API tokens, project-scoped
- Token mgmt in `/p/:slug/api`
- Full CRUD within project:
  - projects (subset), repos, links, contacts, knowledge notes
  - tasks list/get
  - task actions (retry/resync/change repo/force PR) if needed

19. Internal API docs + "why"
- `/p/:slug/api` shows:
  - token management
  - curl examples for all operations
  - OpenAPI spec JSON

20. Task timeline is the primary "what/how/why" record
- Every significant action writes a timeline event:
  - webhook received (metadata)
  - status transitions
  - issue created/closed
  - pr linked
  - ci success/failure
  - manual actions from UI/API

---

### Stage 8 (Deploy): staging + prod on VPS

21. Docker + Caddy + pgvector
- Compose services:
  - app
  - postgres with pgvector
  - caddy reverse proxy (TLS)

22. Staging + Prod
- Separate DBs
- Domains:
  - `staging.<domain>`
  - `<domain>`

23. CI/CD
- GitHub Actions deploy
- Environment secrets via secret manager

---

## 3) Open Questions (not required for MVP, but planned)

- RAG: indexing, chunking, embeddings ingestion, search UI
- Direct OpenCode trigger via API (future mode)
- GitHub App auth (instead of PAT)

---

## 4) Notes about "Launch OpenCode" button

- In dev/local: may launch Terminal
- In staging/prod: button should show instructions and copy commands (must not attempt osascript)

---

## 5) Addendum: Analytics & Observability (To Add)

Goal: add stable "data points" early so we can do analytics (funnels, lead time, failure reasons) and also have a human-readable "what/how/why" history per task.

### 5.1 Event log (DB)

Add tables:
- `task_events` (task timeline; metadata-first)
- optionally `project_events` (project-level actions)

Recommended `task_events` columns:
- `id` (bigserial)
- `task_id` (FK)
- `project_id` (FK)
- `source` (asana|github|system|user|api)
- `event_type` (string)
- `ref_json` (jsonb; summarized payload/refs only)
- `created_at` (timestamptz)

Rules:
- Write a `task_events` row for every important transition/action.
- Do NOT store raw webhook payloads by default; store a safe summary (ids, URLs, statuses, sha, delivery id).
- Always record `delivery_id` where available (for dedupe + debugging).

Minimum event types to support analytics and debugging:
- `asana.webhook_received`
- `github.webhook_received`
- `task.created_or_seen`
- `task.status_changed` (include from/to + reason)
- `task.repo_missing` / `task.repo_resolved`
- `github.issue_created` / `github.issue_closed`
- `github.pr_linked` / `github.pr_merged`
- `ci.updated` (sha/status/url)
- `asana.completed_set` / `asana.reopened_set`
- `manual.action` (retry/resync/force_pr/change_repo/add_note)
- `error`

### 5.2 Analytics endpoints (External API)

Expose read endpoints under `/api/v1` (project-scoped token auth):
- `GET /api/v1/projects/:slug/summary`
- `GET /api/v1/projects/:slug/funnel?from=&to=`
- `GET /api/v1/projects/:slug/lead-time?from=&to=`
- `GET /api/v1/projects/:slug/failures?from=&to=`
- `GET /api/v1/projects/:slug/webhooks/health`
- `GET /api/v1/projects/:slug/jobs/health`
- `GET /api/v1/projects/:slug/tasks/:id/events`

Implementation notes:
- Funnel + lead-time are computed from `task_events` (source of truth).
- Keep `summary` fast (pre-aggregate or query `tasks` + minimal joins).

### 5.3 UI: task timeline is the "what/how/why" report

Add to `/p/:slug/t/:id`:
- Timeline rendering from `task_events`
- Show who/what triggered changes (source + user if present)
- Links to Issue/PR/CI + copyable IDs

### 5.4 Metrics (optional)

Optional but useful for ops:
- `GET /metrics` Prometheus endpoint (protect it; internal only)
- Counters/Gauges:
  - webhooks received/invalid
  - queue depth + oldest pending age
  - API error rates to Asana/GitHub
  - tasks by status

### 5.5 Dashboard targets (what we want to see)

Project-level KPIs:
- Lead time to DEPLOYED (p50/p90)
- Conversion funnel: AutoTask -> Issue -> PR -> Merge -> CI success -> DEPLOYED
- Failure reasons (top categories)
- Backlog states (NEEDS_REPO / WAITING_CI / FAILED)
