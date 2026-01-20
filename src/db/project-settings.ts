import { pool } from './pool';

export type ProjectSecretKey =
  | 'ASANA_PAT'
  | 'GITHUB_TOKEN'
  | 'GITHUB_WEBHOOK_SECRET'
  | 'ASANA_WEBHOOK_SECRET'
  | 'OPENCODE_WORKDIR';

export async function upsertProjectSecret(params: {
  projectId: string;
  key: ProjectSecretKey;
  encryptedValue: string;
}): Promise<void> {
  await pool.query(
    `
      insert into project_secrets (project_id, key, encrypted_value)
      values ($1, $2, $3)
      on conflict (project_id, key) do update
      set encrypted_value = excluded.encrypted_value, updated_at = now()
    `,
    [params.projectId, params.key, params.encryptedValue],
  );
}

export async function getProjectSecret(params: { projectId: string; key: ProjectSecretKey }): Promise<string | null> {
  const res = await pool.query<{ encrypted_value: string }>(
    'select encrypted_value from project_secrets where project_id = $1 and key = $2 limit 1',
    [params.projectId, params.key],
  );
  return res.rows[0]?.encrypted_value ?? null;
}

export async function listProjectAsanaProjects(projectId: string): Promise<string[]> {
  const res = await pool.query<{ asana_project_gid: string }>(
    'select asana_project_gid from project_asana_projects where project_id = $1 order by asana_project_gid asc',
    [projectId],
  );
  return res.rows.map((r) => r.asana_project_gid);
}

export async function addProjectAsanaProject(projectId: string, asanaProjectGid: string): Promise<void> {
  await pool.query(
    `
      insert into project_asana_projects (project_id, asana_project_gid)
      values ($1, $2)
      on conflict do nothing
    `,
    [projectId, asanaProjectGid],
  );
}

export async function removeProjectAsanaProject(projectId: string, asanaProjectGid: string): Promise<void> {
  await pool.query('delete from project_asana_projects where project_id = $1 and asana_project_gid = $2', [projectId, asanaProjectGid]);
}

export type ProjectRepoRow = {
  id: string;
  project_id: string;
  owner: string;
  repo: string;
  is_default: boolean;
};

export async function listProjectGithubRepos(projectId: string): Promise<ProjectRepoRow[]> {
  const res = await pool.query<ProjectRepoRow>(
    'select id, project_id, owner, repo, is_default from project_github_repos where project_id = $1 order by owner asc, repo asc',
    [projectId],
  );
  return res.rows;
}

export async function addProjectGithubRepo(projectId: string, owner: string, repo: string, isDefault: boolean): Promise<void> {
  await pool.query(
    `
      insert into project_github_repos (project_id, owner, repo, is_default)
      values ($1, $2, $3, $4)
      on conflict (project_id, owner, repo) do update
      set is_default = excluded.is_default
    `,
    [projectId, owner, repo, isDefault],
  );

  if (isDefault) {
    await pool.query(
      `
        update project_github_repos
        set is_default = false
        where project_id = $1 and not (owner = $2 and repo = $3)
      `,
      [projectId, owner, repo],
    );
  }
}

export async function removeProjectGithubRepo(projectId: string, owner: string, repo: string): Promise<void> {
  await pool.query('delete from project_github_repos where project_id = $1 and owner = $2 and repo = $3', [projectId, owner, repo]);
}

export async function setDefaultRepo(projectId: string, owner: string, repo: string): Promise<void> {
  await pool.query('update project_github_repos set is_default = false where project_id = $1', [projectId]);
  await pool.query(
    'update project_github_repos set is_default = true where project_id = $1 and owner = $2 and repo = $3',
    [projectId, owner, repo],
  );
}

export async function getProjectKnowledge(projectId: string): Promise<string> {
  const res = await pool.query<{ markdown: string }>('select markdown from project_knowledge_notes where project_id = $1 limit 1', [projectId]);
  return res.rows[0]?.markdown ?? '';
}

export async function upsertProjectKnowledge(projectId: string, markdown: string): Promise<void> {
  await pool.query(
    `
      insert into project_knowledge_notes (project_id, markdown)
      values ($1, $2)
      on conflict (project_id) do update
      set markdown = excluded.markdown, updated_at = now()
    `,
    [projectId, markdown],
  );
}
