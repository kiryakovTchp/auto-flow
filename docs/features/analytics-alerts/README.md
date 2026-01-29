# Analytics Dashboards + Telegram Alerts

## Goal
Provide project-level analytics dashboards inside the Auto-Flow UI and deliver operational alerts to Telegram.

## Scope (MVP)
- New project tab: /p/:slug/analytics (dashboards)
- New project tab: /p/:slug/alerts (Telegram setup and status)
- Telegram bot integration via long polling (getUpdates)
- Alert delivery pipeline using job_queue with retries
- Alert triggers:
  - task.status_changed -> FAILED
  - project_events -> error
  - webhook unauthorized (asana/github)

## Non-goals
- Grafana/Prometheus stack bundled into deploy
- Slack or email alerts
- On-call schedules or escalation
- Raw webhook payload storage

## User flows
1) View dashboards:
   - Open /p/:slug/analytics to see funnel, lead time, failures, queue, and webhook health.
2) Connect Telegram alerts:
   - Paste the bot token and click Start to generate a connect link
   - Open the bot link and run /start <token>
   - Bot replies with the first message: alerts connected (see ALERTS.md for the exact string)

## Components
- UI: server-rendered tabs and pages in the project area
- DB: project_alerts_telegram table, app_secrets for the bot token
- Services: telegram poller, alert dispatcher, message formatter
- Worker: job_queue handler for Telegram sends

## Docs map
- ARCHITECTURE.md - data flow and components
- DASHBOARDS.md - UI layout, metrics, and queries
- ALERTS.md - Telegram bot flow and message templates
- DATA_MODEL.md - SQL schema and migrations
- SETUP.md - configuration steps
- SECURITY.md - secrets handling and access control
- RUNBOOK.md - troubleshooting and ops
- API.md - analytics endpoints
- OPEN_QUESTIONS.md - decisions to confirm
