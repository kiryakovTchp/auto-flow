import { pool } from './pool';

export type IntegrationStatus = 'disabled' | 'connected' | 'expired' | 'error';

export type IntegrationRow = {
  id: string;
  project_id: string;
  type: string;
  status: IntegrationStatus;
  created_by_user_id: string | null;
  connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function getIntegrationByProjectType(projectId: string, type: string): Promise<IntegrationRow | null> {
  const res = await pool.query<IntegrationRow>(
    'select * from integrations where project_id = $1 and type = $2 limit 1',
    [projectId, type],
  );
  return res.rows[0] ?? null;
}

export async function ensureIntegration(params: {
  projectId: string;
  type: string;
  createdByUserId?: string | null;
}): Promise<IntegrationRow> {
  const res = await pool.query<IntegrationRow>(
    `
      insert into integrations (project_id, type, status, created_by_user_id)
      values ($1, $2, 'disabled', $3)
      on conflict (project_id, type) do update
      set updated_at = now()
      returning *
    `,
    [params.projectId, params.type, params.createdByUserId ?? null],
  );
  return res.rows[0]!;
}

export async function updateIntegrationStatus(params: {
  integrationId: string;
  status: IntegrationStatus;
  lastError?: string | null;
  connectedAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `
      update integrations
      set status = $2,
          last_error = $3,
          connected_at = $4,
          updated_at = now()
      where id = $1
    `,
    [params.integrationId, params.status, params.lastError ?? null, params.connectedAt ?? null],
  );
}

export async function setIntegrationError(params: {
  integrationId: string;
  error: string;
}): Promise<void> {
  await pool.query(
    `
      update integrations
      set status = 'error',
          last_error = $2,
          updated_at = now()
      where id = $1
    `,
    [params.integrationId, params.error],
  );
}
