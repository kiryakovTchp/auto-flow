import type { AsanaClient } from '../integrations/asana';
import { getTaskByIssueNumber, updateTaskStatusByIssueNumber } from '../db/tasks-v2';

export async function finalizeIfReady(params: {
  issueNumber: number;
  asana: AsanaClient;
}): Promise<void> {
  const task = await getTaskByIssueNumber(params.issueNumber);
  if (!task) return;

  const ciOk = task.ci_status === 'success';
  const merged = Boolean(task.github_pr_url) && task.status === 'WAITING_CI';

  if (ciOk && merged) {
    await params.asana.setTaskCompleted(task.asana_gid, true);
    const msg =
      'Merged + CI success. PR: ' +
      (task.github_pr_url ?? '') +
      (task.ci_url ? ('\nCI: ' + task.ci_url) : '');
    await params.asana.addComment(task.asana_gid, msg);
    await updateTaskStatusByIssueNumber(params.issueNumber, 'DEPLOYED');
    return;
  }

  if (task.ci_status === 'failure' && merged) {
    const msg =
      'CI failed after merge. PR: ' +
      (task.github_pr_url ?? '') +
      (task.ci_url ? ('\nCI: ' + task.ci_url) : '');
    await params.asana.addComment(task.asana_gid, msg);
    await updateTaskStatusByIssueNumber(params.issueNumber, 'FAILED', msg);
  }
}
