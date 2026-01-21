-- 013_ci_merge_sha.sql

alter table tasks add column if not exists merge_commit_sha text;
create index if not exists idx_tasks_merge_commit_sha on tasks(merge_commit_sha);

alter table tasks add column if not exists asana_completed_by_tool boolean not null default false;
