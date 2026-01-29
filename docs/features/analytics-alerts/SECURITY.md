# Security

## Secrets
- TELEGRAM_BOT_TOKEN is stored in app_secrets and encrypted with the master key
- Project-level chat binding is stored without the raw connect token (hash only)

## Access control
- Only project admins can change alert settings or generate a connect token
- All project members can view dashboard data

## Data in alerts
- Send minimal context only (project name, task id, status, and links)
- Do not include secrets, raw webhook payloads, or tokens

## Telegram trust boundary
- Messages leave Auto-Flow and are stored by Telegram
- Treat alerts as operational notifications, not a secure channel
