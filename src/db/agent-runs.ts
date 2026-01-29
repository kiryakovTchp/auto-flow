import { pool } from './pool';

export type AgentRunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export type AgentRunRow = {
  id: string;
  project_id: string;
  agent_type: string;
  triggered_by_user_id: string | null;
  status: AgentRunStatus;
  input_spec: any;
  output_summary: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export async function createAgentRun(params: {
  projectId: string;
  agentType: string;
  triggeredByUserId?: string | null;
  status: AgentRunStatus;
  inputSpec?: unknown;
}): Promise<AgentRunRow> {
  const res = await pool.query<AgentRunRow>(
    `
      insert into agent_runs (project_id, agent_type, triggered_by_user_id, status, input_spec)
      values ($1, $2, $3, $4, $5::jsonb)
      returning *
    `,
    [params.projectId, params.agentType, params.triggeredByUserId ?? null, params.status, JSON.stringify(params.inputSpec ?? {})],
  );
  return res.rows[0]!;
}

export async function updateAgentRun(params: {
  runId: string;
  status?: AgentRunStatus;
  outputSummary?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `
      update agent_runs
      set status = coalesce($2, status),
          output_summary = coalesce($3, output_summary),
          started_at = coalesce($4, started_at),
          finished_at = coalesce($5, finished_at)
      where id = $1
    `,
    [params.runId, params.status ?? null, params.outputSummary ?? null, params.startedAt ?? null, params.finishedAt ?? null],
  );
}

export async function insertAgentRunLog(params: {
  runId: string;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
}): Promise<void> {
  await pool.query(
    `
      insert into agent_run_logs (agent_run_id, stream, message)
      values ($1, $2, $3)
    `,
    [params.runId, params.stream, params.message],
  );
}

export async function listAgentRunsByProject(params: {
  projectId: string;
  limit?: number;
  offset?: number;
  status?: string | null;
}): Promise<AgentRunRow[]> {
  const lim = Math.max(1, Math.min(200, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);
  const conditions: string[] = ['project_id = $1'];
  const values: Array<string | number> = [params.projectId];
  let idx = 2;

  const status = params.status?.trim();
  if (status) {
    conditions.push(`status = $${idx}`);
    values.push(status);
    idx += 1;
  }

  values.push(lim, offset);

  const res = await pool.query<AgentRunRow>(
    `
      select id, project_id, agent_type, triggered_by_user_id, status, input_spec, output_summary, created_at, started_at, finished_at
      from agent_runs
      where ${conditions.join(' and ')}
      order by created_at desc
      limit $${idx} offset $${idx + 1}
    `,
    values,
  );
  return res.rows;
}

export async function getAgentRunById(params: { projectId: string; runId: string }): Promise<AgentRunRow | null> {
  const res = await pool.query<AgentRunRow>(
    `
      select id, project_id, agent_type, triggered_by_user_id, status, input_spec, output_summary, created_at, started_at, finished_at
      from agent_runs
      where id = $1 and project_id = $2
      limit 1
    `,
    [params.runId, params.projectId],
  );
  return res.rows[0] ?? null;
}

export async function listAgentRunLogs(params: { runId: string; limit?: number }): Promise<Array<{ id: string; stream: string; message: string; created_at: string }>> {
  const lim = Math.max(1, Math.min(500, params.limit ?? 200));
  const res = await pool.query<{ id: string; stream: string; message: string; created_at: string }>(
    `
      select id, stream, message, created_at
      from agent_run_logs
      where agent_run_id = $1
      order by created_at asc
      limit $2
    `,
    [params.runId, lim],
  );
  return res.rows;
}

export async function listAgentRunLogsAfter(params: {
  runId: string;
  afterId?: string | null;
  limit?: number;
}): Promise<Array<{ id: string; stream: string; message: string; created_at: string }>> {
  const lim = Math.max(1, Math.min(500, params.limit ?? 200));
  const after = params.afterId && /^\d+$/.test(params.afterId) ? params.afterId : '0';
  const res = await pool.query<{ id: string; stream: string; message: string; created_at: string }>(
    `
      select id, stream, message, created_at
      from agent_run_logs
      where agent_run_id = $1
        and id > $2
      order by id asc
      limit $3
    `,
    [params.runId, after, lim],
  );
  return res.rows;
}
