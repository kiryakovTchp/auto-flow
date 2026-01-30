import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { getEnv } from '../config/env';
import { tokenHash } from '../security/init-admin';
import { authenticateUser, newSessionId, requireSessionJson, SESSION_COOKIE } from '../security/sessions';
import { consumeInvite, createInvite, createSession, createUser, deleteSession, getInviteByTokenHash, getUserByUsername } from '../db/auth';
import { createProjectApiToken, listProjectApiTokens, revokeProjectApiToken } from '../db/api-tokens';
import { getAgentRunById, insertAgentRunLog, listAgentRunLogs, listAgentRunsByProject, updateAgentRun } from '../db/agent-runs';
import { getAsanaFieldConfig, listAsanaStatusMap, upsertAsanaFieldConfig, upsertAsanaStatusMap, deleteAsanaStatusMap } from '../db/asana-config';
import { createMembership, createProject, getMembership, getProjectBySlug, listProjects, listProjectsForUser } from '../db/projects';
import { listProjectWebhooks, upsertProjectWebhook } from '../db/project-webhooks';
import { listRepoMap, upsertRepoMap, deleteRepoMap } from '../db/repo-map';
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
  type ProjectSecretKey,
  deleteProjectSecret,
} from '../db/project-settings';
import { addProjectContact, addProjectLink, deleteProjectContact, deleteProjectLink, listProjectContacts, listProjectLinks } from '../db/project-links';
import { getIntegrationByProjectType } from '../db/integrations';
import { getOauthCredentials } from '../db/oauth-credentials';
import { enqueueJob, listJobQueueByProject } from '../db/job-queue';
import { listTaskEvents, insertTaskEvent } from '../db/task-events';
import { getLatestTaskSpec, listTaskSpecs } from '../db/taskspecs';
import { attachPrToTaskById, getTaskById, getTaskByProjectAsanaGid, listTasksByProject, updateTaskStatusById, type TaskStatus } from '../db/tasks-v2';
import { setMergeCommitShaByTaskId } from '../db/tasks-extra';
import { pool } from '../db/pool';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { finalizeTaskIfReady } from '../services/finalize';
import { importAsanaTasksForProject } from '../services/import-from-asana';
import { processAsanaTaskStage5 } from '../services/pipeline-stage5';
import { getProjectSecretPlain, repairProjectSecrets, setProjectSecret } from '../services/project-secure-config';
import { getRuntimeConfig } from '../services/secure-config';
import { syncReposToAsanaRepoField } from '../services/sync-repos-to-asana';
import { joinUrl } from '../services/url';
import {
  getOpenCodeProjectConfig,
  normalizeAuthMode,
  normalizeDenyPaths,
  normalizeMaxFilesChanged,
  normalizeOpenCodeCommand,
  normalizeOpenCodeMode,
  normalizeLogMode,
  normalizeTimeoutMinutes,
  normalizeWriteMode,
} from '../services/opencode-runner';
import { disconnectOpenCodeIntegration, startOpenCodeOauth } from '../services/opencode-oauth';
import { buildTokenRemote, ensureRepoCache } from '../services/opencode-workspace';
import { cancelRunProcess } from '../services/opencode-runner-cancel';

type AuthedReq = Request & { auth?: { userId: string; username: string } };

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function resolveBaseUrl(req: Request): string {
  const envBase = String(process.env.PUBLIC_BASE_URL ?? '').trim();
  return envBase || String(req.protocol + '://' + req.get('host'));
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

async function getProjectAccess(req: AuthedReq, res: Response, slug: string, opts?: { admin?: boolean; editor?: boolean }): Promise<{
  project: { id: string; slug: string; name: string; created_at: string };
  membership: { role: 'admin' | 'editor' | 'viewer' };
} | null> {
  const p = await getProjectBySlug(slug);
  if (!p) {
    jsonError(res, 404, 'Project not found');
    return null;
  }

  const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
  if (!membership) {
    jsonError(res, 403, 'Forbidden');
    return null;
  }

  if (opts?.admin && membership.role !== 'admin') {
    jsonError(res, 403, 'Admin role required');
    return null;
  }

  if (opts?.editor && membership.role !== 'admin' && membership.role !== 'editor') {
    jsonError(res, 403, 'Editor role required');
    return null;
  }

  return { project: p, membership };
}

async function getIntegrationStatus(projectId: string): Promise<{ asana: boolean; github: boolean; opencode: boolean }> {
  const [asanaPat, ghToken, asanaProjects, repos, opencodeIntegration] = await Promise.all([
    getProjectSecretPlain(projectId, 'ASANA_PAT'),
    getProjectSecretPlain(projectId, 'GITHUB_TOKEN'),
    listProjectAsanaProjects(projectId),
    listProjectGithubRepos(projectId),
    getIntegrationByProjectType(projectId, 'opencode'),
  ]);

  return {
    asana: Boolean(asanaPat) && asanaProjects.length > 0,
    github: Boolean(ghToken) && repos.length > 0,
    opencode: opencodeIntegration?.status === 'connected',
  };
}

function mapTaskRow(row: any): any {
  return {
    id: row.id,
    title: row.title ?? '',
    status: row.status,
    asanaTaskId: row.asana_gid,
    githubIssueUrl: row.github_issue_url,
    githubPrUrl: row.github_pr_url,
    ciUrl: row.ci_url,
    githubIssueNumber: row.github_issue_number,
    githubPrNumber: row.github_pr_number,
    repo: row.github_repo_owner && row.github_repo_name ? `${row.github_repo_owner}/${row.github_repo_name}` : null,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSpecRow(row: any): any {
  return {
    id: row.id,
    taskId: row.task_id,
    version: row.version,
    content: row.markdown,
    createdAt: row.created_at,
  };
}

function mapEventRow(row: any): any {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.event_type ?? row.kind,
    message: row.message ?? '',
    createdAt: row.created_at,
    source: row.source ?? null,
    taskTitle: row.task_title ?? null,
  };
}

async function adoptLegacyTasksIfSoloProject(projectId: string, userId: string): Promise<number> {
  const userProjects = await listProjectsForUser(userId);
  if (userProjects.length !== 1) return 0;
  if (userProjects[0]?.id !== projectId) return 0;

  const legacyCountRes = await pool.query<{ count: string }>('select count(*) from tasks where project_id is null');
  const legacyCount = Number(legacyCountRes.rows[0]?.count ?? 0);
  if (!legacyCount) return 0;

  await pool.query('update tasks set project_id = $1 where project_id is null', [projectId]);
  await pool.query(
    `
      update task_events
      set project_id = $1
      where project_id is null
        and task_id in (select id from tasks where project_id = $1)
    `,
    [projectId],
  );

  return legacyCount;
}

export function uiApiRouter(): Router {
  const r = Router();

  r.post('/login', async (req: Request, res: Response) => {
    const username = String((req.body as any)?.username ?? '').trim();
    const password = String((req.body as any)?.password ?? '').trim();
    if (!username || !password) {
      jsonError(res, 400, 'username and password are required');
      return;
    }

    const auth = await authenticateUser(username, password);
    if (!auth) {
      jsonError(res, 401, 'Invalid username or password');
      return;
    }

    const sessionId = newSessionId();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    await createSession({ userId: auth.userId, sessionId, expiresAt });

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: expiresAt,
    });

    res.status(200).json({ user: { id: auth.userId, username } });
  });

  r.post('/logout', requireSessionJson, async (req: Request, res: Response) => {
    const sid = (req as any).cookies?.[SESSION_COOKIE];
    if (sid && typeof sid === 'string') {
      await deleteSession(sid);
    }
    res.clearCookie(SESSION_COOKIE);
    res.status(200).json({ ok: true });
  });

  r.get('/me', requireSessionJson, async (req: AuthedReq, res: Response) => {
    res.status(200).json({ user: { id: (req as any).auth.userId, username: (req as any).auth.username } });
  });

  r.post('/init', async (req: Request, res: Response) => {
    const env = getEnv();
    const initToken = env.INIT_ADMIN_TOKEN;
    const token = String((req.body as any)?.token ?? '').trim();
    const username = String((req.body as any)?.username ?? 'admin').trim();
    const password = String((req.body as any)?.password ?? '').trim();

    if (!initToken) {
      jsonError(res, 500, 'INIT_ADMIN_TOKEN is not set');
      return;
    }
    if (!token || token !== initToken) {
      jsonError(res, 403, 'Invalid init token');
      return;
    }
    if (!password || password.length < 8) {
      jsonError(res, 400, 'Password too short');
      return;
    }

    const existingAny = await getUserByUsername(username);
    if (existingAny) {
      jsonError(res, 400, 'User already exists');
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ username, passwordHash: hash });
    const p = await createProject({ slug: 'default', name: 'Default Project' });
    await createMembership({ userId: user.id, projectId: p.id, role: 'admin' });

    const sessionId = newSessionId();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    await createSession({ userId: user.id, sessionId, expiresAt });

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: expiresAt,
    });

    res.status(200).json({ user: { id: user.id, username: user.username }, project: { id: p.id, slug: p.slug, name: p.name } });
  });

  r.get('/invites/:token', async (req: Request, res: Response) => {
    const token = String(req.params.token);
    const inv = await getInviteByTokenHash(tokenHash(token));
    if (!inv) {
      jsonError(res, 404, 'Invite not found or expired');
      return;
    }
    res.status(200).json({ ok: true, expiresAt: inv.expires_at });
  });

  r.post('/invites/:token', async (req: Request, res: Response) => {
    const token = String(req.params.token);
    const inv = await getInviteByTokenHash(tokenHash(token));
    if (!inv) {
      jsonError(res, 404, 'Invite not found or expired');
      return;
    }

    const username = String((req.body as any)?.username ?? '').trim();
    const password = String((req.body as any)?.password ?? '').trim();
    if (!username || username.length < 3) {
      jsonError(res, 400, 'Username too short');
      return;
    }
    if (!password || password.length < 8) {
      jsonError(res, 400, 'Password too short');
      return;
    }

    const exists = await getUserByUsername(username);
    if (exists) {
      jsonError(res, 400, 'Username already exists');
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ username, passwordHash: hash });
    await consumeInvite(inv.id);

    let targetProjectId: string | null = null;
    if (inv.created_by) {
      const res = await pool.query<{ id: string }>(
        `
          select p.id
          from projects p
          join project_memberships m on m.project_id = p.id
          where m.user_id = $1
          order by p.created_at desc
          limit 1
        `,
        [inv.created_by],
      );
      targetProjectId = res.rows[0]?.id ?? null;
    }

    if (!targetProjectId) {
      const projects = await listProjects();
      targetProjectId = projects[0]?.id ?? null;
    }

    if (targetProjectId) {
      await createMembership({ userId: user.id, projectId: targetProjectId, role: 'viewer' });
    }

    const sessionId = newSessionId();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    await createSession({ userId: user.id, sessionId, expiresAt });

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: expiresAt,
    });

    res.status(200).json({ user: { id: user.id, username: user.username } });
  });

  r.post('/invites', requireSessionJson, async (req: AuthedReq, res: Response) => {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createInvite({ tokenHash: tokenHash(token), expiresAt, createdBy: (req as any).auth.userId });
    const base = resolveBaseUrl(req);
    const url = `${base}/invite/${encodeURIComponent(token)}`;
    res.status(200).json({ url, expiresAt: expiresAt.toISOString() });
  });

  r.use(requireSessionJson);

  r.get('/projects', async (req: AuthedReq, res: Response) => {
    const userId = (req as any).auth.userId;
    const rows = await pool.query<{
      id: string;
      slug: string;
      name: string;
      created_at: string;
      role: 'admin' | 'editor' | 'viewer';
      member_count: string;
    }>(
      `
        select p.id, p.slug, p.name, p.created_at, m.role,
               (select count(*)::text from project_memberships pm where pm.project_id = p.id) as member_count
        from projects p
        join project_memberships m on m.project_id = p.id
        where m.user_id = $1
        order by p.created_at desc
      `,
      [userId],
    );

    const projects = [] as any[];
    for (const row of rows.rows) {
      const integrations = await getIntegrationStatus(row.id);
      projects.push({
        id: row.id,
        slug: row.slug,
        name: row.name,
        createdAt: row.created_at,
        memberCount: Number(row.member_count ?? 0),
        role: row.role,
        integrations,
      });
    }

    res.status(200).json({ projects });
  });

  r.post('/projects', async (req: AuthedReq, res: Response) => {
    const slug = String((req.body as any)?.slug ?? '').trim();
    const name = String((req.body as any)?.name ?? '').trim();
    if (!slug || !name) {
      jsonError(res, 400, 'slug and name are required');
      return;
    }
    const p = await createProject({ slug, name });
    await createMembership({ userId: (req as any).auth.userId, projectId: p.id, role: 'admin' });
    res.status(201).json({ project: { id: p.id, slug: p.slug, name: p.name, createdAt: p.created_at } });
  });

  r.get('/projects/:slug', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;
    const integrations = await getIntegrationStatus(access.project.id);
    res.status(200).json({
      project: {
        id: access.project.id,
        slug: access.project.slug,
        name: access.project.name,
        createdAt: access.project.created_at,
      },
      role: access.membership.role,
      integrations,
    });
  });

  r.get('/projects/:slug/overview', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;

    await adoptLegacyTasksIfSoloProject(access.project.id, (req as any).auth.userId);
    const tasks = await listTasksByProject(access.project.id);
    const activeStatuses = new Set(['RECEIVED', 'TASKSPEC_CREATED', 'NEEDS_REPO', 'ISSUE_CREATED', 'PR_CREATED', 'WAITING_CI', 'BLOCKED']);
    const activeTasks = tasks.filter((t) => activeStatuses.has(t.status)).length;
    const prOpen = tasks.filter((t) => t.status === 'PR_CREATED' || t.status === 'WAITING_CI').length;
    const deployed = tasks.filter((t) => t.status === 'DEPLOYED').length;
    const failed = tasks.filter((t) => t.status === 'FAILED').length;
    const successRate = deployed + failed > 0 ? Math.round((deployed / (deployed + failed)) * 100) : null;

    const deployedDurations = tasks
      .filter((t) => t.status === 'DEPLOYED')
      .map((t) => (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24))
      .filter((n) => Number.isFinite(n));
    const avgCycleTimeDays = deployedDurations.length
      ? Number((deployedDurations.reduce((a, b) => a + b, 0) / deployedDurations.length).toFixed(1))
      : null;

    const recentTasks = tasks.slice(0, 5).map(mapTaskRow);

    const eventsRes = await pool.query(
      `
        select e.id, e.task_id, e.event_type, e.kind, e.message, e.source, e.created_at,
               t.title as task_title
        from task_events e
        left join tasks t on t.id = e.task_id
        where e.project_id = $1
        order by e.created_at desc
        limit 8
      `,
      [access.project.id],
    );
    const recentEvents = eventsRes.rows.map(mapEventRow);

    res.status(200).json({
      project: { id: access.project.id, slug: access.project.slug, name: access.project.name },
      stats: {
        activeTasks,
        prOpen,
        successRate,
        avgCycleTimeDays,
      },
      recentTasks,
      recentEvents,
      integrations: await getIntegrationStatus(access.project.id),
    });
  });

  r.get('/projects/:slug/tasks', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;

    await adoptLegacyTasksIfSoloProject(access.project.id, (req as any).auth.userId);
    const status = String(req.query.status ?? '').trim();
    const tasks = await listTasksByProject(access.project.id, status ? (status as TaskStatus) : undefined);
    res.status(200).json({ tasks: tasks.map(mapTaskRow) });
  });

  r.post('/projects/:slug/tasks', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
    const ghToken = await getProjectSecretPlain(access.project.id, 'GITHUB_TOKEN');
    if (!asanaPat || !ghToken) {
      jsonError(res, 400, 'Missing ASANA_PAT or GITHUB_TOKEN in project secrets');
      return;
    }

    const title = String((req.body as any)?.title ?? '').trim();
    const notes = String((req.body as any)?.notes ?? '').trim();
    if (!title) {
      jsonError(res, 400, 'Title is required');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asanaProjectGid = String((req.body as any)?.asana_project_gid ?? '').trim() || asanaProjects[0];
    if (!asanaProjectGid || !asanaProjects.includes(asanaProjectGid)) {
      jsonError(res, 400, 'Invalid Asana project');
      return;
    }

    const autoEnabled = Boolean((req.body as any)?.auto_enabled);
    const repoChoice = parseOwnerRepo(String((req.body as any)?.repo ?? ''));

    const asana = new AsanaClient(asanaPat);
    const created = await asana.createTask({ name: title, notes: notes || null, projects: [asanaProjectGid] });

    const fieldCfg = await getAsanaFieldConfig(access.project.id);
    if (fieldCfg) {
      const updates: Record<string, string | boolean | null> = {};
      if (fieldCfg.auto_field_gid) {
        let autoValue: string | boolean | null = autoEnabled;
        try {
          const createdTask = await asana.getTask(created.taskGid);
          const cfs = Array.isArray((createdTask as any)?.custom_fields) ? (createdTask as any).custom_fields : [];
          const f = cfs.find((x: any) => String(x?.gid ?? '') === String(fieldCfg.auto_field_gid));
          const subtype = typeof f?.resource_subtype === 'string' ? String(f.resource_subtype) : '';
          if (subtype === 'enum') {
            const options = await asana.getEnumOptionsForCustomField(fieldCfg.auto_field_gid);
            const opt = options.find((o) => String(o?.name ?? '').toLowerCase() === (autoEnabled ? 'true' : 'false'));
            if (!opt) {
              jsonError(res, 400, 'AutoTask field is enum but does not have True/False options');
              return;
            }
            autoValue = opt.gid;
          }
        } catch {
          // fall back to boolean
        }
        updates[fieldCfg.auto_field_gid] = autoValue;
      }

      if (repoChoice && fieldCfg.repo_field_gid) {
        const options = await asana.getEnumOptionsForCustomField(fieldCfg.repo_field_gid);
        const opt = options.find((o) => o.name.trim() === `${repoChoice.owner}/${repoChoice.repo}`);
        if (!opt) {
          jsonError(res, 400, 'Repo option not found in Asana Repo field. Sync repos first.');
          return;
        }
        updates[fieldCfg.repo_field_gid] = opt.gid;
      }

      if (Object.keys(updates).length) {
        await asana.setTaskCustomFields(created.taskGid, updates);
      }
    }

    await processAsanaTaskStage5({ projectId: access.project.id, asanaProjectGid, asanaTaskGid: created.taskGid });
    const row = await getTaskByProjectAsanaGid(access.project.id, created.taskGid);
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'manual.create_task',
        message: `Created from UI in Asana project ${asanaProjectGid}`,
        userId: (req as any).auth.userId,
      });
      res.status(201).json({ task: mapTaskRow(row) });
      return;
    }

    res.status(201).json({ ok: true });
  });

  r.get('/projects/:slug/tasks/:id', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;

    const taskId = String(req.params.id);
    await adoptLegacyTasksIfSoloProject(access.project.id, (req as any).auth.userId);
    const task = await getTaskById(taskId);
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    const specs = await listTaskSpecs(task.id);
    const latest = await getLatestTaskSpec(task.id);
    const events = await listTaskEvents(task.id);

    res.status(200).json({
      task: mapTaskRow(task),
      latestSpec: latest ? mapSpecRow(latest) : null,
      specs: specs.map(mapSpecRow),
      events: events.map(mapEventRow),
    });
  });

  r.post('/projects/:slug/tasks/:id/actions/retry', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      jsonError(res, 400, 'No Asana project GIDs configured');
      return;
    }

    await processAsanaTaskStage5({ projectId: access.project.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    await insertTaskEvent({ taskId: task.id, kind: 'manual.retry', message: 'Retry pipeline', userId: (req as any).auth.userId });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/tasks/:id/actions/resync', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      jsonError(res, 400, 'No Asana project GIDs configured');
      return;
    }

    await processAsanaTaskStage5({ projectId: access.project.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    await insertTaskEvent({ taskId: task.id, kind: 'manual.resync', message: 'Triggered manual resync from Asana', userId: (req as any).auth.userId });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/tasks/:id/actions/opencode-run', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    if (!task.github_issue_number) {
      jsonError(res, 400, 'Task has no GitHub issue yet');
      return;
    }

    if (task.github_pr_number) {
      jsonError(res, 400, 'Task already has a PR linked');
      return;
    }

    const cfg = await getOpenCodeProjectConfig(access.project.id);
    if (cfg.mode === 'off') {
      jsonError(res, 400, 'OpenCode mode is off');
      return;
    }

    if (cfg.mode === 'server-runner' && cfg.authMode === 'local-cli' && !cfg.localCliReady) {
      jsonError(res, 400, 'Local CLI not ready');
      return;
    }

    if (cfg.mode === 'server-runner') {
      await enqueueJob({
        projectId: access.project.id,
        provider: 'internal',
        kind: 'opencode.run',
        payload: { projectId: access.project.id, taskId: task.id },
      });
      await insertTaskEvent({ taskId: task.id, kind: 'opencode.job_enqueued', message: 'Manual OpenCode run enqueued', userId: (req as any).auth.userId });
      res.status(200).json({ ok: true, mode: 'server-runner' });
      return;
    }

    const repoOwner = task.github_repo_owner;
    const repoName = task.github_repo_name;
    if (!repoOwner || !repoName) {
      jsonError(res, 400, 'Missing repo metadata on task');
      return;
    }

    const ghToken = await getProjectSecretPlain(access.project.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      jsonError(res, 400, 'Missing GITHUB_TOKEN');
      return;
    }

    const gh = new GithubClient(ghToken, repoOwner, repoName);
    await gh.addIssueComment(task.github_issue_number, cfg.command);
    await insertTaskEvent({
      taskId: task.id,
      kind: 'github.issue_commented',
      message: `Manual OpenCode trigger posted: ${cfg.command}`,
      userId: (req as any).auth.userId,
      refJson: { issueNumber: task.github_issue_number, comment: cfg.command },
    });
    res.status(200).json({ ok: true, mode: 'github-actions' });
  });

  r.post('/projects/:slug/tasks/:id/actions/force-pr', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    if (!task.github_issue_number) {
      jsonError(res, 400, 'Task has no GitHub issue yet');
      return;
    }

    const prNumber = parsePrNumber(String((req.body as any)?.pr ?? ''));
    if (!prNumber) {
      jsonError(res, 400, 'Invalid PR (use number or PR URL)');
      return;
    }

    const repos = await listProjectGithubRepos(access.project.id);
    const repoChoiceRaw = String((req.body as any)?.repo ?? '').trim();
    const selected = repoChoiceRaw ? parseOwnerRepo(repoChoiceRaw) : null;
    const fallback = task.github_repo_owner && task.github_repo_name ? { owner: task.github_repo_owner, repo: task.github_repo_name } : null;
    const def = repos.find((r) => r.is_default) ?? repos[0] ?? null;
    const repoChoice = selected ?? fallback ?? (def ? { owner: def.owner, repo: def.repo } : null);
    if (!repoChoice) {
      jsonError(res, 400, 'No repo configured');
      return;
    }

    const ghToken = await getProjectSecretPlain(access.project.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      jsonError(res, 400, 'Missing GITHUB_TOKEN');
      return;
    }

    const gh = new GithubClient(ghToken, repoChoice.owner, repoChoice.repo);
    const pr = await gh.getPullRequest(prNumber);
    if (!pr.html_url) {
      jsonError(res, 400, 'Could not resolve PR');
      return;
    }

    await attachPrToTaskById({ taskId: task.id, prNumber: pr.number, prUrl: pr.html_url, sha: pr.head_sha || undefined });
    await updateTaskStatusById(task.id, pr.merged ? 'WAITING_CI' : 'PR_CREATED');
    if (pr.merged && pr.merge_commit_sha) {
      await setMergeCommitShaByTaskId({ taskId: task.id, sha: pr.merge_commit_sha });
    }

    const refreshed = await getTaskById(task.id);
    if (refreshed) {
      const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
      if (asanaPat) {
        const asana = new AsanaClient(asanaPat);
        await finalizeTaskIfReady({ task: refreshed, asana, github: gh });
      }
    }

    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.force_pr',
      message: `Linked PR #${pr.number} ${pr.html_url}`,
      userId: (req as any).auth.userId,
    });

    res.status(200).json({ ok: true, pr: { number: pr.number, url: pr.html_url, merged: pr.merged } });
  });

  r.post('/projects/:slug/tasks/:id/actions/note', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    const note = String((req.body as any)?.note ?? '').trim();
    if (!note) {
      jsonError(res, 400, 'Note is required');
      return;
    }

    const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
    if (!asanaPat) {
      jsonError(res, 400, 'Missing ASANA_PAT');
      return;
    }

    const asana = new AsanaClient(asanaPat);
    await asana.addComment(task.asana_gid, note);
    await insertTaskEvent({ taskId: task.id, kind: 'manual.note', message: note, userId: (req as any).auth.userId });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/tasks/:id/actions/change-repo', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    if (task.github_issue_number) {
      jsonError(res, 400, 'Cannot change repo after issue creation');
      return;
    }

    const repoChoice = parseOwnerRepo(String((req.body as any)?.repo ?? ''));
    if (!repoChoice) {
      jsonError(res, 400, 'Invalid repo');
      return;
    }

    const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
    if (!asanaPat) {
      jsonError(res, 400, 'Missing ASANA_PAT');
      return;
    }

    const fieldCfg = await getAsanaFieldConfig(access.project.id);
    if (!fieldCfg?.repo_field_gid) {
      jsonError(res, 400, 'Missing repo_field_gid in Asana field config');
      return;
    }

    const asana = new AsanaClient(asanaPat);
    const options = await asana.getEnumOptionsForCustomField(fieldCfg.repo_field_gid);
    const opt = options.find((o) => o.name.trim() === `${repoChoice.owner}/${repoChoice.repo}`);
    if (!opt) {
      jsonError(res, 400, 'Repo option not found in Asana Repo field. Sync repos first.');
      return;
    }

    await asana.setTaskCustomFields(task.asana_gid, { [fieldCfg.repo_field_gid]: opt.gid });
    await insertTaskEvent({ taskId: task.id, kind: 'manual.change_repo', message: `Changed repo to ${repoChoice.owner}/${repoChoice.repo}`, userId: (req as any).auth.userId });

    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      jsonError(res, 400, 'No Asana project GIDs configured');
      return;
    }

    await processAsanaTaskStage5({ projectId: access.project.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/tasks/:id/actions/create-issue', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const task = await getTaskById(String(req.params.id));
    if (!task || task.project_id !== access.project.id) {
      jsonError(res, 404, 'Task not found');
      return;
    }

    if (task.github_issue_number) {
      res.status(200).json({ ok: true });
      return;
    }

    if (task.status !== 'NEEDS_REPO') {
      jsonError(res, 400, 'Task is not in NEEDS_REPO state');
      return;
    }

    const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
    if (!asanaPat) {
      jsonError(res, 400, 'Missing ASANA_PAT');
      return;
    }

    const repoChoice = parseOwnerRepo(String((req.body as any)?.repo ?? ''));
    if (!repoChoice) {
      jsonError(res, 400, 'Invalid repo');
      return;
    }

    const fieldCfg = await getAsanaFieldConfig(access.project.id);
    if (!fieldCfg?.repo_field_gid) {
      jsonError(res, 400, 'Missing Asana repo field config (repo_field_gid)');
      return;
    }

    const asana = new AsanaClient(asanaPat);
    const options = await asana.getEnumOptionsForCustomField(fieldCfg.repo_field_gid);
    const opt = options.find((o) => o.name.trim() === `${repoChoice.owner}/${repoChoice.repo}`);
    if (!opt) {
      jsonError(res, 400, 'Repo option not found in Asana Repo field. Sync repos first.');
      return;
    }

    await asana.setTaskCustomFields(task.asana_gid, { [fieldCfg.repo_field_gid]: opt.gid });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.repo_set',
      message: `Set repo to ${repoChoice.owner}/${repoChoice.repo} (Asana custom field)`,
      userId: (req as any).auth.userId,
    });

    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      jsonError(res, 400, 'No Asana project GIDs configured');
      return;
    }

    await processAsanaTaskStage5({ projectId: access.project.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.issue_create',
      message: 'Triggered pipeline after setting repo',
      userId: (req as any).auth.userId,
    });

    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/import/asana', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { editor: true });
    if (!access) return;

    const daysRaw = String((req.body as any)?.days ?? '90');
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 90));
    try {
      const result = await importAsanaTasksForProject({ projectId: access.project.id, projectSlug: access.project.slug, days });
      res.status(200).json({ ok: true, result });
    } catch (err: any) {
      jsonError(res, 500, String(err?.message ?? err));
    }
  });

  r.get('/projects/:slug/webhooks', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;

    const base = resolveBaseUrl(req);
    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asanaUrls = asanaProjects.map((gid) => `${base}/webhooks/asana/${encodeURIComponent(access.project.slug)}?asana_project_gid=${encodeURIComponent(gid)}`);
    const githubUrl = `${base}/webhooks/github/${encodeURIComponent(access.project.slug)}`;
    const hooks = await listProjectWebhooks(access.project.id);

    res.status(200).json({
      githubUrl,
      asanaUrls,
      hooks: hooks.map((h) => ({
        provider: h.provider,
        asanaProjectGid: h.asana_project_gid,
        webhookGid: h.webhook_gid,
        targetUrl: h.target_url,
        lastDeliveryAt: h.last_delivery_at,
      })),
    });
  });

  r.post('/projects/:slug/webhooks/asana/setup', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
    if (!asanaPat) {
      jsonError(res, 400, 'Missing ASANA_PAT');
      return;
    }

    const baseUrl = String((req.body as any)?.public_base_url ?? '').trim();
    if (!baseUrl) {
      jsonError(res, 400, 'public_base_url required');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(access.project.id);
    const asana = new AsanaClient(asanaPat);

    for (const asanaProjectGid of asanaProjects) {
      const targetUrl = joinUrl(baseUrl, `/webhooks/asana/${encodeURIComponent(access.project.slug)}?asana_project_gid=${encodeURIComponent(asanaProjectGid)}`);
      const created = await asana.createWebhook({
        resourceGid: asanaProjectGid,
        targetUrl,
        filters: [
          { resource_type: 'task', action: 'added' },
          { resource_type: 'task', action: 'changed' },
        ],
      });

      await upsertProjectWebhook({
        projectId: access.project.id,
        provider: 'asana',
        asanaProjectGid,
        webhookGid: created.webhookGid,
        encryptedSecret: created.hookSecret
          ? (await import('../services/project-webhook-secrets')).encryptWebhookSecret(created.hookSecret)
          : null,
        targetUrl,
      });
    }

    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/webhooks/asana/sync-repos', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    try {
      const result = await syncReposToAsanaRepoField({ projectId: access.project.id });
      res.status(200).json({ ok: true, result });
    } catch (err: any) {
      jsonError(res, 500, String(err?.message ?? err));
    }
  });

  r.post('/projects/:slug/webhooks/github/validate', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const ghToken = await getProjectSecretPlain(access.project.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      jsonError(res, 400, 'Missing GITHUB_TOKEN');
      return;
    }

    const base = resolveBaseUrl(req);
    const expectedUrl = `${base}/webhooks/github/${encodeURIComponent(access.project.slug)}`;
    const repos = await listProjectGithubRepos(access.project.id);
    const report: string[] = [];

    for (const r0 of repos) {
      const gh = new GithubClient(ghToken, r0.owner, r0.repo);
      const hooks = await gh.listWebhooks();
      const match = hooks.find((h) => h.config?.url === expectedUrl);
      report.push(`${r0.owner}/${r0.repo}: ${match ? 'OK' : 'MISSING'}`);
    }

    res.status(200).json({ ok: true, report });
  });

  r.get('/projects/:slug/integrations/opencode', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;

    const integration = await getIntegrationByProjectType(access.project.id, 'opencode');
    const creds = integration ? await getOauthCredentials({ integrationId: integration.id, provider: 'openai' }) : null;
    const cfg = await getOpenCodeProjectConfig(access.project.id);
    const runtime = await getRuntimeConfig();

    res.status(200).json({
      status: integration?.status ?? 'disabled',
      connectedAt: integration?.connected_at ?? null,
      lastError: integration?.last_error ?? null,
      token: {
        expiresAt: creds?.expires_at ?? null,
        scopes: creds?.scopes ? String(creds.scopes).split(/\s+/).filter(Boolean) : [],
        lastRefreshAt: creds?.last_refresh_at ?? null,
        tokenType: creds?.token_type ?? null,
      },
      config: {
        mode: cfg.mode,
        authMode: cfg.authMode,
        localCliReady: cfg.localCliReady,
        command: cfg.command,
        prTimeoutMinutes: cfg.prTimeoutMinutes,
        model: cfg.model,
        workspaceRoot: cfg.workspaceRoot,
        policy: cfg.policy,
      },
      webConfig: {
        url: runtime.OPENCODE_WEB_URL ?? null,
        embedEnabled: ['1', 'true', 'yes', 'on'].includes(String(runtime.OPENCODE_WEB_EMBED ?? '').toLowerCase()),
        enabled: ['1', 'true', 'yes', 'on'].includes(String(runtime.OPENCODE_WEB_ENABLED ?? '').toLowerCase()),
      },
    });
  });

  r.post('/projects/:slug/integrations/opencode/connect', async (req: AuthedReq, res: Response, next: NextFunction) => {
    try {
      const slug = String(req.params.slug);
      const access = await getProjectAccess(req, res, slug, { admin: true });
      if (!access) return;

      const cfg = await getOpenCodeProjectConfig(access.project.id);
      if (cfg.authMode === 'local-cli') {
        jsonError(res, 400, 'Auth mode is local-cli');
        return;
      }

      const returnUrl = `/p/${encodeURIComponent(access.project.slug)}/integrations`;
      const redirectBaseUrl = resolveBaseUrl(req);
      const result = await startOpenCodeOauth({
        projectId: access.project.id,
        userId: (req as any).auth.userId,
        returnUrl,
        redirectBaseUrl,
      });

      res.status(200).json({ authorizeUrl: result.authorizeUrl, state: result.state, expiresAt: result.expiresAt.toISOString() });
    } catch (err) {
      next(err);
    }
  });

  r.post('/projects/:slug/integrations/opencode/disconnect', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    await disconnectOpenCodeIntegration({ projectId: access.project.id });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/integrations/opencode/prepare-repo', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const cfg = await getOpenCodeProjectConfig(access.project.id);
    if (cfg.mode !== 'server-runner') {
      jsonError(res, 400, 'OpenCode mode is not server-runner');
      return;
    }
    if (!cfg.workspaceRoot) {
      jsonError(res, 400, 'Missing OPENCODE_WORKSPACE_ROOT');
      return;
    }

    const ghToken = await getProjectSecretPlain(access.project.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      jsonError(res, 400, 'Missing GITHUB_TOKEN');
      return;
    }

    const repos = await listProjectGithubRepos(access.project.id);
    if (!repos.length) {
      jsonError(res, 400, 'No repositories configured');
      return;
    }

    const repoRaw = String((req.body as any)?.repo ?? '').trim();
    const repoChoice = repoRaw ? parseOwnerRepo(repoRaw) : null;
    const targets = repoChoice
      ? repos.filter((r) => r.owner === repoChoice.owner && r.repo === repoChoice.repo)
      : repos;

    if (repoChoice && !targets.length) {
      jsonError(res, 400, 'Repository not configured');
      return;
    }

    const results: Array<{ owner: string; repo: string; status: string; message?: string; defaultBranch?: string }> = [];
    for (const target of targets) {
      try {
        const gh = new GithubClient(ghToken, target.owner, target.repo);
        const info = await gh.getRepository();
        const defaultBranch = info.default_branch || 'main';
        const tokenUrl = buildTokenRemote(target.owner, target.repo, ghToken);
        const cache = await ensureRepoCache({
          workspaceRoot: cfg.workspaceRoot,
          owner: target.owner,
          repo: target.repo,
          defaultBranch,
          tokenUrl,
          scrub: ghToken,
        });
        results.push({ owner: target.owner, repo: target.repo, status: cache.status, defaultBranch });
      } catch (err: any) {
        results.push({ owner: target.owner, repo: target.repo, status: 'failed', message: String(err?.message ?? err) });
      }
    }

    res.status(200).json({ ok: true, results });
  });

  r.get('/projects/:slug/runs', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;
    const limitRaw = Number.parseInt(String(req.query.limit ?? '').trim(), 10);
    const offsetRaw = Number.parseInt(String(req.query.offset ?? '').trim(), 10);
    const statusRaw = String(req.query.status ?? '').trim();
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;
    const runs = await listAgentRunsByProject({
      projectId: access.project.id,
      limit: limit + 1,
      offset,
      status: statusRaw || null,
    });
    const hasMore = runs.length > limit;
    const trimmed = hasMore ? runs.slice(0, limit) : runs;
    res.status(200).json({
      runs: trimmed.map((r0) => ({
        id: r0.id,
        status: r0.status,
        createdAt: r0.created_at,
        startedAt: r0.started_at,
        finishedAt: r0.finished_at,
        outputSummary: r0.output_summary,
        taskId: r0.input_spec?.taskId ?? null,
      })),
      hasMore,
      limit,
      offset,
    });
  });

  r.get('/projects/:slug/job-queue', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;
    const limitRaw = Number.parseInt(String(req.query.limit ?? '').trim(), 10);
    const offsetRaw = Number.parseInt(String(req.query.offset ?? '').trim(), 10);
    const statusRaw = String(req.query.status ?? '').trim();
    const providerRaw = String(req.query.provider ?? '').trim();
    const queryRaw = String(req.query.query ?? '').trim();
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0;
    const rows = await listJobQueueByProject({
      projectId: access.project.id,
      limit: limit + 1,
      offset,
      status: statusRaw || null,
      provider: providerRaw || null,
      query: queryRaw || null,
    });
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const providersRes = await pool.query<{ provider: string }>(
      'select distinct provider from job_queue where project_id = $1 order by provider asc',
      [access.project.id],
    );
    const providers = providersRes.rows.map((row) => row.provider);
    res.status(200).json({
      jobs: trimmed.map((row) => ({
        id: row.id,
        status: row.status,
        kind: row.kind,
        provider: row.provider,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        nextRunAt: row.next_run_at,
        lockedAt: row.locked_at,
        lockedBy: row.locked_by,
        lastError: row.last_error,
        createdAt: row.created_at,
      })),
      hasMore,
      limit,
      offset,
      providers,
    });
  });

  r.get('/projects/:slug/runs/:runId', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;
    const runId = String(req.params.runId);
    const run = await getAgentRunById({ projectId: access.project.id, runId });
    if (!run) {
      jsonError(res, 404, 'Run not found');
      return;
    }
    const logs = await listAgentRunLogs({ runId, limit: 500 });
    res.status(200).json({
      run: {
        id: run.id,
        status: run.status,
        createdAt: run.created_at,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        outputSummary: run.output_summary,
        inputSpec: run.input_spec,
      },
      logs,
    });
  });

  r.post('/projects/:slug/runs/:runId/cancel', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const runId = String(req.params.runId);
    const run = await getAgentRunById({ projectId: access.project.id, runId });
    if (!run) {
      jsonError(res, 404, 'Run not found');
      return;
    }
    if (run.status !== 'running' && run.status !== 'queued') {
      jsonError(res, 400, 'Run is not cancellable');
      return;
    }

    const cancelled = cancelRunProcess(run.id);
    await insertAgentRunLog({ runId: run.id, stream: 'system', message: 'Run cancelled by user.' });
    await updateAgentRun({ runId: run.id, status: 'cancelled', outputSummary: 'Cancelled by user', finishedAt: new Date() });
    res.status(200).json({ ok: true, cancelled });
  });

  r.get('/projects/:slug/settings', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;

    const [asanaProjects, repos, links, contacts, knowledge, asanaFields, statusMap, repoMap, tokens] = await Promise.all([
      listProjectAsanaProjects(access.project.id),
      listProjectGithubRepos(access.project.id),
      listProjectLinks(access.project.id),
      listProjectContacts(access.project.id),
      getProjectKnowledge(access.project.id),
      getAsanaFieldConfig(access.project.id),
      listAsanaStatusMap(access.project.id),
      listRepoMap(access.project.id),
      listProjectApiTokens(access.project.id),
    ]);

    const secretErrors: Array<{ key: string; message: string }> = [];
    const readSecretSafe = async (key: ProjectSecretKey): Promise<string | null> => {
      try {
        return await getProjectSecretPlain(access.project.id, key);
      } catch (err: any) {
        secretErrors.push({ key, message: String(err?.message ?? err) });
        return null;
      }
    };

    const secrets = {
      asanaPat: Boolean(await readSecretSafe('ASANA_PAT')),
      githubToken: Boolean(await readSecretSafe('GITHUB_TOKEN')),
      githubWebhookSecret: Boolean(await readSecretSafe('GITHUB_WEBHOOK_SECRET')),
      opencodeWorkdir: Boolean(await readSecretSafe('OPENCODE_WORKDIR')),
    };

  const opencode = await getOpenCodeProjectConfig(access.project.id);

    res.status(200).json({
      project: { id: access.project.id, slug: access.project.slug, name: access.project.name },
      role: access.membership.role,
      secrets,
      secretErrors: secretErrors.length ? secretErrors : undefined,
      opencode,
      asanaFields,
      statusMap,
      repoMap,
      asanaProjects,
      repos,
      links,
      contacts,
      apiTokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        lastUsedAt: t.last_used_at,
        revokedAt: t.revoked_at,
        tokenHash: t.token_hash,
      })),
      knowledge,
    });
  });

  r.post('/projects/:slug/settings/secrets', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const asanaPat = String((req.body as any)?.asana_pat ?? '').trim();
    const ghToken = String((req.body as any)?.github_token ?? '').trim();
    const ghSecret = String((req.body as any)?.github_webhook_secret ?? '').trim();
    const ocWorkdir = String((req.body as any)?.opencode_workdir ?? '').trim();

    if (asanaPat) await setProjectSecret(access.project.id, 'ASANA_PAT', asanaPat);
    if (ghToken) await setProjectSecret(access.project.id, 'GITHUB_TOKEN', ghToken);
    if (ghSecret) await setProjectSecret(access.project.id, 'GITHUB_WEBHOOK_SECRET', ghSecret);
    if (ocWorkdir) await setProjectSecret(access.project.id, 'OPENCODE_WORKDIR', ocWorkdir);

    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/settings/opencode', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const modeRaw = String((req.body as any)?.opencode_mode ?? '').trim();
    const commandRaw = String((req.body as any)?.opencode_command ?? '').trim();
    const timeoutRaw = String((req.body as any)?.opencode_pr_timeout_min ?? '').trim();
    const modelRaw = String((req.body as any)?.opencode_model ?? '').trim();
    const providerRaw = String((req.body as any)?.opencode_provider ?? '').trim();
    const authProviderRaw = String((req.body as any)?.opencode_auth_provider ?? '').trim();
    const workspaceRootRaw = String((req.body as any)?.opencode_workspace_root ?? '').trim();
    const logModeRaw = String((req.body as any)?.opencode_log_mode ?? '').trim();
    const systemPromptRaw = String((req.body as any)?.opencode_system_prompt ?? '').trim();
    const configJsonRaw = String((req.body as any)?.opencode_config_json ?? '').trim();
    const authModeRaw = String((req.body as any)?.opencode_auth_mode ?? '').trim();
    const localCliReadyRaw = String((req.body as any)?.opencode_local_cli_ready ?? '').trim();
    const policyWriteModeRaw = String((req.body as any)?.opencode_policy_write_mode ?? '').trim();
    const policyMaxFilesRaw = String((req.body as any)?.opencode_policy_max_files_changed ?? '').trim();
    const policyDenyPathsRaw = String((req.body as any)?.opencode_policy_deny_paths ?? '').trim();

    const mode = normalizeOpenCodeMode(modeRaw);
    if (mode) await setProjectSecret(access.project.id, 'OPENCODE_MODE', mode);
    if (commandRaw) await setProjectSecret(access.project.id, 'OPENCODE_COMMAND', normalizeOpenCodeCommand(commandRaw));
    if (timeoutRaw) await setProjectSecret(access.project.id, 'OPENCODE_PR_TIMEOUT_MINUTES', String(normalizeTimeoutMinutes(timeoutRaw)));
    if (modelRaw) await setProjectSecret(access.project.id, 'OPENCODE_MODEL', modelRaw);
    if (workspaceRootRaw) await setProjectSecret(access.project.id, 'OPENCODE_WORKSPACE_ROOT', workspaceRootRaw);
    const logMode = normalizeLogMode(logModeRaw);
    if (logMode) await setProjectSecret(access.project.id, 'OPENCODE_LOG_MODE', logMode);
    if (systemPromptRaw) {
      await setProjectSecret(access.project.id, 'OPENCODE_SYSTEM_PROMPT', systemPromptRaw);
    } else {
      await deleteProjectSecret({ projectId: access.project.id, key: 'OPENCODE_SYSTEM_PROMPT' });
    }
    if (configJsonRaw) {
      try {
        JSON.parse(configJsonRaw);
      } catch (err: any) {
        jsonError(res, 400, `Invalid OpenCode config JSON: ${String(err?.message ?? err)}`);
        return;
      }
      await setProjectSecret(access.project.id, 'OPENCODE_CONFIG_JSON', configJsonRaw);
    } else {
      await deleteProjectSecret({ projectId: access.project.id, key: 'OPENCODE_CONFIG_JSON' });
    }
    const authMode = normalizeAuthMode(authModeRaw);
    if (authMode) await setProjectSecret(access.project.id, 'OPENCODE_AUTH_MODE', authMode);
    if (providerRaw) {
      await setProjectSecret(access.project.id, 'OPENCODE_PROVIDER', providerRaw);
    } else {
      await deleteProjectSecret({ projectId: access.project.id, key: 'OPENCODE_PROVIDER' });
    }
    if (authProviderRaw) {
      await setProjectSecret(access.project.id, 'OPENCODE_AUTH_PROVIDER', authProviderRaw);
    } else {
      await deleteProjectSecret({ projectId: access.project.id, key: 'OPENCODE_AUTH_PROVIDER' });
    }
    await setProjectSecret(access.project.id, 'OPENCODE_LOCAL_CLI_READY', localCliReadyRaw ? '1' : '');
    const writeMode = normalizeWriteMode(policyWriteModeRaw);
    if (writeMode) await setProjectSecret(access.project.id, 'OPENCODE_POLICY_WRITE_MODE', writeMode);
    if (policyMaxFilesRaw || policyMaxFilesRaw === '0') {
      const maxFiles = normalizeMaxFilesChanged(policyMaxFilesRaw);
      await setProjectSecret(access.project.id, 'OPENCODE_POLICY_MAX_FILES_CHANGED', maxFiles ? String(maxFiles) : '');
    }
    await setProjectSecret(access.project.id, 'OPENCODE_POLICY_DENY_PATHS', normalizeDenyPaths(policyDenyPathsRaw).join('\n'));

    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/settings/secrets/reset', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const keysRaw = (req.body as any)?.keys;
    if (!Array.isArray(keysRaw) || !keysRaw.length) {
      jsonError(res, 400, 'keys must be a non-empty array');
      return;
    }

    const allowed: ProjectSecretKey[] = [
      'ASANA_PAT',
      'GITHUB_TOKEN',
      'GITHUB_WEBHOOK_SECRET',
      'ASANA_WEBHOOK_SECRET',
      'OPENCODE_WORKDIR',
      'OPENCODE_MODE',
      'OPENCODE_COMMAND',
      'OPENCODE_PR_TIMEOUT_MINUTES',
      'OPENCODE_MODEL',
      'OPENCODE_WORKSPACE_ROOT',
      'OPENCODE_LOG_MODE',
      'OPENCODE_SYSTEM_PROMPT',
      'OPENCODE_CONFIG_JSON',
      'OPENCODE_PROVIDER',
      'OPENCODE_AUTH_PROVIDER',
      'OPENCODE_AUTH_MODE',
      'OPENCODE_LOCAL_CLI_READY',
      'OPENCODE_POLICY_WRITE_MODE',
      'OPENCODE_POLICY_DENY_PATHS',
      'OPENCODE_POLICY_MAX_FILES_CHANGED',
      'OPENAI_API_KEY',
    ];
    const allowedSet = new Set<ProjectSecretKey>(allowed);

    const keys = keysRaw
      .map((k) => String(k).trim())
      .filter(Boolean)
      .filter((k) => allowedSet.has(k as ProjectSecretKey)) as ProjectSecretKey[];

    if (!keys.length) {
      jsonError(res, 400, 'No valid keys provided');
      return;
    }

    for (const key of keys) {
      await deleteProjectSecret({ projectId: access.project.id, key });
    }

    res.status(200).json({ ok: true, cleared: keys });
  });

  r.post('/projects/:slug/settings/secrets/repair', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const result = await repairProjectSecrets(access.project.id);
    res.status(200).json({ ok: true, result });
  });

  r.post('/projects/:slug/settings/asana-fields', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    await upsertAsanaFieldConfig({
      projectId: access.project.id,
      workspaceGid: String((req.body as any)?.workspace_gid ?? '').trim() || undefined,
      autoFieldGid: String((req.body as any)?.auto_field_gid ?? '').trim() || undefined,
      repoFieldGid: String((req.body as any)?.repo_field_gid ?? '').trim() || undefined,
      statusFieldGid: String((req.body as any)?.status_field_gid ?? '').trim() || undefined,
    });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/settings/asana-fields/detect', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const sampleInput = String((req.body as any)?.sample_task_gid ?? '').trim();
    if (!sampleInput) {
      jsonError(res, 400, 'Missing Asana URL/GID');
      return;
    }

    const asanaPat = await getProjectSecretPlain(access.project.id, 'ASANA_PAT');
    if (!asanaPat) {
      jsonError(res, 400, 'Missing ASANA_PAT');
      return;
    }

    try {
      const asana = new AsanaClient(asanaPat);
      const gids = Array.from(sampleInput.matchAll(/\d{6,}/g)).map((m) => m[0]);
      if (!gids.length) {
        jsonError(res, 400, 'Could not find numeric Asana GID in input');
        return;
      }

      const taskGidCandidate = gids[gids.length - 1];
      const projectGidCandidate = gids.length >= 2 ? gids[gids.length - 2] : gids[0];

      let source: 'task' | 'project' = 'task';
      let usedGid = taskGidCandidate;
      let workspaceGid: string | null = null;
      let customFields: any[] = [];

      try {
        const task = await asana.getTask(taskGidCandidate);
        workspaceGid = (task as any)?.workspace?.gid ? String((task as any).workspace.gid) : null;
        customFields = Array.isArray((task as any)?.custom_fields) ? (task as any).custom_fields : [];
      } catch {
        const project = await asana.getProjectCustomFields(projectGidCandidate);
        source = 'project';
        usedGid = projectGidCandidate;
        workspaceGid = project.workspaceGid;
        customFields = project.fields;
      }

      const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]/g, ' ');
      const findFieldGid = (candidates: string[]): string | null => {
        const want = new Set(candidates.map(norm));
        const f = customFields.find((x: any) => typeof x?.name === 'string' && want.has(norm(String(x.name))));
        return f?.gid ? String(f.gid) : null;
      };

      const autoFieldGid = findFieldGid(['AutoTask', 'Auto Task', 'auto_task', 'auto-task']);
      const repoFieldGid = findFieldGid(['Repo', 'repo']);
      const statusFieldGid = findFieldGid(['STATUS', 'Status', 'status']);

      const updates: any = { projectId: access.project.id };
      if (workspaceGid) updates.workspaceGid = workspaceGid;
      if (autoFieldGid) updates.autoFieldGid = autoFieldGid;
      if (repoFieldGid) updates.repoFieldGid = repoFieldGid;
      if (statusFieldGid) updates.statusFieldGid = statusFieldGid;
      if (updates.workspaceGid || updates.autoFieldGid || updates.repoFieldGid || updates.statusFieldGid) {
        await upsertAsanaFieldConfig(updates);
      }

      res.status(200).json({
        ok: Boolean(autoFieldGid && repoFieldGid && statusFieldGid),
        source,
        usedGid,
        detected: {
          workspaceGid,
          autoFieldGid,
          repoFieldGid,
          statusFieldGid,
        },
      });
    } catch (e: any) {
      jsonError(res, 500, String(e?.message ?? e));
    }
  });

  r.post('/projects/:slug/settings/asana-status-map', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const optionName = String((req.body as any)?.option_name ?? '').trim();
    const mapped = String((req.body as any)?.mapped_status ?? '').trim().toUpperCase();
    if (!optionName || !mapped) {
      jsonError(res, 400, 'option_name and mapped_status are required');
      return;
    }
    await upsertAsanaStatusMap({ projectId: access.project.id, optionName, mappedStatus: mapped });
    res.status(200).json({ ok: true });
  });

  r.delete('/projects/:slug/settings/asana-status-map/:optionName', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const optionName = String(req.params.optionName ?? '').trim();
    if (!optionName) {
      jsonError(res, 400, 'option_name required');
      return;
    }
    await deleteAsanaStatusMap(access.project.id, optionName);
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/settings/repo-map', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const optionName = String((req.body as any)?.option_name ?? '').trim();
    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    if (!optionName || !owner || !repo) {
      jsonError(res, 400, 'option_name, owner, repo are required');
      return;
    }
    await upsertRepoMap({ projectId: access.project.id, optionName, owner, repo });
    res.status(200).json({ ok: true });
  });

  r.delete('/projects/:slug/settings/repo-map/:optionName', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const optionName = String(req.params.optionName ?? '').trim();
    if (!optionName) {
      jsonError(res, 400, 'option_name required');
      return;
    }
    await deleteRepoMap(access.project.id, optionName);
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/asana-projects', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const gid = String((req.body as any)?.asana_project_gid ?? '').trim();
    if (!gid) {
      jsonError(res, 400, 'asana_project_gid required');
      return;
    }
    await addProjectAsanaProject(access.project.id, gid);
    res.status(201).json({ ok: true });
  });

  r.delete('/projects/:slug/asana-projects/:gid', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const gid = String(req.params.gid ?? '').trim();
    if (!gid) {
      jsonError(res, 400, 'asana_project_gid required');
      return;
    }
    await removeProjectAsanaProject(access.project.id, gid);
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/repos', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    const isDefault = Boolean((req.body as any)?.is_default);
    if (!owner || !repo) {
      jsonError(res, 400, 'owner and repo are required');
      return;
    }
    await addProjectGithubRepo(access.project.id, owner, repo, isDefault);
    res.status(201).json({ ok: true });
  });

  r.delete('/projects/:slug/repos', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    if (!owner || !repo) {
      jsonError(res, 400, 'owner and repo are required');
      return;
    }
    await removeProjectGithubRepo(access.project.id, owner, repo);
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/repos/default', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    if (!owner || !repo) {
      jsonError(res, 400, 'owner and repo are required');
      return;
    }
    await setDefaultRepo(access.project.id, owner, repo);
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/contacts', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const role = String((req.body as any)?.role ?? '').trim();
    const name = String((req.body as any)?.name ?? '').trim();
    const handle = String((req.body as any)?.handle ?? '').trim();
    if (!role) {
      jsonError(res, 400, 'role required');
      return;
    }
    await addProjectContact({ projectId: access.project.id, role, name: name || null, handle: handle || null });
    res.status(201).json({ ok: true });
  });

  r.delete('/projects/:slug/contacts/:id', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      jsonError(res, 400, 'id required');
      return;
    }
    await deleteProjectContact({ projectId: access.project.id, id });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/links', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const kind = String((req.body as any)?.kind ?? '').trim();
    const url = String((req.body as any)?.url ?? '').trim();
    const title = String((req.body as any)?.title ?? '').trim();
    const tags = String((req.body as any)?.tags ?? '').trim();
    if (!kind || !url) {
      jsonError(res, 400, 'kind and url are required');
      return;
    }
    await addProjectLink({ projectId: access.project.id, kind, url, title: title || null, tags: tags || null });
    res.status(201).json({ ok: true });
  });

  r.delete('/projects/:slug/links/:id', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      jsonError(res, 400, 'id required');
      return;
    }
    await deleteProjectLink({ projectId: access.project.id, id });
    res.status(200).json({ ok: true });
  });

  r.post('/projects/:slug/api-tokens', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;

    const name = String((req.body as any)?.name ?? '').trim();
    const token = crypto.randomBytes(24).toString('hex');
    await createProjectApiToken({
      projectId: access.project.id,
      tokenHash: tokenHash(token),
      name: name || null,
      createdBy: (req as any).auth.userId,
    });
    res.status(201).json({ token });
  });

  r.get('/projects/:slug/api-tokens', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug);
    if (!access) return;
    const tokens = await listProjectApiTokens(access.project.id);
    res.status(200).json({
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        lastUsedAt: t.last_used_at,
        revokedAt: t.revoked_at,
        tokenHash: t.token_hash,
      })),
    });
  });

  r.delete('/projects/:slug/api-tokens/:id', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      jsonError(res, 400, 'token id required');
      return;
    }
    await revokeProjectApiToken({ projectId: access.project.id, tokenId: id });
    res.status(200).json({ ok: true });
  });

  r.put('/projects/:slug/knowledge', async (req: AuthedReq, res: Response) => {
    const slug = String(req.params.slug);
    const access = await getProjectAccess(req, res, slug, { admin: true });
    if (!access) return;
    const markdown = String((req.body as any)?.markdown ?? '');
    await upsertProjectKnowledge(access.project.id, markdown);
    res.status(200).json({ ok: true });
  });

  return r;
}
