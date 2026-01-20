-- 005_project_webhooks_indexes.sql

-- Ensure only one GitHub webhook record per project (asana_project_gid is null).
create unique index if not exists uniq_project_webhooks_github
  on project_webhooks(project_id)
  where provider = 'github' and asana_project_gid is null;

-- Ensure no duplicate Asana webhook records per asana project gid.
create unique index if not exists uniq_project_webhooks_asana
  on project_webhooks(project_id, asana_project_gid)
  where provider = 'asana' and asana_project_gid is not null;
