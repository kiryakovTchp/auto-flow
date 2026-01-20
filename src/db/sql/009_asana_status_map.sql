-- 009_asana_status_map.sql

create table if not exists asana_status_map (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  option_name text not null,
  mapped_status text not null,
  created_at timestamptz not null default now(),
  unique(project_id, option_name)
);

create index if not exists idx_asana_status_map_project_id on asana_status_map(project_id);
