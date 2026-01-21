-- 016_task_events_observability.sql

-- Add metadata-first columns for analytics and debugging.
alter table task_events add column if not exists project_id bigint references projects(id) on delete cascade;
alter table task_events add column if not exists source text;
alter table task_events add column if not exists event_type text;
alter table task_events add column if not exists ref_json jsonb;
alter table task_events add column if not exists delivery_id text;
alter table task_events add column if not exists user_id bigint references users(id) on delete set null;

-- Backfill project_id from tasks.
update task_events e
set project_id = t.project_id
from tasks t
where e.task_id = t.id
  and e.project_id is null;

-- Backfill event_type from legacy kind.
update task_events
set event_type = kind
where event_type is null;

-- Backfill source from kind.
update task_events
set source = case
  when kind like 'asana.%' then 'asana'
  when kind like 'github.%' then 'github'
  when kind like 'manual.%' then 'user'
  when kind like 'import.%' then 'system'
  when kind like 'pipeline.%' then 'system'
  when kind like 'finalize.%' then 'system'
  when kind like 'reconcile.%' then 'system'
  else 'system'
end
where source is null;

-- Backfill ref_json with message.
update task_events
set ref_json = jsonb_build_object('message', message)
where ref_json is null;

create index if not exists idx_task_events_project_id_created_at on task_events(project_id, created_at desc);
create index if not exists idx_task_events_event_type_created_at on task_events(event_type, created_at desc);
create index if not exists idx_task_events_source_created_at on task_events(source, created_at desc);
