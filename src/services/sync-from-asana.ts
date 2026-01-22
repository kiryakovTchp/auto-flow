import { getTaskByAsanaGid, getTaskByProjectAsanaGid, upsertTaskByAsanaGid, attachIssueToTask } from '../db/tasks-v2';
import { insertTaskSpec, getLatestTaskSpec } from '../db/taskspecs';
import { insertTaskEvent } from '../db/task-events';
import { enqueueJob } from '../db/job-queue';
import { getProjectKnowledge } from '../db/project-settings';
import { listProjectContacts, listProjectLinks } from '../db/project-links';
import type { AsanaClient } from '../integrations/asana';
import type { GithubClient } from '../integrations/github';
import { buildIssueBodyWithCommandV2, buildTaskSpecMarkdown } from './taskspec';
import { buildIssueCreatedAsanaComment, getOpenCodeProjectConfig } from './opencode-runner';
import { buildProjectContextMarkdown } from './project-context';

export async function ensureGithubIssueForAsanaTask(params: {
  projectId?: string;
  asana: AsanaClient;
  github: GithubClient;
  repoOwner: string;
  repoName: string;
  asanaTaskGid: string;
  asanaProjectGid?: string;
}): Promise<{ created: boolean; issueNumber?: number; issueUrl?: string }> {
  const existing = params.projectId
    ? await getTaskByProjectAsanaGid(params.projectId, params.asanaTaskGid)
    : await getTaskByAsanaGid(params.asanaTaskGid);
  if (existing?.github_issue_number && existing.github_issue_url) {
    return { created: false, issueNumber: existing.github_issue_number, issueUrl: existing.github_issue_url };
  }

  const asanaTask = await params.asana.getTask(params.asanaTaskGid);

  const existingStatus = existing?.status ?? null;

  const taskRow = await upsertTaskByAsanaGid({
    projectId: params.projectId,
    asanaGid: asanaTask.gid,
    title: asanaTask.name,
    status: existingStatus ?? 'RECEIVED',
  });

  const prev = await getLatestTaskSpec(taskRow.id);
  const nextVersion = prev ? prev.version + 1 : 1;

  const specMarkdown = buildTaskSpecMarkdown({ asanaTask, asanaProjectGid: params.asanaProjectGid });
  await insertTaskSpec({ taskId: taskRow.id, version: nextVersion, markdown: specMarkdown });

  await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: asanaTask.gid, status: 'TASKSPEC_CREATED' });

  const opencodeCfg = await getOpenCodeProjectConfig(params.projectId ?? null);

  const issue = await params.github.createIssue({
    title: asanaTask.name,
    body: buildIssueBodyWithCommandV2({
      taskSpecMarkdown: specMarkdown,
      projectContextMarkdown:
        params.projectId
          ? buildProjectContextMarkdown({
              knowledgeMarkdown: await getProjectKnowledge(params.projectId),
              links: await listProjectLinks(params.projectId),
              contacts: await listProjectContacts(params.projectId),
            })
          : null,
      opencodeCommand: opencodeCfg.command,
    }),
  });

  await attachIssueToTask({
    projectId: params.projectId,
    asanaGid: asanaTask.gid,
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    repoOwner: params.repoOwner,
    repoName: params.repoName,
  });

  await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: asanaTask.gid, status: 'ISSUE_CREATED' });

  await insertTaskEvent({
    taskId: taskRow.id,
    kind: 'github.issue_created',
    eventType: 'github.issue_created',
    source: 'system',
    refJson: {
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      repo: `${params.repoOwner}/${params.repoName}`,
    },
  });

  const shouldTriggerOpenCode = opencodeCfg.mode === 'github-actions';
  let triggerPosted = false;

  if (shouldTriggerOpenCode) {
    try {
      await params.github.addIssueComment(issue.number, opencodeCfg.command);
      triggerPosted = true;
      await insertTaskEvent({
        taskId: taskRow.id,
        kind: 'github.issue_commented',
        eventType: 'github.issue_commented',
        source: 'system',
        refJson: {
          issueNumber: issue.number,
          repo: `${params.repoOwner}/${params.repoName}`,
          comment: opencodeCfg.command,
        },
      });
    } catch (err: any) {
      await insertTaskEvent({
        taskId: taskRow.id,
        kind: 'opencode.trigger_failed',
        eventType: 'opencode.trigger_failed',
        source: 'system',
        message: String(err?.message ?? err),
        refJson: { issueNumber: issue.number },
      });
    }
  }

  if (opencodeCfg.mode === 'server-runner' && params.projectId) {
    await enqueueJob({
      projectId: params.projectId,
      provider: 'internal',
      kind: 'opencode.run',
      payload: { projectId: params.projectId, taskId: taskRow.id },
    });
    await insertTaskEvent({
      taskId: taskRow.id,
      kind: 'opencode.job_enqueued',
      eventType: 'opencode.job_enqueued',
      source: 'system',
      refJson: { issueNumber: issue.number, repo: `${params.repoOwner}/${params.repoName}` },
    });
  }

  try {
    let asanaMessage = buildIssueCreatedAsanaComment({
      issueUrl: issue.html_url,
      command: triggerPosted ? opencodeCfg.command : null,
      triggered: triggerPosted,
    });
    if (opencodeCfg.mode === 'server-runner') {
      asanaMessage += '\nOpenCode server runner queued.';
    }
    await params.asana.addComment(asanaTask.gid, asanaMessage);
    await insertTaskEvent({
      taskId: taskRow.id,
      kind: 'asana.comment_posted',
      eventType: 'asana.comment_posted',
      source: 'system',
      message: asanaMessage,
      refJson: { issueNumber: issue.number, issueUrl: issue.html_url },
    });
  } catch (err: any) {
    await insertTaskEvent({
      taskId: taskRow.id,
      kind: 'asana.comment_failed',
      eventType: 'asana.comment_failed',
      source: 'system',
      message: String(err?.message ?? err),
    });
  }

  return { created: true, issueNumber: issue.number, issueUrl: issue.html_url };
}
