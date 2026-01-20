-- 007_tasks_project_scope.sql

-- Project-scoped tasks (Stage 4)

alter table tasks add column if not exists project_id bigint references projects(id);
create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_project_id_updated on tasks(project_id, updated_at desc);

create table if not exists task_events (
  id bigserial primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  kind text not null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_events_task_id_created_at on task_events(task_id, created_at desc);
