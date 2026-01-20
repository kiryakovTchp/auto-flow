import { pool } from './pool';

export type TaskSpecRow = {
  id: string;
  task_id: string;
  version: number;
  markdown: string;
  created_at: string;
};

export async function insertTaskSpec(params: { taskId: string; version: number; markdown: string }): Promise<TaskSpecRow> {
  const res = await pool.query<TaskSpecRow>(
    `
      insert into taskspecs (task_id, version, markdown)
      values ($1, $2, $3)
      returning *
    `,
    [params.taskId, params.version, params.markdown],
  );
  return res.rows[0]!;
}

export async function getLatestTaskSpec(taskId: string): Promise<TaskSpecRow | null> {
  const res = await pool.query<TaskSpecRow>(
    'select * from taskspecs where task_id = $1 order by version desc limit 1',
    [taskId],
  );
  return res.rows[0] ?? null;
}

export async function listTaskSpecs(taskId: string): Promise<TaskSpecRow[]> {
  const res = await pool.query<TaskSpecRow>('select * from taskspecs where task_id = $1 order by version desc', [taskId]);
  return res.rows;
}
