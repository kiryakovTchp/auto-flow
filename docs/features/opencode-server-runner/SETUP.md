# Setup (MVP)

This is the setup for "PR only": OpenCode creates a PR, humans merge.

## 1) Auto-Flow project
1) Configure Asana + GitHub tokens in Auto-Flow project settings.
2) Configure Asana custom fields:
   - AutoTask checkbox field
   - Repo enum field
   - Status enum field
3) Configure repo list / default repo.
4) Configure OpenCode Runner settings:
   - Mode: `server-runner` (or `github-actions` if you want Actions)
   - Trigger comment: `/opencode implement` (Actions only)
   - PR timeout (minutes): default 60
   - Model: `openai/gpt-4o-mini` (or your choice)
   - Workspace Root: `/var/lib/opencode/workspaces`
   - OpenAI API Key (for server-runner)
5) Configure per-project webhooks:
   - Asana webhook: `/webhooks/asana/:projectId`
   - GitHub webhook: `/webhooks/github/:projectId`

## 2) Install OpenCode on the server (server-runner)
1) Install OpenCode CLI on the VPS:

```
curl -fsSL https://opencode.ai/install | bash
```

2) Ensure `opencode` is in PATH for the Auto-Flow service user.

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
