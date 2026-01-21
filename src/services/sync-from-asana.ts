import { getTaskByAsanaGid, getTaskByProjectAsanaGid, upsertTaskByAsanaGid, attachIssueToTask } from '../db/tasks-v2';
import { insertTaskSpec, getLatestTaskSpec } from '../db/taskspecs';
import type { AsanaClient } from '../integrations/asana';
import type { GithubClient } from '../integrations/github';
import { buildIssueBodyWithCommand, buildTaskSpecMarkdown } from './taskspec';

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

  const taskRow = await upsertTaskByAsanaGid({
    projectId: params.projectId,
    asanaGid: asanaTask.gid,
    title: asanaTask.name,
    status: 'RECEIVED',
  });

  const prev = await getLatestTaskSpec(taskRow.id);
  const nextVersion = prev ? prev.version + 1 : 1;

  const specMarkdown = buildTaskSpecMarkdown({ asanaTask, asanaProjectGid: params.asanaProjectGid });
  await insertTaskSpec({ taskId: taskRow.id, version: nextVersion, markdown: specMarkdown });

  await upsertTaskByAsanaGid({ projectId: params.projectId, asanaGid: asanaTask.gid, status: 'TASKSPEC_CREATED' });

  const issue = await params.github.createIssue({
    title: asanaTask.name,
    body: buildIssueBodyWithCommand(specMarkdown),
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

  return { created: true, issueNumber: issue.number, issueUrl: issue.html_url };
}
