import { getTaskById, listTasksByProject } from '../db/tasks-v2';
import { getProjectSecretPlain } from './project-secure-config';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { setCiStateByShaAndRepo } from '../db/ci';
import { finalizeTaskIfReady } from './finalize';
import { insertTaskEvent } from '../db/task-events';

export async function reconcileProject(params: { projectId: string }): Promise<void> {
  const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
  const ghToken = await getProjectSecretPlain(params.projectId, 'GITHUB_TOKEN');
  if (!asanaPat || !ghToken) return;

  const asana = new AsanaClient(asanaPat);

  // MVP reconciliation: if we're waiting for CI but missed workflow_run,
  // query GitHub checks for merge commit SHA and finalize.
  const waiting = await listTasksByProject(params.projectId, 'WAITING_CI');
  for (const t of waiting) {
    if (!t.ci_sha) continue;
    if (!t.github_repo_owner || !t.github_repo_name) continue;
    if (!t.github_issue_number) continue;

    // If we already know CI status, just finalize.
    if (t.ci_status === 'success' || t.ci_status === 'failure') {
      const gh = new GithubClient(ghToken, t.github_repo_owner, t.github_repo_name);
      await finalizeTaskIfReady({ task: t, asana, github: gh });
      continue;
    }

    const gh = new GithubClient(ghToken, t.github_repo_owner, t.github_repo_name);
    const runs = await gh.listCheckRunsForRef(t.ci_sha);
    if (!runs.length) continue;

    const completed = runs.filter((r) => r.status === 'completed');
    if (completed.length !== runs.length) continue;

    const ok = completed.every((r) => r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped');
    const status = ok ? 'success' : 'failure';
    const url = completed.find((r) => r.html_url)?.html_url ?? null;

    await setCiStateByShaAndRepo({ sha: t.ci_sha, repoOwner: t.github_repo_owner, repoName: t.github_repo_name, status, url });
    await insertTaskEvent({
      taskId: t.id,
      kind: 'ci.updated',
      eventType: 'ci.updated',
      source: 'system',
      refJson: { sha: t.ci_sha, status, url },
      message: `Reconciled CI via check-runs: ${status}${url ? ' ' + url : ''}`,
    });

    const refreshed = await getTaskById(t.id);
    if (refreshed) {
      await finalizeTaskIfReady({ task: refreshed, asana, github: gh });
    }
  }
}
