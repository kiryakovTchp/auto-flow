import { pool } from './pool';

export type RepoMapRow = {
  id: string;
  project_id: string;
  option_name: string;
  owner: string;
  repo: string;
  created_at: string;
};

export async function listRepoMap(projectId: string): Promise<RepoMapRow[]> {
  const res = await pool.query<RepoMapRow>(
    'select id, project_id, option_name, owner, repo, created_at from repo_map where project_id = $1 order by option_name asc',
    [projectId],
  );
  return res.rows;
}

export async function upsertRepoMap(params: { projectId: string; optionName: string; owner: string; repo: string }): Promise<void> {
  await pool.query(
    `
      insert into repo_map (project_id, option_name, owner, repo)
      values ($1, $2, $3, $4)
      on conflict (project_id, option_name) do update
      set owner = excluded.owner, repo = excluded.repo
    `,
    [params.projectId, params.optionName, params.owner, params.repo],
  );
}

export async function deleteRepoMap(projectId: string, optionName: string): Promise<void> {
  await pool.query('delete from repo_map where project_id = $1 and option_name = $2', [projectId, optionName]);
}

export async function resolveRepoForOption(projectId: string, optionName: string): Promise<{ owner: string; repo: string } | null> {
  const res = await pool.query<{ owner: string; repo: string }>(
    'select owner, repo from repo_map where project_id = $1 and option_name = $2 limit 1',
    [projectId, optionName],
  );
  const r = res.rows[0];
  return r ? { owner: r.owner, repo: r.repo } : null;
}
