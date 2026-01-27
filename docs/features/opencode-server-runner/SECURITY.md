# Security Notes

## Why GitHub Actions integration is preferred
OpenCode runs inside an isolated runner environment with explicit permissions.

## Minimal required permissions
The workflow needs enough permissions to:
- create branches/commits
- open PRs
- comment on issues

Recommended (MVP):

```yaml
permissions:
  id-token: write
  contents: write
  pull-requests: write
  issues: write
```

## Secrets
- github-actions: store LLM provider keys in GitHub Actions secrets.
- server-runner: store OpenCode OAuth tokens in Auto-Flow (encrypted); CLI receives access token at runtime.

## Policy gates
- server-runner enforces policy checks before commit/PR:
  - write_mode (must be pr_only)
  - deny_paths (glob patterns)
  - max_files_changed

## Repo allowlist
- Only enable the OpenCode workflow in repos you actually want to automate.

## Prompt injection
Treat Asana notes and issue text as untrusted input.
Keep OpenCode permissions constrained and avoid giving it access to production secrets.
