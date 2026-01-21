import { pool } from './pool';

export type ProjectEventRow = {
  id: string;
  project_id: string;
  source: string;
  event_type: string;
  ref_json: any;
  delivery_id: string | null;
  user_id: string | null;
  created_at: string;
};

export async function insertProjectEvent(params: {
  projectId: string;
  source: 'asana' | 'github' | 'system' | 'user' | 'api';
  eventType: string;
  refJson?: unknown;
  deliveryId?: string | null;
  userId?: string | null;
}): Promise<void> {
  await pool.query(
    `
      insert into project_events (project_id, source, event_type, ref_json, delivery_id, user_id)
      values ($1, $2, $3, $4::jsonb, $5, $6)
    `,
    [
      params.projectId,
      params.source,
      params.eventType,
      JSON.stringify(params.refJson ?? {}),
      params.deliveryId ?? null,
      params.userId ?? null,
    ],
  );
}

export async function listProjectEvents(params: { projectId: string; limit?: number }): Promise<ProjectEventRow[]> {
  const lim = Math.max(1, Math.min(500, params.limit ?? 100));
  const res = await pool.query<ProjectEventRow>(
    'select id, project_id, source, event_type, ref_json, delivery_id, user_id, created_at from project_events where project_id = $1 order by created_at desc limit $2',
    [params.projectId, lim],
  );
  return res.rows;
}
