import type { Request, Response } from 'express';

import { getEnv } from '../config/env';
import { markDeliveryProcessed } from '../db/deliveries';
import { setCiStateBySha } from '../db/ci';
import { attachPrToTaskByIssueNumber, getTaskByIssueNumber, updateTaskStatusByIssueNumber } from '../db/tasks-v2';
import { setMergeCommitShaByIssueNumber } from '../db/tasks-extra';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { getRuntimeConfig } from '../services/secure-config';
import { finalizeIfReady, finalizeTaskIfReady } from '../services/finalize';
import { buildPrLinkedAsanaComment } from '../services/opencode-runner';
import { verifyAndParseGithubWebhook } from './github';

function extractFixesIssueNumber(text: string): number | null {
  const m = text.match(/\bFixes\s+#(\d+)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export async function githubWebhookHandler(req: Request, res: Response): Promise<void> {
  const verified = await verifyAndParseGithubWebhook(req);

  if (verified.kind === 'unauthorized') {
    req.log.warn({ reason: verified.reason }, 'GitHub webhook unauthorized');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Acknowledge immediately.
  res.status(200).send('OK');

  setImmediate(async () => {
    try {
      // Idempotency via delivery ID.
      if (verified.deliveryId) {
        const isNew = await markDeliveryProcessed('github', verified.deliveryId);
        if (!isNew) return;
      }

      getEnv();
      const cfg = await getRuntimeConfig();
      const asanaPat = cfg.ASANA_PAT;

      if (!asanaPat) {
        req.log.warn('Missing ASANA_PAT; skipping GitHub processing');
        return;
      }

      const asana = new AsanaClient(asanaPat);

      if (verified.eventName === 'ping') {
        req.log.info({ deliveryId: verified.deliveryId }, 'GitHub webhook ping');
        return;
      }

      if (verified.eventName === 'issue_comment') {
        const action = String(verified.payload?.action ?? '');
        if (action !== 'created') return;

        const issueNumber = Number(verified.payload?.issue?.number);
        if (!issueNumber || Number.isNaN(issueNumber)) return;

        const body = String(verified.payload?.comment?.body ?? '');
        if (body.includes('/opencode')) {
          const task = await getTaskByIssueNumber(issueNumber);
          if (task) {
            await updateTaskStatusByIssueNumber(issueNumber, 'ISSUE_CREATED');
            req.log.info({ issueNumber }, 'Opencode command comment detected');
          }
        }
        return;
      }

      if (verified.eventName === 'issues') {
        const action = String(verified.payload?.action ?? '');
        const issueNumber = Number(verified.payload?.issue?.number);
        if (!issueNumber || Number.isNaN(issueNumber)) return;

        const task = await getTaskByIssueNumber(issueNumber);
        if (!task) return;

        if (task.status === 'AUTO_DISABLED' || task.status === 'CANCELLED') return;

        // IMPORTANT: we no longer treat issue closed as deployed.
        // Deployment is: PR merged + CI success.
        if (action === 'closed') {
          await updateTaskStatusByIssueNumber(issueNumber, 'WAITING_CI');
          req.log.info({ issueNumber, asanaGid: task.asana_gid }, 'Issue closed -> waiting CI');
        }

        if (action === 'reopened') {
          await updateTaskStatusByIssueNumber(issueNumber, 'ISSUE_CREATED');
          req.log.info({ issueNumber, asanaGid: task.asana_gid }, 'Issue reopened');
        }

        return;
      }

      if (verified.eventName === 'pull_request') {
        const action = String(verified.payload?.action ?? '');
        const prNumber = Number(verified.payload?.number);
        const prUrl = String(verified.payload?.pull_request?.html_url ?? '');
        const merged = Boolean(verified.payload?.pull_request?.merged);
        const sha = String(verified.payload?.pull_request?.head?.sha ?? '');
        const mergeSha = String(verified.payload?.pull_request?.merge_commit_sha ?? '');

        const body = String(verified.payload?.pull_request?.body ?? '');
        const title = String(verified.payload?.pull_request?.title ?? '');
        const text = `${title}\n${body}`;
        const issueNumber = extractFixesIssueNumber(text);

        if (issueNumber && prNumber && prUrl) {
          const task = await getTaskByIssueNumber(issueNumber);
          if (task) {
            if (task.status === 'AUTO_DISABLED' || task.status === 'CANCELLED') return;
            const firstLink = !task.github_pr_number;
            await attachPrToTaskByIssueNumber({ issueNumber, prNumber, prUrl, sha: sha || undefined });
            await updateTaskStatusByIssueNumber(issueNumber, merged ? 'WAITING_CI' : 'PR_CREATED');
            req.log.info({ issueNumber, prNumber, sha, merged }, 'PR linked to task');

            if (firstLink) {
              try {
                const comment = buildPrLinkedAsanaComment({ prUrl, issueUrl: task.github_issue_url });
                await asana.addComment(task.asana_gid, comment);
              } catch (err) {
                req.log.warn({ err, issueNumber }, 'Failed to post Asana comment for PR');
              }
            }

            if (action === 'closed' && merged && mergeSha) {
              await setMergeCommitShaByIssueNumber({ issueNumber, sha: mergeSha });
            }
          }
        }

        if (action === 'closed' && merged && issueNumber) {
          await updateTaskStatusByIssueNumber(issueNumber, 'WAITING_CI');
          req.log.info({ prNumber, issueNumber }, 'PR merged (waiting CI)');
          const task = await getTaskByIssueNumber(issueNumber);
          if (task && cfg.GITHUB_TOKEN && cfg.GITHUB_OWNER && cfg.GITHUB_REPO) {
            const gh = new GithubClient(cfg.GITHUB_TOKEN, cfg.GITHUB_OWNER, cfg.GITHUB_REPO);
            await finalizeTaskIfReady({ task, asana, github: gh });
          } else {
            await finalizeIfReady({ issueNumber, asana });
          }
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
        req.log.info({ headSha, status, url }, 'Workflow run completed');

        // Deterministic finalize: find tasks by ci_sha and finalize.
        const tasks = await (await import('../db/tasks-by-sha')).getTasksByCiSha(headSha);
        req.log.info({ headSha, matchedTasks: tasks.length }, 'Finalize candidates');
        for (const t of tasks) {
          if (!t.github_issue_number) continue;
          if (t.status === 'AUTO_DISABLED' || t.status === 'CANCELLED') continue;
          await finalizeIfReady({ issueNumber: t.github_issue_number, asana });
        }

        return;
      }

      req.log.info({ eventName: verified.eventName }, 'Unhandled GitHub webhook event');
    } catch (err) {
      req.log.error({ err }, 'GitHub webhook async handler error');
    }
  });
}
