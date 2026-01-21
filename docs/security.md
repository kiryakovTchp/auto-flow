# Security Notes

## Token rotation

If secrets were committed at any point, assume they are compromised and rotate:

- Asana PAT
- GitHub PAT
- GitHub webhook secrets

After rotation:
- Update project secrets inside the tool UI.

## Git history cleanup (optional, destructive)

If you need to purge committed secrets from git history, you must rewrite history and force-push.

Typical approach:

1) Install git-filter-repo

2) Remove the sensitive paths from history (example):

```
git filter-repo --path docs/apikeys.md --invert-paths
```

3) Force push branches/tags as needed.

WARNING:
- This is destructive. All collaborators must re-clone or hard reset to the new history.
- Do not run this unless you explicitly decide to rewrite history.
