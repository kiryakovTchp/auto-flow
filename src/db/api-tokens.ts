import { pool } from './pool';

export type ApiTokenRow = {
  id: string;
  project_id: string;
  name: string | null;
  token_hash: string;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function createProjectApiToken(params: {
  projectId: string;
  tokenHash: string;
  name?: string | null;
  createdBy?: string | null;
}): Promise<ApiTokenRow> {
  const res = await pool.query<ApiTokenRow>(
    `
      insert into project_api_tokens (project_id, name, token_hash, created_by)
      values ($1, $2, $3, $4)
      returning *
    `,
    [params.projectId, params.name ?? null, params.tokenHash, params.createdBy ?? null],
  );
  return res.rows[0]!;
}

export async function listProjectApiTokens(projectId: string): Promise<ApiTokenRow[]> {
  const res = await pool.query<ApiTokenRow>(
    `
      select id, project_id, name, token_hash, created_by, created_at, last_used_at, revoked_at
      from project_api_tokens
      where project_id = $1
      order by created_at desc, id desc
    `,
    [projectId],
  );
  return res.rows;
}

export async function revokeProjectApiToken(params: { projectId: string; tokenId: string }): Promise<void> {
  await pool.query(
    `
      update project_api_tokens
      set revoked_at = now()
      where project_id = $1 and id = $2
    `,
    [params.projectId, params.tokenId],
  );
}

export async function getProjectApiTokenByHash(tokenHash: string): Promise<ApiTokenRow | null> {
  const res = await pool.query<ApiTokenRow>(
    `
      select id, project_id, name, token_hash, created_by, created_at, last_used_at, revoked_at
      from project_api_tokens
      where token_hash = $1 and revoked_at is null
      limit 1
    `,
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

export async function markProjectApiTokenUsed(tokenId: string): Promise<void> {
  await pool.query('update project_api_tokens set last_used_at = now() where id = $1', [tokenId]);
}
