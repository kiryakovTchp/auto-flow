import { pool } from './pool';

export type TaskEventRow = {
  id: string;
  task_id: string;
  kind: string;
  message: string | null;
  created_at: string;
};

export async function insertTaskEvent(params: { taskId: string; kind: string; message?: string }): Promise<void> {
  await pool.query(
    `
      insert into task_events (task_id, kind, message)
      values ($1, $2, $3)
    `,
    [params.taskId, params.kind, params.message ?? null],
  );
}

export async function listTaskEvents(taskId: string): Promise<TaskEventRow[]> {
  const res = await pool.query<TaskEventRow>(
    'select id, task_id, kind, message, created_at from task_events where task_id = $1 order by created_at desc',
    [taskId],
  );
  return res.rows;
}
