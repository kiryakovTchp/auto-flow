import type { AsanaClient } from '../integrations/asana';
import type { TaskRow } from '../db/tasks-v2';
import { getTaskByIssueNumber, updateTaskStatusById } from '../db/tasks-v2';
import { insertTaskEvent } from '../db/task-events';
import { setAsanaCompletedByToolByTaskId } from '../db/tasks-extra';

export async function finalizeTaskIfReady(params: { task: TaskRow; asana: AsanaClient }): Promise<void> {
  const task = params.task;

  const ciOk = task.ci_status === 'success';
  const merged = Boolean(task.github_pr_url) && task.status === 'WAITING_CI';

  if (ciOk && merged) {
    await params.asana.setTaskCompleted(task.asana_gid, true);
    const msg =
      'Merged + CI success. PR: ' +
      (task.github_pr_url ?? '') +
      (task.ci_url ? ('\nCI: ' + task.ci_url) : '');
    await params.asana.addComment(task.asana_gid, msg);

    await setAsanaCompletedByToolByTaskId({ taskId: task.id, value: true });
    await updateTaskStatusById(task.id, 'DEPLOYED');
    await insertTaskEvent({ taskId: task.id, kind: 'finalize.deployed', message: msg });
    return;
  }

  if (task.ci_status === 'failure' && merged) {
    const msg =
      'CI failed after merge. PR: ' +
      (task.github_pr_url ?? '') +
      (task.ci_url ? ('\nCI: ' + task.ci_url) : '');
    await params.asana.addComment(task.asana_gid, msg);

    if (task.asana_completed_by_tool) {
      await params.asana.setTaskCompleted(task.asana_gid, false);
      await setAsanaCompletedByToolByTaskId({ taskId: task.id, value: false });
      await params.asana.addComment(task.asana_gid, 'Reopened in Asana because CI failed after merge.');
    }

    await updateTaskStatusById(task.id, 'FAILED', msg);
    await insertTaskEvent({ taskId: task.id, kind: 'finalize.failed', message: msg });
  }
}

export async function finalizeIfReady(params: {
  issueNumber: number;
  asana: AsanaClient;
}): Promise<void> {
  const task = await getTaskByIssueNumber(params.issueNumber);
  if (!task) return;

  await finalizeTaskIfReady({ task, asana: params.asana });
}
