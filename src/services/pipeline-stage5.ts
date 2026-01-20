import { getAsanaFieldConfig, resolveMappedStatus } from '../db/asana-config';
import { getProjectSecretPlain } from './project-secure-config';
import { listProjectGithubRepos } from '../db/project-settings';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';import { ensureGithubIssueForAsanaTask } from './sync-from-asana';
import { getAutoTaskEnabled, getEnumOptionName } from './asana-fields';
import { insertTaskEvent } from '../db/task-events';
import { getTaskByAsanaGid, upsertTaskByAsanaGid } from '../db/tasks-v2';

export async function processAsanaTaskStage5(params: {
  projectId: string;
  asanaProjectGid: string;
  asanaTaskGid: string;
}): Promise<void> {
  const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
  const ghToken = await getProjectSecretPlain(params.projectId, 'GITHUB_TOKEN');
  if (!asanaPat || !ghToken) throw new Error('Missing ASANA_PAT or GITHUB_TOKEN');

  const fieldCfg = await getAsanaFieldConfig(params.projectId);
  if (!fieldCfg?.auto_field_gid || !fieldCfg.repo_field_gid || !fieldCfg.status_field_gid) {
    throw new Error('Missing Asana field config (auto/repo/status field gid)');
  }

  const asana = new AsanaClient(asanaPat);
  const rawTask: any = await asana.getTask(params.asanaTaskGid);

  const autoEnabled = getAutoTaskEnabled(rawTask, fieldCfg.auto_field_gid);
  const repoName = getEnumOptionName(rawTask, fieldCfg.repo_field_gid);
  const statusOptionName = getEnumOptionName(rawTask, fieldCfg.status_field_gid);

  const mappedStatus = await resolveMappedStatus(params.projectId, statusOptionName);

  // Ensure task row exists
  await upsertTaskByAsanaGid({
    projectId: params.projectId,
    asanaGid: params.asanaTaskGid,
    title: rawTask.name,
    status: 'RECEIVED',
  });

  const row = await getTaskByAsanaGid(params.asanaTaskGid);
  if (row?.id) {
    await insertTaskEvent({
      taskId: row.id,
      kind: 'asana.sync',
      message:
        `AutoTask=${String(autoEnabled)} repo=${String(repoName)} status=${String(statusOptionName)} mapped=${String(mappedStatus)}`,
    });
  }

  // Cancelled: stop sync and close issue as not_planned if exists
  if (mappedStatus === 'CANCELLED') {
    if (row?.id) await insertTaskEvent({ taskId: row.id, kind: 'pipeline.cancelled', message: 'Cancelled by Asana status mapping' });

    // If issue exists, close it as not_planned.
    if (row?.github_issue_number) {
      const repos = await listProjectGithubRepos(params.projectId);
      const def = repos.find((r) => r.is_default) ?? repos[0];
      if (def) {
        const gh = new GithubClient(ghToken, def.owner, def.repo);
        await gh.closeIssueNotPlanned(row.github_issue_number);
        if (row.id) await insertTaskEvent({ taskId: row.id, kind: 'github.issue', message: `Closed issue #${row.github_issue_number} as not_planned` });
      }
    }

    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'CANCELLED' });
    return;
  }

  if (mappedStatus === 'BLOCKED') {
    if (row?.id) await insertTaskEvent({ taskId: row.id, kind: 'pipeline.blocked', message: 'Blocked by Asana status mapping' });
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'BLOCKED' });
    return;
  }

  // AutoTask gating
  if (autoEnabled !== true) {
    if (row?.id) await insertTaskEvent({ taskId: row.id, kind: 'pipeline.auto_disabled', message: 'AutoTask is not enabled; skipping issue creation' });
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'AUTO_DISABLED' });
    return;
  }

  // Resolve repo from enum option name.
  // MVP rule: option name must match one of configured repos "owner/repo".
  if (!repoName) {
    if (row?.id) await insertTaskEvent({ taskId: row.id, kind: 'pipeline.needs_repo', message: 'Repo field is empty' });
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'NEEDS_REPO' });
    return;
  }

  const repos = await listProjectGithubRepos(params.projectId);
  const [owner, repo] = repoName.split('/');
  const match = repos.find((r) => r.owner === owner && r.repo === repo);

  if (!match) {
    if (row?.id) await insertTaskEvent({ taskId: row.id, kind: 'pipeline.needs_repo', message: `Repo not found in project config: ${repoName}` });
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'NEEDS_REPO' });
    return;
  }

  const github = new GithubClient(ghToken, match.owner, match.repo);

  await ensureGithubIssueForAsanaTask({
    projectId: params.projectId,
    asana,
    github,
    asanaTaskGid: params.asanaTaskGid,
    asanaProjectGid: params.asanaProjectGid,
  });

  const updated = await getTaskByAsanaGid(params.asanaTaskGid);
  if (updated?.id) {
    await insertTaskEvent({ taskId: updated.id, kind: 'pipeline.issue', message: `Issue ensured in ${match.owner}/${match.repo}` });
  }
}
