import { pool } from './pool';

export type AsanaFieldConfigRow = {
  project_id: string;
  workspace_gid: string | null;
  auto_field_gid: string | null;
  repo_field_gid: string | null;
  status_field_gid: string | null;
};

export async function upsertAsanaFieldConfig(params: {
  projectId: string;
  workspaceGid?: string;
  autoFieldGid?: string;
  repoFieldGid?: string;
  statusFieldGid?: string;
}): Promise<void> {
  await pool.query(
    `
      insert into asana_field_config (project_id, workspace_gid, auto_field_gid, repo_field_gid, status_field_gid)
      values ($1, $2, $3, $4, $5)
      on conflict (project_id) do update
      set
        workspace_gid = coalesce(excluded.workspace_gid, asana_field_config.workspace_gid),
        auto_field_gid = coalesce(excluded.auto_field_gid, asana_field_config.auto_field_gid),
        repo_field_gid = coalesce(excluded.repo_field_gid, asana_field_config.repo_field_gid),
        status_field_gid = coalesce(excluded.status_field_gid, asana_field_config.status_field_gid),
        updated_at = now()
    `,
    [
      params.projectId,
      params.workspaceGid ?? null,
      params.autoFieldGid ?? null,
      params.repoFieldGid ?? null,
      params.statusFieldGid ?? null,
    ],
  );
}

export async function getAsanaFieldConfig(projectId: string): Promise<AsanaFieldConfigRow | null> {
  const res = await pool.query<AsanaFieldConfigRow>(
    'select project_id, workspace_gid, auto_field_gid, repo_field_gid, status_field_gid from asana_field_config where project_id = $1 limit 1',
    [projectId],
  );
  return res.rows[0] ?? null;
}

export type StatusMapRow = {
  id: string;
  project_id: string;
  option_name: string;
  mapped_status: string;
};

export async function listAsanaStatusMap(projectId: string): Promise<StatusMapRow[]> {
  const res = await pool.query<StatusMapRow>(
    'select id, project_id, option_name, mapped_status from asana_status_map where project_id = $1 order by option_name asc',
    [projectId],
  );
  return res.rows;
}

export async function upsertAsanaStatusMap(params: { projectId: string; optionName: string; mappedStatus: string }): Promise<void> {
  await pool.query(
    `
      insert into asana_status_map (project_id, option_name, mapped_status)
      values ($1, $2, $3)
      on conflict (project_id, option_name) do update
      set mapped_status = excluded.mapped_status
    `,
    [params.projectId, params.optionName, params.mappedStatus],
  );
}

export async function deleteAsanaStatusMap(projectId: string, optionName: string): Promise<void> {
  await pool.query('delete from asana_status_map where project_id = $1 and option_name = $2', [projectId, optionName]);
}

export async function resolveMappedStatus(projectId: string, optionName: string | null): Promise<string | null> {
  if (!optionName) return null;
  const res = await pool.query<{ mapped_status: string }>(
    'select mapped_status from asana_status_map where project_id = $1 and option_name = $2 limit 1',
    [projectId, optionName],
  );
  return res.rows[0]?.mapped_status ?? null;
}
