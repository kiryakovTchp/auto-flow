import { pool } from './pool';
import type { TaskRow } from './tasks-v2';

export async function getTasksByCiSha(sha: string): Promise<TaskRow[]> {
  const res = await pool.query<TaskRow>('select * from tasks where ci_sha = $1 order by id desc', [sha]);
  return res.rows;
}
