import type { Request, Response } from 'express';

import { getProjectBySlug } from '../db/projects';
import { markProjectWebhookDelivery } from '../db/project-webhooks';
import { markDeliveryProcessed } from '../db/deliveries';
import { setCiStateBySha } from '../db/ci';
import { attachPrToTaskByIssueNumber, getTaskByIssueNumber, updateTaskStatusByIssueNumber } from '../db/tasks-v2';
import { AsanaClient } from '../integrations/asana';
import { verifyAndParseGithubWebhookForProject } from './github-project';
import { finalizeIfReady } from '../services/finalize';
import { getProjectSecretPlain } from '../services/project-secure-config';

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

  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      await markProjectWebhookDelivery({ projectId: project.id, provider: 'github', asanaProjectGid: '' });

      if (verified.deliveryId) {
        const isNew = await markDeliveryProcessed('github', verified.deliveryId);
        if (!isNew) return;
      }

      const asanaPat = await getProjectSecretPlain(project.id, 'ASANA_PAT');
      if (!asanaPat) {
        req.log.warn({ projectSlug }, 'Missing ASANA_PAT for project; skipping GitHub processing');
        return;
      }

      const asana = new AsanaClient(asanaPat);

      if (verified.eventName === 'ping') return;

      if (verified.eventName === 'issues') {
        const action = String(verified.payload?.action ?? '');
        const issueNumber = Number(verified.payload?.issue?.number);
        if (!issueNumber || Number.isNaN(issueNumber)) return;

        const task = await getTaskByIssueNumber(issueNumber);
        if (!task || task.project_id !== project.id) return;

        if (action === 'closed') {
          await updateTaskStatusByIssueNumber(issueNumber, 'WAITING_CI');
        }

        if (action === 'reopened') {
          await updateTaskStatusByIssueNumber(issueNumber, 'ISSUE_CREATED');
        }

        return;
      }

      if (verified.eventName === 'pull_request') {
        const action = String(verified.payload?.action ?? '');
        const prNumber = Number(verified.payload?.number);
        const prUrl = String(verified.payload?.pull_request?.html_url ?? '');
        const merged = Boolean(verified.payload?.pull_request?.merged);
        const sha = String(verified.payload?.pull_request?.head?.sha ?? '');

        const body = String(verified.payload?.pull_request?.body ?? '');
        const title = String(verified.payload?.pull_request?.title ?? '');
        const text = `${title}\n${body}`;
        const m = text.match(/#(\d+)/);
        const issueNumber = m ? Number(m[1]) : null;

        if (issueNumber && prNumber && prUrl) {
          const task = await getTaskByIssueNumber(issueNumber);
          if (task && task.project_id === project.id) {
            await attachPrToTaskByIssueNumber({ issueNumber, prNumber, prUrl, sha: sha || undefined });
            await updateTaskStatusByIssueNumber(issueNumber, merged ? 'WAITING_CI' : 'PR_CREATED');
          }
        }

        if (action === 'closed' && merged && issueNumber) {
          await updateTaskStatusByIssueNumber(issueNumber, 'WAITING_CI');
          await finalizeIfReady({ issueNumber, asana });
        }

        return;
      }

      if (verified.eventName === 'workflow_run') {
        const action = String(verified.payload?.action ?? '');
        if (action !== 'completed') return;

        const headSha = String(verified.payload?.workflow_run?.head_sha ?? '');
        const conclusion = String(verified.payload?.workflow_run?.conclusion ?? '');
        const url = String(verified.payload?.workflow_run?.html_url ?? '');
        if (!headSha) return;

        const status = conclusion === 'success' ? 'success' : 'failure';
        await setCiStateBySha({ sha: headSha, status, url: url || null });

        const tasks = await (await import('../db/tasks-by-sha')).getTasksByCiSha(headSha);
        for (const t of tasks) {
          if (!t.github_issue_number) continue;
          if (t.project_id !== project.id) continue;
          await finalizeIfReady({ issueNumber: t.github_issue_number, asana });
        }
      }
    } catch (err) {
      req.log.error({ err, projectSlug }, 'GitHub project webhook handler error');
    }
  });
}
