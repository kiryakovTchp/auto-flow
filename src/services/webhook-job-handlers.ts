import { markProjectWebhookDelivery } from '../db/project-webhooks';
import { setCiStateByShaAndRepo } from '../db/ci';
import { attachPrToTaskById, getTaskById, getTaskByIssueNumber, getTaskByRepoIssueNumber, updateTaskStatusById } from '../db/tasks-v2';
import { setMergeCommitShaByTaskId } from '../db/tasks-extra';
import { getProjectSecretPlain } from './project-secure-config';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { finalizeTaskIfReady } from './finalize';
import { parseAsanaWebhookPayload, isTaskAddedEvent, isTaskChangedEvent } from '../webhooks/asana-events';
import { processAsanaTaskStage5 } from './pipeline-stage5';

function extractFixesIssueNumber(text: string): number | null {
  const m = text.match(/\bFixes\s+#(\d+)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export async function processAsanaProjectWebhookJob(params: {
  projectId: string;
  asanaProjectGid: string;
  payload: unknown;
}): Promise<void> {
  await markProjectWebhookDelivery({ projectId: params.projectId, provider: 'asana', asanaProjectGid: params.asanaProjectGid });

  const parsed = parseAsanaWebhookPayload(params.payload);
  if (!parsed.events.length) return;

  for (const e of parsed.events) {
    const asanaGid = e.resource?.gid;
    if (!asanaGid) continue;

    if (isTaskAddedEvent(e) || isTaskChangedEvent(e)) {
      await processAsanaTaskStage5({ projectId: params.projectId, asanaProjectGid: params.asanaProjectGid, asanaTaskGid: asanaGid });
    }
  }
}

export async function processGithubProjectWebhookJob(params: {
  projectId: string;
  deliveryId?: string | null;
  eventName: string;
  payload: any;
}): Promise<void> {
  await markProjectWebhookDelivery({ projectId: params.projectId, provider: 'github', asanaProjectGid: '' });

  const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
  const ghToken = await getProjectSecretPlain(params.projectId, 'GITHUB_TOKEN');

  const asana = asanaPat ? new AsanaClient(asanaPat) : null;

  if (params.eventName === 'ping') return;

  if (params.eventName === 'issues') {
    const action = String(params.payload?.action ?? '');
    const issueNumber = Number(params.payload?.issue?.number);
    if (!issueNumber || Number.isNaN(issueNumber)) return;

    const repoOwner = String(params.payload?.repository?.owner?.login ?? '').trim();
    const repoName = String(params.payload?.repository?.name ?? '').trim();

    const task = repoOwner && repoName
      ? await getTaskByRepoIssueNumber({ projectId: params.projectId, repoOwner, repoName, issueNumber })
      : await getTaskByIssueNumber(issueNumber);
    if (!task || task.project_id !== params.projectId) return;
    if (task.status === 'AUTO_DISABLED' || task.status === 'CANCELLED') return;

    if (action === 'closed') {
      await updateTaskStatusById(task.id, 'WAITING_CI');
    }

    if (action === 'reopened') {
      await updateTaskStatusById(task.id, 'ISSUE_CREATED');
    }

    return;
  }

  if (params.eventName === 'pull_request') {
    const action = String(params.payload?.action ?? '');
    const prNumber = Number(params.payload?.number);
    const prUrl = String(params.payload?.pull_request?.html_url ?? '');
    const merged = Boolean(params.payload?.pull_request?.merged);
    const sha = String(params.payload?.pull_request?.head?.sha ?? '');
    const mergeSha = String(params.payload?.pull_request?.merge_commit_sha ?? '');

    const repoOwner = String(params.payload?.repository?.owner?.login ?? '').trim();
    const repoName = String(params.payload?.repository?.name ?? '').trim();

    const body = String(params.payload?.pull_request?.body ?? '');
    const title = String(params.payload?.pull_request?.title ?? '');
    const text = `${title}\n${body}`;
    const issueNumber = extractFixesIssueNumber(text);

    if (issueNumber && prNumber && prUrl) {
      const task = repoOwner && repoName
        ? await getTaskByRepoIssueNumber({ projectId: params.projectId, repoOwner, repoName, issueNumber })
        : await getTaskByIssueNumber(issueNumber);
      if (task && task.project_id === params.projectId) {
        if (task.status === 'AUTO_DISABLED' || task.status === 'CANCELLED') return;

        await attachPrToTaskById({ taskId: task.id, prNumber, prUrl, sha: sha || undefined });
        await updateTaskStatusById(task.id, merged ? 'WAITING_CI' : 'PR_CREATED');

        if (action === 'closed' && merged && mergeSha) {
          await setMergeCommitShaByTaskId({ taskId: task.id, sha: mergeSha });
        }

        const refreshed = await getTaskById(task.id);
        if (refreshed && asana) {
          const gh = ghToken && repoOwner && repoName ? new GithubClient(ghToken, repoOwner, repoName) : undefined;
          await finalizeTaskIfReady({ task: refreshed, asana, github: gh });
        }
      }
    }

    return;
  }

  if (params.eventName === 'workflow_run') {
    const action = String(params.payload?.action ?? '');
    if (action !== 'completed') return;

    const headSha = String(params.payload?.workflow_run?.head_sha ?? '');
    const conclusion = String(params.payload?.workflow_run?.conclusion ?? '');
    const url = String(params.payload?.workflow_run?.html_url ?? '');
    if (!headSha) return;

    const repoOwner = String(params.payload?.repository?.owner?.login ?? '').trim();
    const repoName = String(params.payload?.repository?.name ?? '').trim();
    if (!repoOwner || !repoName) return;

    const status = conclusion === 'success' ? 'success' : 'failure';
    await setCiStateByShaAndRepo({ sha: headSha, repoOwner, repoName, status, url: url || null });

    const tasks = await (await import('../db/tasks-by-sha')).getTasksByCiSha(headSha);
    for (const t of tasks) {
      if (!t.github_issue_number) continue;
      if (t.project_id !== params.projectId) continue;
      if (t.status === 'AUTO_DISABLED' || t.status === 'CANCELLED') continue;
      if (t.github_repo_owner !== repoOwner || t.github_repo_name !== repoName) continue;

      if (!asana) continue;
      const gh = ghToken ? new GithubClient(ghToken, repoOwner, repoName) : undefined;
      await finalizeTaskIfReady({ task: t, asana, github: gh });
    }

    return;
  }
}
