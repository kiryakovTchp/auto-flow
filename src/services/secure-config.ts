import { decryptString, encryptString, loadOrCreateMasterKey } from '../security/crypto-store';
import { deleteAppSecret, getAppSecret, type SecretKey, upsertAppSecret } from '../db/app-secrets';

const masterKey = loadOrCreateMasterKey();

export async function getConfig(key: SecretKey): Promise<string | null> {
  const encrypted = await getAppSecret(key);
  if (encrypted) return decryptString(encrypted, masterKey);

  const fromEnv = process.env[key];
  return typeof fromEnv === 'string' && fromEnv.length ? fromEnv : null;
}

export async function setConfig(key: SecretKey, value: string | null): Promise<void> {
  if (value === null) {
    await deleteAppSecret(key);
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    await deleteAppSecret(key);
    return;
  }

  const encrypted = encryptString(trimmed, masterKey);
  await upsertAppSecret(key, encrypted);
}

export type RuntimeConfig = {
  ASANA_PAT: string | null;
  ASANA_PROJECT_GID: string | null;
  ASANA_WEBHOOK_SECRET: string | null;
  GITHUB_TOKEN: string | null;
  GITHUB_OWNER: string | null;
  GITHUB_REPO: string | null;
  GITHUB_WEBHOOK_SECRET: string | null;
  PUBLIC_BASE_URL: string | null;
  OPENCODE_MODE: string | null;
  OPENCODE_ENDPOINT: string | null;
  OPENCODE_WORKDIR: string | null;
};

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const [
    ASANA_PAT,
    ASANA_PROJECT_GID,
    ASANA_WEBHOOK_SECRET,
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_WEBHOOK_SECRET,
    PUBLIC_BASE_URL,
    OPENCODE_MODE,
    OPENCODE_ENDPOINT,
    OPENCODE_WORKDIR,
  ] = await Promise.all([
    getConfig('ASANA_PAT'),
    getConfig('ASANA_PROJECT_GID'),
    getConfig('ASANA_WEBHOOK_SECRET'),
    getConfig('GITHUB_TOKEN'),
    getConfig('GITHUB_OWNER'),
    getConfig('GITHUB_REPO'),
    getConfig('GITHUB_WEBHOOK_SECRET'),
    getConfig('PUBLIC_BASE_URL'),
    getConfig('OPENCODE_MODE'),
    getConfig('OPENCODE_ENDPOINT'),
    getConfig('OPENCODE_WORKDIR'),
  ]);

  return {
    ASANA_PAT,
    ASANA_PROJECT_GID,
    ASANA_WEBHOOK_SECRET,
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_WEBHOOK_SECRET,
    PUBLIC_BASE_URL,
    OPENCODE_MODE,
    OPENCODE_ENDPOINT,
    OPENCODE_WORKDIR,
  };
}
