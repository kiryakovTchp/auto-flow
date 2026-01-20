-- 003_project_settings.sql

create table if not exists project_secrets (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  key text not null,
  encrypted_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, key)
);

create table if not exists project_webhooks (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  provider text not null,
  asana_project_gid text,
  webhook_gid text,
  target_url text,
  last_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, provider, asana_project_gid)
);

create index if not exists idx_project_webhooks_project_id on project_webhooks(project_id);

create index if not exists idx_project_secrets_project_id on project_secrets(project_id);

create table if not exists project_asana_projects (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  asana_project_gid text not null,
  created_at timestamptz not null default now(),
  unique(project_id, asana_project_gid)
);

create index if not exists idx_project_asana_projects_project_id on project_asana_projects(project_id);

create table if not exists project_github_repos (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  owner text not null,
  repo text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique(project_id, owner, repo)
);

create index if not exists idx_project_github_repos_project_id on project_github_repos(project_id);

create table if not exists project_knowledge_notes (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);
