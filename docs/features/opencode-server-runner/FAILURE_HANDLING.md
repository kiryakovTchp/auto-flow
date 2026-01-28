# Failure Handling (MVP)

## What can go wrong
- Issue created but OpenCode job never runs (workflow missing / app not installed / no comment trigger).
- OpenCode runs but fails to open PR (permissions, missing secrets, repo protections).
- PR created but missing `Fixes #<issue_number>` -> Auto-Flow won't link PR to task.
- server-runner: OpenCode CLI missing, OAuth not connected, Local CLI not ready, or auth.json missing.

## How we want it to look from Asana
"Just looking at Asana" should be enough to know where it failed.

Minimum signals:
1) Comment in Asana when issue is created (link to issue).
2) Comment in Asana when PR is created (link to PR).
3) Timeout warning if no PR appears within N minutes (link to issue + hint to check Actions logs).

## Recommended timeout (rollout)
- Default: 60 minutes after `ISSUE_CREATED` with no PR.
- Configurable per project: `OpenCode Runner -> PR Timeout (minutes)`.
- Global scan interval: `OPENCODE_WATCHDOG_INTERVAL_MINUTES` (default 5).
- Action: mark task as `FAILED` + Asana comment with next steps.

Implementation idea:
- Add a scheduler similar to `src/services/reconcile-scheduler.ts` that scans stuck tasks and writes Asana comments.
