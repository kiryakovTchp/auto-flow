import { pool } from './pool';

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

export type ProjectMembershipRow = {
  id: string;
  user_id: string;
  project_id: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
};

export async function listProjects(): Promise<ProjectRow[]> {
  const res = await pool.query<ProjectRow>('select * from projects order by created_at desc');
  return res.rows;
}

export async function listProjectsForUser(userId: string): Promise<ProjectRow[]> {
  const res = await pool.query<ProjectRow>(
    `
      select p.*
      from projects p
      join project_memberships m on m.project_id = p.id
      where m.user_id = $1
      order by p.created_at desc
    `,
    [userId],
  );
  return res.rows;
}

export async function getProjectBySlug(slug: string): Promise<ProjectRow | null> {
  const res = await pool.query<ProjectRow>('select * from projects where slug = $1 limit 1', [slug]);
  return res.rows[0] ?? null;
}

export async function createProject(params: { slug: string; name: string }): Promise<ProjectRow> {
  const res = await pool.query<ProjectRow>(
    `
      insert into projects (slug, name)
      values ($1, $2)
      returning *
    `,
    [params.slug, params.name],
  );
  return res.rows[0]!;
}

export async function createMembership(params: { userId: string; projectId: string; role: 'admin' | 'editor' | 'viewer' }): Promise<ProjectMembershipRow> {
  const res = await pool.query<ProjectMembershipRow>(
    `
      insert into project_memberships (user_id, project_id, role)
      values ($1, $2, $3)
      returning *
    `,
    [params.userId, params.projectId, params.role],
  );
  return res.rows[0]!;
}

export async function getMembership(params: { userId: string; projectId: string }): Promise<ProjectMembershipRow | null> {
  const res = await pool.query<ProjectMembershipRow>(
    'select * from project_memberships where user_id = $1 and project_id = $2 limit 1',
    [params.userId, params.projectId],
  );
  return res.rows[0] ?? null;
}
