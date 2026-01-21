import { getAsanaFieldConfig, resolveMappedStatus } from '../db/asana-config';
import { getProjectSecretPlain } from './project-secure-config';
import { listProjectGithubRepos } from '../db/project-settings';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { ensureGithubIssueForAsanaTask } from './sync-from-asana';
import { getAutoTaskEnabled, getEnumOptionName } from './asana-fields';
import { insertTaskEvent } from '../db/task-events';
import { getTaskByProjectAsanaGid, upsertTaskByAsanaGid } from '../db/tasks-v2';

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

  // Ensure task row exists, but avoid clobbering current pipeline status.
  const existing = await getTaskByProjectAsanaGid(params.projectId, params.asanaTaskGid);
  const prevStatus = existing?.status ?? null;

  const row = await upsertTaskByAsanaGid({
    projectId: params.projectId,
    asanaGid: params.asanaTaskGid,
    title: rawTask.name,
    status: existing?.status ?? 'RECEIVED',
  });

  if (!existing && row?.id) {
    await insertTaskEvent({
      taskId: row.id,
      kind: 'task.created_or_seen',
      eventType: 'task.created_or_seen',
      source: 'asana',
      refJson: { asanaGid: params.asanaTaskGid, title: rawTask.name },
    });
  }

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
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'task.status_changed',
        eventType: 'task.status_changed',
        source: 'asana',
        refJson: { from: prevStatus, to: 'CANCELLED', reason: 'asana_status_map' },
      });
      await insertTaskEvent({ taskId: row.id, kind: 'pipeline.cancelled', message: 'Cancelled by Asana status mapping' });
    }

    // If issue exists, close it as not_planned.
    if (row?.github_issue_number) {
      const owner = row.github_repo_owner;
      const repo = row.github_repo_name;
      if (owner && repo) {
        const gh = new GithubClient(ghToken, owner, repo);
        await gh.closeIssueNotPlanned(row.github_issue_number);
        if (row.id) {
          await insertTaskEvent({
            taskId: row.id,
            kind: 'github.issue_closed',
            eventType: 'github.issue_closed',
            source: 'system',
            refJson: { issueNumber: row.github_issue_number, reason: 'not_planned', repo: `${owner}/${repo}` },
          });
          await insertTaskEvent({ taskId: row.id, kind: 'github.issue', message: `Closed issue #${row.github_issue_number} as not_planned` });
        }
      } else {
        const repos = await listProjectGithubRepos(params.projectId);
        const def = repos.find((r) => r.is_default) ?? repos[0];
        if (def) {
          const gh = new GithubClient(ghToken, def.owner, def.repo);
          await gh.closeIssueNotPlanned(row.github_issue_number);
          if (row.id) {
            await insertTaskEvent({
              taskId: row.id,
              kind: 'github.issue_closed',
              eventType: 'github.issue_closed',
              source: 'system',
              refJson: { issueNumber: row.github_issue_number, reason: 'not_planned', repo: `${def.owner}/${def.repo}` },
            });
            await insertTaskEvent({ taskId: row.id, kind: 'github.issue', message: `Closed issue #${row.github_issue_number} as not_planned` });
          }
        }
      }
    }

    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'CANCELLED' });
    return;
  }

  // If the task was previously cancelled and is now active again, reopen the issue (if any).
  if (prevStatus === 'CANCELLED' && mappedStatus !== 'CANCELLED' && row?.github_issue_number && row.github_repo_owner && row.github_repo_name) {
    const gh = new GithubClient(ghToken, row.github_repo_owner, row.github_repo_name);
    try {
      await gh.reopenIssue(row.github_issue_number);
      if (row.id) {
        await insertTaskEvent({
          taskId: row.id,
          kind: 'github.issue',
          message: `Reopened issue #${row.github_issue_number} because Asana status is active again`,
        });
      }
    } catch {
      // ignore
    }

    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'ISSUE_CREATED' });
  }

  if (mappedStatus === 'BLOCKED') {
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'task.status_changed',
        eventType: 'task.status_changed',
        source: 'asana',
        refJson: { from: prevStatus, to: 'BLOCKED', reason: 'asana_status_map' },
      });
      await insertTaskEvent({ taskId: row.id, kind: 'pipeline.blocked', message: 'Blocked by Asana status mapping' });
    }
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'BLOCKED' });
    return;
  }

  // AutoTask gating
  if (autoEnabled !== true) {
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'task.status_changed',
        eventType: 'task.status_changed',
        source: 'asana',
        refJson: { from: prevStatus, to: 'AUTO_DISABLED', reason: 'autoTask=false' },
      });
      await insertTaskEvent({ taskId: row.id, kind: 'pipeline.auto_disabled', message: 'AutoTask is not enabled; skipping issue creation' });
    }

    // If a task already has an issue and automation is being disabled, mark it on GitHub.
    if (prevStatus !== 'AUTO_DISABLED' && row?.github_issue_number && row.github_repo_owner && row.github_repo_name) {
      const gh = new GithubClient(ghToken, row.github_repo_owner, row.github_repo_name);
      try {
        await gh.addIssueLabels(row.github_issue_number, ['auto-disabled']);
      } catch {
        // ignore (label may already exist or repo may restrict labels)
      }
      try {
        await gh.addIssueComment(row.github_issue_number, 'AutoTask disabled in Asana. auto-flow will pause automation for this task until re-enabled.');
      } catch {
        // ignore
      }
    }

    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'AUTO_DISABLED' });
    return;
  }

  // If automation was just re-enabled, remove the GitHub marker.
  if (prevStatus === 'AUTO_DISABLED' && row?.github_issue_number && row.github_repo_owner && row.github_repo_name) {
    const gh = new GithubClient(ghToken, row.github_repo_owner, row.github_repo_name);
    try {
      await gh.removeIssueLabel(row.github_issue_number, 'auto-disabled');
    } catch {
      // ignore if missing
    }
    try {
      await gh.addIssueComment(row.github_issue_number, 'AutoTask re-enabled in Asana. auto-flow will resume automation for this task.');
    } catch {
      // ignore
    }
  }

  // Resolve repo from enum option name.
  // MVP rule: option name must match one of configured repos "owner/repo".
  if (!repoName) {
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'task.repo_missing',
        eventType: 'task.repo_missing',
        source: 'asana',
        refJson: { reason: 'repo_field_empty' },
      });
      await insertTaskEvent({ taskId: row.id, kind: 'pipeline.needs_repo', message: 'Repo field is empty' });
    }
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'NEEDS_REPO' });
    return;
  }

  const repos = await listProjectGithubRepos(params.projectId);

  // First try exact match by option name = owner/repo.
  const direct = (() => {
    const parts = repoName.split('/');
    if (parts.length !== 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    const match = repos.find((r) => r.owner === owner && r.repo === repo);
    return match ? { owner: match.owner, repo: match.repo } : null;
  })();

  // If not matched, try repo_map override.
  const mapped = direct
    ? null
    : await (await import('../db/repo-map')).resolveRepoForOption(params.projectId, repoName);

  const resolved = direct ?? mapped;
  if (!resolved) {
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'pipeline.needs_repo',
        message: `Repo not resolved. Option: ${repoName}. Add mapping in Settings.`,
      });
      await insertTaskEvent({
        taskId: row.id,
        kind: 'task.repo_missing',
        eventType: 'task.repo_missing',
        source: 'system',
        refJson: { reason: 'repo_not_resolved', optionName: repoName },
      });
    }
    await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'NEEDS_REPO' });
    return;
  }

  if (prevStatus === 'NEEDS_REPO' && row?.id) {
    await insertTaskEvent({
      taskId: row.id,
      kind: 'task.repo_resolved',
      eventType: 'task.repo_resolved',
      source: 'asana',
      refJson: { repo: `${resolved.owner}/${resolved.repo}` },
    });
  }

  const github = new GithubClient(ghToken, resolved.owner, resolved.repo);

  await ensureGithubIssueForAsanaTask({
    projectId: params.projectId,
    asana,
    github,
    repoOwner: resolved.owner,
    repoName: resolved.repo,
    asanaTaskGid: params.asanaTaskGid,
    asanaProjectGid: params.asanaProjectGid,
  });

  const updated = await getTaskByProjectAsanaGid(params.projectId, params.asanaTaskGid);
  if (updated?.id) {
    await insertTaskEvent({ taskId: updated.id, kind: 'pipeline.issue', message: `Issue ensured in ${resolved.owner}/${resolved.repo}` });

    // If the issue already existed, ensure the tool status reflects that.
    if (updated.github_issue_number && !['PR_CREATED', 'WAITING_CI', 'DEPLOYED', 'FAILED'].includes(updated.status)) {
      await insertTaskEvent({
        taskId: updated.id,
        kind: 'task.status_changed',
        eventType: 'task.status_changed',
        source: 'system',
        refJson: { to: 'ISSUE_CREATED', reason: 'issue_ensured' },
      });
      await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: params.asanaTaskGid, status: 'ISSUE_CREATED' });
    }
  }
}
