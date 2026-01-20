import { AsanaClient } from '../integrations/asana';
import { listTasksUpdatedSince } from '../integrations/asana-sync';
import { getTaskByAsanaGid } from '../db/tasks-v2';
import { insertTaskEvent } from '../db/task-events';
import { listProjectAsanaProjects, listProjectGithubRepos } from '../db/project-settings';
import { getProjectSecretPlain } from './project-secure-config';
import { GithubClient } from '../integrations/github';
import { ensureGithubIssueForAsanaTask } from './sync-from-asana';

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

  const repos = await listProjectGithubRepos(params.projectId);
  const def = repos.find((r) => r.is_default) ?? repos[0];
  if (!def) {
    throw new Error('No GitHub repos configured');
  }

  const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();

  const asana = new AsanaClient(asanaPat);
  const github = new GithubClient(ghToken, def.owner, def.repo);

  let imported = 0;
  let createdIssues = 0;
  let skipped = 0;

  for (const asanaProjectGid of asanaProjects) {
    const stubs = await listTasksUpdatedSince({ asanaPat, asanaProjectGid, since });

    for (const s of stubs) {
      imported += 1;
      const result = await ensureGithubIssueForAsanaTask({
        projectId: params.projectId,
        asana,
        github,
        asanaTaskGid: s.gid,
        asanaProjectGid,
      });

      if (result.created) createdIssues += 1;
      else skipped += 1;

      const row = await getTaskByAsanaGid(s.gid);
      if (row?.id) {
        const msg = result.created
          ? `Imported from Asana project ${asanaProjectGid}. Created issue #${result.issueNumber ?? ''}`
          : `Imported from Asana project ${asanaProjectGid}. Issue already exists.`;
        await insertTaskEvent({ taskId: row.id, kind: 'import.asana', message: msg });
      }

      void params.projectSlug;
    }
  }

  return { imported, createdIssues, skipped };
}
