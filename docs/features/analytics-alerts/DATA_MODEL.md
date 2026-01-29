# Data model

## New table: project_alerts_telegram
Purpose: store per-project Telegram alert configuration and chat binding.

Suggested schema:
```sql
create table if not exists project_alerts_telegram (
  project_id bigint not null references projects(id) on delete cascade,
  connect_token_hash text,
  chat_id text,
  enabled boolean not null default false,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index if not exists idx_project_alerts_telegram_chat_id on project_alerts_telegram(chat_id);
```

## Token storage
- Telegram bot token is stored in app_secrets as TELEGRAM_BOT_TOKEN
- Value is encrypted using the master key (data/master.key)

## Migration
- New migration file: src/db/sql/019_telegram_alerts.sql
- Version number must be higher than the latest migration

## Optional future tables
- alert_deliveries for dedupe and retry visibility (not required for MVP)
