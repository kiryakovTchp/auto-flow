# Open Questions

## 1) Which provider + model?
We need to standardize on the model line used in server-runner and (optionally) GitHub Actions.

## 2) How do we guarantee PR body contains `Fixes #<issue_number>`?
Options:
- rely on the Issue body contract (already present in `src/services/taskspec.ts`)
- add a stricter prompt in the workflow via `prompt:` override

## 3) How do we surface OpenCode output in UI?
Options:
- Auto-Flow task events (server-runner logs)
- enable OpenCode share links (`share: true`)
- mirror key events back to Asana (recommended)
