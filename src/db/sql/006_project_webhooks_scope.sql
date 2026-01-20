-- 006_project_webhooks_scope.sql

-- Make asana_project_gid non-null with default '' so we can have a single GitHub row
-- with (provider='github', asana_project_gid='') under the existing unique constraint.

alter table project_webhooks add column if not exists asana_project_gid text;

update project_webhooks set asana_project_gid = '' where asana_project_gid is null;

alter table project_webhooks alter column asana_project_gid set default '';
alter table project_webhooks alter column asana_project_gid set not null;

-- Ensure github uniqueness works with empty string.
create unique index if not exists uniq_project_webhooks_github_v2
  on project_webhooks(project_id, provider, asana_project_gid)
  where provider = 'github' and asana_project_gid = '';
