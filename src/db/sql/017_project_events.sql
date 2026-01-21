-- 017_project_events.sql

create table if not exists project_events (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  source text not null,
  event_type text not null,
  ref_json jsonb not null default '{}'::jsonb,
  delivery_id text,
  user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_events_project_id_created_at on project_events(project_id, created_at desc);
create index if not exists idx_project_events_event_type_created_at on project_events(event_type, created_at desc);
create index if not exists idx_project_events_source_created_at on project_events(source, created_at desc);
