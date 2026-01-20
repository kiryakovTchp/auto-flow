import { decryptString, encryptString, loadOrCreateMasterKey } from '../security/crypto-store';
import { getProjectSecret, type ProjectSecretKey, upsertProjectSecret } from '../db/project-settings';

const masterKey = loadOrCreateMasterKey();

export async function setProjectSecret(projectId: string, key: ProjectSecretKey, value: string): Promise<void> {
  const encrypted = encryptString(value.trim(), masterKey);
  await upsertProjectSecret({ projectId, key, encryptedValue: encrypted });
}

export async function getProjectSecretPlain(projectId: string, key: ProjectSecretKey): Promise<string | null> {
  const encrypted = await getProjectSecret({ projectId, key });
  if (!encrypted) return null;
  return decryptString(encrypted, masterKey);
}
