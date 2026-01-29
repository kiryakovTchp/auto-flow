import { pool } from './pool';

export type JobQueueRow = {
  id: string;
  project_id: string | null;
  provider: string;
  kind: string;
  payload: any;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function enqueueJob(params: {
  projectId?: string | null;
  provider: string;
  kind: string;
  payload: unknown;
  runAt?: Date;
}): Promise<void> {
  await pool.query(
    `
      insert into job_queue (project_id, provider, kind, payload, next_run_at)
      values ($1, $2, $3, $4::jsonb, $5)
    `,
    [params.projectId ?? null, params.provider, params.kind, JSON.stringify(params.payload), params.runAt ?? new Date()],
  );
}

export async function claimNextJob(workerId: string): Promise<JobQueueRow | null> {
  await pool.query('begin');
  try {
    const res = await pool.query<JobQueueRow>(
      `
        with picked as (
          select id
          from job_queue
          where status = 'pending'
            and next_run_at <= now()
          order by next_run_at asc, id asc
          limit 1
          for update skip locked
        )
        update job_queue
        set status = 'processing',
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
        where id in (select id from picked)
        returning *
      `,
      [workerId],
    );
    await pool.query('commit');
    return res.rows[0] ?? null;
  } catch (err) {
    await pool.query('rollback');
    throw err;
  }
}

export async function markJobDone(jobId: string): Promise<void> {
  await pool.query(
    `
      update job_queue
      set status = 'done', updated_at = now()
      where id = $1
    `,
    [jobId],
  );
}

export async function markJobFailed(params: {
  jobId: string;
  attempts: number;
  maxAttempts: number;
  error: string;
}): Promise<void> {
  const isTerminal = params.attempts >= params.maxAttempts;
  const status = isTerminal ? 'failed' : 'pending';

  const backoffMs = (() => {
    if (isTerminal) return 0;
    if (params.attempts <= 1) return 10_000;
    if (params.attempts === 2) return 60_000;
    return 5 * 60_000;
  })();

  await pool.query(
    `
      update job_queue
      set
        status = $2,
        attempts = $3,
        last_error = $4,
        next_run_at = case when $5::bigint > 0 then now() + ($5::bigint || ' milliseconds')::interval else next_run_at end,
        locked_at = null,
        locked_by = null,
        updated_at = now()
      where id = $1
    `,
    [params.jobId, status, params.attempts, params.error, backoffMs],
  );
}

export async function listJobQueueByProject(params: {
  projectId: string;
  limit?: number;
}): Promise<JobQueueRow[]> {
  const limit = params.limit && params.limit > 0 ? params.limit : 50;
  const res = await pool.query<JobQueueRow>(
    `
      select *
      from job_queue
      where project_id = $1
      order by created_at desc
      limit $2
    `,
    [params.projectId, limit],
  );
  return res.rows;
}
