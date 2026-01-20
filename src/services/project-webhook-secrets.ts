import { decryptString, encryptString, loadOrCreateMasterKey } from '../security/crypto-store';
import { getProjectWebhookEncryptedSecret } from '../db/project-webhooks';

const masterKey = loadOrCreateMasterKey();

export function encryptWebhookSecret(secret: string): string {
  return encryptString(secret, masterKey);
}

export function decryptWebhookSecret(payload: string): string {
  return decryptString(payload, masterKey);
}

export async function getProjectWebhookSecretPlain(params: {
  projectId: string;
  provider: 'asana' | 'github';
  asanaProjectGid?: string;
}): Promise<string | null> {
  const encrypted = await getProjectWebhookEncryptedSecret({
    projectId: params.projectId,
    provider: params.provider,
    asanaProjectGid: params.asanaProjectGid ?? '',
  });

  if (!encrypted) return null;
  return decryptWebhookSecret(encrypted);
}
