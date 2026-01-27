# API Keys (Example)

Do NOT commit real secrets to this repository.

Store secrets in:
- the tool UI (per-project encrypted secrets)
- `.env` (local dev only; not committed)
- GitHub Actions secrets / a secret manager (deploy)

## Asana

- `ASANA_PAT`: <paste here>

## GitHub

- `GITHUB_TOKEN`: <paste here>
- `GITHUB_WEBHOOK_SECRET`: <paste here>

## OpenCode OAuth (server-managed)

- `OPENCODE_OAUTH_AUTH_URL`: <provider authorize URL>
- `OPENCODE_OAUTH_TOKEN_URL`: <provider token URL>
- `OPENCODE_OAUTH_CLIENT_ID`: <client id>
- `OPENCODE_OAUTH_CLIENT_SECRET`: <client secret (optional)>
- `OPENCODE_OAUTH_SCOPES`: <space-separated scopes>
