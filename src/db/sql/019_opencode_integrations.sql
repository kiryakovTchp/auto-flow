-- 019_opencode_integrations.sql

create table if not exists integrations (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  type text not null,
  status text not null default 'disabled',
  created_by_user_id bigint references users(id) on delete set null,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, type)
);

create index if not exists idx_integrations_project_id on integrations(project_id);
create index if not exists idx_integrations_type on integrations(type);
create index if not exists idx_integrations_status on integrations(status);

create table if not exists oauth_credentials (
  id bigserial primary key,
  integration_id bigint not null references integrations(id) on delete cascade,
  provider text not null,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text,
  token_type text,
  last_refresh_at timestamptz,
  revoked_at timestamptz,
  encryption_key_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(integration_id, provider)
);

create index if not exists idx_oauth_credentials_integration_id on oauth_credentials(integration_id);
create index if not exists idx_oauth_credentials_provider on oauth_credentials(provider);
create index if not exists idx_oauth_credentials_revoked_at on oauth_credentials(revoked_at);

create table if not exists oauth_sessions (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  user_id bigint references users(id) on delete set null,
  provider text not null,
  state text not null unique,
  code_verifier_enc text not null,
  code_challenge text not null,
  redirect_uri text not null,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_sessions_project_id on oauth_sessions(project_id);
create index if not exists idx_oauth_sessions_user_id on oauth_sessions(user_id);
create index if not exists idx_oauth_sessions_expires_at on oauth_sessions(expires_at);

create table if not exists agent_runs (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  agent_type text not null,
  triggered_by_user_id bigint references users(id) on delete set null,
  status text not null,
  input_spec jsonb not null default '{}'::jsonb,
  output_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_agent_runs_project_id_created_at on agent_runs(project_id, created_at desc);
create index if not exists idx_agent_runs_status_created_at on agent_runs(status, created_at desc);

create table if not exists agent_run_logs (
  id bigserial primary key,
  agent_run_id bigint not null references agent_runs(id) on delete cascade,
  stream text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_run_logs_run_id_created_at on agent_run_logs(agent_run_id, created_at asc);
