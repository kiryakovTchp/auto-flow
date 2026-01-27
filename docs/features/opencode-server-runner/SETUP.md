# Setup (MVP)

This is the setup for "PR only": OpenCode creates a PR, humans merge.

## 1) Auto-Flow project
1) Configure Asana + GitHub tokens in Auto-Flow project settings.
2) Configure OpenCode OAuth in server environment (`OPENCODE_OAUTH_*`).
3) Configure Asana custom fields:
   - AutoTask checkbox field
   - Repo enum field
   - Status enum field
4) Configure repo list / default repo.
5) Configure OpenCode Runner settings:
    - Mode: `server-runner` (or `github-actions` if you want Actions)
    - Auth Mode:
      - `oauth` (recommended)
      - `local-cli` (manual login inside container)
    - Trigger comment: `/opencode implement` (Actions only)
    - PR timeout (minutes): default 60
    - Model: `openai/gpt-4o-mini` (or your choice)
    - Workspace Root: `/var/lib/opencode/workspaces`
    - OAuth is configured via Integrations → OpenCode (server-managed OAuth)
    - Policies:
      - Write mode: `pr_only`
      - Max files changed (optional)
      - Deny paths (optional, glob patterns)
6) Configure per-project webhooks:
   - Asana webhook: `/webhooks/asana/:projectId`
   - GitHub webhook: `/webhooks/github/:projectId`

## 2) Install OpenCode on the server (server-runner)
1) Install OpenCode CLI on the VPS:

```
curl -fsSL https://opencode.ai/install | bash
```

If you use the Docker deployment, the image already includes `opencode` and `git`.

2) Ensure `opencode` is in PATH for the Auto-Flow service user.

### Local CLI login (if Auth Mode = local-cli)
1) Login inside the app container:

```
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec app opencode login
```

2) In project settings, enable **Local CLI Ready**.

## 2.1) Connect OpenCode OAuth
1) Open the project UI.
2) Go to Integrations → OpenCode.
3) Click Connect and complete OAuth in the browser.

## 3) GitHub Actions setup (only for github-actions mode)
OpenCode's official GitHub integration runs inside GitHub Actions.

Option A: guided install

```
opencode github install
```

Option B: manual install (minimal)
1) Install the GitHub app: https://github.com/apps/opencode-agent
2) Add workflow file `.github/workflows/opencode.yml` (example in `DEPLOYMENT.md`).
3) Configure provider API keys as GitHub Actions secrets.

## 4) Trigger behavior
- server-runner: Auto-Flow runs OpenCode directly on the VPS.
- github-actions: Auto-Flow posts an issue comment to trigger the workflow.

## 5) Validation
1) Create an AutoTask in Asana.
2) Ensure Auto-Flow created a GitHub issue.
3) If github-actions: ensure an issue comment `/opencode implement` exists.
4) If github-actions: ensure GitHub Actions workflow ran.
5) Ensure PR appears and contains `Fixes #<issue_number>`.

## 6) Watchdog
If no PR is created within the configured timeout, Auto-Flow will mark the task as `FAILED`
and post a comment in Asana + GitHub issue.
