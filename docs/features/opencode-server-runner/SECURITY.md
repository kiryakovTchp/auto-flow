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
- server-runner: store LLM provider keys in Auto-Flow project secrets (encrypted).

## Repo allowlist
- Only enable the OpenCode workflow in repos you actually want to automate.

## Prompt injection
Treat Asana notes and issue text as untrusted input.
Keep OpenCode permissions constrained and avoid giving it access to production secrets.
