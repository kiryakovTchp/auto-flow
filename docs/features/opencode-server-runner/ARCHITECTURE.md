# Architecture

## Happy Path
1) Asana task is created/updated and marked as AutoTask.
2) Auto-Flow receives Asana webhook and resolves:
   - auto enabled
   - repo
   - mapped status (ACTIVE/BLOCKED/CANCELLED)
3) Auto-Flow creates or updates:
   - TaskSpec (stored in DB)
   - GitHub Issue (contains TaskSpec)
4) Mode switch:
   - github-actions: Auto-Flow posts an Issue comment with the configured command.
   - server-runner: Auto-Flow enqueues a local OpenCode run.
5) OpenCode runs (Actions or server) and opens a PR.
   - PR body must contain `Fixes #<issue_number>`.
7) Auto-Flow receives GitHub webhooks and links PR to task.
   - task status becomes `PR_CREATED`.
8) Human reviews and merges.
9) Auto-Flow tracks CI and finalizes:
   - merged + CI success -> Asana completed -> `DEPLOYED`
   - merged + CI failure -> Asana comment -> `FAILED`

## Auto-Flow Code Map
- Asana -> pipeline: `src/services/pipeline-stage5.ts`
- Create issue + TaskSpec: `src/services/sync-from-asana.ts`, `src/services/taskspec.ts`
- Server runner job: `src/services/opencode-server-runner-job.ts`
- GitHub webhook processing (project mode): `src/services/webhook-job-handlers.ts`
- Finalization logic: `src/services/finalize.ts`

## GitHub Events Needed
- `issue_comment` (only for github-actions mode)
- `pull_request` (to link PR)
- `workflow_run` (to capture CI)

Auto-Flow uses per-project webhook endpoints:
- `POST /webhooks/github/:projectId`
