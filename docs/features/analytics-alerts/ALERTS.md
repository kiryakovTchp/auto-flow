# Telegram Alerts

## Goal
Send project-level alerts to a single Telegram chat when important events occur.

## Configuration UI
- Route: /p/:slug/alerts
- Admin-only actions: set bot token, generate connect token, enable/disable alerts
- Read-only for non-admin members: connection status and last connected time

## Bot token storage
- Key: TELEGRAM_BOT_TOKEN in app_secrets
- Encrypted with master key (data/master.key)
- Validated via Telegram getMe before saving

## Connection flow
1) Admin clicks Start in UI to generate a connect token
2) UI shows a link: https://t.me/<bot_username>?start=<connect_token>
3) User opens the link and runs /start <connect_token>
4) Poller matches connect_token hash to project_alerts_telegram
5) Chat is linked and enabled
6) Bot sends the first message

### First message requirement
- The first reply must be the exact Russian phrase "alerts connected"
- Use the literal Unicode string in code:
  \u0430\u043b\u0435\u0440\u0442\u044b \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u044b

## Polling strategy
- Use getUpdates with long polling and an offset
- Store last_update_id in memory (or optional DB if needed)
- Backoff on failures (exponential or fixed 5-10s)

## Alert triggers (MVP)
- task_events: event_type = 'task.status_changed' and ref_json.to = 'FAILED'
- project_events: event_type = 'error' (job worker failures)
- unauthorized webhooks: insert project_events with event_type = 'webhook.unauthorized'

## Message format (example)
[Auto-Flow] Project: <name>
Event: task.failed
Task: <title> (id=<id>)
Reason: <reason>
Link: /p/<slug>/t/<id>
Time: <iso>

## Delivery pipeline
- Insert alert job: kind = alerts.telegram_send
- Payload includes: projectId, eventType, taskId, title, reason, url
- job_queue retries with existing backoff logic
- Avoid recursion: do not emit error alerts from alert send failures
