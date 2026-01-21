-- 014_project_links_contacts.sql

create table if not exists project_links (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  kind text not null,
  url text not null,
  title text,
  tags text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_links_project_id on project_links(project_id);

create table if not exists project_contacts (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  role text not null,
  name text,
  handle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_contacts_project_id on project_contacts(project_id);
