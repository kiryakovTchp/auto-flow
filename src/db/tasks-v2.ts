import { pool } from './pool';

export type CiStatus = 'pending' | 'success' | 'failure';

export type TaskStatus =
  | 'RECEIVED'
  | 'TASKSPEC_CREATED'
  | 'ISSUE_CREATED'
  | 'PR_CREATED'
  | 'WAITING_CI'
  | 'DEPLOYED'
  | 'FAILED';

export type TaskRow = {
  id: string;
  asana_gid: string;
  title: string | null;
  status: TaskStatus;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  ci_sha: string | null;
  ci_status: string | null;
  ci_url: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function upsertTaskByAsanaGid(params: {
  asanaGid: string;
  title?: string;
  status: TaskStatus;
  lastError?: string;
}): Promise<TaskRow> {
  const res = await pool.query<TaskRow>(
    `
      insert into tasks (asana_gid, title, status, last_error)
      values ($1, $2, $3, $4)
      on conflict (asana_gid) do update
      set
        title = coalesce(excluded.title, tasks.title),
        status = excluded.status,
        last_error = excluded.last_error,
        updated_at = now()
      returning *
    `,
    [params.asanaGid, params.title ?? null, params.status, params.lastError ?? null],
  );
  return res.rows[0]!;
}

export async function attachIssueToTask(params: {
  asanaGid: string;
  issueNumber: number;
  issueUrl: string;
}): Promise<void> {
  await pool.query(
    `
      update tasks
      set github_issue_number = $2,
          github_issue_url = $3,
          updated_at = now()
      where asana_gid = $1
    `,
    [params.asanaGid, params.issueNumber, params.issueUrl],
  );
}

export async function attachPrToTaskByIssueNumber(params: {
  issueNumber: number;
  prNumber: number;
  prUrl: string;
  sha?: string;
}): Promise<void> {
  await pool.query(
    `
      update tasks
      set github_pr_number = $2,
          github_pr_url = $3,
          ci_sha = coalesce($4, ci_sha),
          updated_at = now()
      where github_issue_number = $1
    `,
    [params.issueNumber, params.prNumber, params.prUrl, params.sha ?? null],
  );
}

export async function updateTaskStatusByAsanaGid(asanaGid: string, status: TaskStatus, lastError?: string): Promise<void> {
  await pool.query(
    `
      update tasks
      set status = $2,
          last_error = $3,
          updated_at = now()
      where asana_gid = $1
    `,
    [asanaGid, status, lastError ?? null],
  );
}

export async function updateTaskStatusByIssueNumber(issueNumber: number, status: TaskStatus, lastError?: string): Promise<void> {
  await pool.query(
    `
      update tasks
      set status = $2,
          last_error = $3,
          updated_at = now()
      where github_issue_number = $1
    `,
    [issueNumber, status, lastError ?? null],
  );
}

export async function getTaskByAsanaGid(asanaGid: string): Promise<TaskRow | null> {
  const res = await pool.query<TaskRow>('select * from tasks where asana_gid = $1 limit 1', [asanaGid]);
  return res.rows[0] ?? null;
}

export async function getTaskByIssueNumber(issueNumber: number): Promise<TaskRow | null> {
  const res = await pool.query<TaskRow>('select * from tasks where github_issue_number = $1 limit 1', [issueNumber]);
  return res.rows[0] ?? null;
}

export async function listTasks(): Promise<TaskRow[]> {
  const res = await pool.query<TaskRow>('select * from tasks order by id desc');
  return res.rows;
}
