-- 002_auth_projects.sql

create table if not exists users (
  id bigserial primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  session_id text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_id on sessions(user_id);
create index if not exists idx_sessions_expires_at on sessions(expires_at);

create table if not exists invites (
  id bigserial primary key,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by bigint references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_invites_expires_at on invites(expires_at);

create table if not exists projects (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists project_memberships (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  project_id bigint not null references projects(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique(user_id, project_id)
);

create index if not exists idx_project_memberships_project_id on project_memberships(project_id);
