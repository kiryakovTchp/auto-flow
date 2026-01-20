import crypto from 'node:crypto';
import type { Request } from 'express';

import { getConfig } from '../services/secure-config';

export type GithubWebhookResult =
  | { kind: 'event'; eventName: string; payload: any; deliveryId: string | null }
  | { kind: 'unauthorized'; reason: string };

export async function verifyAndParseGithubWebhook(req: Request): Promise<GithubWebhookResult> {
  const signatureHeader = req.header('x-hub-signature-256');
  if (!signatureHeader) return { kind: 'unauthorized', reason: 'missing x-hub-signature-256' };

  const secret = await getConfig('GITHUB_WEBHOOK_SECRET');
  if (!secret) return { kind: 'unauthorized', reason: 'github webhook secret not configured' };

  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (!rawBody) return { kind: 'unauthorized', reason: 'missing raw body' };

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = `sha256=${digest}`;

  const sigBuf = Buffer.from(signatureHeader, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { kind: 'unauthorized', reason: 'invalid signature' };
  }

  const eventName = req.header('x-github-event') ?? 'unknown';
  const deliveryId = req.header('x-github-delivery');

  return { kind: 'event', eventName, payload: req.body, deliveryId: deliveryId ?? null };
}
