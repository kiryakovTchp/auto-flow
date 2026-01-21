import type { Request } from 'express';

import { pool } from '../db/pool';
import { getEnv } from '../config/env';

type Labels = Record<string, string>;

const counters = new Map<string, number>();

function seriesKey(name: string, labels?: Labels): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
  return `${name}{${parts.join(',')}}`;
}

function incCounter(name: string, labels?: Labels, n = 1): void {
  const k = seriesKey(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + n);
}

export function incWebhookReceived(provider: 'asana' | 'github'): void {
  incCounter('auto_flow_webhooks_received_total', { provider });
}

export function incWebhookUnauthorized(provider: 'asana' | 'github'): void {
  incCounter('auto_flow_webhooks_unauthorized_total', { provider });
}

export function incJobDone(): void {
  incCounter('auto_flow_jobs_done_total');
}

export function incJobFailed(terminal: boolean): void {
  incCounter('auto_flow_jobs_failed_total', { terminal: terminal ? 'true' : 'false' });
}

export function formatPrometheusText(lines: string[]): string {
  return lines.join('\n') + (lines.length ? '\n' : '');
}

async function collectDbGauges(): Promise<string[]> {
  const out: string[] = [];

  // Queue depth by status.
  const q = await pool.query<{ status: string; count: string }>(
    'select status, count(*)::text as count from job_queue group by status order by status asc',
  );
  out.push('# HELP auto_flow_job_queue_depth Current job queue depth');
  out.push('# TYPE auto_flow_job_queue_depth gauge');
  for (const r of q.rows) {
    out.push(`auto_flow_job_queue_depth{status="${r.status}"} ${Number(r.count)}`);
  }

  // Oldest pending age.
  const oldest = await pool.query<{ age_seconds: string | null }>(
    "select extract(epoch from (now() - min(created_at)))::text as age_seconds from job_queue where status = 'pending'",
  );
  out.push('# HELP auto_flow_job_queue_oldest_pending_age_seconds Age of oldest pending job');
  out.push('# TYPE auto_flow_job_queue_oldest_pending_age_seconds gauge');
  out.push(`auto_flow_job_queue_oldest_pending_age_seconds ${oldest.rows[0]?.age_seconds ? Number(oldest.rows[0].age_seconds) : 0}`);

  // Tasks by status.
  const t = await pool.query<{ status: string; count: string }>(
    'select status, count(*)::text as count from tasks group by status order by status asc',
  );
  out.push('# HELP auto_flow_tasks_by_status Tasks grouped by status');
  out.push('# TYPE auto_flow_tasks_by_status gauge');
  for (const r of t.rows) {
    out.push(`auto_flow_tasks_by_status{status="${r.status}"} ${Number(r.count)}`);
  }

  return out;
}

function renderCounters(): string[] {
  const out: string[] = [];
  const byName = new Map<string, string[]>();

  for (const [k, v] of counters.entries()) {
    const name = k.split('{')[0];
    const arr = byName.get(name) ?? [];
    arr.push(`${k} ${v}`);
    byName.set(name, arr);
  }

  const specs: Array<{ name: string; help: string }> = [
    { name: 'auto_flow_webhooks_received_total', help: 'Webhooks received (validated) total' },
    { name: 'auto_flow_webhooks_unauthorized_total', help: 'Webhooks rejected as unauthorized total' },
    { name: 'auto_flow_jobs_done_total', help: 'Jobs processed successfully total' },
    { name: 'auto_flow_jobs_failed_total', help: 'Jobs failed total' },
  ];

  for (const s of specs) {
    out.push(`# HELP ${s.name} ${s.help}`);
    out.push(`# TYPE ${s.name} counter`);
    const series = byName.get(s.name) ?? [];
    if (!series.length) {
      out.push(`${s.name} 0`);
      continue;
    }
    out.push(...series.sort());
  }

  return out;
}

export function isMetricsRequestAllowed(req: Request): boolean {
  const env = getEnv();
  const token = env.METRICS_TOKEN;

  if (token && token.trim()) {
    const auth = String(req.header('authorization') ?? '');
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return Boolean(m && m[1].trim() === token.trim());
  }

  // Default: allow only local access.
  const ip = String((req as any).ip ?? '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export async function getMetricsText(): Promise<string> {
  const lines: string[] = [];
  lines.push(...renderCounters());
  lines.push(...(await collectDbGauges()));
  return formatPrometheusText(lines);
}
