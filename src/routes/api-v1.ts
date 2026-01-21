import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';

import { tokenHash } from '../security/init-admin';
import { getProjectApiTokenByHash, markProjectApiTokenUsed } from '../db/api-tokens';
import { getProjectBySlug } from '../db/projects';
import { pool } from '../db/pool';
import { getTaskById } from '../db/tasks-v2';
import { listTaskEvents } from '../db/task-events';
import { listProjectWebhooks } from '../db/project-webhooks';

type AuthedReq = Request & { apiAuth?: { projectId: string; tokenId: string } };

function parseDateParam(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function requireProjectToken(req: AuthedReq, res: Response, next: NextFunction): Promise<void> {
  const auth = String(req.header('authorization') ?? '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = m[1].trim();
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const row = await getProjectApiTokenByHash(tokenHash(token));
  if (!row) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  (req as AuthedReq).apiAuth = { projectId: row.project_id, tokenId: row.id };
  await markProjectApiTokenUsed(row.id);
  next();
}

export function apiV1Router(): Router {
  const r = Router();

  r.get('/projects/:slug/summary', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const byStatus = await pool.query<{ status: string; count: string }>(
        'select status, count(*)::text as count from tasks where project_id = $1 group by status order by status asc',
        [p.id],
      );

      const queue = await pool.query<{ status: string; count: string }>(
        "select status, count(*)::text as count from job_queue where project_id = $1 group by status order by status asc",
        [p.id],
      );

      res.status(200).json({
        project: { slug: p.slug, name: p.name, id: p.id },
        tasksByStatus: Object.fromEntries(byStatus.rows.map((r0) => [r0.status, Number(r0.count)])),
        jobQueueByStatus: Object.fromEntries(queue.rows.map((r0) => [r0.status, Number(r0.count)])),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/webhooks/health', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const hooks = await listProjectWebhooks(p.id);
      res.status(200).json({
        project: { slug: p.slug, id: p.id },
        webhooks: hooks.map((h) => ({
          provider: h.provider,
          asana_project_gid: h.asana_project_gid,
          webhook_gid: h.webhook_gid,
          target_url: h.target_url,
          last_delivery_at: h.last_delivery_at,
          updated_at: h.updated_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/jobs/health', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const byStatus = await pool.query<{ status: string; count: string }>(
        'select status, count(*)::text as count from job_queue where project_id = $1 group by status order by status asc',
        [p.id],
      );

      const oldest = await pool.query<{ age_seconds: string | null }>(
        "select extract(epoch from (now() - min(created_at)))::text as age_seconds from job_queue where project_id = $1 and status = 'pending'",
        [p.id],
      );

      res.status(200).json({
        project: { slug: p.slug, id: p.id },
        queueByStatus: Object.fromEntries(byStatus.rows.map((r0) => [r0.status, Number(r0.count)])),
        pendingOldestAgeSeconds: oldest.rows[0]?.age_seconds ? Number(oldest.rows[0].age_seconds) : null,
      });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/tasks/:id/events', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const taskId = String(req.params.id);
      const task = await getTaskById(taskId);
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const events = await listTaskEvents(taskId);
      res.status(200).json({
        project: { slug: p.slug, id: p.id },
        task: { id: task.id, asana_gid: task.asana_gid, status: task.status, title: task.title },
        events,
      });
    } catch (err) {
      next(err);
    }
  });

  // Basic funnel computed from tasks (fast path). Event-based funnel can be added later.
  r.get('/projects/:slug/funnel', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const from = parseDateParam(req.query.from);
      const to = parseDateParam(req.query.to);

      // Event-based funnel (source of truth).
      const q = await pool.query<{
        seen: string;
        issue: string;
        pr: string;
        merged: string;
        ci_success: string;
        deployed: string;
      }>(
        `
          with base as (
            select distinct task_id
            from task_events
            where project_id = $1
              and event_type = 'task.created_or_seen'
              and ($2::timestamptz is null or created_at >= $2::timestamptz)
              and ($3::timestamptz is null or created_at <= $3::timestamptz)
          ),
          issue as (
            select distinct task_id
            from task_events
            where project_id = $1 and event_type = 'github.issue_created'
          ),
          pr as (
            select distinct task_id
            from task_events
            where project_id = $1 and event_type = 'github.pr_linked'
          ),
          merged as (
            select distinct task_id
            from task_events
            where project_id = $1 and event_type = 'github.pr_merged'
          ),
          ci_success as (
            select distinct task_id
            from task_events
            where project_id = $1
              and event_type = 'ci.updated'
              and (ref_json->>'status') = 'success'
          ),
          deployed as (
            select distinct task_id
            from task_events
            where project_id = $1
              and event_type = 'task.status_changed'
              and (ref_json->>'to') = 'DEPLOYED'
          )
          select
            (select count(*)::text from base) as seen,
            (select count(*)::text from (select task_id from base intersect select task_id from issue) x) as issue,
            (select count(*)::text from (select task_id from base intersect select task_id from pr) x) as pr,
            (select count(*)::text from (select task_id from base intersect select task_id from merged) x) as merged,
            (select count(*)::text from (select task_id from base intersect select task_id from ci_success) x) as ci_success,
            (select count(*)::text from (select task_id from base intersect select task_id from deployed) x) as deployed
        `,
        [p.id, from ? from.toISOString() : null, to ? to.toISOString() : null],
      );

      const row = q.rows[0] ?? { seen: '0', issue: '0', pr: '0', merged: '0', ci_success: '0', deployed: '0' };
      res.status(200).json({
        project: { slug: p.slug, id: p.id },
        funnel: {
          seen: Number(row.seen),
          issue: Number(row.issue),
          pr: Number(row.pr),
          merged: Number(row.merged),
          ci_success: Number(row.ci_success),
          deployed: Number(row.deployed),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/lead-time', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const from = parseDateParam(req.query.from);
      const to = parseDateParam(req.query.to);

      const dist = await pool.query<{ p50: number | null; p90: number | null; n: string }>(
        `
          with created as (
            select task_id, min(created_at) as created_at
            from task_events
            where project_id = $1
              and event_type = 'task.created_or_seen'
              and ($2::timestamptz is null or created_at >= $2::timestamptz)
              and ($3::timestamptz is null or created_at <= $3::timestamptz)
            group by task_id
          ),
          deployed as (
            select task_id, min(created_at) as deployed_at
            from task_events
            where project_id = $1
              and event_type = 'task.status_changed'
              and (ref_json->>'to') = 'DEPLOYED'
            group by task_id
          ),
          durations as (
            select extract(epoch from (d.deployed_at - c.created_at)) as seconds
            from created c
            join deployed d on d.task_id = c.task_id
            where d.deployed_at >= c.created_at
          )
          select
            percentile_cont(0.5) within group (order by seconds) as p50,
            percentile_cont(0.9) within group (order by seconds) as p90,
            count(*)::text as n
          from durations
        `,
        [p.id, from ? from.toISOString() : null, to ? to.toISOString() : null],
      );

      res.status(200).json({
        project: { slug: p.slug, id: p.id },
        deployedCount: Number(dist.rows[0]?.n ?? 0),
        leadTimeSeconds: {
          p50: dist.rows[0]?.p50 ?? null,
          p90: dist.rows[0]?.p90 ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/failures', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getProjectBySlug(slug);
      if (!p) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (p.id !== req.apiAuth!.projectId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const from = parseDateParam(req.query.from);
      const to = parseDateParam(req.query.to);

      const byReason = await pool.query<{ reason: string | null; count: string }>(
        `
          select (ref_json->>'reason') as reason, count(*)::text as count
          from task_events
          where project_id = $1
            and event_type = 'task.status_changed'
            and (ref_json->>'to') = 'FAILED'
            and ($2::timestamptz is null or created_at >= $2::timestamptz)
            and ($3::timestamptz is null or created_at <= $3::timestamptz)
          group by reason
          order by count desc
          limit 50
        `,
        [p.id, from ? from.toISOString() : null, to ? to.toISOString() : null],
      );

      res.status(200).json({
        project: { slug: p.slug, id: p.id },
        failuresByReason: byReason.rows.map((r0) => ({ reason: r0.reason ?? 'unknown', count: Number(r0.count) })),
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
