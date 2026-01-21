import { pool } from './pool';

export type TaskEventRow = {
  id: string;
  task_id: string;
  project_id: string | null;
  kind: string;
  message: string | null;
  source: string | null;
  event_type: string | null;
  ref_json: any;
  delivery_id: string | null;
  user_id: string | null;
  username: string | null;
  created_at: string;
};

export async function insertTaskEvent(params: {
  taskId: string;
  kind: string;
  message?: string;
  source?: 'asana' | 'github' | 'system' | 'user' | 'api';
  eventType?: string;
  refJson?: unknown;
  deliveryId?: string | null;
  userId?: string | null;
}): Promise<void> {
  const derivedSource = params.source ?? inferSourceFromKind(params.kind);
  const derivedEventType = params.eventType ?? (params.kind.startsWith('manual.') ? 'manual.action' : params.kind);
  const refJson =
    params.refJson ??
    (params.kind.startsWith('manual.')
      ? { action: params.kind, message: params.message ?? null }
      : { message: params.message ?? null });

  await pool.query(
    `
      insert into task_events (task_id, project_id, kind, message, source, event_type, ref_json, delivery_id, user_id)
      values (
        $1,
        (select project_id from tasks where id = $1 limit 1),
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        $7,
        $8
      )
    `,
    [
      params.taskId,
      params.kind,
      params.message ?? null,
      derivedSource,
      derivedEventType,
      JSON.stringify(refJson),
      params.deliveryId ?? null,
      params.userId ?? null,
    ],
  );
}

export async function listTaskEvents(taskId: string): Promise<TaskEventRow[]> {
  const res = await pool.query<TaskEventRow>(
    `
      select e.id, e.task_id, e.project_id, e.kind, e.message, e.source, e.event_type, e.ref_json, e.delivery_id, e.user_id,
             u.username as username,
             e.created_at
      from task_events e
      left join users u on u.id = e.user_id
      where e.task_id = $1
      order by e.created_at desc
    `,
    [taskId],
  );
  return res.rows;
}

function inferSourceFromKind(kind: string): 'asana' | 'github' | 'system' | 'user' | 'api' {
  if (kind.startsWith('asana.')) return 'asana';
  if (kind.startsWith('github.')) return 'github';
  if (kind.startsWith('manual.')) return 'user';
  if (kind.startsWith('api.')) return 'api';
  return 'system';
}
