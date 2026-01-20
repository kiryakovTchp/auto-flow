import type { Request, Response } from 'express';

import { markProjectWebhookDelivery } from '../db/project-webhooks';
import { processAsanaTaskStage5 } from '../services/pipeline-stage5';
import { getProjectBySlug } from '../db/projects';
import { verifyAndParseAsanaWebhookForProject } from './asana-project';
import { parseAsanaWebhookPayload, isTaskAddedEvent, isTaskCompletedChangedEvent } from './asana-events';

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

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      await markProjectWebhookDelivery({ projectId: project.id, provider: 'asana', asanaProjectGid });

      const payload = parseAsanaWebhookPayload(verified.payload);
      if (!payload.events.length) return;

      // Stage 5 pipeline is project-aware and handles AutoTask gating + repo mapping.
      for (const e of payload.events) {
        const asanaGid = e.resource?.gid;
        if (!asanaGid) continue;

        if (isTaskAddedEvent(e) || isTaskCompletedChangedEvent(e)) {
          await processAsanaTaskStage5({ projectId: project.id, asanaProjectGid, asanaTaskGid: asanaGid });
        }
      }
    } catch (err) {
      req.log.error({ err, projectSlug }, 'Asana project webhook handler error');
    }
  });
}
