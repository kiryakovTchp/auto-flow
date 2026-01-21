import type { Request, Response } from 'express';

import { getEnv } from '../config/env';
import { getRuntimeConfig } from '../services/secure-config';
import { getTaskByAsanaGid, updateTaskStatusByAsanaGid } from '../db/tasks-v2';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { ensureGithubIssueForAsanaTask } from '../services/sync-from-asana';
import { verifyAndParseAsanaWebhook } from './asana';
import { isTaskAddedEvent, isTaskCompletedChangedEvent, parseAsanaWebhookPayload } from './asana-events';

export async function asanaWebhookHandler(req: Request, res: Response): Promise<void> {
  const verified = await verifyAndParseAsanaWebhook(req);

  if (verified.kind === 'handshake') {
    res.setHeader('X-Hook-Secret', verified.secret);
    res.status(200).send('OK');
    return;
  }

  if (verified.kind === 'unauthorized') {
    req.log.warn({ reason: verified.reason }, 'Asana webhook unauthorized');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Acknowledge immediately.
  res.status(200).send('OK');

  // Process asynchronously.
  setImmediate(async () => {
    try {
      const payload = parseAsanaWebhookPayload(verified.payload);

      // Heartbeat is often an empty events array.
      if (!payload.events.length) return;

      const env = getEnv();
      const cfg = await getRuntimeConfig();
      const asanaPat = cfg.ASANA_PAT;
      const ghToken = cfg.GITHUB_TOKEN;
      const ghOwner = cfg.GITHUB_OWNER;
      const ghRepo = cfg.GITHUB_REPO;

      if (!asanaPat || !ghToken || !ghOwner || !ghRepo) {
        req.log.warn('Missing ASANA_PAT/GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO; skipping Asana processing');
        return;
      }

      const asana = new AsanaClient(asanaPat);
      const github = new GithubClient(ghToken, ghOwner, ghRepo);

      for (const e of payload.events) {
        const asanaGid = e.resource?.gid;
        if (!asanaGid) continue;

        if (isTaskAddedEvent(e)) {
          // Idempotency: if task already exists with an issue, do nothing.
          const existing = await getTaskByAsanaGid(asanaGid);
          if (existing?.github_issue_number) continue;

          const created = await ensureGithubIssueForAsanaTask({
            asana,
            github,
            repoOwner: ghOwner,
            repoName: ghRepo,
            asanaTaskGid: asanaGid,
            asanaProjectGid: cfg.ASANA_PROJECT_GID ?? env.ASANA_PROJECT_GID,
          });

          req.log.info({ asanaGid, created }, 'Created GitHub issue for Asana task');
          continue;
        }

        if (isTaskCompletedChangedEvent(e)) {
          const newValue = (e.change as any)?.new_value;
          if (typeof newValue !== 'boolean') continue;

          const task = await getTaskByAsanaGid(asanaGid);
          if (!task?.github_issue_number) continue;

          if (newValue) {
            await github.closeIssue(task.github_issue_number);
            await updateTaskStatusByAsanaGid(asanaGid, 'WAITING_CI');
          } else {
            await github.reopenIssue(task.github_issue_number);
            await updateTaskStatusByAsanaGid(asanaGid, 'ISSUE_CREATED');
          }

          req.log.info(
            { asanaGid, completed: newValue, issueNumber: task.github_issue_number },
            'Synced completion state to GitHub issue',
          );
          continue;
        }
      }
    } catch (err) {
      req.log.error({ err }, 'Asana webhook async handler error');
    }
  });
}
