import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';

import { tokenHash } from '../security/init-admin';
import { getProjectApiTokenByHash, markProjectApiTokenUsed } from '../db/api-tokens';
import { getProjectBySlug } from '../db/projects';
import { pool } from '../db/pool';
import { getTaskById, listTasksByProject } from '../db/tasks-v2';
import { listTaskEvents } from '../db/task-events';
import { listProjectWebhooks } from '../db/project-webhooks';
import { getProjectSecretPlain, setProjectSecret } from '../services/project-secure-config';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { processAsanaTaskStage5 } from '../services/pipeline-stage5';
import { insertTaskEvent } from '../db/task-events';
import {
  addProjectAsanaProject,
  addProjectGithubRepo,
  getProjectKnowledge,
  listProjectAsanaProjects,
  listProjectGithubRepos,
  removeProjectAsanaProject,
  removeProjectGithubRepo,
  setDefaultRepo,
  upsertProjectKnowledge,
} from '../db/project-settings';
import { addProjectContact, addProjectLink, deleteProjectContact, deleteProjectLink, listProjectContacts, listProjectLinks } from '../db/project-links';
import { getAsanaFieldConfig, listAsanaStatusMap } from '../db/asana-config';
import { listRepoMap } from '../db/repo-map';
import { attachPrToTaskById, updateTaskStatusById } from '../db/tasks-v2';
import { setMergeCommitShaByTaskId } from '../db/tasks-extra';
import { finalizeTaskIfReady } from '../services/finalize';
import { getAgentRunById, listAgentRunLogs, listAgentRunsByProject } from '../db/agent-runs';
import { enqueueJob } from '../db/job-queue';
import { getIntegrationByProjectType } from '../db/integrations';
import { getOauthCredentials } from '../db/oauth-credentials';
import { disconnectOpenCodeIntegration, startOpenCodeOauth } from '../services/opencode-oauth';
import {
  getOpenCodeProjectConfig,
  normalizeDenyPaths,
  normalizeMaxFilesChanged,
  normalizeWriteMode,
} from '../services/opencode-runner';

type AuthedReq = Request & { apiAuth?: { projectId: string; tokenId: string } };

async function getAuthedProject(req: AuthedReq, slug: string): Promise<{ id: string; slug: string; name: string } | null> {
  const p = await getProjectBySlug(slug);
  if (!p) return null;
  if (p.id !== req.apiAuth!.projectId) return null;
  return p;
}

function parseOwnerRepo(value: string): { owner: string; repo: string } | null {
  const v = String(value ?? '').trim();
  const parts = v.split('/');
  if (parts.length !== 2) return null;
  const owner = parts[0]?.trim();
  const repo = parts[1]?.trim();
  if (!owner || !repo) return null;
  return { owner, repo };
}

function parsePrNumber(input: string): number | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/\/pull\/(\d+)/);
  if (m) return Number(m[1]);
  return null;
}

function parseDateParam(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveBaseUrl(req: Request): string {
  const envBase = String(process.env.PUBLIC_BASE_URL ?? '').trim();
  return envBase || String(req.protocol + '://' + req.get('host'));
}

function ensureSafeReturnUrl(raw: string, baseUrl: string): string {
  if (!raw) return '/app';
  if (raw.startsWith('/')) return raw;
  try {
    const base = new URL(baseUrl);
    const url = new URL(raw, base);
    if (url.origin !== base.origin) return '/app';
    return `${url.pathname}${url.search}${url.hash}` || '/app';
  } catch {
    return '/app';
  }
}

function formatPolicy(policy: { writeMode: string; denyPaths: string[]; maxFilesChanged: number | null }): {
  write_mode: string;
  deny_paths: string[];
  max_files_changed: number | null;
} {
  return {
    write_mode: policy.writeMode,
    deny_paths: policy.denyPaths,
    max_files_changed: policy.maxFilesChanged,
  };
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

  r.get('/openapi.json', async (_req: Request, res: Response) => {
    const baseUrl = String(process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`);

    const slugParam = {
      name: 'slug',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    };

    const idParam = {
      name: 'id',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    };

    res.status(200).json({
      openapi: '3.0.0',
      info: {
        title: 'auto-flow API',
        version: '1.0.0',
        description: [
          'Auto-Flow API.',
          '',
          'Policies',
          '- write_mode: pr_only | working_tree | read_only (server-runner supports pr_only)',
          '- deny_paths: newline/comma-separated glob patterns',
          '- max_files_changed: integer limit or null',
        ].join('\n'),
      },
      servers: [{ url: baseUrl }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ bearerAuth: [] }],
      paths: {
        '/api/v1/projects/{slug}/summary': {
          get: {
            summary: 'Project summary',
            tags: ['analytics'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' }, 403: { description: 'Forbidden' } },
          },
        },
        '/api/v1/projects/{slug}/settings': {
          get: {
            summary: 'Get project settings',
            tags: ['settings'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks': {
          get: {
            summary: 'List tasks',
            tags: ['tasks'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}': {
          get: {
            summary: 'Get task',
            tags: ['tasks'],
            parameters: [slugParam, idParam],
            responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/events': {
          get: {
            summary: 'List task events',
            tags: ['events'],
            parameters: [slugParam, idParam],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/actions/retry': {
          post: {
            summary: 'Retry pipeline',
            tags: ['actions'],
            parameters: [slugParam, idParam],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/actions/resync': {
          post: {
            summary: 'Re-sync from Asana',
            tags: ['actions'],
            parameters: [slugParam, idParam],
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/actions/note': {
          post: {
            summary: 'Post note to Asana + timeline',
            tags: ['actions'],
            parameters: [slugParam, idParam],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { note: { type: 'string' } },
                    required: ['note'],
                  },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/actions/change-repo': {
          post: {
            summary: 'Change repo (pre-issue only)',
            tags: ['actions'],
            parameters: [slugParam, idParam],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { repo: { type: 'string', example: 'owner/repo' } },
                    required: ['repo'],
                  },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/actions/force-pr': {
          post: {
            summary: 'Force link PR by number/url',
            tags: ['actions'],
            parameters: [slugParam, idParam],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      pr: { type: 'string' },
                      repo: { type: 'string', nullable: true, description: 'Optional owner/repo' },
                    },
                    required: ['pr'],
                  },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
        '/api/v1/projects/{slug}/tasks/{id}/actions/opencode-run': {
          post: {
            summary: 'Trigger OpenCode run for a task',
            tags: ['actions'],
            parameters: [slugParam, idParam],
            responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' } },
          },
        },
        '/api/v1/projects/{slug}/links': {
          get: { summary: 'List links', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
          post: { summary: 'Add link', tags: ['settings'], parameters: [slugParam], responses: { 201: { description: 'Created' } } },
        },
        '/api/v1/projects/{slug}/links/{id}': {
          delete: { summary: 'Delete link', tags: ['settings'], parameters: [slugParam, idParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/contacts': {
          get: { summary: 'List contacts', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
          post: { summary: 'Add contact', tags: ['settings'], parameters: [slugParam], responses: { 201: { description: 'Created' } } },
        },
        '/api/v1/projects/{slug}/contacts/{id}': {
          delete: { summary: 'Delete contact', tags: ['settings'], parameters: [slugParam, idParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/repos': {
          get: { summary: 'List repos', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
          post: { summary: 'Add repo', tags: ['settings'], parameters: [slugParam], responses: { 201: { description: 'Created' } } },
          delete: { summary: 'Delete repo', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/repos/default': {
          post: { summary: 'Set default repo', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/integrations/opencode': {
          get: {
            summary: 'Get OpenCode integration status',
            tags: ['integrations'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
          },
        },
        '/api/v1/projects/{slug}/integrations/opencode/oauth/start': {
          post: {
            summary: 'Start OpenCode OAuth',
            tags: ['integrations'],
            parameters: [slugParam],
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      redirect_mode: { type: 'string', example: 'server' },
                      return_url: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
          },
        },
        '/api/v1/projects/{slug}/integrations/opencode/disconnect': {
          post: {
            summary: 'Disconnect OpenCode integration',
            tags: ['integrations'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
          },
        },
        '/api/v1/projects/{slug}/opencode/policy': {
          get: {
            summary: 'Get OpenCode policy settings',
            tags: ['opencode'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
          },
          put: {
            summary: 'Update OpenCode policy settings',
            tags: ['opencode'],
            parameters: [slugParam],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      write_mode: { type: 'string', example: 'pr_only' },
                      deny_paths: { type: 'array', items: { type: 'string' } },
                      max_files_changed: { type: 'integer', nullable: true },
                    },
                  },
                },
              },
            },
            responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' } },
          },
        },
        '/api/v1/projects/{slug}/opencode/runs': {
          get: {
            summary: 'List OpenCode agent runs',
            tags: ['opencode'],
            parameters: [slugParam],
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
          },
        },
        '/api/v1/projects/{slug}/opencode/runs/{id}': {
          get: {
            summary: 'Get OpenCode agent run + logs',
            tags: ['opencode'],
            parameters: [slugParam, idParam],
            responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' }, 404: { description: 'Not found' } },
          },
        },
        '/api/v1/projects/{slug}/asana-projects': {
          get: { summary: 'List Asana projects', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
          post: { summary: 'Add Asana project', tags: ['settings'], parameters: [slugParam], responses: { 201: { description: 'Created' } } },
          delete: { summary: 'Delete Asana project', tags: ['settings'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/funnel': {
          get: { summary: 'Conversion funnel', tags: ['analytics'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/lead-time': {
          get: { summary: 'Lead time (p50/p90)', tags: ['analytics'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/failures': {
          get: { summary: 'Failures by reason', tags: ['analytics'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/webhooks/health': {
          get: { summary: 'Webhook health', tags: ['health'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
        '/api/v1/projects/{slug}/jobs/health': {
          get: { summary: 'Queue health', tags: ['health'], parameters: [slugParam], responses: { 200: { description: 'OK' } } },
        },
      },
    });
  });

  r.get('/projects/:slug/summary', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
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
      const p = await getAuthedProject(req, slug);
      if (!p) {
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
      const p = await getAuthedProject(req, slug);
      if (!p) {
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
      const p = await getAuthedProject(req, slug);
      if (!p) {
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

  r.get('/projects/:slug/tasks', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const status = String(req.query.status ?? '').trim();
      const tasks = await listTasksByProject(p.id, status ? (status as any) : undefined);
      res.status(200).json({ project: { slug: p.slug, id: p.id }, tasks });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/tasks/:id', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const taskId = String(req.params.id);
      const task = await getTaskById(taskId);
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      res.status(200).json({ project: { slug: p.slug, id: p.id }, task });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/settings', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const asanaProjects = await listProjectAsanaProjects(p.id);
      const repos = await listProjectGithubRepos(p.id);
      const links = await listProjectLinks(p.id);
      const contacts = await listProjectContacts(p.id);
      const knowledge = await getProjectKnowledge(p.id);
      const asanaFields = await getAsanaFieldConfig(p.id);
      const statusMap = await listAsanaStatusMap(p.id);
      const repoMap = await listRepoMap(p.id);

      res.status(200).json({
        project: { slug: p.slug, id: p.id, name: p.name },
        asanaProjects,
        repos,
        links,
        contacts,
        knowledge,
        asanaFields,
        statusMap,
        repoMap,
      });
    } catch (err) {
      next(err);
    }
  });

  r.put('/projects/:slug/settings/knowledge', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const markdown = String((req.body as any)?.markdown ?? '');
      await upsertProjectKnowledge(p.id, markdown);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/links', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.status(200).json({ project: { slug: p.slug, id: p.id }, links: await listProjectLinks(p.id) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/links', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const kind = String((req.body as any)?.kind ?? '').trim();
      const url = String((req.body as any)?.url ?? '').trim();
      const title = String((req.body as any)?.title ?? '').trim();
      const tags = String((req.body as any)?.tags ?? '').trim();
      if (!kind || !url) {
        res.status(400).json({ error: 'kind and url are required' });
        return;
      }
      await addProjectLink({ projectId: p.id, kind, url, title: title || null, tags: tags || null });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/projects/:slug/links/:id', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      await deleteProjectLink({ projectId: p.id, id: String(req.params.id) });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/contacts', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.status(200).json({ project: { slug: p.slug, id: p.id }, contacts: await listProjectContacts(p.id) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/contacts', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const role = String((req.body as any)?.role ?? '').trim();
      const name = String((req.body as any)?.name ?? '').trim();
      const handle = String((req.body as any)?.handle ?? '').trim();
      if (!role) {
        res.status(400).json({ error: 'role is required' });
        return;
      }
      await addProjectContact({ projectId: p.id, role, name: name || null, handle: handle || null });
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/projects/:slug/contacts/:id', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      await deleteProjectContact({ projectId: p.id, id: String(req.params.id) });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/integrations/opencode', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const integration = await getIntegrationByProjectType(p.id, 'opencode');
      if (!integration) {
        res.status(200).json({ status: 'disabled', connected_at: null, expires_at: null, scopes: [], last_error: null });
        return;
      }

      const creds = await getOauthCredentials({ integrationId: integration.id, provider: 'openai' });
      res.status(200).json({
        status: integration.status,
        connected_at: integration.connected_at,
        expires_at: creds?.expires_at ?? null,
        scopes: creds?.scopes ? String(creds.scopes).split(/\s+/).filter(Boolean) : [],
        last_error: integration.last_error,
      });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/integrations/opencode/oauth/start', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const returnUrlRaw = String((req.body as any)?.return_url ?? '').trim();
      const fallbackUrl = `/p/${encodeURIComponent(p.slug)}/integrations/opencode`;
      const returnUrl = ensureSafeReturnUrl(returnUrlRaw || fallbackUrl, resolveBaseUrl(req));
      const redirectBaseUrl = resolveBaseUrl(req);

      const result = await startOpenCodeOauth({
        projectId: p.id,
        userId: null,
        returnUrl,
        redirectBaseUrl,
      });

      res.status(200).json({ authorize_url: result.authorizeUrl, state: result.state, expires_at: result.expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/integrations/opencode/disconnect', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await disconnectOpenCodeIntegration({ projectId: p.id });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/opencode/runs', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const limitRaw = Number.parseInt(String(req.query.limit ?? '').trim(), 10);
      const runs = await listAgentRunsByProject({ projectId: p.id, limit: Number.isFinite(limitRaw) ? limitRaw : 50 });
      res.status(200).json({ runs });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/opencode/runs/:id', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const runId = String(req.params.id);
      const run = await getAgentRunById({ projectId: p.id, runId });
      if (!run) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const limitRaw = Number.parseInt(String(req.query.limit ?? '').trim(), 10);
      const logs = await listAgentRunLogs({ runId, limit: Number.isFinite(limitRaw) ? limitRaw : 200 });
      res.status(200).json({ run, logs });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/opencode/policy', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const cfg = await getOpenCodeProjectConfig(p.id);
      res.status(200).json({ policy: formatPolicy(cfg.policy) });
    } catch (err) {
      next(err);
    }
  });

  r.put('/projects/:slug/opencode/policy', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const body = req.body as any;

      if (Object.prototype.hasOwnProperty.call(body, 'write_mode')) {
        const normalized = normalizeWriteMode(body?.write_mode ?? null);
        if (!normalized && String(body?.write_mode ?? '').trim()) {
          res.status(400).json({ error: 'Invalid write_mode', error_code: 'OPENCODE_POLICY_INVALID_WRITE_MODE' });
          return;
        }
        await setProjectSecret(p.id, 'OPENCODE_POLICY_WRITE_MODE', normalized ?? '');
      }

      if (Object.prototype.hasOwnProperty.call(body, 'deny_paths')) {
        const raw = Array.isArray(body.deny_paths) ? body.deny_paths.join('\n') : String(body.deny_paths ?? '');
        const normalized = normalizeDenyPaths(raw).join('\n');
        await setProjectSecret(p.id, 'OPENCODE_POLICY_DENY_PATHS', normalized);
      }

      if (Object.prototype.hasOwnProperty.call(body, 'max_files_changed')) {
        const rawValue = body.max_files_changed;
        if (rawValue === null || rawValue === '') {
          await setProjectSecret(p.id, 'OPENCODE_POLICY_MAX_FILES_CHANGED', '');
        } else {
          const normalized = normalizeMaxFilesChanged(String(rawValue));
          if (!normalized) {
            res.status(400).json({ error: 'Invalid max_files_changed', error_code: 'OPENCODE_POLICY_INVALID_MAX_FILES' });
            return;
          }
          await setProjectSecret(p.id, 'OPENCODE_POLICY_MAX_FILES_CHANGED', String(normalized));
        }
      }

      const cfg = await getOpenCodeProjectConfig(p.id);
      res.status(200).json({ policy: formatPolicy(cfg.policy) });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/repos', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.status(200).json({ project: { slug: p.slug, id: p.id }, repos: await listProjectGithubRepos(p.id) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/repos', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const owner = String((req.body as any)?.owner ?? '').trim();
      const repo = String((req.body as any)?.repo ?? '').trim();
      const isDefault = Boolean((req.body as any)?.is_default);
      if (!owner || !repo) {
        res.status(400).json({ error: 'owner and repo are required' });
        return;
      }
      await addProjectGithubRepo(p.id, owner, repo, isDefault);
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/repos/default', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const owner = String((req.body as any)?.owner ?? '').trim();
      const repo = String((req.body as any)?.repo ?? '').trim();
      if (!owner || !repo) {
        res.status(400).json({ error: 'owner and repo are required' });
        return;
      }
      await setDefaultRepo(p.id, owner, repo);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/projects/:slug/repos', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const owner = String((req.body as any)?.owner ?? '').trim();
      const repo = String((req.body as any)?.repo ?? '').trim();
      if (!owner || !repo) {
        res.status(400).json({ error: 'owner and repo are required' });
        return;
      }
      await removeProjectGithubRepo(p.id, owner, repo);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get('/projects/:slug/asana-projects', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.status(200).json({ project: { slug: p.slug, id: p.id }, asanaProjects: await listProjectAsanaProjects(p.id) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/asana-projects', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const asanaProjectGid = String((req.body as any)?.asana_project_gid ?? '').trim();
      if (!asanaProjectGid) {
        res.status(400).json({ error: 'asana_project_gid is required' });
        return;
      }
      await addProjectAsanaProject(p.id, asanaProjectGid);
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/projects/:slug/asana-projects', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const asanaProjectGid = String((req.body as any)?.asana_project_gid ?? '').trim();
      if (!asanaProjectGid) {
        res.status(400).json({ error: 'asana_project_gid is required' });
        return;
      }
      await removeProjectAsanaProject(p.id, asanaProjectGid);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/tasks/:id/actions/retry', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const task = await getTaskById(String(req.params.id));
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const asanaProjects = await listProjectAsanaProjects(p.id);
      const asanaProjectGid = asanaProjects[0];
      if (!asanaProjectGid) {
        res.status(400).json({ error: 'No Asana project GIDs configured' });
        return;
      }

      await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
      await insertTaskEvent({
        taskId: task.id,
        kind: 'api.action',
        source: 'api',
        refJson: { action: 'retry', tokenId: req.apiAuth!.tokenId },
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/tasks/:id/actions/resync', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    // Same behavior as retry: pull Asana and run stage5 pipeline.
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const task = await getTaskById(String(req.params.id));
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const asanaProjects = await listProjectAsanaProjects(p.id);
      const asanaProjectGid = asanaProjects[0];
      if (!asanaProjectGid) {
        res.status(400).json({ error: 'No Asana project GIDs configured' });
        return;
      }

      await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
      await insertTaskEvent({
        taskId: task.id,
        kind: 'api.action',
        source: 'api',
        refJson: { action: 'resync', tokenId: req.apiAuth!.tokenId },
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/tasks/:id/actions/opencode-run', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const task = await getTaskById(String(req.params.id));
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (!task.github_issue_number) {
        res.status(400).json({ error: 'Task has no GitHub issue yet', error_code: 'OPENCODE_TASK_NO_ISSUE' });
        return;
      }

      if (task.github_pr_number) {
        res.status(400).json({ error: 'Task already has a PR linked', error_code: 'OPENCODE_TASK_HAS_PR' });
        return;
      }

      const cfg = await getOpenCodeProjectConfig(p.id);
      const policy = formatPolicy(cfg.policy);

      if (cfg.mode === 'off') {
        res.status(400).json({ error: 'OpenCode mode is off', error_code: 'OPENCODE_DISABLED', policy });
        return;
      }

      if (cfg.mode === 'server-runner' && cfg.policy.writeMode !== 'pr_only') {
        res.status(400).json({
          error: `Policy write_mode=${cfg.policy.writeMode} is not supported by server-runner`,
          error_code: 'OPENCODE_POLICY_WRITE_MODE',
          policy,
        });
        return;
      }

      if (cfg.mode === 'server-runner' && !cfg.workspaceRoot) {
        res.status(400).json({ error: 'Missing OPENCODE_WORKSPACE_ROOT', error_code: 'OPENCODE_WORKSPACE_ROOT_MISSING', policy });
        return;
      }

      if (cfg.mode === 'server-runner' && cfg.authMode === 'local-cli' && !cfg.localCliReady) {
        res.status(400).json({
          error: 'Local CLI not ready',
          error_code: 'OPENCODE_LOCAL_CLI_NOT_READY',
          policy,
        });
        return;
      }

      if (cfg.mode === 'server-runner') {
        await enqueueJob({
          projectId: p.id,
          provider: 'internal',
          kind: 'opencode.run',
          payload: { projectId: p.id, taskId: task.id },
        });
        await insertTaskEvent({
          taskId: task.id,
          kind: 'api.action',
          source: 'api',
          refJson: { action: 'opencode.run', mode: 'server-runner', tokenId: req.apiAuth!.tokenId },
        });
        res.status(200).json({ ok: true, mode: 'server-runner', job_enqueued: true, policy });
        return;
      }

      const repoOwner = task.github_repo_owner;
      const repoName = task.github_repo_name;
      if (!repoOwner || !repoName) {
        res.status(400).json({ error: 'Missing repo metadata on task', error_code: 'OPENCODE_REPO_MISSING', policy });
        return;
      }

      const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
      if (!ghToken) {
        res.status(400).json({ error: 'Missing GITHUB_TOKEN', error_code: 'GITHUB_TOKEN_MISSING', policy });
        return;
      }

      const gh = new GithubClient(ghToken, repoOwner, repoName);
      await gh.addIssueComment(task.github_issue_number, cfg.command);
      await insertTaskEvent({
        taskId: task.id,
        kind: 'api.action',
        source: 'api',
        message: `OpenCode trigger posted: ${cfg.command}`,
        refJson: { action: 'opencode.run', mode: 'github-actions', tokenId: req.apiAuth!.tokenId },
      });
      res.status(200).json({ ok: true, mode: 'github-actions', comment: cfg.command, policy });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/tasks/:id/actions/note', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const task = await getTaskById(String(req.params.id));
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const note = String((req.body as any)?.note ?? '').trim();
      if (!note) {
        res.status(400).json({ error: 'note is required' });
        return;
      }

      const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
      if (!asanaPat) {
        res.status(400).json({ error: 'Missing ASANA_PAT' });
        return;
      }

      const asana = new AsanaClient(asanaPat);
      await asana.addComment(task.asana_gid, note);
      await insertTaskEvent({
        taskId: task.id,
        kind: 'api.action',
        source: 'api',
        refJson: { action: 'note', tokenId: req.apiAuth!.tokenId },
        message: note,
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/tasks/:id/actions/change-repo', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const task = await getTaskById(String(req.params.id));
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (task.github_issue_number) {
        res.status(400).json({ error: 'Cannot change repo after issue creation' });
        return;
      }

      const repo = parseOwnerRepo(String((req.body as any)?.repo ?? ''));
      if (!repo) {
        res.status(400).json({ error: 'repo must be owner/repo' });
        return;
      }

      const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
      if (!asanaPat) {
        res.status(400).json({ error: 'Missing ASANA_PAT' });
        return;
      }

      const fields = await getAsanaFieldConfig(p.id);
      if (!fields?.repo_field_gid) {
        res.status(400).json({ error: 'Missing repo_field_gid in asana_field_config' });
        return;
      }

      const asana = new AsanaClient(asanaPat);
      const options = await asana.getEnumOptionsForCustomField(fields.repo_field_gid);
      const opt = options.find((o) => o.name.trim() === `${repo.owner}/${repo.repo}`);
      if (!opt) {
        res.status(400).json({ error: 'Repo option not found in Asana Repo field. Sync options first.' });
        return;
      }

      await asana.setTaskCustomFields(task.asana_gid, { [fields.repo_field_gid]: opt.gid });

      const asanaProjects = await listProjectAsanaProjects(p.id);
      const asanaProjectGid = asanaProjects[0];
      if (!asanaProjectGid) {
        res.status(400).json({ error: 'No Asana project GIDs configured' });
        return;
      }

      await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
      await insertTaskEvent({
        taskId: task.id,
        kind: 'api.action',
        source: 'api',
        refJson: { action: 'change_repo', repo: `${repo.owner}/${repo.repo}`, tokenId: req.apiAuth!.tokenId },
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/tasks/:id/actions/force-pr', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const task = await getTaskById(String(req.params.id));
      if (!task || task.project_id !== p.id) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (!task.github_issue_number) {
        res.status(400).json({ error: 'Task has no GitHub issue yet' });
        return;
      }

      const prNumber = parsePrNumber(String((req.body as any)?.pr ?? ''));
      if (!prNumber) {
        res.status(400).json({ error: 'Invalid pr (number or URL)' });
        return;
      }

      const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
      if (!ghToken) {
        res.status(400).json({ error: 'Missing GITHUB_TOKEN' });
        return;
      }

      const repoRaw = String((req.body as any)?.repo ?? '').trim();
      const selected = repoRaw ? parseOwnerRepo(repoRaw) : null;
      const fallback = task.github_repo_owner && task.github_repo_name ? { owner: task.github_repo_owner, repo: task.github_repo_name } : null;
      const repos = await listProjectGithubRepos(p.id);
      const def = repos.find((r) => r.is_default) ?? repos[0] ?? null;
      const repo = selected ?? fallback ?? (def ? { owner: def.owner, repo: def.repo } : null);
      if (!repo) {
        res.status(400).json({ error: 'No repo configured' });
        return;
      }

      const gh = new GithubClient(ghToken, repo.owner, repo.repo);
      const pr = await gh.getPullRequest(prNumber);
      if (!pr.html_url) {
        res.status(400).json({ error: 'Could not resolve PR' });
        return;
      }

      await attachPrToTaskById({ taskId: task.id, prNumber: pr.number, prUrl: pr.html_url, sha: pr.head_sha || undefined });
      await updateTaskStatusById(task.id, pr.merged ? 'WAITING_CI' : 'PR_CREATED');
      if (pr.merged && pr.merge_commit_sha) {
        await setMergeCommitShaByTaskId({ taskId: task.id, sha: pr.merge_commit_sha });
      }

      const refreshed = await getTaskById(task.id);
      if (refreshed) {
        const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
        if (asanaPat) {
          const asana = new AsanaClient(asanaPat);
          await finalizeTaskIfReady({ task: refreshed, asana, github: gh });
        }
      }

      await insertTaskEvent({
        taskId: task.id,
        kind: 'api.action',
        source: 'api',
        refJson: { action: 'force_pr', prNumber: pr.number, prUrl: pr.html_url, tokenId: req.apiAuth!.tokenId },
      });

      res.status(200).json({ ok: true, pr: { number: pr.number, url: pr.html_url, merged: pr.merged } });
    } catch (err) {
      next(err);
    }
  });

  // Basic funnel computed from tasks (fast path). Event-based funnel can be added later.
  r.get('/projects/:slug/funnel', requireProjectToken, async (req: AuthedReq, res: Response, next) => {
    try {
      const slug = String(req.params.slug);
      const p = await getAuthedProject(req, slug);
      if (!p) {
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
      const p = await getAuthedProject(req, slug);
      if (!p) {
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
      const p = await getAuthedProject(req, slug);
      if (!p) {
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
