import crypto from 'node:crypto';

import { ensureIntegration, getIntegrationByProjectType, setIntegrationError, updateIntegrationStatus } from '../db/integrations';
import { deleteOauthSessionByState, getOauthSessionByState, insertOauthSession } from '../db/oauth-sessions';
import { getOauthCredentials, revokeOauthCredentials, upsertOauthCredentials } from '../db/oauth-credentials';
import { decryptString, encryptString, loadOrCreateMasterKey } from '../security/crypto-store';

const masterKey = loadOrCreateMasterKey();

const OAUTH_SESSION_TTL_MINUTES = 10;
const ACCESS_TOKEN_SKEW_SECONDS = 60;

type OpenCodeOauthConfig = {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  scopes: string | null;
};

export type OpenCodeOauthStartResult = {
  authorizeUrl: string;
  state: string;
  expiresAt: Date;
};

export type OpenCodeTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresIn: number | null;
};

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

function buildCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function getOpenCodeOauthConfig(): OpenCodeOauthConfig {
  const authUrl = String(process.env.OPENCODE_OAUTH_AUTH_URL ?? '').trim();
  const tokenUrl = String(process.env.OPENCODE_OAUTH_TOKEN_URL ?? '').trim();
  const clientId = String(process.env.OPENCODE_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = String(process.env.OPENCODE_OAUTH_CLIENT_SECRET ?? '').trim() || null;
  const scopes = String(process.env.OPENCODE_OAUTH_SCOPES ?? '').trim() || null;

  if (!authUrl || !tokenUrl || !clientId) {
    throw new Error('Missing OpenCode OAuth config (OPENCODE_OAUTH_AUTH_URL, OPENCODE_OAUTH_TOKEN_URL, OPENCODE_OAUTH_CLIENT_ID)');
  }

  return { authUrl, tokenUrl, clientId, clientSecret, scopes };
}

export async function startOpenCodeOauth(params: {
  projectId: string;
  userId?: string | null;
  returnUrl: string;
  redirectBaseUrl: string;
}): Promise<OpenCodeOauthStartResult> {
  const cfg = getOpenCodeOauthConfig();
  const integration = await ensureIntegration({ projectId: params.projectId, type: 'opencode', createdByUserId: params.userId ?? null });

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = buildCodeVerifier();
  const codeChallenge = buildCodeChallenge(codeVerifier);

  const redirectUri = joinUrl(params.redirectBaseUrl, '/oauth/opencode/callback');
  const expiresAt = new Date(Date.now() + OAUTH_SESSION_TTL_MINUTES * 60 * 1000);

  await insertOauthSession({
    projectId: params.projectId,
    userId: params.userId ?? null,
    provider: 'openai',
    state,
    codeVerifierEnc: encryptString(codeVerifier, masterKey),
    codeChallenge,
    redirectUri,
    returnUrl: params.returnUrl,
    expiresAt,
  });

  const authorizeUrl = new URL(cfg.authUrl);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', cfg.clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  if (cfg.scopes) authorizeUrl.searchParams.set('scope', cfg.scopes);

  await updateIntegrationStatus({ integrationId: integration.id, status: 'disabled', lastError: null });

  return { authorizeUrl: authorizeUrl.toString(), state, expiresAt };
}

export async function handleOpenCodeOauthCallback(params: {
  code: string;
  state: string;
}): Promise<{ projectId: string; returnUrl: string }> {
  const session = await getOauthSessionByState(params.state);
  if (!session) throw new Error('OAUTH_STATE_INVALID');

  const expiresAt = new Date(session.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await deleteOauthSessionByState(params.state);
    throw new Error('OAUTH_STATE_EXPIRED');
  }

  const cfg = getOpenCodeOauthConfig();
  const codeVerifier = decryptString(session.code_verifier_enc, masterKey);

  try {
    const token = await exchangeCodeForTokens({
      tokenUrl: cfg.tokenUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      code: params.code,
      redirectUri: session.redirect_uri,
      codeVerifier,
    });

    const integration = await ensureIntegration({ projectId: session.project_id, type: 'opencode', createdByUserId: session.user_id ?? null });

    const expiresAtToken = token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000) : null;
    await upsertOauthCredentials({
      integrationId: integration.id,
      provider: 'openai',
      accessTokenEnc: encryptString(token.accessToken, masterKey),
      refreshTokenEnc: token.refreshToken ? encryptString(token.refreshToken, masterKey) : null,
      expiresAt: expiresAtToken,
      scopes: token.scope,
      tokenType: token.tokenType,
      lastRefreshAt: new Date(),
      revokedAt: null,
      encryptionKeyVersion: 'v1',
    });

    await updateIntegrationStatus({
      integrationId: integration.id,
      status: 'connected',
      lastError: null,
      connectedAt: new Date(),
    });
  } catch (err: any) {
    const integration = await getIntegrationByProjectType(session.project_id, 'opencode');
    if (integration) {
      await setIntegrationError({ integrationId: integration.id, error: String(err?.message ?? err) });
    }
    throw err;
  } finally {
    await deleteOauthSessionByState(params.state);
  }

  return { projectId: session.project_id, returnUrl: session.return_url };
}

export async function disconnectOpenCodeIntegration(params: { projectId: string }): Promise<void> {
  const integration = await getIntegrationByProjectType(params.projectId, 'opencode');
  if (!integration) return;
  await revokeOauthCredentials({ integrationId: integration.id, provider: 'openai', revokedAt: new Date() });
  await updateIntegrationStatus({ integrationId: integration.id, status: 'disabled', lastError: null, connectedAt: null });
}

export async function getOpenCodeAccessToken(projectId: string): Promise<string> {
  const integration = await getIntegrationByProjectType(projectId, 'opencode');
  if (!integration) throw new Error('OPENCODE_NOT_CONNECTED');
  if (integration.status !== 'connected') throw new Error('OPENCODE_NOT_CONNECTED');

  const creds = await getOauthCredentials({ integrationId: integration.id, provider: 'openai' });
  if (!creds || creds.revoked_at) throw new Error('OPENCODE_NOT_CONNECTED');

  const accessToken = creds.access_token_enc ? decryptString(creds.access_token_enc, masterKey) : null;
  const refreshToken = creds.refresh_token_enc ? decryptString(creds.refresh_token_enc, masterKey) : null;

  const expiresAt = creds.expires_at ? new Date(creds.expires_at) : null;
  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() + ACCESS_TOKEN_SKEW_SECONDS * 1000 : false;

  if (accessToken && !isExpired) return accessToken;

  if (!refreshToken) {
    await updateIntegrationStatus({ integrationId: integration.id, status: 'expired', lastError: 'Missing refresh token' });
    throw new Error('TOKEN_REFRESH_FAILED');
  }

  try {
    const cfg = getOpenCodeOauthConfig();
    const refreshed = await refreshAccessTokenWithRetry({
      tokenUrl: cfg.tokenUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      refreshToken,
    });

    const nextExpiresAt = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null;
    await upsertOauthCredentials({
      integrationId: integration.id,
      provider: 'openai',
      accessTokenEnc: encryptString(refreshed.accessToken, masterKey),
      refreshTokenEnc: refreshed.refreshToken ? encryptString(refreshed.refreshToken, masterKey) : null,
      expiresAt: nextExpiresAt,
      scopes: refreshed.scope,
      tokenType: refreshed.tokenType,
      lastRefreshAt: new Date(),
      revokedAt: null,
    });

    return refreshed.accessToken;
  } catch (err: any) {
    await updateIntegrationStatus({ integrationId: integration.id, status: 'expired', lastError: String(err?.message ?? err) });
    throw err;
  }
}

async function exchangeCodeForTokens(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OpenCodeTokenResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  if (params.clientSecret) body.set('client_secret', params.clientSecret);

  const res = await (globalThis as any).fetch(params.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await safeJson(res);
  if (!res.ok) {
    throw new Error(`OAUTH_TOKEN_EXCHANGE_FAILED: ${json?.error ?? res.status}`);
  }

  return normalizeTokenResponse(json);
}

async function refreshAccessToken(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  refreshToken: string;
}): Promise<OpenCodeTokenResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
  if (params.clientSecret) body.set('client_secret', params.clientSecret);

  const res = await (globalThis as any).fetch(params.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await safeJson(res);
  if (!res.ok) {
    throw new Error(`OAUTH_REFRESH_FAILED: ${json?.error ?? res.status}`);
  }

  return normalizeTokenResponse(json);
}

async function refreshAccessTokenWithRetry(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string | null;
  refreshToken: string;
}): Promise<OpenCodeTokenResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await refreshAccessToken(params);
    } catch (err) {
      lastErr = err;
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('TOKEN_REFRESH_FAILED');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res: any): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeTokenResponse(payload: any): OpenCodeTokenResult {
  const accessToken = String(payload?.access_token ?? '').trim();
  if (!accessToken) throw new Error('OAUTH_TOKEN_INVALID');

  const refreshToken = payload?.refresh_token ? String(payload.refresh_token) : null;
  const tokenType = payload?.token_type ? String(payload.token_type) : null;
  const scope = payload?.scope ? String(payload.scope) : null;
  const expiresIn = Number.isFinite(Number(payload?.expires_in)) ? Number(payload.expires_in) : null;

  return { accessToken, refreshToken, tokenType, scope, expiresIn };
}

function joinUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}
