import { getProjectSecret, type ProjectSecretKey, upsertProjectSecret } from '../db/project-settings';
import { decryptString, encryptString, isEncryptedPayload, loadOrCreateMasterKey } from '../security/crypto-store';

const masterKey = loadOrCreateMasterKey();

export async function setProjectSecret(projectId: string, key: ProjectSecretKey, value: string): Promise<void> {
  const encrypted = encryptString(value.trim(), masterKey);
  await upsertProjectSecret({ projectId, key, encryptedValue: encrypted });
}

export async function getProjectSecretPlain(projectId: string, key: ProjectSecretKey): Promise<string | null> {
  const encrypted = await getProjectSecret({ projectId, key });
  if (!encrypted) return null;
  const raw = encrypted.trim();
  if (!raw) return null;
  if (!isEncryptedPayload(raw)) {
    const reEncrypted = encryptString(raw, masterKey);
    await upsertProjectSecret({ projectId, key, encryptedValue: reEncrypted });
    return raw;
  }
  try {
    return decryptString(raw, masterKey);
  } catch {
    return null;
  }
}
