import { pool } from './pool';

export type OauthCredentialsRow = {
  id: string;
  integration_id: string;
  provider: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scopes: string | null;
  token_type: string | null;
  last_refresh_at: string | null;
  revoked_at: string | null;
  encryption_key_version: string | null;
  created_at: string;
  updated_at: string;
};

export async function getOauthCredentials(params: {
  integrationId: string;
  provider: string;
}): Promise<OauthCredentialsRow | null> {
  const res = await pool.query<OauthCredentialsRow>(
    'select * from oauth_credentials where integration_id = $1 and provider = $2 limit 1',
    [params.integrationId, params.provider],
  );
  return res.rows[0] ?? null;
}

export async function upsertOauthCredentials(params: {
  integrationId: string;
  provider: string;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
  tokenType?: string | null;
  lastRefreshAt?: Date | null;
  revokedAt?: Date | null;
  encryptionKeyVersion?: string | null;
}): Promise<void> {
  await pool.query(
    `
      insert into oauth_credentials
        (integration_id, provider, access_token_enc, refresh_token_enc, expires_at, scopes, token_type, last_refresh_at, revoked_at, encryption_key_version)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (integration_id, provider) do update
      set access_token_enc = coalesce(excluded.access_token_enc, oauth_credentials.access_token_enc),
          refresh_token_enc = coalesce(excluded.refresh_token_enc, oauth_credentials.refresh_token_enc),
          expires_at = coalesce(excluded.expires_at, oauth_credentials.expires_at),
          scopes = coalesce(excluded.scopes, oauth_credentials.scopes),
          token_type = coalesce(excluded.token_type, oauth_credentials.token_type),
          last_refresh_at = coalesce(excluded.last_refresh_at, oauth_credentials.last_refresh_at),
          revoked_at = excluded.revoked_at,
          encryption_key_version = coalesce(excluded.encryption_key_version, oauth_credentials.encryption_key_version),
          updated_at = now()
    `,
    [
      params.integrationId,
      params.provider,
      params.accessTokenEnc ?? null,
      params.refreshTokenEnc ?? null,
      params.expiresAt ?? null,
      params.scopes ?? null,
      params.tokenType ?? null,
      params.lastRefreshAt ?? null,
      params.revokedAt ?? null,
      params.encryptionKeyVersion ?? null,
    ],
  );
}

export async function revokeOauthCredentials(params: {
  integrationId: string;
  provider: string;
  revokedAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `
      update oauth_credentials
      set access_token_enc = null,
          refresh_token_enc = null,
          expires_at = null,
          revoked_at = $3,
          updated_at = now()
      where integration_id = $1 and provider = $2
    `,
    [params.integrationId, params.provider, params.revokedAt ?? new Date()],
  );
}
