import { listTasksUpdatedSince } from '../integrations/asana-sync';
import { getTaskByProjectAsanaGid } from '../db/tasks-v2';
import { insertTaskEvent } from '../db/task-events';
import { listProjectAsanaProjects } from '../db/project-settings';
import { getProjectSecretPlain } from './project-secure-config';
import { processAsanaTaskStage5 } from './pipeline-stage5';

export async function importAsanaTasksForProject(params: {
  projectId: string;
  projectSlug: string;
  days: number;
}): Promise<{ imported: number; createdIssues: number; skipped: number }> {
  const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
  const ghToken = await getProjectSecretPlain(params.projectId, 'GITHUB_TOKEN');

  if (!asanaPat || !ghToken) {
    throw new Error('Missing ASANA_PAT or GITHUB_TOKEN in project secrets');
  }

  const asanaProjects = await listProjectAsanaProjects(params.projectId);
  if (!asanaProjects.length) {
    throw new Error('No Asana project GIDs configured');
  }

  const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();

  let imported = 0;
  let createdIssues = 0;
  let skipped = 0;

  for (const asanaProjectGid of asanaProjects) {
    const stubs = await listTasksUpdatedSince({ asanaPat, asanaProjectGid, since });

    for (const s of stubs) {
      imported += 1;

      const before = await getTaskByProjectAsanaGid(params.projectId, s.gid);
      const beforeIssue = before?.github_issue_number ?? null;

      await processAsanaTaskStage5({ projectId: params.projectId, asanaProjectGid, asanaTaskGid: s.gid });

      const row = await getTaskByProjectAsanaGid(params.projectId, s.gid);
      const afterIssue = row?.github_issue_number ?? null;

      if (!beforeIssue && afterIssue) createdIssues += 1;
      else skipped += 1;

      if (row?.id) {
        const msg = afterIssue
          ? `Imported from Asana project ${asanaProjectGid}. Issue #${afterIssue}. Status=${row.status}`
          : `Imported from Asana project ${asanaProjectGid}. No issue created. Status=${row.status}`;
        await insertTaskEvent({ taskId: row.id, kind: 'import.asana', message: msg });
      }

      void params.projectSlug;
    }
  }

  return { imported, createdIssues, skipped };
}
