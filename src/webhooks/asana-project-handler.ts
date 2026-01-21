import type { Request, Response } from 'express';

import { getProjectBySlug } from '../db/projects';
import { verifyAndParseAsanaWebhookForProject } from './asana-project';
import { enqueueJob } from '../db/job-queue';
import { insertProjectEvent } from '../db/project-events';

export async function asanaProjectWebhookHandler(req: Request, res: Response): Promise<void> {
  const projectSlug = String(req.params.projectId);
  const project = await getProjectBySlug(projectSlug);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const asanaProjectGid = String(req.query.asana_project_gid ?? '').trim();
  if (!asanaProjectGid) {
    res.status(400).json({ error: 'Missing asana_project_gid query param' });
    return;
  }

  const verified = await verifyAndParseAsanaWebhookForProject({ req, projectId: project.id, asanaProjectGid });

  if (verified.kind === 'handshake') {
    res.setHeader('X-Hook-Secret', verified.secret);
    res.status(200).send('OK');
    return;
  }

  if (verified.kind === 'unauthorized') {
    req.log.warn({ reason: verified.reason, projectSlug, asanaProjectGid }, 'Asana webhook unauthorized');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  await insertProjectEvent({
    projectId: project.id,
    source: 'asana',
    eventType: 'asana.webhook_received',
    refJson: {
      asanaProjectGid,
      eventsCount: Array.isArray((verified as any).payload?.events) ? (verified as any).payload.events.length : null,
    },
  });

  try {
    await enqueueJob({
      projectId: project.id,
      provider: 'asana',
      kind: 'asana.project_webhook',
      payload: {
        projectId: project.id,
        asanaProjectGid,
        payload: verified.payload,
      },
    });
    res.status(200).send('OK');
  } catch (err) {
    req.log.error({ err, projectSlug }, 'Failed to enqueue Asana webhook job');
    res.status(500).send('Failed to enqueue');
  }
}
