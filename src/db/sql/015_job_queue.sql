-- 015_job_queue.sql

create table if not exists job_queue (
  id bigserial primary key,
  project_id bigint references projects(id) on delete cascade,
  provider text not null,
  kind text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_queue_status_run on job_queue(status, next_run_at);
create index if not exists idx_job_queue_project_id on job_queue(project_id);
