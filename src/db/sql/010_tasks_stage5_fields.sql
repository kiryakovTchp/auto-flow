-- 010_tasks_stage5_fields.sql

alter table tasks add column if not exists auto_enabled boolean;
alter table tasks add column if not exists paused boolean;
alter table tasks add column if not exists asana_status text;

alter table tasks add column if not exists repo_owner text;
alter table tasks add column if not exists repo_name text;

alter table tasks add column if not exists github_repo_owner text;
alter table tasks add column if not exists github_repo_name text;

create index if not exists idx_tasks_repo on tasks(repo_owner, repo_name);
create index if not exists idx_tasks_github_repo_issue on tasks(github_repo_owner, github_repo_name, github_issue_number);
