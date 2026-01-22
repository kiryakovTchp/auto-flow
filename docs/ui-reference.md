# UI Reference (Auto-Flow)

This document describes the current server-rendered UI: pages, actions, and what each form does.

## Global

- Auth is cookie-session based.
- Most pages are under `/p/:slug/...` (project scope).
- The UI is implemented as Express routes (HTML strings) in:
  - `src/routes/auth-ui.ts`
  - `src/routes/project-tasks-ui.ts`
  - `src/routes/auth-ui-webhooks.ts`
  - `src/routes/asana-import-ui.ts`

## Auth & App

### `/login`

- Purpose: login form.
- POST `/login` fields:
  - `username`
  - `password`

### `/logout`

- POST `/logout`: clears session.

### `/init?token=...`

- Purpose: one-time first admin creation (only if there are no users yet).
- Requires env `INIT_ADMIN_TOKEN`.
- POST `/init` fields:
  - `token` (must equal `INIT_ADMIN_TOKEN`)
  - `username` (defaults to `admin`)
  - `password`

### `/invite/:token`

- Purpose: accept invite link.
- POST `/invite/:token` fields:
  - `username`
  - `password`

### `/app`

- Purpose: projects list + create project + create invite.
- POST `/app/projects` fields:
  - `slug`
  - `name`
- POST `/app/invites`: creates a 7-day invite link (shown once).

### `/docs`

- Purpose: quick links + commands for running/deploying + curl examples.

## Project: Dashboard & Task

### `/p/:slug`

- Purpose: project dashboard (tasks table + filters + import + create task).

Actions:
- GET filter query:
  - `status` (optional)

- POST `/p/:slug/import/asana` fields:
  - `days` (1..365)
  - Behavior: imports tasks updated in the last N days from configured Asana project(s) and runs Stage 5 pipeline.

- POST `/p/:slug/tasks/create` fields:
  - `title` (required)
  - `notes` (optional)
  - `asana_project_gid` (required; must be one of project Asana project GIDs)
  - `repo` (optional; `owner/repo`)
  - `auto_enabled` (checkbox)
  - Behavior: creates an Asana task in the chosen Asana project; optionally sets AutoTask + Repo fields; then runs Stage 5 pipeline.

### `/p/:slug/t/:id`

- Purpose: task details page (links + TaskSpec + timeline + actions).

Actions (require project role admin/editor):

- POST `/p/:slug/t/:id/retry`
  - Behavior: reruns Stage 5 pipeline for this Asana task.

- POST `/p/:slug/t/:id/resync`
  - Behavior: reruns Stage 5 pipeline (same implementation as retry).

- POST `/p/:slug/t/:id/note` fields:
  - `note`
  - Behavior: posts comment to Asana and writes timeline event.

- POST `/p/:slug/t/:id/repo/change` fields:
  - `repo` (`owner/repo`)
  - Behavior: sets the Asana Repo custom field, then reruns Stage 5 pipeline.
  - Restriction: blocked if GitHub issue already exists (cannot “move” an issue between repos).

- POST `/p/:slug/t/:id/pr/force` fields:
  - `pr` (PR number or PR URL)
  - `repo` (optional `owner/repo`; if empty uses task repo or default repo)
  - Behavior: loads PR data from GitHub API, links PR to the task, sets merge SHA when merged, and attempts finalize.

- POST `/p/:slug/t/:id/issue/create` fields:
  - `repo` (`owner/repo`)
  - Behavior: for `NEEDS_REPO` only; sets Asana Repo field and triggers pipeline which creates the issue.

## Project: Settings

### `/p/:slug/settings`

Purpose: configure per-project secrets + Asana/GitHub mapping rules + project context.
Access: admin only.

Sections:

1) Secrets (encrypted in DB)
- POST `/p/:slug/settings/secrets` fields:
  - `asana_pat`
  - `github_token`
  - `github_webhook_secret`
  - `opencode_workdir` (optional)

2) Asana custom fields
- POST `/p/:slug/settings/asana-fields` fields:
  - `workspace_gid` (optional; used only for reference/debug)
  - `auto_field_gid` (required for AutoTask gating)
  - `repo_field_gid` (required for Repo routing)
  - `status_field_gid` (required for BLOCKED/CANCELLED mapping)

What to enter in these Asana fields:
- `workspace_gid`: your Asana workspace ID (optional).
- `auto_field_gid`: the custom field ID of the AutoTask checkbox.
- `repo_field_gid`: the custom field ID of the Repo enum.
- `status_field_gid`: the custom field ID of the Status enum.

How to get these IDs:
- In Asana, open a task in the workspace that has these fields.
- Use Asana API (fastest): `GET /tasks/<taskGid>?opt_fields=custom_fields.gid,custom_fields.name,custom_fields.resource_subtype,custom_fields.enum_options.gid,custom_fields.enum_options.name` and copy the `gid` for the matching field name.

3) Asana status mapping
- POST `/p/:slug/settings/asana-status-map`:
  - `option_name` (must match the enum option name in Asana)
  - `mapped_status` (`ACTIVE` | `BLOCKED` | `CANCELLED`)
- POST `/p/:slug/settings/asana-status-map/delete`:
  - `option_name`

4) Repo mapping overrides
- POST `/p/:slug/settings/repo-map`:
  - `option_name` (Asana Repo enum option name)
  - `owner`
  - `repo`
- POST `/p/:slug/settings/repo-map/delete`:
  - `option_name`

5) Asana project list
- POST `/p/:slug/settings/asana/add`:
  - `asana_project_gid`
- POST `/p/:slug/settings/asana/remove`:
  - `asana_project_gid`

6) GitHub repo list
- POST `/p/:slug/settings/repos/add`:
  - `owner`
  - `repo`
  - `is_default` (`yes|no`)
- POST `/p/:slug/settings/repos/default`:
  - `owner`
  - `repo`
- POST `/p/:slug/settings/repos/remove`:
  - `owner`
  - `repo`

7) Project context (added to GitHub issue body)
- Links
  - POST `/p/:slug/settings/links/add`: `kind`, `url`, `title`, `tags`
  - POST `/p/:slug/settings/links/delete`: `id`
- Contacts
  - POST `/p/:slug/settings/contacts/add`: `role`, `name`, `handle`
  - POST `/p/:slug/settings/contacts/delete`: `id`

## Project: Webhooks

### `/p/:slug/webhooks`

Purpose: show webhook URLs + setup Asana hooks + validate GitHub hooks.
Access: view requires membership; mutations require admin.

- POST `/p/:slug/webhooks/asana/setup` fields:
  - `public_base_url` (e.g. `https://ai.gnezdoai.ru`)
  - Behavior: creates an Asana webhook for each configured Asana project GID.

- POST `/p/:slug/webhooks/asana/sync-repos`
  - Behavior: adds missing enum options to the Asana Repo field (one option per configured GitHub repo, named `owner/repo`).

- POST `/p/:slug/webhooks/github/validate`
  - Behavior: checks each configured GitHub repo for a webhook pointing to `/webhooks/github/:slug`.

## Project: API Tokens UI

### `/p/:slug/api`

Purpose: manage project-scoped API tokens (for `/api/v1`).
Access: read requires membership; token create/revoke requires admin.

- POST `/p/:slug/api/tokens/create`: `name` (optional)
- POST `/p/:slug/api/tokens/revoke`: `token_id`

## Knowledge

### `/p/:slug/knowledge`

Purpose: project notes (markdown) used in GitHub issue “Project Context”.
Access: read requires membership; write requires admin.

- POST `/p/:slug/knowledge`: `markdown`

## Legacy Admin (kept)

### `/admin`

- Purpose: legacy single-project config/debug panel.
- Protected by basic auth (see env / config).
