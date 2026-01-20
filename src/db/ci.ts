import { pool } from './pool';

export async function setCiStateByIssueNumber(params: {
  issueNumber: number;
  sha?: string | null;
  status?: string | null;
  url?: string | null;
}): Promise<void> {
  await pool.query(
    `
      update tasks
      set
        ci_sha = coalesce($2, ci_sha),
        ci_status = coalesce($3, ci_status),
        ci_url = coalesce($4, ci_url),
        updated_at = now()
      where github_issue_number = $1
    `,
    [params.issueNumber, params.sha ?? null, params.status ?? null, params.url ?? null],
  );
}

export async function setCiStateBySha(params: {
  sha: string;
  status: string;
  url?: string | null;
}): Promise<void> {
  await pool.query(
    `
      update tasks
      set
        ci_sha = $1,
        ci_status = $2,
        ci_url = coalesce($3, ci_url),
        updated_at = now()
      where ci_sha = $1
    `,
    [params.sha, params.status, params.url ?? null],
  );
}
