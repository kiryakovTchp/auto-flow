-- 018_project_api_tokens.sql

create table if not exists project_api_tokens (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  name text,
  token_hash text not null unique,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_project_api_tokens_project_id on project_api_tokens(project_id);
create index if not exists idx_project_api_tokens_revoked_at on project_api_tokens(revoked_at);
