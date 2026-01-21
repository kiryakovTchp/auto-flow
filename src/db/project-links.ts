import { pool } from './pool';

export type ProjectLinkRow = {
  id: string;
  project_id: string;
  kind: string;
  url: string;
  title: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectContactRow = {
  id: string;
  project_id: string;
  role: string;
  name: string | null;
  handle: string | null;
  created_at: string;
  updated_at: string;
};

export async function listProjectLinks(projectId: string): Promise<ProjectLinkRow[]> {
  const res = await pool.query<ProjectLinkRow>(
    'select id, project_id, kind, url, title, tags, created_at, updated_at from project_links where project_id = $1 order by created_at desc, id desc',
    [projectId],
  );
  return res.rows;
}

export async function addProjectLink(params: {
  projectId: string;
  kind: string;
  url: string;
  title?: string | null;
  tags?: string | null;
}): Promise<void> {
  await pool.query(
    `
      insert into project_links (project_id, kind, url, title, tags)
      values ($1, $2, $3, $4, $5)
    `,
    [params.projectId, params.kind, params.url, params.title ?? null, params.tags ?? null],
  );
}

export async function deleteProjectLink(params: { projectId: string; id: string }): Promise<void> {
  await pool.query('delete from project_links where project_id = $1 and id = $2', [params.projectId, params.id]);
}

export async function listProjectContacts(projectId: string): Promise<ProjectContactRow[]> {
  const res = await pool.query<ProjectContactRow>(
    'select id, project_id, role, name, handle, created_at, updated_at from project_contacts where project_id = $1 order by created_at desc, id desc',
    [projectId],
  );
  return res.rows;
}

export async function addProjectContact(params: {
  projectId: string;
  role: string;
  name?: string | null;
  handle?: string | null;
}): Promise<void> {
  await pool.query(
    `
      insert into project_contacts (project_id, role, name, handle)
      values ($1, $2, $3, $4)
    `,
    [params.projectId, params.role, params.name ?? null, params.handle ?? null],
  );
}

export async function deleteProjectContact(params: { projectId: string; id: string }): Promise<void> {
  await pool.query('delete from project_contacts where project_id = $1 and id = $2', [params.projectId, params.id]);
}
