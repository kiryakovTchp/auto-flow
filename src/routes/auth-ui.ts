import type { Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

import { getEnv } from '../config/env';
import {
  consumeInvite,
  createInvite,
  createSession,
  createUser,
  getInviteByTokenHash,
  getUserByUsername,
  deleteSession,
} from '../db/auth';
import { createProjectApiToken, listProjectApiTokens, revokeProjectApiToken } from '../db/api-tokens';
import { createMembership, createProject, getMembership, getProjectBySlug, listProjects, listProjectsForUser } from '../db/projects';
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
import {
  getAsanaFieldConfig,
  listAsanaStatusMap,
  upsertAsanaFieldConfig,
  upsertAsanaStatusMap,
  deleteAsanaStatusMap,
} from '../db/asana-config';
import { listRepoMap, upsertRepoMap, deleteRepoMap } from '../db/repo-map';
import { addProjectContact, addProjectLink, deleteProjectContact, deleteProjectLink, listProjectContacts, listProjectLinks } from '../db/project-links';
import { getProjectSecretPlain, setProjectSecret } from '../services/project-secure-config';
import { tokenHash } from '../security/init-admin';
import { authenticateUser, newSessionId, optionalSession, requireSession, SESSION_COOKIE } from '../security/sessions';

export function authUiRouter(): Router {
  const r = Router();

  r.get('/docs', optionalSession, async (req: Request, res: Response) => {
    const envBase = String(process.env.PUBLIC_BASE_URL ?? '').trim();
    const base = envBase || `http://localhost:${escapeHtml(String(process.env.PORT ?? '3000'))}`;
    const username = (req as any)?.auth?.username ? String((req as any).auth.username) : null;

    const body = `
      <div class="card">
        <h1>Auto-Flow Docs</h1>
        <div class="muted">${username ? `Logged in as ${escapeHtml(username)}` : 'Not logged in'}</div>

        <div class="muted" style="margin-top:12px">Quick links</div>
        <div class="nav">
          <div class="pill"><a href="/health">/health</a></div>
          <div class="pill"><a href="/metrics">/metrics</a></div>
          <div class="pill"><a href="/api/v1/openapi.json">/api/v1/openapi.json</a></div>
          <div class="pill"><a href="/app">/app</a></div>
        </div>

        <div class="muted" style="margin-top:12px">Local dev</div>
        <pre style="white-space:pre-wrap">docker compose up -d
npm run dev</pre>

        <div class="muted" style="margin-top:12px">Init admin (one-time)</div>
        <pre style="white-space:pre-wrap">${escapeHtml(base)}/init?token=&lt;INIT_ADMIN_TOKEN&gt;</pre>

        <div class="muted" style="margin-top:12px">API token (project-scoped)</div>
        <div class="muted">Create a token in <code>/p/:slug/api</code>, then call:</div>
        <pre style="white-space:pre-wrap">curl -H "Authorization: Bearer &lt;PROJECT_API_TOKEN&gt;" ${escapeHtml(base)}/api/v1/projects/&lt;slug&gt;/summary</pre>

        <div class="muted" style="margin-top:12px">Metrics</div>
        <div class="muted">If <code>METRICS_TOKEN</code> is set:</div>
        <pre style="white-space:pre-wrap">curl -H "Authorization: Bearer &lt;METRICS_TOKEN&gt;" ${escapeHtml(base)}/metrics</pre>

        <div class="muted" style="margin-top:12px">Deploy</div>
        <pre style="white-space:pre-wrap">docker compose -f deploy/docker-compose.yml --env-file deploy/staging.env up -d --build</pre>
        <div class="muted">See <code>docs/deploy.md</code> and <code>docs/ci-cd.md</code>.</div>

        <div style="margin-top:12px"><a href="/app">← Back</a></div>
      </div>
    `;

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(layout('Docs', body));
  });

  r.get('/login', optionalSession, async (req: Request, res: Response) => {
    if ((req as any).auth) {
      res.redirect('/app');
      return;
    }

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(loginPage());
  });

  r.post('/login', async (req: Request, res: Response) => {
    const username = String((req.body as any)?.username ?? '');
    const password = String((req.body as any)?.password ?? '');

    const auth = await authenticateUser(username, password);
    if (!auth) {
      res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8').send(loginPage('Invalid credentials'));
      return;
    }

    const sessionId = newSessionId();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14d
    await createSession({ userId: auth.userId, sessionId, expiresAt });

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: expiresAt,
    });

    res.redirect('/app');
  });

  r.post('/logout', requireSession, async (req: Request, res: Response) => {
    const sid = (req as any).cookies?.[SESSION_COOKIE];
    if (sid && typeof sid === 'string') {
      await deleteSession(sid);
    }
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/login');
  });

  // Initial admin creation. Works only if there are no users yet.
  r.get('/init', optionalSession, async (req: Request, res: Response) => {
    if ((req as any).auth) {
      res.redirect('/app');
      return;
    }

    const env = getEnv();
    const initToken = env.INIT_ADMIN_TOKEN;
    const token = String(req.query.token ?? '');

    if (!initToken) {
      res.status(500).send('INIT_ADMIN_TOKEN is not set');
      return;
    }

    if (!token || token !== initToken) {
      res.status(403).send('Invalid init token');
      return;
    }

    // If admin exists, block.
    const existing = await getUserByUsername('admin');
    if (existing) {
      res.status(403).send('Admin already exists');
      return;
    }

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage());
  });

  r.post('/init', async (req: Request, res: Response) => {
    const env = getEnv();
    const initToken = env.INIT_ADMIN_TOKEN;
    const token = String((req.body as any)?.token ?? '');
    const username = String((req.body as any)?.username ?? 'admin');
    const password = String((req.body as any)?.password ?? '');

    if (!initToken || token !== initToken) {
      res.status(403).send('Invalid init token');
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).send('Password too short');
      return;
    }

    const existingAny = await getUserByUsername(username);
    if (existingAny) {
      res.status(400).send('User already exists');
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ username, passwordHash: hash });

    // Create a default project so Acceptance can be met quickly.
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

    res.redirect('/app');
  });

  r.get('/invite/:token', optionalSession, async (req: Request, res: Response) => {
    const token = String(req.params.token);
    const inv = await getInviteByTokenHash(tokenHash(token));
    if (!inv) {
      res.status(404).send('Invite not found or expired');
      return;
    }

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(invitePage(token));
  });

  r.post('/invite/:token', async (req: Request, res: Response) => {
    const token = String(req.params.token);
    const inv = await getInviteByTokenHash(tokenHash(token));
    if (!inv) {
      res.status(404).send('Invite not found or expired');
      return;
    }

    const username = String((req.body as any)?.username ?? '');
    const password = String((req.body as any)?.password ?? '');

    if (!username || username.length < 3) {
      res.status(400).send('Username too short');
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).send('Password too short');
      return;
    }

    const exists = await getUserByUsername(username);
    if (exists) {
      res.status(400).send('User already exists');
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ username, passwordHash: hash });
    await consumeInvite(inv.id);

    const projects = await listProjects();
    if (projects[0]) {
      await createMembership({ userId: user.id, projectId: projects[0].id, role: 'viewer' });
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

    res.redirect('/app');
  });

  // App pages
  r.get('/app', requireSession, async (req: Request, res: Response) => {
    const projects = await listProjectsForUser((req as any).auth.userId);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(appPage((req as any).auth.username, projects));
  });

  r.post('/app/projects', requireSession, async (req: Request, res: Response) => {
    const slug = String((req.body as any)?.slug ?? '').trim();
    const name = String((req.body as any)?.name ?? '').trim();
    if (!slug || !name) {
      res.status(400).send('slug/name required');
      return;
    }

    const p = await createProject({ slug, name });
    await createMembership({ userId: (req as any).auth.userId, projectId: p.id, role: 'admin' });
    res.redirect(`/p/${encodeURIComponent(p.slug)}`);
  });

  r.post('/app/invites', requireSession, async (req: Request, res: Response) => {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createInvite({ tokenHash: tokenHash(token), expiresAt, createdBy: (req as any).auth.userId });

    const base = String(req.protocol + '://' + req.get('host'));
    const url = `${base}/invite/${encodeURIComponent(token)}`;
    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(layout('Invite created', `<div class="card"><h1>Invite</h1><div class="muted">Valid for 7 days</div><pre>${escapeHtml(url)}</pre><div style="margin-top:12px"><a href="/app">← Back</a></div></div>`));
  });


  r.get('/p/:slug/settings', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership) {
      res.status(403).send('Forbidden');
      return;
    }
    if (membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const repos = await listProjectGithubRepos(p.id);

    const hasAsanaPat = Boolean(await getProjectSecretPlain(p.id, 'ASANA_PAT'));
    const hasGithubToken = Boolean(await getProjectSecretPlain(p.id, 'GITHUB_TOKEN'));
    const hasGithubWebhookSecret = Boolean(await getProjectSecretPlain(p.id, 'GITHUB_WEBHOOK_SECRET'));

    const asanaFieldCfg = await getAsanaFieldConfig(p.id);
    const statusMap = await listAsanaStatusMap(p.id);
    const repoMap = await listRepoMap(p.id);

    const links = await listProjectLinks(p.id);
    const contacts = await listProjectContacts(p.id);

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(projectSettingsPage(p, asanaProjects, repos, { hasAsanaPat, hasGithubToken, hasGithubWebhookSecret }, asanaFieldCfg, statusMap, repoMap, links, contacts));
  });

  r.post('/p/:slug/settings/links/add', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const kind = String((req.body as any)?.kind ?? '').trim();
    const url = String((req.body as any)?.url ?? '').trim();
    const title = String((req.body as any)?.title ?? '').trim();
    const tags = String((req.body as any)?.tags ?? '').trim();

    if (kind && url) {
      await addProjectLink({ projectId: p.id, kind, url, title: title || null, tags: tags || null });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/links/delete', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const id = String((req.body as any)?.id ?? '').trim();
    if (id) {
      await deleteProjectLink({ projectId: p.id, id });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/contacts/add', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const role = String((req.body as any)?.role ?? '').trim();
    const name = String((req.body as any)?.name ?? '').trim();
    const handle = String((req.body as any)?.handle ?? '').trim();

    if (role) {
      await addProjectContact({ projectId: p.id, role, name: name || null, handle: handle || null });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/contacts/delete', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const id = String((req.body as any)?.id ?? '').trim();
    if (id) {
      await deleteProjectContact({ projectId: p.id, id });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/secrets', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const asanaPat = String((req.body as any)?.asana_pat ?? '').trim();
    const ghToken = String((req.body as any)?.github_token ?? '').trim();
    const ghSecret = String((req.body as any)?.github_webhook_secret ?? '').trim();
    const ocWorkdir = String((req.body as any)?.opencode_workdir ?? '').trim();

    if (asanaPat) await setProjectSecret(p.id, 'ASANA_PAT', asanaPat);
    if (ghToken) await setProjectSecret(p.id, 'GITHUB_TOKEN', ghToken);
    if (ghSecret) await setProjectSecret(p.id, 'GITHUB_WEBHOOK_SECRET', ghSecret);
    if (ocWorkdir) await setProjectSecret(p.id, 'OPENCODE_WORKDIR', ocWorkdir);

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/asana/add', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const gid = String((req.body as any)?.asana_project_gid ?? '').trim();
    if (gid) await addProjectAsanaProject(p.id, gid);

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/asana/remove', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const gid = String((req.body as any)?.asana_project_gid ?? '').trim();
    if (gid) await removeProjectAsanaProject(p.id, gid);

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/repos/add', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    const isDefRaw = String((req.body as any)?.is_default ?? '').trim().toLowerCase();
    const isDefault = isDefRaw === 'yes' || isDefRaw === 'true' || isDefRaw === '1';

    if (owner && repo) {
      await addProjectGithubRepo(p.id, owner, repo, isDefault);
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/repos/default', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    if (owner && repo) await setDefaultRepo(p.id, owner, repo);

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/asana-fields', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    await upsertAsanaFieldConfig({
      projectId: p.id,
      workspaceGid: String((req.body as any)?.workspace_gid ?? '').trim() || undefined,
      autoFieldGid: String((req.body as any)?.auto_field_gid ?? '').trim() || undefined,
      repoFieldGid: String((req.body as any)?.repo_field_gid ?? '').trim() || undefined,
      statusFieldGid: String((req.body as any)?.status_field_gid ?? '').trim() || undefined,
    });

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/asana-status-map', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const optionName = String((req.body as any)?.option_name ?? '').trim();
    const mapped = String((req.body as any)?.mapped_status ?? '').trim().toUpperCase();
    if (optionName && mapped) {
      await upsertAsanaStatusMap({ projectId: p.id, optionName, mappedStatus: mapped });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/asana-status-map/delete', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const optionName = String((req.body as any)?.option_name ?? '').trim();
    if (optionName) {
      await deleteAsanaStatusMap(p.id, optionName);
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/repo-map', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const optionName = String((req.body as any)?.option_name ?? '').trim();
    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();

    if (optionName && owner && repo) {
      await upsertRepoMap({ projectId: p.id, optionName, owner, repo });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/repo-map/delete', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const optionName = String((req.body as any)?.option_name ?? '').trim();
    if (optionName) {
      await deleteRepoMap(p.id, optionName);
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });

  r.post('/p/:slug/settings/repos/remove', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit settings');
      return;
    }

    const owner = String((req.body as any)?.owner ?? '').trim();
    const repo = String((req.body as any)?.repo ?? '').trim();
    if (owner && repo) await removeProjectGithubRepo(p.id, owner, repo);

    res.redirect(`/p/${encodeURIComponent(p.slug)}/settings`);
  });


  r.get('/p/:slug/api', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership) {
      res.status(403).send('Forbidden');
      return;
    }

    const tokens = await listProjectApiTokens(p.id);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectApiPage(p, tokens, null, membership.role === 'admin'));
  });

  r.post('/p/:slug/api/tokens/create', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can manage API tokens');
      return;
    }

    const name = String((req.body as any)?.name ?? '').trim();
    const token = crypto.randomBytes(24).toString('hex');
    await createProjectApiToken({
      projectId: p.id,
      tokenHash: tokenHash(token),
      name: name || null,
      createdBy: (req as any).auth.userId,
    });

    const tokens = await listProjectApiTokens(p.id);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectApiPage(p, tokens, token, true));
  });

  r.post('/p/:slug/api/tokens/revoke', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can manage API tokens');
      return;
    }

    const tokenId = String((req.body as any)?.token_id ?? '').trim();
    if (tokenId) {
      await revokeProjectApiToken({ projectId: p.id, tokenId });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/api`);
  });

  r.get('/p/:slug/knowledge', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership) {
      res.status(403).send('Forbidden');
      return;
    }

    const md = await getProjectKnowledge(p.id);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectKnowledgePage(p, md));
  });

  r.post('/p/:slug/knowledge', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit knowledge');
      return;
    }

    const md = String((req.body as any)?.markdown ?? '');
    await upsertProjectKnowledge(p.id, md);
    res.redirect(`/p/${encodeURIComponent(p.slug)}/knowledge`);
  });

  return r;
}

function layout(title: string, body: string): string {
  return `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n<style>\n  body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0f14;color:#e8eef7;}\n  a{color:#7aa2ff;text-decoration:none;}\n  .wrap{max-width:860px;margin:0 auto;padding:24px 16px;}\n  .card{border:1px solid rgba(232,238,247,0.12);background:rgba(255,255,255,0.06);border-radius:14px;padding:16px;}\n  .row{display:grid;grid-template-columns:1fr;gap:12px;}\n  @media(min-width:640px){.row{grid-template-columns:1fr 1fr;}}\n  label{font-size:12px;color:rgba(232,238,247,0.72);display:block;margin-bottom:6px;}\n  input,textarea{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);color:#e8eef7;padding:10px 12px;}\n  button{border:1px solid rgba(232,238,247,0.12);background:rgba(255,255,255,0.08);color:#e8eef7;padding:10px 12px;border-radius:12px;cursor:pointer;}\n  h1{font-size:18px;margin:0 0 10px;}\n  .muted{color:rgba(232,238,247,0.72);font-size:13px;}\n  .nav{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;}\n  .pill{border:1px solid rgba(232,238,247,0.12);padding:6px 10px;border-radius:999px;background:rgba(0,0,0,0.22);}\n</style>\n</head>\n<body>\n<div class="wrap">\n${body}\n</div>\n</body>\n</html>`;
}

function loginPage(error?: string): string {
  return layout(
    'Login',
    `<div class="card">\n      <h1>Login</h1>\n      ${error ? `<div class="muted" style="color:#ff6b6b">${error}</div>` : `<div class="muted">Use your admin credentials.</div>`}\n      <form method="post" action="/login">\n        <div class="row">\n          <div>\n            <label>Username</label>\n            <input name="username" />\n          </div>\n          <div>\n            <label>Password</label>\n            <input name="password" type="password" />\n          </div>\n        </div>\n        <div style="margin-top:12px">\n          <button type="submit">Login</button>\n        </div>\n      </form>\n      <div class="muted" style="margin-top:12px">If no users exist, initialize admin via <code>/init?token=INIT_ADMIN_TOKEN</code>.</div>\n    </div>`,
  );
}

function initAdminPage(): string {
  return layout(
    'Init Admin',
    `<div class="card">\n      <h1>Init Admin</h1>\n      <div class="muted">Creates the first admin user (one-time flow).</div>\n      <form method="post" action="/init">\n        <div class="row">\n          <div>\n            <label>Init Token</label>\n            <input name="token" />\n          </div>\n          <div>\n            <label>Username</label>\n            <input name="username" value="admin" />\n          </div>\n          <div>\n            <label>Password</label>\n            <input name="password" type="password" />\n          </div>\n        </div>\n        <div style="margin-top:12px">\n          <button type="submit">Create Admin</button>\n        </div>\n      </form>\n    </div>`,
  );
}

function invitePage(token: string): string {
  return layout(
    'Accept Invite',
    `<div class="card">\n      <h1>Accept Invite</h1>\n      <div class="muted">Set your username and password.</div>\n      <form method="post" action="/invite/${encodeURIComponent(token)}">\n        <div class="row">\n          <div>\n            <label>Username</label>\n            <input name="username" />\n          </div>\n          <div>\n            <label>Password</label>\n            <input name="password" type="password" />\n          </div>\n        </div>\n        <div style="margin-top:12px">\n          <button type="submit">Create Account</button>\n        </div>\n      </form>\n    </div>`,
  );
}

function appPage(username: string, projects: Array<{ slug: string; name: string }>): string {
  const list = projects
    .map((p) => `<div class="pill"><a href="/p/${encodeURIComponent(p.slug)}">${p.name}</a></div>`)
    .join('');

  return layout(
    'App',
    `<div class="card">\n      <h1>Projects</h1>\n      <div class="muted">Logged in as ${username}</div>\n      <form method="post" action="/logout" style="margin-top:10px">\n        <button type="submit">Logout</button>\n      </form>\n      <div class="nav" style="margin-top:14px">${list || '<span class="muted">No projects yet</span>'}</div>\n      <div class="muted" style="margin-top:12px"><a href="/docs">Open Docs</a></div>\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      <h1>Create Invite</h1>\n      <div class="muted">Creates a 7-day invite link.</div>\n      <form method="post" action="/app/invites" style="margin-top:12px">\n        <button type="submit">Create Invite Link</button>\n      </form>\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      <h1>Create Project</h1>\n      <form method="post" action="/app/projects">\n        <div class="row">\n          <div>\n            <label>Slug</label>\n            <input name="slug" placeholder="my-tool" />\n          </div>\n          <div>\n            <label>Name</label>\n            <input name="name" placeholder="My Tool" />\n          </div>\n        </div>\n        <div style="margin-top:12px">\n          <button type="submit">Create</button>\n        </div>\n      </form>\n    </div>`,
  );
}

function projectNav(p: { slug: string }, active: string): string {
  const tabs = [
    ['Home', `/p/${p.slug}`],
    ['Settings', `/p/${p.slug}/settings`],
    ['Webhooks', `/p/${p.slug}/webhooks`],
    ['API', `/p/${p.slug}/api`],
    ['Knowledge', `/p/${p.slug}/knowledge`],
  ];
  return `<div class="nav">${tabs
    .map(([label, href]) => `<div class="pill" style="${label.toLowerCase() === active ? 'border-color:#4fd1c5' : ''}"><a href="${href}">${label}</a></div>`)
    .join('')}</div>`;
}



function projectSettingsPage(
  p: { slug: string; name: string },
  asanaProjects: string[],
  repos: Array<{ owner: string; repo: string; is_default: boolean }>,
  secrets: { hasAsanaPat: boolean; hasGithubToken: boolean; hasGithubWebhookSecret: boolean },
  asanaFieldCfg: { workspace_gid: string | null; auto_field_gid: string | null; repo_field_gid: string | null; status_field_gid: string | null } | null,
  statusMap: Array<{ option_name: string; mapped_status: string }>,
  repoMap: Array<{ option_name: string; owner: string; repo: string }>,
  links: Array<{ id: string; kind: string; url: string; title: string | null; tags: string | null }>,
  contacts: Array<{ id: string; role: string; name: string | null; handle: string | null }>,
): string {
  const secretsBlock = `
    <div class="muted">Secrets (stored encrypted):</div>
    <div class="nav">
      <div class="pill">Asana PAT: ${secrets.hasAsanaPat ? 'set' : 'missing'}</div>
      <div class="pill">GitHub Token: ${secrets.hasGithubToken ? 'set' : 'missing'}</div>
      <div class="pill">GitHub Webhook Secret: ${secrets.hasGithubWebhookSecret ? 'set' : 'missing'}</div>
    </div>

    <form method="post" action="/p/${p.slug}/settings/secrets">
      <div class="row" style="margin-top:12px">
        <div>
          <label>Asana PAT</label>
          <input name="asana_pat" type="password" placeholder="paste token" />
        </div>
        <div>
          <label>GitHub Token</label>
          <input name="github_token" type="password" placeholder="paste token" />
        </div>
        <div>
          <label>GitHub Webhook Secret</label>
          <input name="github_webhook_secret" type="password" placeholder="paste secret" />
        </div>
        <div>
          <label>OpenCode Workdir (optional)</label>
          <input name="opencode_workdir" placeholder="/Users/.../repo" />
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="submit">Save Secrets</button>
      </div>
      <div class="muted" style="margin-top:8px">Leave fields blank to keep existing values.</div>
    </form>

    <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />

    <div class="muted">Asana custom fields (workspace-level):</div>
    <form method="post" action="/p/${p.slug}/settings/asana-fields" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Workspace GID (optional)</label>
          <input name="workspace_gid" value="${escapeHtml(asanaFieldCfg?.workspace_gid ?? '')}" placeholder="123..." />
        </div>
        <div>
          <label>AutoTask field GID (checkbox)</label>
          <input name="auto_field_gid" value="${escapeHtml(asanaFieldCfg?.auto_field_gid ?? '')}" placeholder="field gid" />
        </div>
        <div>
          <label>Repo field GID (enum)</label>
          <input name="repo_field_gid" value="${escapeHtml(asanaFieldCfg?.repo_field_gid ?? '')}" placeholder="field gid" />
        </div>
        <div>
          <label>Status field GID (enum)</label>
          <input name="status_field_gid" value="${escapeHtml(asanaFieldCfg?.status_field_gid ?? '')}" placeholder="field gid" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Save Asana Field Config</button></div>
      <div class="muted" style="margin-top:8px">Paste GIDs manually.</div>
    </form>

    <div class="muted" style="margin-top:16px">Asana status mapping (option name → ACTIVE/BLOCKED/CANCELLED):</div>
    <div class="nav">${statusMap.map((m) => `<div class=\"pill\">${escapeHtml(m.option_name)} → ${escapeHtml(m.mapped_status)}</div>`).join('') || '<span class="muted">No mappings yet</span>'}</div>
    <form method="post" action="/p/${p.slug}/settings/asana-status-map" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Option name</label>
          <input name="option_name" placeholder="Cancelled" />
        </div>
        <div>
          <label>Mapped status</label>
          <input name="mapped_status" placeholder="CANCELLED" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Upsert Mapping</button></div>
    </form>
    <form method="post" action="/p/${p.slug}/settings/asana-status-map/delete" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Delete mapping by option name</label>
          <input name="option_name" placeholder="Cancelled" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Delete Mapping</button></div>
    </form>

    <div class="muted" style="margin-top:16px">Repo mapping override (Asana Repo option name → GitHub owner/repo):</div>
    <div class="nav">${repoMap.map((m) => `<div class=\"pill\">${escapeHtml(m.option_name)} → ${escapeHtml(m.owner)}/${escapeHtml(m.repo)}</div>`).join('') || '<span class="muted">No repo overrides</span>'}</div>
    <div class="muted">Use when option name is not exactly "owner/repo".</div>
    <form method="post" action="/p/${p.slug}/settings/repo-map" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Option name</label>
          <input name="option_name" placeholder="Backend Repo" />
        </div>
        <div>
          <label>Owner</label>
          <input name="owner" placeholder="kiryakovTchp" />
        </div>
        <div>
          <label>Repo</label>
          <input name="repo" placeholder="auto-flow" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Upsert Repo Mapping</button></div>
    </form>
    <form method="post" action="/p/${p.slug}/settings/repo-map/delete" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Delete mapping by option name</label>
          <input name="option_name" placeholder="Backend Repo" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Delete Repo Mapping</button></div>
    </form>
  `;

  const asanaList = `
    <div class="muted">Asana projects:</div>
    <div class="nav">${asanaProjects.map((g) => `<div class=\"pill\">${g}</div>`).join('') || '<span class="muted">None</span>'}</div>

    <form method="post" action="/p/${p.slug}/settings/asana/add">
      <div class="row" style="margin-top:12px">
        <div>
          <label>Add Asana Project GID</label>
          <input name="asana_project_gid" placeholder="121286..." />
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="submit">Add</button>
      </div>
    </form>

    <form method="post" action="/p/${p.slug}/settings/asana/remove" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Remove Asana Project GID</label>
          <input name="asana_project_gid" placeholder="121286..." />
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="submit">Remove</button>
      </div>
    </form>
  `;

  const repoList = `
    <div class="muted">GitHub repos:</div>
    <div class="nav">${repos
      .map((r) => `<div class=\"pill\">${r.owner}/${r.repo}${r.is_default ? ' (default)' : ''}</div>`)
      .join('') || '<span class="muted">None</span>'}</div>

    <form method="post" action="/p/${p.slug}/settings/repos/add">
      <div class="row" style="margin-top:12px">
        <div>
          <label>Owner</label>
          <input name="owner" placeholder="kiryakovTchp" />
        </div>
        <div>
          <label>Repo</label>
          <input name="repo" placeholder="auto-flow" />
        </div>
        <div>
          <label>Make default (yes/no)</label>
          <input name="is_default" placeholder="yes" />
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="submit">Add / Update</button>
      </div>
    </form>

    <form method="post" action="/p/${p.slug}/settings/repos/default" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Set default owner</label>
          <input name="owner" placeholder="kiryakovTchp" />
        </div>
        <div>
          <label>Set default repo</label>
          <input name="repo" placeholder="auto-flow" />
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="submit">Set Default</button>
      </div>
    </form>

    <form method="post" action="/p/${p.slug}/settings/repos/remove" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Remove owner</label>
          <input name="owner" placeholder="kiryakovTchp" />
        </div>
        <div>
          <label>Remove repo</label>
          <input name="repo" placeholder="auto-flow" />
        </div>
      </div>
      <div style="margin-top:12px">
        <button type="submit">Remove</button>
      </div>
    </form>
  `;

  const linksBlock = `
    <div class="muted">Links:</div>
    <div class="nav">${
      links
        .map((l) => `<div class=\"pill\">#${escapeHtml(l.id)} ${escapeHtml(l.kind)}: ${escapeHtml(l.title ?? '')} ${escapeHtml(l.url)}</div>`)
        .join('') || '<span class="muted">None</span>'
    }</div>
    <form method="post" action="/p/${p.slug}/settings/links/add" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Kind</label>
          <input name="kind" placeholder="docs" />
        </div>
        <div>
          <label>URL</label>
          <input name="url" placeholder="https://..." />
        </div>
        <div>
          <label>Title (optional)</label>
          <input name="title" placeholder="Runbook" />
        </div>
        <div>
          <label>Tags (optional)</label>
          <input name="tags" placeholder="backend, ci" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Add Link</button></div>
    </form>
    <form method="post" action="/p/${p.slug}/settings/links/delete" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Delete link by id</label>
          <input name="id" placeholder="123" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Delete Link</button></div>
      <div class="muted" style="margin-top:8px">Copy the id from the pills above.</div>
    </form>
  `;

  const contactsBlock = `
    <div class="muted">Contacts:</div>
    <div class="nav">${
      contacts
        .map((c) => `<div class=\"pill\">#${escapeHtml(c.id)} ${escapeHtml(c.role)}: ${escapeHtml(c.name ?? '')} ${escapeHtml(c.handle ?? '')}</div>`)
        .join('') || '<span class="muted">None</span>'
    }</div>
    <form method="post" action="/p/${p.slug}/settings/contacts/add" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Role</label>
          <input name="role" placeholder="owner" />
        </div>
        <div>
          <label>Name (optional)</label>
          <input name="name" placeholder="Ivan" />
        </div>
        <div>
          <label>Handle (optional)</label>
          <input name="handle" placeholder="@kiryakov" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Add Contact</button></div>
    </form>
    <form method="post" action="/p/${p.slug}/settings/contacts/delete" style="margin-top:12px">
      <div class="row">
        <div>
          <label>Delete contact by id</label>
          <input name="id" placeholder="123" />
        </div>
      </div>
      <div style="margin-top:12px"><button type="submit">Delete Contact</button></div>
    </form>
  `;

  return layout(
    `${p.name} - settings`,
    `<div class="card">\n      <h1>${p.name}</h1>\n      <div class="muted">/p/${p.slug}/settings</div>\n      ${projectNav(p, 'settings')}\n      <div class="muted">Stage 2: edit project settings.</div>\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${secretsBlock}\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${asanaList}\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${repoList}\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${contactsBlock}\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${linksBlock}\n      <div style="margin-top:12px"><a href="/p/${p.slug}">← Back</a></div>\n    </div>`,
  );
}

function projectApiPage(
  p: { slug: string; name: string },
  tokens: Array<{ id: string; name: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null; token_hash: string }>,
  createdToken: string | null = null,
  canAdmin = false,
): string {
  const tokenList = tokens
    .map((t) => {
      const status = t.revoked_at ? 'revoked' : 'active';
      const label = (t.name ?? '').trim() ? `${escapeHtml(t.name ?? '')}` : '(unnamed)';
      const hashShort = escapeHtml(String(t.token_hash).slice(0, 10));
      return `<tr>
        <td>${escapeHtml(String(t.id))}</td>
        <td>${label}</td>
        <td>${status}</td>
        <td class="muted">${hashShort}...</td>
        <td class="muted">${escapeHtml(String(t.created_at))}</td>
        <td class="muted">${escapeHtml(String(t.last_used_at ?? ''))}</td>
        <td class="muted">${escapeHtml(String(t.revoked_at ?? ''))}</td>
      </tr>`;
    })
    .join('');

  const base = `http://localhost:${escapeHtml(String(process.env.PORT ?? '3000'))}`;
  const createdBlock = createdToken
    ? `<div class="pill" style="border-color:#4fd1c5">Token created (shown once)</div>
       <pre style="white-space:pre-wrap">${escapeHtml(createdToken)}</pre>
       <div class="muted">Example:</div>
       <pre style="white-space:pre-wrap">curl -H "Authorization: Bearer ${escapeHtml(createdToken)}" ${base}/api/v1/projects/${escapeHtml(p.slug)}/summary</pre>`
    : '';

  const adminBlock = canAdmin
    ? `
      <div class="muted" style="margin-top:16px">Create API token (project-scoped):</div>
      <form method="post" action="/p/${p.slug}/api/tokens/create" style="margin-top:12px">
        <div class="row">
          <div>
            <label>Name (optional)</label>
            <input name="name" placeholder="CI dashboard" />
          </div>
        </div>
        <div style="margin-top:12px"><button type="submit">Create Token</button></div>
      </form>

      <div class="muted" style="margin-top:16px">Revoke token:</div>
      <form method="post" action="/p/${p.slug}/api/tokens/revoke" style="margin-top:12px">
        <div class="row">
          <div>
            <label>Token id</label>
            <input name="token_id" placeholder="123" />
          </div>
        </div>
        <div style="margin-top:12px"><button type="submit">Revoke</button></div>
      </form>
    `
    : `<div class="muted" style="margin-top:16px">Only project admins can create/revoke API tokens.</div>`;

  return layout(
    `${p.name} - api`,
    `<div class="card">
      <h1>${escapeHtml(p.name)}</h1>
      <div class="muted">/p/${escapeHtml(p.slug)}/api</div>
      ${projectNav(p, 'api')}
      ${createdBlock}

      <div class="muted" style="margin-top:16px">API endpoints (Bearer token):</div>
      <pre style="white-space:pre-wrap">${base}/api/v1/openapi.json

${base}/api/v1/projects/${escapeHtml(p.slug)}/summary
${base}/api/v1/projects/${escapeHtml(p.slug)}/settings
${base}/api/v1/projects/${escapeHtml(p.slug)}/links
${base}/api/v1/projects/${escapeHtml(p.slug)}/contacts
${base}/api/v1/projects/${escapeHtml(p.slug)}/repos
${base}/api/v1/projects/${escapeHtml(p.slug)}/asana-projects
${base}/api/v1/projects/${escapeHtml(p.slug)}/tasks
${base}/api/v1/projects/${escapeHtml(p.slug)}/tasks/:id
${base}/api/v1/projects/${escapeHtml(p.slug)}/tasks/:id/events

${base}/api/v1/projects/${escapeHtml(p.slug)}/funnel
${base}/api/v1/projects/${escapeHtml(p.slug)}/lead-time
${base}/api/v1/projects/${escapeHtml(p.slug)}/failures
${base}/api/v1/projects/${escapeHtml(p.slug)}/webhooks/health
${base}/api/v1/projects/${escapeHtml(p.slug)}/jobs/health</pre>

      <div class="muted" style="margin-top:16px">Tokens</div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>Hash</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Revoked</th>
          </tr>
        </thead>
        <tbody>
          ${tokenList || '<tr><td colspan="7" class="muted">No tokens yet</td></tr>'}
        </tbody>
      </table>

      ${adminBlock}

      <div style="margin-top:12px"><a href="/p/${p.slug}">← Back</a></div>
    </div>`,
  );
}

function projectKnowledgePage(p: { slug: string; name: string }, md: string): string {
  const safe = md.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  return layout(
    `${p.name} - knowledge`,
    `<div class="card">\n      <h1>${p.name}</h1>\n      <div class="muted">/p/${p.slug}/knowledge</div>\n      ${projectNav(p, 'knowledge')}\n      <div class="muted">Notes are stored in DB (markdown).</div>\n      <form method="post" action="/p/${p.slug}/knowledge">\n        <div style="margin-top:12px">\n          <label>Markdown</label>\n          <textarea name="markdown" style="width:100%;box-sizing:border-box;min-height:220px;border-radius:12px;border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);color:#e8eef7;padding:10px 12px;">${safe}</textarea>\n        </div>\n        <div style="margin-top:12px">\n          <button type="submit">Save</button>\n        </div>\n      </form>\n      <div style="margin-top:12px"><a href="/p/${p.slug}">← Back</a></div>\n    </div>`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
