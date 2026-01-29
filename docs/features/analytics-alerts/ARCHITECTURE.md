# Architecture

## Overview
Dashboard UI reads data directly from Postgres using the same query logic as the /api/v1 analytics endpoints.
Alerting is event-driven and uses job_queue for delivery retries.

## Components
- UI routes: /p/:slug/analytics and /p/:slug/alerts (server-rendered)
- DB tables: task_events, project_events, project_alerts_telegram
- app_secrets for TELEGRAM_BOT_TOKEN (encrypted)
- Telegram poller service (getUpdates long polling)
- Alert dispatcher and job_queue worker
- Metrics endpoint /metrics (optional for ops)

## Data flow: dashboards
1) User opens /p/:slug/analytics
2) Server loads project and membership
3) Server runs analytics queries (funnel, lead time, failures, queue, webhooks)
4) HTML is rendered and returned

## Data flow: alerts
1) Event sources write task_events or project_events
2) Alert dispatcher selects eligible events
3) Enqueue alerts.telegram_send job with project_id in payload
4) Worker sends message to Telegram API
5) Logs record delivery outcome (optional: project_events entry)

## Telegram connection flow
1) Admin enters TELEGRAM_BOT_TOKEN in /p/:slug/alerts
2) System validates token via getMe and stores it in app_secrets
3) System generates connect_token and stores its hash in project_alerts_telegram
4) User runs /start <connect_token> in the bot
5) Poller receives update, links chat_id to the project, and sends "alerts connected"

## Sequence (simplified)
User -> UI (/p/:slug/alerts) -> DB (store connect token)
User -> Telegram bot (/start token) -> Poller -> DB (store chat_id)
Event -> task_events/project_events -> Alert dispatcher -> job_queue -> Worker -> Telegram API -> Chat
