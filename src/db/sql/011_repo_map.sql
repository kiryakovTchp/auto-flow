-- 011_repo_map.sql

create table if not exists repo_map (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  option_name text not null,
  owner text not null,
  repo text not null,
  created_at timestamptz not null default now(),
  unique(project_id, option_name)
);

create index if not exists idx_repo_map_project_id on repo_map(project_id);
