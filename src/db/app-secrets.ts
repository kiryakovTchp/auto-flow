import { pool } from './pool';

export type SecretKey =
  | 'ASANA_PAT'
  | 'ASANA_PROJECT_GID'
  | 'ASANA_WEBHOOK_SECRET'
  | 'GITHUB_TOKEN'
  | 'GITHUB_OWNER'
  | 'GITHUB_REPO'
  | 'GITHUB_WEBHOOK_SECRET'
  | 'PUBLIC_BASE_URL'
  | 'OPENCODE_MODE'
  | 'OPENCODE_ENDPOINT'
  | 'OPENCODE_WORKDIR';

export async function upsertAppSecret(key: SecretKey, encryptedValue: string): Promise<void> {
  await pool.query(
    `
      insert into app_secrets (key, encrypted_value)
      values ($1, $2)
      on conflict (key) do update
      set encrypted_value = excluded.encrypted_value, updated_at = now()
    `,
    [key, encryptedValue],
  );
}

export async function deleteAppSecret(key: SecretKey): Promise<void> {
  await pool.query('delete from app_secrets where key = $1', [key]);
}

export async function getAppSecret(key: SecretKey): Promise<string | null> {
  const res = await pool.query<{ encrypted_value: string }>('select encrypted_value from app_secrets where key = $1 limit 1', [key]);
  return res.rows[0]?.encrypted_value ?? null;
}

export async function listAppSecretKeys(): Promise<SecretKey[]> {
  const res = await pool.query<{ key: SecretKey }>('select key from app_secrets order by key asc');
  return res.rows.map((r) => r.key);
}
