-- 008_asana_field_config.sql

create table if not exists asana_field_config (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  workspace_gid text,
  auto_field_gid text,
  repo_field_gid text,
  status_field_gid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);
