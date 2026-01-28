# CI/CD (Stage 8)

## CI

GitHub Actions runs `npm run build` for the server and `npm run build` in `ui/` for the SPA on PRs and pushes to `main`.

Workflow: `.github/workflows/ci.yml`

## Deploy

Workflow: `.github/workflows/deploy.yml`

Behavior:
- Push to `main` deploys `staging`.
- Manual `workflow_dispatch` can deploy `staging` or `prod`.

Required GitHub secrets:
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH` (path to repo clone on VPS, e.g. `/opt/auto-flow`)

Server setup (one-time):
1) Clone repo on VPS to `DEPLOY_PATH`
2) Create `deploy/staging.env` and `deploy/prod.env` on the VPS (do not commit)
3) Run the deploy workflow

Staging/prod separation:
- Uses different env files + different compose project names (`auto_flow_staging` vs `auto_flow_prod`)
- Uses separate databases (`PGDATABASE` differs)
