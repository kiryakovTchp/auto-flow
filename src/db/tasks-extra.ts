import { pool } from './pool';

export async function setMergeCommitShaByIssueNumber(params: { issueNumber: number; sha: string }): Promise<void> {
  await pool.query(
    `
      update tasks
      set merge_commit_sha = $2, ci_sha = $2, updated_at = now()
      where github_issue_number = $1
    `,
    [params.issueNumber, params.sha],
  );
}

export async function setMergeCommitShaByTaskId(params: { taskId: string; sha: string }): Promise<void> {
  await pool.query(
    `
      update tasks
      set merge_commit_sha = $2, ci_sha = $2, updated_at = now()
      where id = $1
    `,
    [params.taskId, params.sha],
  );
}

export async function setAsanaCompletedByToolByIssueNumber(params: { issueNumber: number; value: boolean }): Promise<void> {
  await pool.query(
    `
      update tasks
      set asana_completed_by_tool = $2, updated_at = now()
      where github_issue_number = $1
    `,
    [params.issueNumber, params.value],
  );
}

export async function setAsanaCompletedByToolByTaskId(params: { taskId: string; value: boolean }): Promise<void> {
  await pool.query(
    `
      update tasks
      set asana_completed_by_tool = $2, updated_at = now()
      where id = $1
    `,
    [params.taskId, params.value],
  );
}
