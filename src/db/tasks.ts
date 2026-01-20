import { pool } from './pool';

export type TaskMapping = {
  id: string;
  asana_gid: string;
  asana_project_gid: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listTaskMappings(): Promise<TaskMapping[]> {
  const res = await pool.query<TaskMapping>('select * from task_mappings order by id desc');
  return res.rows;
}

export async function getMappingByAsanaGid(asanaGid: string): Promise<TaskMapping | null> {
  const res = await pool.query<TaskMapping>('select * from task_mappings where asana_gid = $1 limit 1', [asanaGid]);
  return res.rows[0] ?? null;
}

export async function getMappingByGithubIssueNumber(issueNumber: number): Promise<TaskMapping | null> {
  const res = await pool.query<TaskMapping>('select * from task_mappings where github_issue_number = $1 limit 1', [issueNumber]);
  return res.rows[0] ?? null;
}

export async function insertMapping(params: {
  asanaGid: string;
  asanaProjectGid?: string;
  githubIssueNumber: number;
  githubIssueUrl: string;
}): Promise<TaskMapping> {
  const res = await pool.query<TaskMapping>(
    `
      insert into task_mappings (asana_gid, asana_project_gid, github_issue_number, github_issue_url, status)
      values ($1, $2, $3, $4, 'open')
      returning *
    `,
    [params.asanaGid, params.asanaProjectGid ?? null, params.githubIssueNumber, params.githubIssueUrl],
  );
  return res.rows[0]!;
}

export async function updateMappingStatusByAsanaGid(asanaGid: string, status: string): Promise<void> {
  await pool.query(
    `
      update task_mappings
      set status = $2, updated_at = now()
      where asana_gid = $1
    `,
    [asanaGid, status],
  );
}

export async function updateMappingStatusByIssueNumber(issueNumber: number, status: string): Promise<void> {
  await pool.query(
    `
      update task_mappings
      set status = $2, updated_at = now()
      where github_issue_number = $1
    `,
    [issueNumber, status],
  );
}
