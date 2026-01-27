# Deployment

## Recommended: server-runner (direct OpenCode on VPS)
Auto-Flow runs `opencode` directly on the server where Auto-Flow is deployed.

### 1) Install OpenCode CLI

If you use the Docker deployment, the image already includes `opencode` and `git`.

If you run on a host directly:

```
curl -fsSL https://opencode.ai/install | bash
```

### 2) Ensure Auto-Flow user has access
- `opencode` is on PATH for the Auto-Flow process.
- `OPENCODE_WORKSPACE_ROOT` is writable by Auto-Flow.

### 3) Configure project settings
- Mode: `server-runner`
- Model: `openai/gpt-4o-mini`
- Workspace Root: `/var/lib/opencode/workspaces`
- OAuth: connect via Integrations → OpenCode (server-managed OAuth)

## Alternative: GitHub Actions + self-hosted runner
This uses the official OpenCode GitHub integration.

### 1) Create a self-hosted runner
Follow GitHub docs for your org/repo:
- https://docs.github.com/actions/hosting-your-own-runners

Register the runner on your VPS and keep it running as a service (systemd).

### 2) Update workflow to target self-hosted runner
In `.github/workflows/opencode.yml` set:

```yaml
runs-on: self-hosted
```

### 3) Minimal OpenCode workflow

```yaml
name: opencode
on:
  issue_comment:
    types: [created]

jobs:
  opencode:
    if: contains(github.event.comment.body, '/oc') || contains(github.event.comment.body, '/opencode')
    runs-on: self-hosted
    permissions:
      id-token: write
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          fetch-depth: 1
          persist-credentials: false

      - name: Run OpenCode
        uses: anomalyco/opencode/github@latest
        env:
          # Pick the provider you use
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          # Optional if you want to force using GH token
          # GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          model: anthropic/claude-sonnet-4-20250514
          # share: true
```

Notes:
- You can keep `runs-on: ubuntu-latest` if you are OK with GitHub-hosted runners.
- `share: true` can help to get a browser link for the session (if enabled by OpenCode).

## Optional: OpenCode web UI on VPS (for demo/debug)

### Docker deployment (recommended)
The deploy stack includes an `opencode-web` service and a Caddy proxy path at `/opencode`.

1) In `deploy/.env` set:

```
OPENCODE_WEB_URL=https://your-domain/opencode
OPENCODE_WEB_EMBED=1
OPENCODE_WEB_ENABLED=1
```

2) Deploy:

```
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

This enables the "Open OpenCode Web UI" button and embeds the UI inside Auto-Flow.

You can also toggle these in the instance UI at `/admin` → OpenCode Web UI.

### Host deployment (manual)
If you want a standalone process:

```
OPENCODE_SERVER_PASSWORD=change-me opencode web --hostname 0.0.0.0 --port 4096
```

Then reverse-proxy it behind your existing ingress (Caddy/Nginx) and keep it behind auth.

To show a button in Auto-Flow UI, set:

```
OPENCODE_WEB_URL=https://opencode.your-domain
```

Docs:
- https://opencode.ai/docs/web/
- https://opencode.ai/docs/server/
