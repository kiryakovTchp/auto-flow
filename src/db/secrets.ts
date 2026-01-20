import { pool } from './pool';

export type WebhookConfig = {
  provider: 'asana' | 'github';
  secret: string | null;
  webhook_gid: string | null;
  resource_gid: string | null;
  target_url: string | null;
};

export async function getWebhookSecret(provider: 'asana' | 'github'): Promise<string | null> {
  const res = await pool.query<{ secret: string | null }>('select secret from webhook_secrets where provider = $1 limit 1', [provider]);
  return res.rows[0]?.secret ?? null;
}

export async function getWebhookConfig(provider: 'asana' | 'github'): Promise<WebhookConfig | null> {
  const res = await pool.query<WebhookConfig>(
    'select provider, secret, webhook_gid, resource_gid, target_url from webhook_secrets where provider = $1 limit 1',
    [provider],
  );
  return res.rows[0] ?? null;
}

export async function upsertWebhookConfig(params: {
  provider: 'asana' | 'github';
  secret: string | null;
  webhookGid?: string;
  resourceGid?: string;
  targetUrl?: string;
}): Promise<void> {
  await pool.query(
    `
      insert into webhook_secrets (provider, secret, webhook_gid, resource_gid, target_url)
      values ($1, $2, $3, $4, $5)
      on conflict (provider) do update
      set
        secret = coalesce(excluded.secret, webhook_secrets.secret),
        webhook_gid = coalesce(excluded.webhook_gid, webhook_secrets.webhook_gid),
        resource_gid = coalesce(excluded.resource_gid, webhook_secrets.resource_gid),
        target_url = coalesce(excluded.target_url, webhook_secrets.target_url),
        updated_at = now()
    `,
    [params.provider, params.secret, params.webhookGid ?? null, params.resourceGid ?? null, params.targetUrl ?? null],
  );
}

export async function upsertWebhookSecret(provider: 'asana' | 'github', secret: string): Promise<void> {
  await upsertWebhookConfig({ provider, secret });
}
