import { listProjectGithubRepos } from '../db/project-settings';
import { getAsanaFieldConfig } from '../db/asana-config';
import { getProjectSecretPlain } from './project-secure-config';
import { addEnumOptionToCustomField } from '../integrations/asana-custom-fields';

export async function syncReposToAsanaRepoField(params: { projectId: string }): Promise<{ added: number }> {
  const asanaPat = await getProjectSecretPlain(params.projectId, 'ASANA_PAT');
  if (!asanaPat) throw new Error('Missing ASANA_PAT in project secrets');

  const cfg = await getAsanaFieldConfig(params.projectId);
  if (!cfg?.repo_field_gid) throw new Error('Missing repo_field_gid in Asana field config');

  const repos = await listProjectGithubRepos(params.projectId);

  let added = 0;
  // MVP: we attempt to add enum options by name "owner/repo".
  // Asana will reject duplicates; we treat that as error for now.
  for (const r of repos) {
    const optionName = `${r.owner}/${r.repo}`;
    await addEnumOptionToCustomField({ asanaPat, customFieldGid: cfg.repo_field_gid, optionName });
    added += 1;
  }

  return { added };
}
