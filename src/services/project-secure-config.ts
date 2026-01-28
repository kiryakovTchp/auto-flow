import { deleteProjectSecret, getProjectSecret, listProjectSecrets, type ProjectSecretKey, upsertProjectSecret } from '../db/project-settings';
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
  return decryptString(raw, masterKey);
}

export async function repairProjectSecrets(projectId: string): Promise<{
  repaired: ProjectSecretKey[];
  cleared: ProjectSecretKey[];
  ok: ProjectSecretKey[];
  failed: Array<{ key: ProjectSecretKey; message: string }>;
}> {
  const rows = await listProjectSecrets(projectId);
  const repaired: ProjectSecretKey[] = [];
  const cleared: ProjectSecretKey[] = [];
  const ok: ProjectSecretKey[] = [];
  const failed: Array<{ key: ProjectSecretKey; message: string }> = [];

  for (const row of rows) {
    const raw = String(row.encrypted_value ?? '').trim();
    if (!raw) {
      await deleteProjectSecret({ projectId, key: row.key });
      cleared.push(row.key);
      continue;
    }
    if (!isEncryptedPayload(raw)) {
      const reEncrypted = encryptString(raw, masterKey);
      await upsertProjectSecret({ projectId, key: row.key, encryptedValue: reEncrypted });
      repaired.push(row.key);
      continue;
    }
    try {
      decryptString(raw, masterKey);
      ok.push(row.key);
    } catch (err: any) {
      await deleteProjectSecret({ projectId, key: row.key });
      cleared.push(row.key);
      failed.push({ key: row.key, message: String(err?.message ?? err) });
    }
  }

  return { repaired, cleared, ok, failed };
}
