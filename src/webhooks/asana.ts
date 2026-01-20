import crypto from 'node:crypto';
import type { Request } from 'express';

import { getConfig, setConfig } from '../services/secure-config';

export type AsanaWebhookResult =
  | { kind: 'handshake'; secret: string }
  | { kind: 'event'; payload: unknown }
  | { kind: 'unauthorized'; reason: string };

export async function verifyAndParseAsanaWebhook(req: Request): Promise<AsanaWebhookResult> {
  const hookSecretHeader = req.header('x-hook-secret');
  if (hookSecretHeader) {
    // Asana handshake: respond echoing X-Hook-Secret.
    // Store secret in encrypted config (Postgres).
    await setConfig('ASANA_WEBHOOK_SECRET', hookSecretHeader);
    return { kind: 'handshake', secret: hookSecretHeader };
  }

  const signature = req.header('x-hook-signature');
  if (!signature) return { kind: 'unauthorized', reason: 'missing x-hook-signature' };

  const secret = await getConfig('ASANA_WEBHOOK_SECRET');
  if (!secret) return { kind: 'unauthorized', reason: 'asana webhook secret not configured' };

  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (!rawBody) return { kind: 'unauthorized', reason: 'missing raw body' };

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { kind: 'unauthorized', reason: 'invalid signature' };
  }

  return { kind: 'event', payload: req.body };
}
