# Runbook

## Verify alert connection
- Check UI status: /p/:slug/alerts should show connected and enabled
- Confirm chat_id is stored:
  select * from project_alerts_telegram where project_id = <id>;

## Bot not responding to /start
- Verify TELEGRAM_BOT_TOKEN is valid (call getMe)
- Ensure connect token is fresh and not already consumed
- Check poller logs for getUpdates errors

## Alerts not arriving
- Ensure enabled = true in project_alerts_telegram
- Check job_queue for pending alerts:
  select * from job_queue where kind = 'alerts.telegram_send' order by created_at desc limit 20;
- Verify task_events or project_events exist for the trigger
- Inspect server logs for Telegram send errors (429, 401, network)

## Reset connection
- Disable alerts in UI
- Regenerate connect token and run /start again
- Optionally clear chat_id in DB:
  update project_alerts_telegram set chat_id = null, enabled = false where project_id = <id>;

## Dashboards look empty
- Ensure task_events exist for the project
- Check date range filters (from/to)
- Verify tasks table has project_id data
