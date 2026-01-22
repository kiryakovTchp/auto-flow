import crypto from 'node:crypto';
import type { Request } from 'express';

import { getProjectSecretPlain } from '../services/project-secure-config';
import { getProjectWebhookSecretPlain } from '../services/project-webhook-secrets';

export type GithubWebhookResult =
  | { kind: 'event'; eventName: string; payload: any; deliveryId: string | null }
  | { kind: 'unauthorized'; reason: string };

export async function verifyAndParseGithubWebhookForProject(params: {
  req: Request;
  projectId: string;
}): Promise<GithubWebhookResult> {
  const req = params.req;

  const signatureHeader = req.header('x-hub-signature-256');
  if (!signatureHeader) return { kind: 'unauthorized', reason: 'missing x-hub-signature-256' };

  const secretFromSettings = await getProjectSecretPlain(params.projectId, 'GITHUB_WEBHOOK_SECRET');
  const secretFromWebhook = await getProjectWebhookSecretPlain({ projectId: params.projectId, provider: 'github', asanaProjectGid: '' });
  const secret = secretFromSettings ?? secretFromWebhook;
  if (!secret) return { kind: 'unauthorized', reason: 'github project webhook secret not configured' };

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
