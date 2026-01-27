import { pool } from './pool';

export type OauthSessionRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  provider: string;
  state: string;
  code_verifier_enc: string;
  code_challenge: string;
  redirect_uri: string;
  return_url: string;
  expires_at: string;
  created_at: string;
};

export async function insertOauthSession(params: {
  projectId: string;
  userId?: string | null;
  provider: string;
  state: string;
  codeVerifierEnc: string;
  codeChallenge: string;
  redirectUri: string;
  returnUrl: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(
    `
      insert into oauth_sessions
        (project_id, user_id, provider, state, code_verifier_enc, code_challenge, redirect_uri, return_url, expires_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      params.projectId,
      params.userId ?? null,
      params.provider,
      params.state,
      params.codeVerifierEnc,
      params.codeChallenge,
      params.redirectUri,
      params.returnUrl,
      params.expiresAt,
    ],
  );
}

export async function getOauthSessionByState(state: string): Promise<OauthSessionRow | null> {
  const res = await pool.query<OauthSessionRow>('select * from oauth_sessions where state = $1 limit 1', [state]);
  return res.rows[0] ?? null;
}

export async function deleteOauthSessionByState(state: string): Promise<void> {
  await pool.query('delete from oauth_sessions where state = $1', [state]);
}
