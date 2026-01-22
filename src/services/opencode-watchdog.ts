import { insertTaskEvent } from '../db/task-events';
import { listStaleIssueCreatedTasks, updateTaskStatusById } from '../db/tasks-v2';
import { GithubClient } from '../integrations/github';
import { AsanaClient } from '../integrations/asana';
import { logger } from '../logger/logger';
import { getProjectSecretPlain } from './project-secure-config';
import { buildOpenCodeTimeoutComment, getOpenCodeProjectConfig } from './opencode-runner';

export async function processOpenCodeWatchdogJob(params: { projectId: string }): Promise<void> {
  const cfg = await getOpenCodeProjectConfig(params.projectId);
  if (cfg.mode === 'off') return;

  const staleTasks = await listStaleIssueCreatedTasks({ projectId: params.projectId, olderThanMinutes: cfg.prTimeoutMinutes });
  if (!staleTasks.length) return;

  const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
  const ghToken = await getProjectSecretPlain(params.projectId, 'GITHUB_TOKEN');
  const asana = asanaPat ? new AsanaClient(asanaPat) : null;

  for (const task of staleTasks) {
    const message = buildOpenCodeTimeoutComment({
      issueUrl: task.github_issue_url,
      minutes: cfg.prTimeoutMinutes,
      mode: cfg.mode,
    });

    await updateTaskStatusById(task.id, 'FAILED', message);
    await insertTaskEvent({
      taskId: task.id,
      kind: 'opencode.timeout',
      eventType: 'opencode.timeout',
      source: 'system',
      message,
      refJson: {
        issueNumber: task.github_issue_number,
        issueUrl: task.github_issue_url,
        minutes: cfg.prTimeoutMinutes,
      },
    });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'task.status_changed',
      eventType: 'task.status_changed',
      source: 'system',
      refJson: { from: task.status, to: 'FAILED', reason: 'opencode_timeout' },
    });

    if (asana) {
      try {
        await asana.addComment(task.asana_gid, message);
        await insertTaskEvent({
          taskId: task.id,
          kind: 'asana.comment_posted',
          eventType: 'asana.comment_posted',
          source: 'system',
          message,
        });
      } catch (err: any) {
        await insertTaskEvent({
          taskId: task.id,
          kind: 'asana.comment_failed',
          eventType: 'asana.comment_failed',
          source: 'system',
          message: String(err?.message ?? err),
        });
      }
    }

    if (ghToken && task.github_repo_owner && task.github_repo_name && task.github_issue_number) {
      try {
        const gh = new GithubClient(ghToken, task.github_repo_owner, task.github_repo_name);
        await gh.addIssueComment(task.github_issue_number, message);
        await insertTaskEvent({
          taskId: task.id,
          kind: 'github.issue_commented',
          eventType: 'github.issue_commented',
          source: 'system',
          message,
          refJson: { issueNumber: task.github_issue_number, repo: `${task.github_repo_owner}/${task.github_repo_name}` },
        });
      } catch (err) {
        logger.warn({ err, taskId: task.id }, 'Failed to add GitHub issue comment for opencode timeout');
      }
    }
  }
}
