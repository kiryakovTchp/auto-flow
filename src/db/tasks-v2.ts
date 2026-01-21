import { pool } from './pool';

export type CiStatus = 'pending' | 'success' | 'failure';

export type TaskStatus =
  | 'RECEIVED'
  | 'TASKSPEC_CREATED'
  | 'NEEDS_REPO'
  | 'AUTO_DISABLED'
  | 'CANCELLED'
  | 'BLOCKED'
  | 'ISSUE_CREATED'
  | 'PR_CREATED'
  | 'WAITING_CI'
  | 'DEPLOYED'
  | 'FAILED';

export type TaskRow = {
  id: string;
  project_id: string | null;
  asana_gid: string;
  title: string | null;
  status: TaskStatus;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_repo_owner: string | null;
  github_repo_name: string | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  ci_sha: string | null;
  merge_commit_sha: string | null;
  ci_status: string | null;
  ci_url: string | null;
  asana_completed_by_tool: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function upsertTaskByAsanaGid(params: {
  projectId?: string;
  asanaGid: string;
  title?: string;
  status: TaskStatus;
  lastError?: string;
}): Promise<TaskRow> {
  // Legacy mode runs without projectId; in that case we still want idempotency.
  // Since project-scoped uniqueness allows multiple rows for the same Asana GID,
  // we treat (project_id is null, asana_gid) as the legacy identity.
  if (!params.projectId) {
    const existing = await pool.query<TaskRow>('select * from tasks where project_id is null and asana_gid = $1 limit 1', [params.asanaGid]);
    const row = existing.rows[0];
    if (row) {
      const updated = await pool.query<TaskRow>(
        `
          update tasks
          set
            title = coalesce($2, title),
            status = $3,
            last_error = $4,
            updated_at = now()
          where id = $1
          returning *
        `,
        [row.id, params.title ?? null, params.status, params.lastError ?? null],
      );
      return updated.rows[0]!;
    }

    const inserted = await pool.query<TaskRow>(
      `
        insert into tasks (project_id, asana_gid, title, status, last_error)
        values (null, $1, $2, $3, $4)
        returning *
      `,
      [params.asanaGid, params.title ?? null, params.status, params.lastError ?? null],
    );
    return inserted.rows[0]!;
  }

  const res = await pool.query<TaskRow>(
    `
      insert into tasks (project_id, asana_gid, title, status, last_error)
      values ($1, $2, $3, $4, $5)
      on conflict (project_id, asana_gid) do update
      set
        project_id = coalesce(excluded.project_id, tasks.project_id),
        title = coalesce(excluded.title, tasks.title),
        status = excluded.status,
        last_error = excluded.last_error,
        updated_at = now()
      returning *
    `,
    [params.projectId, params.asanaGid, params.title ?? null, params.status, params.lastError ?? null],
  );
  return res.rows[0]!;
}

export async function attachIssueToTask(params: {
  projectId?: string;
  asanaGid: string;
  issueNumber: number;
  issueUrl: string;
  repoOwner: string;
  repoName: string;
}): Promise<void> {
  await pool.query(
    `
      update tasks
      set github_issue_number = $3,
          github_issue_url = $4,
          github_repo_owner = $5,
          github_repo_name = $6,
          updated_at = now()
      where asana_gid = $1
        and project_id is not distinct from $2
    `,
    [params.asanaGid, params.projectId ?? null, params.issueNumber, params.issueUrl, params.repoOwner, params.repoName],
  );
}

export async function getTaskByProjectAsanaGid(projectId: string, asanaGid: string): Promise<TaskRow | null> {
  const res = await pool.query<TaskRow>('select * from tasks where project_id = $1 and asana_gid = $2 limit 1', [projectId, asanaGid]);
  return res.rows[0] ?? null;
}

export async function getTaskByRepoIssueNumber(params: {
  projectId: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
}): Promise<TaskRow | null> {
  const res = await pool.query<TaskRow>(
    `
      select *
      from tasks
      where project_id = $1
        and github_repo_owner = $2
        and github_repo_name = $3
        and github_issue_number = $4
      limit 1
    `,
    [params.projectId, params.repoOwner, params.repoName, params.issueNumber],
  );
  return res.rows[0] ?? null;
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

export async function attachPrToTaskById(params: {
  taskId: string;
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
      where id = $1
    `,
    [params.taskId, params.prNumber, params.prUrl, params.sha ?? null],
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

export async function updateTaskStatusById(taskId: string, status: TaskStatus, lastError?: string): Promise<void> {
  await pool.query(
    `
      update tasks
      set status = $2,
          last_error = $3,
          updated_at = now()
      where id = $1
    `,
    [taskId, status, lastError ?? null],
  );
}

export async function getTaskByAsanaGid(asanaGid: string): Promise<TaskRow | null> {
  // Prefer legacy rows (project_id is null) when ambiguous.
  const res = await pool.query<TaskRow>(
    'select * from tasks where asana_gid = $1 order by (project_id is null) desc, updated_at desc limit 1',
    [asanaGid],
  );
  return res.rows[0] ?? null;
}

export async function getTaskByIssueNumber(issueNumber: number): Promise<TaskRow | null> {
  const res = await pool.query<TaskRow>('select * from tasks where github_issue_number = $1 limit 1', [issueNumber]);
  return res.rows[0] ?? null;
}

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const res = await pool.query<TaskRow>('select * from tasks where id = $1 limit 1', [id]);
  return res.rows[0] ?? null;
}

export async function listTasksByProject(projectId: string, status?: TaskStatus): Promise<TaskRow[]> {
  if (status) {
    const res = await pool.query<TaskRow>(
      'select * from tasks where project_id = $1 and status = $2 order by updated_at desc, id desc',
      [projectId, status],
    );
    return res.rows;
  }

  const res = await pool.query<TaskRow>('select * from tasks where project_id = $1 order by updated_at desc, id desc', [projectId]);
  return res.rows;
}

export async function listTasks(): Promise<TaskRow[]> {
  const res = await pool.query<TaskRow>('select * from tasks order by id desc');
  return res.rows;
}
