# Deploy (Stage 8)

This repo includes a production-ish Docker + Caddy setup under `deploy/`.

## Prereqs

- A VPS with Docker + docker compose plugin
- DNS A/AAAA record for your domain pointing to the VPS

## First-time setup

1) Copy and edit env

```
cp deploy/.env.example deploy/.env
```

Set:
- `DOMAIN`
- `ACME_EMAIL` (used by Caddy for TLS)
- `PUBLIC_BASE_URL`
- `INIT_ADMIN_TOKEN` (one-time)
- `PGPASSWORD` (do not keep default)
- `OPENCODE_OAUTH_*` (required for server-runner OAuth)

2) Start services

From repo root:

```
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

3) Create the first admin

Open:

`https://<DOMAIN>/init?token=<INIT_ADMIN_TOKEN>`

Then set username/password.

## Notes

- Encryption master key is stored in a Docker volume mounted at `/app/data`.
- SQL migrations are executed automatically on app start.
- `/metrics` is protected by `METRICS_TOKEN` if set (Authorization: Bearer ...). If not set, it is only accessible from localhost.
- For server-runner, set Workspace Root in project settings (e.g. `/var/lib/opencode/workspaces`).
## Staging + prod

For two environments on the same VPS:

1) Create env files (do not commit):

```
cp deploy/staging.env.example deploy/staging.env
cp deploy/prod.env.example deploy/prod.env
```

2) Start each stack with a different project name:

```
docker compose -p auto_flow_staging -f deploy/docker-compose.yml --env-file deploy/staging.env up -d --build
docker compose -p auto_flow_prod -f deploy/docker-compose.yml --env-file deploy/prod.env up -d --build
```
