import { pool } from './pool';

export type ProjectWebhookRow = {
  id: string;
  project_id: string;
  provider: 'asana' | 'github';
  encrypted_secret: string | null;
  asana_project_gid: string;
  webhook_gid: string | null;
  target_url: string | null;
  last_delivery_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function upsertProjectWebhook(params: {
  projectId: string;
  provider: 'asana' | 'github';
  encryptedSecret?: string | null;
  asanaProjectGid?: string;
  webhookGid?: string | null;
  targetUrl?: string | null;
}): Promise<void> {
  await pool.query(
    `
      insert into project_webhooks (project_id, provider, encrypted_secret, asana_project_gid, webhook_gid, target_url)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (project_id, provider, asana_project_gid) do update
      set
        encrypted_secret = coalesce(excluded.encrypted_secret, project_webhooks.encrypted_secret),
        webhook_gid = coalesce(excluded.webhook_gid, project_webhooks.webhook_gid),
        target_url = coalesce(excluded.target_url, project_webhooks.target_url),
        updated_at = now()
    `,
    [
      params.projectId,
      params.provider,
      params.encryptedSecret ?? null,
      params.asanaProjectGid ?? '',
      params.webhookGid ?? null,
      params.targetUrl ?? null,
    ],
  );
}

export async function markProjectWebhookDelivery(params: {
  projectId: string;
  provider: 'asana' | 'github';
  asanaProjectGid?: string;
}): Promise<void> {
  await pool.query(
    `
      insert into project_webhooks (project_id, provider, asana_project_gid, last_delivery_at)
      values ($1, $2, $3, now())
      on conflict (project_id, provider, asana_project_gid) do update
      set last_delivery_at = now(), updated_at = now()
    `,
    [params.projectId, params.provider, params.asanaProjectGid ?? ''],
  );
}

export async function getProjectWebhookEncryptedSecret(params: {
  projectId: string;
  provider: 'asana' | 'github';
  asanaProjectGid?: string;
}): Promise<string | null> {
  const res = await pool.query<{ encrypted_secret: string | null }>(
    `
      select encrypted_secret
      from project_webhooks
      where project_id = $1 and provider = $2 and asana_project_gid = $3
      limit 1
    `,
    [params.projectId, params.provider, params.asanaProjectGid ?? ''],
  );
  return res.rows[0]?.encrypted_secret ?? null;
}

export async function listProjectWebhooks(projectId: string): Promise<ProjectWebhookRow[]> {
  const res = await pool.query<ProjectWebhookRow>('select * from project_webhooks where project_id = $1 order by provider asc', [projectId]);
  return res.rows;
}
