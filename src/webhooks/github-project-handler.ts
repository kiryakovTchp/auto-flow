import type { Request, Response } from 'express';

import { getProjectBySlug } from '../db/projects';
import { enqueueJob } from '../db/job-queue';
import { markDeliveryProcessed } from '../db/deliveries';
import { verifyAndParseGithubWebhookForProject } from './github-project';

export async function githubProjectWebhookHandler(req: Request, res: Response): Promise<void> {
  const projectSlug = String(req.params.projectId);
  const project = await getProjectBySlug(projectSlug);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const verified = await verifyAndParseGithubWebhookForProject({ req, projectId: project.id });
  if (verified.kind === 'unauthorized') {
    req.log.warn({ reason: verified.reason, projectSlug }, 'GitHub project webhook unauthorized');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // GitHub idempotency: dedupe by delivery ID at enqueue time.
  if (verified.deliveryId) {
    const isNew = await markDeliveryProcessed('github', verified.deliveryId);
    if (!isNew) {
      res.status(200).send('OK');
      return;
    }
  }

  try {
    await enqueueJob({
      projectId: project.id,
      provider: 'github',
      kind: 'github.project_webhook',
      payload: {
        projectId: project.id,
        deliveryId: verified.deliveryId ?? null,
        eventName: verified.eventName,
        payload: verified.payload,
      },
    });
    res.status(200).send('OK');
  } catch (err) {
    req.log.error({ err, projectSlug }, 'Failed to enqueue GitHub webhook job');
    res.status(500).send('Failed to enqueue');
  }
}
