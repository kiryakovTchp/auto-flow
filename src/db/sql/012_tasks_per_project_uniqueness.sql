-- 012_tasks_per_project_uniqueness.sql

-- Asana GID uniqueness only within project.
-- Existing schema has unique(asana_gid). Replace with unique(project_id, asana_gid).

alter table tasks drop constraint if exists tasks_asana_gid_key;

-- Clean up: if some rows were created without project_id, keep constraint off.
-- Stage 5+ always sets project_id.

create unique index if not exists uniq_tasks_project_asana_gid on tasks(project_id, asana_gid);
