# OpenCode Server Runner (MVP: PR only)

## Goal
Asana task -> Auto-Flow -> GitHub Issue -> OpenCode executes -> PR created.

For the first rollout we consider the task "done" when a PR is created.
Merge + CI -> Asana completion stays handled by Auto-Flow.

## Execution Models
We support two modes:

1) **server-runner** (preferred for full control)
   - Auto-Flow runs `opencode` directly on the server.
   - Uses OpenCode OAuth (server-managed) and passes `OPENAI_ACCESS_TOKEN` to the CLI.
   - No GitHub Actions required.

2) **github-actions** (alternative)
   - Auto-Flow posts an issue comment to trigger the official OpenCode GitHub Action.
   - Can run on GitHub-hosted or self-hosted runners.

## Trigger Contract
- Auto-Flow must create a GitHub issue for the task.
- In `github-actions` mode, OpenCode is triggered by a comment containing `/opencode` or `/oc`.
- In `server-runner` mode, Auto-Flow runs OpenCode directly and does not require a comment.

Auto-Flow posts the trigger comment when OpenCode mode is `github-actions`.
Important: putting `/opencode implement` only in the issue body is not enough if the workflow listens to `issue_comment`.

## PR Linking Contract (Auto-Flow)
Auto-Flow links PR -> Issue by regex `Fixes #<issue_number>`.

So OpenCode must produce a PR body that contains:

```
Fixes #123
```

Source:
- `src/services/webhook-job-handlers.ts` (`extractFixesIssueNumber()`)
- `src/services/taskspec.ts` (Issue body includes the requirement)

## Observability ("see how it works")
server-runner:
- Auto-Flow task events + Asana comments.
- Server logs from Auto-Flow process.
- Project UI: Integrations → OpenCode (agent runs + logs).

github-actions:
- GitHub Actions logs (job `opencode`).
- Optional: OpenCode session sharing (`share: true`) to get a web link in logs.

Optional web UI:
- run `opencode web` with basic auth (see `DEPLOYMENT.md`).
