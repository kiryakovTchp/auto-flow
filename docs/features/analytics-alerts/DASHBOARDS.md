# Dashboards (Project UI)

## Route and access
- GET /p/:slug/analytics
- Requires session; any project member can view
- Tab label key: screens.analytics.title

## Layout (suggested)
- Header with date range controls (from/to, quick presets 7/30/90 days)
- KPI cards: tasks by status, queue status, oldest pending age
- Funnel chart: seen -> issue -> pr -> merged -> ci_success -> deployed
- Lead time chart: p50 and p90 seconds + deployed count
- Failures table: top reasons
- Webhooks health: last delivery per provider/asana_project_gid
- Job queue health: pending/processing/done/failed counts

## Data sources and queries
| Block | Source | Notes |
| --- | --- | --- |
| Tasks by status | tasks | group by status for project_id |
| Queue by status | job_queue | group by status for project_id |
| Oldest pending age | job_queue | min(created_at) where status = 'pending' |
| Funnel | task_events | same SQL as /api/v1/projects/:slug/funnel |
| Lead time | task_events | same SQL as /api/v1/projects/:slug/lead-time |
| Failures | task_events | same SQL as /api/v1/projects/:slug/failures |
| Webhook health | project_webhooks | last_delivery_at per provider |

## Date range behavior
- Default range: last 90 days
- from/to are optional query params (ISO string)
- Funnel and lead time use task_events within range
- Summary and queue health ignore range (real-time snapshot)

## Empty states
- No tasks: show muted placeholder and zero cards
- No events in range: show zero funnel and a "no data" note
- Missing webhook rows: show provider with "-" last_delivery_at

## Performance notes
- Use aggregated queries only
- Limit failures list to top 50 (same as API)
- Avoid N+1 queries; compute all blocks in one request
