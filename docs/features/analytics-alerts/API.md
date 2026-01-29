# Analytics API

These endpoints already exist under /api/v1 and are protected by a project Bearer token.

## Tokens
- Create a token in /p/:slug/api
- Use Authorization: Bearer <token>

## Endpoints
- GET /api/v1/projects/:slug/summary
- GET /api/v1/projects/:slug/funnel?from=&to=
- GET /api/v1/projects/:slug/lead-time?from=&to=
- GET /api/v1/projects/:slug/failures?from=&to=
- GET /api/v1/projects/:slug/webhooks/health
- GET /api/v1/projects/:slug/jobs/health
- GET /api/v1/projects/:slug/tasks/:id/events

## Example
```bash
curl -H "Authorization: Bearer <PROJECT_API_TOKEN>" \
  https://<host>/api/v1/projects/<slug>/summary
```

## Notes
- funnel, lead-time, failures use task_events as source of truth
- summary and health endpoints are real-time snapshots
