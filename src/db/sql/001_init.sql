-- 001_init.sql

-- Tracks which SQL migrations were applied.
create table if not exists schema_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

-- Legacy table (kept for compatibility; not used in v2)
create table if not exists task_mappings (
  id bigserial primary key,
  asana_gid text not null unique,
  asana_project_gid text,
  github_issue_number integer,
  github_issue_url text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_mappings_asana_gid on task_mappings(asana_gid);
create index if not exists idx_task_mappings_github_issue_number on task_mappings(github_issue_number);

-- v2 tasks
create table if not exists tasks (
  id bigserial primary key,
  asana_gid text not null unique,
  title text,
  status text not null,
  github_issue_number integer,
  github_issue_url text,
  github_pr_number integer,
  github_pr_url text,
  ci_sha text,
  ci_status text,
  ci_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tasks add column if not exists ci_sha text;
alter table tasks add column if not exists ci_status text;
alter table tasks add column if not exists ci_url text;

create index if not exists idx_tasks_asana_gid on tasks(asana_gid);
create index if not exists idx_tasks_github_issue_number on tasks(github_issue_number);
create index if not exists idx_tasks_github_pr_number on tasks(github_pr_number);
create index if not exists idx_tasks_ci_sha on tasks(ci_sha);

create table if not exists taskspecs (
  id bigserial primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  version integer not null,
  markdown text not null,
  created_at timestamptz not null default now(),
  unique(task_id, version)
);

create table if not exists webhook_secrets (
  id bigserial primary key,
  provider text not null,
  secret text,
  webhook_gid text,
  resource_gid text,
  target_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider)
);

alter table webhook_secrets alter column secret drop not null;
alter table webhook_secrets add column if not exists webhook_gid text;
alter table webhook_secrets add column if not exists resource_gid text;
alter table webhook_secrets add column if not exists target_url text;

create table if not exists webhook_deliveries (
  id bigserial primary key,
  provider text not null,
  delivery_id text not null,
  received_at timestamptz not null default now(),
  unique(provider, delivery_id)
);

create table if not exists app_secrets (
  id bigserial primary key,
  key text not null unique,
  encrypted_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_users (
  id bigserial primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
