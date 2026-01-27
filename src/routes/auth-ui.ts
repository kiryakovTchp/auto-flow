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
import { getAgentRunById, listAgentRunLogs, listAgentRunLogsAfter, listAgentRunsByProject } from '../db/agent-runs';
import { createMembership, createProject, getMembership, getProjectBySlug, listProjects, listProjectsForUser } from '../db/projects';
import { getIntegrationByProjectType } from '../db/integrations';
import { getOauthCredentials } from '../db/oauth-credentials';
import { insertProjectEvent } from '../db/project-events';
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
import { getRuntimeConfig } from '../services/secure-config';
import {
  getOpenCodeProjectConfig,
  type OpenCodeProjectConfig,
  normalizeOpenCodeMode,
  normalizeOpenCodeCommand,
  normalizeTimeoutMinutes,
  normalizeAuthMode,
  normalizeWriteMode,
  normalizeMaxFilesChanged,
} from '../services/opencode-runner';
import { disconnectOpenCodeIntegration, handleOpenCodeOauthCallback, startOpenCodeOauth } from '../services/opencode-oauth';
import { AsanaClient } from '../integrations/asana';
import { escapeHtml, pageShell, renderCodeBlock, renderLanguageToggle, renderTabs, renderTopbar } from '../services/html';
import { getLangFromRequest, normalizeLang, setLangCookie, t, type UiLang } from '../services/i18n';
import { tokenHash } from '../security/init-admin';
import { authenticateUser, newSessionId, optionalSession, requireSession, SESSION_COOKIE } from '../security/sessions';

export function authUiRouter(): Router {
  const r = Router();

  r.get('/ui/lang', (req: Request, res: Response) => {
    const lang = normalizeLang((req.query as any)?.lang);
    setLangCookie(res, lang);
    res.redirect(String(req.get('referer') ?? '/'));
  });

  r.post('/ui/lang', (req: Request, res: Response) => {
    const lang = normalizeLang((req.body as any)?.lang);
    setLangCookie(res, lang);
    if (String(req.get('accept') ?? '').includes('application/json')) {
      res.status(200).json({ ok: true, lang });
      return;
    }
    res.redirect(String(req.get('referer') ?? '/'));
  });

  r.get('/docs', optionalSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const envBase = String(process.env.PUBLIC_BASE_URL ?? '').trim();
    const base = envBase || `http://localhost:${escapeHtml(String(process.env.PORT ?? '3000'))}`;
    const username = (req as any)?.auth?.username ? String((req as any).auth.username) : null;

    const body = `
      <div class="card">
        <div style="font-weight:900;font-size:16px">Auto-Flow Docs</div>
        <div class="muted" style="margin-top:6px">${username ? `Logged in as ${escapeHtml(username)}` : 'Not logged in'}</div>

        <div style="margin-top:16px;font-weight:900">Quick links</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <a class="btn btn-secondary btn-sm" href="/health">/health</a>
          <a class="btn btn-secondary btn-sm" href="/metrics">/metrics</a>
          <a class="btn btn-secondary btn-sm" href="/api/v1/openapi.json">/api/v1/openapi.json</a>
          <a class="btn btn-secondary btn-sm" href="/app">/app</a>
        </div>

        <div style="margin-top:20px;font-weight:900">Local dev</div>
        <div style="margin-top:12px">${renderCodeBlock('docker compose up -d\nnpm run dev', { copyLabel: t(lang, 'common.copy') })}</div>

        <div style="margin-top:20px;font-weight:900">Init admin (one-time)</div>
        <div style="margin-top:12px">${renderCodeBlock(`${base}/init?token=<INIT_ADMIN_TOKEN>`, { copyLabel: t(lang, 'common.copy') })}</div>

        <div style="margin-top:20px;font-weight:900">API token (project-scoped)</div>
        <div class="muted" style="margin-top:6px">Create a token in <span class="mono">/p/:slug/api</span>, then call:</div>
        <div style="margin-top:12px">${renderCodeBlock(`curl -H "Authorization: Bearer <PROJECT_API_TOKEN>" ${base}/api/v1/projects/<slug>/summary`, { copyLabel: t(lang, 'common.copy') })}</div>

        <div style="margin-top:20px;font-weight:900">Metrics</div>
        <div class="muted" style="margin-top:6px">If <span class="mono">METRICS_TOKEN</span> is set:</div>
        <div style="margin-top:12px">${renderCodeBlock(`curl -H "Authorization: Bearer <METRICS_TOKEN>" ${base}/metrics`, { copyLabel: t(lang, 'common.copy') })}</div>

        <div style="margin-top:20px;font-weight:900">Deploy</div>
        <div style="margin-top:12px">${renderCodeBlock('docker compose -f deploy/docker-compose.yml --env-file deploy/staging.env up -d --build', { copyLabel: t(lang, 'common.copy') })}</div>
        <div class="muted" style="margin-top:10px">See <span class="mono">docs/deploy.md</span> and <span class="mono">docs/ci-cd.md</span>.</div>
      </div>
    `;

    const top = renderTopbar({
      title: 'Auto-Flow Docs',
      subtitle: username ? `Logged in as ${username}` : 'Not logged in',
      rightHtml: renderLanguageToggle(lang) + `<a class="btn btn-secondary btn-sm" href="/app">${escapeHtml(t(lang, 'common.back'))}</a>`,
    });
    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        pageShell({
          title: 'Docs',
          lang,
          body: `<div class="container">${top}${body}</div>`,
        }),
      );
  });

  r.get('/login', optionalSession, async (req: Request, res: Response) => {
    if ((req as any).auth) {
      res.redirect('/app');
      return;
    }

    const lang = getLangFromRequest(req);
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(loginPage(lang));
  });

  r.post('/login', async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const username = String((req.body as any)?.username ?? '');
    const password = String((req.body as any)?.password ?? '');

    const auth = await authenticateUser(username, password);
    if (!auth) {
      res
        .status(401)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(loginPage(lang, t(lang, 'screens.login.error_invalid')));
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
    const lang = getLangFromRequest(req);
    if ((req as any).auth) {
      res.redirect('/app');
      return;
    }

    const env = getEnv();
    const initToken = env.INIT_ADMIN_TOKEN;
    const token = String(req.query.token ?? '');

    if (!initToken) {
      res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang, 'INIT_ADMIN_TOKEN is not set'));
      return;
    }

    if (!token || token !== initToken) {
      res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang, 'Invalid init token'));
      return;
    }

    // If admin exists, block.
    const existing = await getUserByUsername('admin');
    if (existing) {
      res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang, 'Admin user already created'));
      return;
    }

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang));
  });

  r.post('/init', async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const env = getEnv();
    const initToken = env.INIT_ADMIN_TOKEN;
    const token = String((req.body as any)?.token ?? '');
    const username = String((req.body as any)?.username ?? 'admin');
    const password = String((req.body as any)?.password ?? '');

    if (!initToken || token !== initToken) {
      res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang, 'Invalid init token'));
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang, 'Password too short'));
      return;
    }

    const existingAny = await getUserByUsername(username);
    if (existingAny) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(initAdminPage(lang, 'User already exists'));
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
    const lang = getLangFromRequest(req);
    const token = String(req.params.token);
    const inv = await getInviteByTokenHash(tokenHash(token));
    if (!inv) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(authShell(lang, 'Invite', inlineAlert('error', 'Invite not found or expired')));
      return;
    }

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(invitePage(lang, token));
  });

  r.post('/invite/:token', async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const token = String(req.params.token);
    const inv = await getInviteByTokenHash(tokenHash(token));
    if (!inv) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(authShell(lang, 'Invite', inlineAlert('error', 'Invite not found or expired')));
      return;
    }

    const username = String((req.body as any)?.username ?? '');
    const password = String((req.body as any)?.password ?? '');

    if (!username || username.length < 3) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(invitePage(lang, token, 'Username too short'));
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(invitePage(lang, token, 'Password too short'));
      return;
    }

    const exists = await getUserByUsername(username);
    if (exists) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(invitePage(lang, token, 'Username already exists'));
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
    const lang = getLangFromRequest(req);
    const projects = await listProjectsForUser((req as any).auth.userId);
    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(appPage(lang, (req as any).auth.username, projects));
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
    const lang = getLangFromRequest(req);
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createInvite({ tokenHash: tokenHash(token), expiresAt, createdBy: (req as any).auth.userId });

    const base = String(req.protocol + '://' + req.get('host'));
    const url = `${base}/invite/${encodeURIComponent(token)}`;
    if (String(req.get('accept') ?? '').includes('application/json')) {
      res.status(200).json({ url, expires_at: expiresAt.toISOString() });
      return;
    }
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(inviteCreatedPage(lang, url));
  });


  r.get('/p/:slug/settings', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
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
    const opencodeCfg = await getOpenCodeProjectConfig(p.id);

    const asanaFieldCfg = await getAsanaFieldConfig(p.id);
    const statusMap = await listAsanaStatusMap(p.id);
    const repoMap = await listRepoMap(p.id);

    const links = await listProjectLinks(p.id);
    const contacts = await listProjectContacts(p.id);

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        projectSettingsPage(
          p,
          asanaProjects,
          repos,
          { hasAsanaPat, hasGithubToken, hasGithubWebhookSecret },
          asanaFieldCfg,
          statusMap,
          repoMap,
          opencodeCfg,
          links,
          contacts,
          lang,
        ),
      );
  });

  r.get('/p/:slug/integrations/opencode', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
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

    const integration = await getIntegrationByProjectType(p.id, 'opencode');
    const creds = integration ? await getOauthCredentials({ integrationId: integration.id, provider: 'openai' }) : null;
    const runs = await listAgentRunsByProject({ projectId: p.id, limit: 20 });
    const notice = parseOpencodeNotice(req.query);
    const baseUrl = resolveBaseUrl(req);
    const runtime = await getRuntimeConfig();
    const webUrl = String(runtime.OPENCODE_WEB_URL ?? '').trim() || null;
    const webConfig = {
      url: webUrl,
      embedEnabled: normalizeBoolFlag(runtime.OPENCODE_WEB_EMBED),
      enabled: normalizeBoolFlag(runtime.OPENCODE_WEB_ENABLED),
    };

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        opencodeIntegrationPage({
          lang,
          p,
          integration,
          creds,
          runs,
          canAdmin: membership.role === 'admin',
          notice,
          baseUrl,
          webConfig,
        }),
      );
  });

  r.get('/p/:slug/integrations/opencode/runs/:runId', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
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

    const runId = String(req.params.runId);
    const run = await getAgentRunById({ projectId: p.id, runId });
    if (!run) {
      res.status(404).send('Run not found');
      return;
    }

    const logs = await listAgentRunLogs({ runId, limit: 500 });

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(opencodeRunDetailsPage({ lang, p, run, logs }));
  });

  r.get('/p/:slug/integrations/opencode/runs/:runId/stream', requireSession, async (req: Request, res: Response) => {
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

    const runId = String(req.params.runId);
    const run = await getAgentRunById({ projectId: p.id, runId });
    if (!run) {
      res.status(404).send('Run not found');
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    let lastId = String(req.query.since_id ?? req.header('last-event-id') ?? '').trim();
    if (!/^\d+$/.test(lastId)) lastId = '';
    let closed = false;

    const sendLog = (log: { id: string; stream: string; message: string; created_at: string }) => {
      res.write(`id: ${log.id}\n`);
      res.write('event: log\n');
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    };

    const poll = async () => {
      if (closed) return;
      try {
        const logs = await listAgentRunLogsAfter({ runId, afterId: lastId || null, limit: 200 });
        for (const log of logs) {
          lastId = String(log.id);
          sendLog(log);
        }
      } catch (err: any) {
        res.write('event: error\n');
        res.write(`data: ${JSON.stringify({ message: String(err?.message ?? err) })}\n\n`);
      }
    };

    const interval = setInterval(poll, 2000);
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    void poll();

    req.on('close', () => {
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
    });
  });

  r.post('/p/:slug/integrations/opencode/connect', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can connect integrations');
      return;
    }

    const returnUrl = `/p/${encodeURIComponent(p.slug)}/integrations/opencode`;
    const redirectBaseUrl = resolveBaseUrl(req);

    const result = await startOpenCodeOauth({
      projectId: p.id,
      userId: (req as any).auth.userId,
      returnUrl,
      redirectBaseUrl,
    });

    await insertProjectEvent({
      projectId: p.id,
      source: 'user',
      eventType: 'opencode.oauth_started',
      userId: (req as any).auth.userId,
      refJson: { state: result.state, expiresAt: result.expiresAt.toISOString() },
    });

    res.redirect(result.authorizeUrl);
  });

  r.post('/p/:slug/integrations/opencode/reconnect', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can connect integrations');
      return;
    }

    const returnUrl = `/p/${encodeURIComponent(p.slug)}/integrations/opencode`;
    const redirectBaseUrl = resolveBaseUrl(req);

    const result = await startOpenCodeOauth({
      projectId: p.id,
      userId: (req as any).auth.userId,
      returnUrl,
      redirectBaseUrl,
    });

    await insertProjectEvent({
      projectId: p.id,
      source: 'user',
      eventType: 'opencode.oauth_reconnect_started',
      userId: (req as any).auth.userId,
      refJson: { state: result.state, expiresAt: result.expiresAt.toISOString() },
    });

    res.redirect(result.authorizeUrl);
  });

  r.post('/p/:slug/integrations/opencode/disconnect', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can disconnect integrations');
      return;
    }

    await disconnectOpenCodeIntegration({ projectId: p.id });
    await insertProjectEvent({
      projectId: p.id,
      source: 'user',
      eventType: 'opencode.disconnected',
      userId: (req as any).auth.userId,
    });

    res.redirect(`/p/${encodeURIComponent(p.slug)}/integrations/opencode?opencode=disconnected`);
  });

  r.get(['/oauth/opencode/callback', '/api/oauth/opencode/callback'], async (req: Request, res: Response) => {
    const code = String(req.query.code ?? '').trim();
    const state = String(req.query.state ?? '').trim();
    if (!code || !state) {
      res.status(400).send('Missing code or state');
      return;
    }

    try {
      const result = await handleOpenCodeOauthCallback({ code, state });
      await insertProjectEvent({
        projectId: result.projectId,
        source: 'system',
        eventType: 'opencode.oauth_connected',
        refJson: { state },
      });

      const redirectUrl = ensureSafeReturnUrl(result.returnUrl, resolveBaseUrl(req));
      res.redirect(withQuery(redirectUrl, { opencode: 'connected' }));
    } catch (err: any) {
      const redirectUrl = ensureSafeReturnUrl(String((req.query.return_url ?? '') || '/app'), resolveBaseUrl(req));
      res.redirect(withQuery(redirectUrl, { opencode: 'error', reason: String(err?.message ?? err) }));
    }
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

  r.post('/p/:slug/settings/opencode', requireSession, async (req: Request, res: Response) => {
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

    const modeRaw = String((req.body as any)?.opencode_mode ?? '').trim();
    const commandRaw = String((req.body as any)?.opencode_command ?? '').trim();
    const timeoutRaw = String((req.body as any)?.opencode_pr_timeout_min ?? '').trim();
    const modelRaw = String((req.body as any)?.opencode_model ?? '').trim();
    const workspaceRootRaw = String((req.body as any)?.opencode_workspace_root ?? '').trim();
    const authModeRaw = String((req.body as any)?.opencode_auth_mode ?? '').trim();
    const localCliReadyRaw = String((req.body as any)?.opencode_local_cli_ready ?? '').trim();
    const policyWriteModeRaw = String((req.body as any)?.opencode_policy_write_mode ?? '').trim();
    const policyMaxFilesRaw = String((req.body as any)?.opencode_policy_max_files_changed ?? '').trim();
    const policyDenyPathsRaw = String((req.body as any)?.opencode_policy_deny_paths ?? '').trim();

    const mode = normalizeOpenCodeMode(modeRaw);
    if (mode) {
      await setProjectSecret(p.id, 'OPENCODE_MODE', mode);
    }

    if (commandRaw) {
      await setProjectSecret(p.id, 'OPENCODE_COMMAND', normalizeOpenCodeCommand(commandRaw));
    }

    if (timeoutRaw) {
      const parsed = Number.parseInt(timeoutRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        await setProjectSecret(p.id, 'OPENCODE_PR_TIMEOUT_MINUTES', String(normalizeTimeoutMinutes(timeoutRaw)));
      }
    }

    if (modelRaw) {
      await setProjectSecret(p.id, 'OPENCODE_MODEL', modelRaw);
    }

    if (workspaceRootRaw) {
      await setProjectSecret(p.id, 'OPENCODE_WORKSPACE_ROOT', workspaceRootRaw);
    }

    const authMode = normalizeAuthMode(authModeRaw);
    if (authMode) {
      await setProjectSecret(p.id, 'OPENCODE_AUTH_MODE', authMode);
    }

    await setProjectSecret(p.id, 'OPENCODE_LOCAL_CLI_READY', localCliReadyRaw ? '1' : '');

    const writeMode = normalizeWriteMode(policyWriteModeRaw);
    if (writeMode) {
      await setProjectSecret(p.id, 'OPENCODE_POLICY_WRITE_MODE', writeMode);
    }

    if (policyMaxFilesRaw || policyMaxFilesRaw === '0') {
      const maxFiles = normalizeMaxFilesChanged(policyMaxFilesRaw);
      await setProjectSecret(p.id, 'OPENCODE_POLICY_MAX_FILES_CHANGED', maxFiles ? String(maxFiles) : '');
    }

    await setProjectSecret(p.id, 'OPENCODE_POLICY_DENY_PATHS', policyDenyPathsRaw);

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

  r.post('/p/:slug/settings/asana-fields/detect', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
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

    const renderSettings = async (notice?: { kind: 'success' | 'error'; title: string; message: string }) => {
      const asanaProjects = await listProjectAsanaProjects(p.id);
      const repos = await listProjectGithubRepos(p.id);

      const hasAsanaPat = Boolean(await getProjectSecretPlain(p.id, 'ASANA_PAT'));
      const hasGithubToken = Boolean(await getProjectSecretPlain(p.id, 'GITHUB_TOKEN'));
      const hasGithubWebhookSecret = Boolean(await getProjectSecretPlain(p.id, 'GITHUB_WEBHOOK_SECRET'));
      const opencodeCfg = await getOpenCodeProjectConfig(p.id);

      const asanaFieldCfg = await getAsanaFieldConfig(p.id);
      const statusMap = await listAsanaStatusMap(p.id);
      const repoMap = await listRepoMap(p.id);

      const links = await listProjectLinks(p.id);
      const contacts = await listProjectContacts(p.id);

      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          projectSettingsPage(
            p,
            asanaProjects,
            repos,
            { hasAsanaPat, hasGithubToken, hasGithubWebhookSecret },
            asanaFieldCfg,
            statusMap,
            repoMap,
            opencodeCfg,
            links,
            contacts,
            lang,
            notice,
          ),
        );
    };

    const sampleInput = String((req.body as any)?.sample_task_gid ?? '').trim();
    if (!sampleInput) {
      await renderSettings({
        kind: 'error',
        title: 'Missing Asana URL/GID',
        message: 'Paste an Asana task or project URL/GID where AutoTask/Repo/STATUS fields are visible.',
      });
      return;
    }

    const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
    if (!asanaPat) {
      await renderSettings({
        kind: 'error',
        title: 'Missing ASANA_PAT',
        message: 'Set ASANA_PAT in Secrets first, then retry auto-detect.',
      });
      return;
    }

    try {
      const asana = new AsanaClient(asanaPat);

      const gids = Array.from(sampleInput.matchAll(/\d{6,}/g)).map((m) => m[0]);
      if (!gids.length) {
        await renderSettings({
          kind: 'error',
          title: 'Invalid input',
          message: 'Could not find a numeric Asana GID in the provided value. Paste a task/project URL or a numeric GID.',
        });
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

      const updates: any = { projectId: p.id };
      if (workspaceGid) updates.workspaceGid = workspaceGid;
      if (autoFieldGid) updates.autoFieldGid = autoFieldGid;
      if (repoFieldGid) updates.repoFieldGid = repoFieldGid;
      if (statusFieldGid) updates.statusFieldGid = statusFieldGid;

      if (updates.workspaceGid || updates.autoFieldGid || updates.repoFieldGid || updates.statusFieldGid) {
        await upsertAsanaFieldConfig(updates);
      }

      const missing: string[] = [];
      if (!autoFieldGid) missing.push('AutoTask');
      if (!repoFieldGid) missing.push('Repo');
      if (!statusFieldGid) missing.push('STATUS');

      const foundLines = [
        workspaceGid ? `Workspace: ${workspaceGid}` : null,
        autoFieldGid ? `AutoTask: ${autoFieldGid}` : null,
        repoFieldGid ? `Repo: ${repoFieldGid}` : null,
        statusFieldGid ? `STATUS: ${statusFieldGid}` : null,
      ].filter((x): x is string => typeof x === 'string' && x.length > 0);

      const msgParts = [`Input: ${sampleInput}`, `Detected from ${source} GID: ${usedGid}`];
      if (foundLines.length) msgParts.push('', ...foundLines);
      if (missing.length) msgParts.push('', `Missing: ${missing.join(', ')}`);

      const ok = Boolean(autoFieldGid && repoFieldGid && statusFieldGid);
      const anyFound = Boolean(workspaceGid || autoFieldGid || repoFieldGid || statusFieldGid);

      await renderSettings({
        kind: ok ? 'success' : 'error',
        title: ok ? 'Asana field detection complete' : anyFound ? 'Asana field detection incomplete' : 'Asana field detection failed',
        message: msgParts.join('\n'),
      });
    } catch (e: any) {
      await renderSettings({
        kind: 'error',
        title: 'Asana API error',
        message: String(e?.message ?? e),
      });
    }
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
    const lang = getLangFromRequest(req);
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
    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(projectApiPage(p, tokens, null, membership.role === 'admin', lang));
  });

  r.post('/p/:slug/api/tokens/create', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
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
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectApiPage(p, tokens, token, true, lang));
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
    const lang = getLangFromRequest(req);
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
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectKnowledgePage(p, md, lang));
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
  // Backwards-compat shim (legacy callers inside this file).
  return pageShell({ title, body: `<div class="container">${body}</div>` });
}

function authShell(lang: UiLang, title: string, cardHtml: string): string {
  return pageShell({
    title,
    lang,
    variant: 'auth',
    body: `
      <div class="auth-top">${renderLanguageToggle(lang)}</div>
      <div class="auth-wrap">
        <div class="card auth-card">${cardHtml}</div>
      </div>
    `,
  });
}

function inlineAlert(type: 'success' | 'error' | 'warning' | 'info', msg: string): string {
  const title = type === 'error' ? 'Error' : type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Info';
  return `
    <div class="toast toast-${type}" style="position:relative;box-shadow:none;margin:0 0 14px">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-msg">${escapeHtml(msg)}</div>
    </div>
  `;
}

function loginPage(lang: UiLang, error?: string): string {
  const err = error ? inlineAlert('error', error) : '';

  return authShell(
    lang,
    t(lang, 'screens.login.title'),
    `
      <div class="auth-logo">Auto-Flow</div>
      <div class="muted" style="margin-bottom:16px">${escapeHtml(t(lang, 'screens.login.subtitle'))}</div>
      ${err}
      <form method="post" action="/login">
        <div class="row row-2">
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.login.username'))}</label>
            <input name="username" placeholder="user@example.com" />
            <div class="helper">${escapeHtml(t(lang, 'screens.login.username_help'))}</div>
          </div>
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.login.password'))}</label>
            <input name="password" type="password" placeholder="••••••••" />
            <div class="helper">${escapeHtml(t(lang, 'screens.login.password_help'))}</div>
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-md" style="width:100%" type="submit">${escapeHtml(t(lang, 'screens.login.submit'))}</button>
        </div>
      </form>
      <div class="helper" style="margin-top:16px">/init?token=INIT_ADMIN_TOKEN</div>
    `,
  );
}

function initAdminPage(lang: UiLang, error?: string): string {
  const err = error ? inlineAlert('error', error) : '';

  return authShell(
    lang,
    t(lang, 'screens.init.title'),
    `
      <div class="auth-logo">Auto-Flow</div>
      <div class="muted" style="margin-bottom:16px">${escapeHtml(t(lang, 'screens.init.subtitle'))}</div>
      ${err}
      <form method="post" action="/init">
        <div class="row">
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.init.token'))}</label>
            <input name="token" type="password" placeholder="paste token" />
            <div class="helper">${escapeHtml(t(lang, 'screens.init.token_help'))}</div>
          </div>
          <div class="row row-2">
            <div class="form-group">
              <label>${escapeHtml(t(lang, 'screens.init.username'))}</label>
              <input name="username" value="admin" placeholder="admin" />
              <div class="helper">${escapeHtml(t(lang, 'screens.init.username_help'))}</div>
            </div>
            <div class="form-group">
              <label>${escapeHtml(t(lang, 'screens.init.password'))}</label>
              <input name="password" type="password" placeholder="••••••••" />
              <div class="helper">${escapeHtml(t(lang, 'screens.init.password_help'))}</div>
            </div>
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-md" style="width:100%" type="submit">${escapeHtml(t(lang, 'screens.init.submit'))}</button>
        </div>
      </form>
    `,
  );
}

function invitePage(lang: UiLang, token: string, error?: string): string {
  const err = error ? inlineAlert('error', error) : '';

  return authShell(
    lang,
    t(lang, 'screens.invite.title'),
    `
      <div class="auth-logo">Auto-Flow</div>
      <div class="muted" style="margin-bottom:16px">${escapeHtml(t(lang, 'screens.invite.subtitle'))}</div>
      ${err}
      <form method="post" action="/invite/${encodeURIComponent(token)}">
        <div class="row row-2">
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.invite.username'))}</label>
            <input name="username" placeholder="john_doe" />
            <div class="helper">${escapeHtml(t(lang, 'screens.invite.username_help'))}</div>
          </div>
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.invite.password'))}</label>
            <input name="password" type="password" placeholder="••••••••" />
            <div class="helper">${escapeHtml(t(lang, 'screens.invite.password_help'))}</div>
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-md" style="width:100%" type="submit">${escapeHtml(t(lang, 'screens.invite.submit'))}</button>
        </div>
      </form>
    `,
  );
}

function appPage(lang: UiLang, username: string, projects: Array<{ slug: string; name: string }>): string {
  const projectCards = projects
    .map((p) => {
      return `
        <a class="card" href="/p/${encodeURIComponent(p.slug)}" style="display:block">
          <div style="font-weight:800;font-size:16px">${escapeHtml(p.name)}</div>
          <div class="muted" style="margin-top:6px">${escapeHtml(p.slug)}</div>
        </a>
      `;
    })
    .join('');

  const top = renderTopbar({
    title: t(lang, 'screens.projects.title'),
    subtitle: `Logged in as ${username}`,
    rightHtml:
      `
        <button class="btn btn-secondary btn-sm" type="button" data-action="create-invite">${escapeHtml(t(lang, 'screens.projects.create_invite'))}</button>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-create-project">${escapeHtml(t(lang, 'screens.projects.create_project'))}</button>
        <form method="post" action="/logout" style="display:inline">
          <button class="btn btn-ghost btn-sm" type="submit">${escapeHtml(t(lang, 'common.logout'))}</button>
        </form>
        ${renderLanguageToggle(lang)}
      `,
  });

  const modalCreateProject = `
    <div class="modal-backdrop" id="modal-create-project" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(t(lang, 'screens.projects.create_project_modal_title'))}</div>
          <button class="modal-close" type="button" data-close-modal="modal-create-project" aria-label="Close">×</button>
        </div>
        <form method="post" action="/app/projects">
          <div class="modal-body">
            <div class="row row-2">
              <div class="form-group">
                <label>${escapeHtml(t(lang, 'screens.projects.project_slug'))}</label>
                <input name="slug" placeholder="my-awesome-project" />
                <div class="helper">/^[a-z0-9-]+$/ (max 50)</div>
              </div>
              <div class="form-group">
                <label>${escapeHtml(t(lang, 'screens.projects.project_name'))}</label>
                <input name="name" placeholder="My Awesome Project" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-create-project">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalInvite = `
    <div class="modal-backdrop" id="modal-invite" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(t(lang, 'screens.projects.create_invite_modal_title'))}</div>
          <button class="modal-close" type="button" data-close-modal="modal-invite" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="muted" style="margin-bottom:12px">${escapeHtml(t(lang, 'screens.projects.invite_helper'))}</div>
          <div class="codeblock">
            <button type="button" class="codeblock-copy" data-copy>${escapeHtml(t(lang, 'common.copy'))}</button>
            <pre><code id="invite-url">...</code></pre>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-invite">${escapeHtml(t(lang, 'common.close'))}</button>
        </div>
      </div>
    </div>
  `;

  return pageShell({
    title: 'Projects',
    lang,
    body: `
      <div class="container">
        ${top}
        <div class="muted" style="margin:6px 0 16px"><a href="/docs">${escapeHtml(t(lang, 'screens.projects.open_docs'))}</a></div>
        <div class="grid grid-3">${projectCards || `<div class="card"><div class="muted">No projects yet</div></div>`}</div>
      </div>
      ${modalCreateProject}
      ${modalInvite}
    `,
    scriptsHtml: `
      <script>
        (function(){
          async function createInvite(){
            try{
              var res = await fetch('/app/invites', { method: 'POST', headers: { 'Accept': 'application/json' } });
              var data = await res.json();
              if(!res.ok) throw new Error((data && data.error) ? data.error : 'invite error');
              var code = document.getElementById('invite-url');
              if(code) code.textContent = String(data.url || '');
              window.uiOpenModal('modal-invite');
            }catch(err){
              window.toast('error', String(err && err.message ? err.message : err));
            }
          }
          document.addEventListener('click', function(e){
            var btn = e.target && e.target.closest ? e.target.closest('[data-action="create-invite"]') : null;
            if(!btn) return;
            e.preventDefault();
            createInvite();
          });
        })();
      </script>
    `,
  });
}

function inviteCreatedPage(lang: UiLang, url: string): string {
  const top = renderTopbar({
    title: t(lang, 'screens.projects.create_invite_modal_title'),
    rightHtml: `<a class="btn btn-secondary btn-sm" href="/app">${escapeHtml(t(lang, 'common.back'))}</a>${renderLanguageToggle(lang)}`,
  });
  return pageShell({
    title: 'Invite',
    lang,
    body: `<div class="container">${top}<div class="card">${renderCodeBlock(url, { copyLabel: t(lang, 'common.copy') })}</div></div>`,
  });
}

function projectTabs(p: { slug: string }, active: string, lang: UiLang): string {
  const tabs = [
    { key: 'home', label: 'Home', href: `/p/${p.slug}` },
    { key: 'settings', label: t(lang, 'screens.settings.title'), href: `/p/${p.slug}/settings` },
    { key: 'webhooks', label: t(lang, 'screens.webhooks.title'), href: `/p/${p.slug}/webhooks` },
    { key: 'integrations', label: t(lang, 'screens.integrations.title'), href: `/p/${p.slug}/integrations/opencode` },
    { key: 'api', label: t(lang, 'screens.api.title'), href: `/p/${p.slug}/api` },
    { key: 'knowledge', label: t(lang, 'screens.knowledge.title'), href: `/p/${p.slug}/knowledge` },
  ];
  return renderTabs(tabs, active);
}

function projectShell(lang: UiLang, p: { slug: string; name: string }, active: string, subtitle: string, inner: string): string {
  const top = renderTopbar({
    title: p.name,
    subtitle,
    tabsHtml: projectTabs(p, active, lang),
    rightHtml: `<a class="btn btn-secondary btn-sm" href="/app">${escapeHtml(t(lang, 'common.back'))}</a>${renderLanguageToggle(lang)}`,
  });

  return pageShell({
    title: `${p.name} - ${active}`,
    lang,
    body: `<div class="container">${top}${inner}</div>`,
  });
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

function withQuery(url: string, params: Record<string, string>): string {
  const u = url.includes('://') ? new URL(url) : new URL(url, 'http://local');
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  const s = `${u.pathname}${u.search}${u.hash}`;
  return url.includes('://') ? u.toString() : s;
}

function parseOpencodeNotice(query: any): { kind: 'success' | 'error'; title: string; message: string } | null {
  const status = String(query?.opencode ?? '').trim();
  if (status === 'connected') {
    return { kind: 'success', title: 'OpenCode connected', message: 'OAuth connection completed successfully.' };
  }
  if (status === 'disconnected') {
    return { kind: 'success', title: 'OpenCode disconnected', message: 'Integration has been disabled.' };
  }
  if (status === 'error') {
    const reason = String(query?.reason ?? '').trim();
    return { kind: 'error', title: 'OpenCode connection failed', message: reason || 'OAuth flow failed.' };
  }
  return null;
}

function normalizeBoolFlag(value: string | null | undefined): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
}

function shouldEmbedOpenCodeWeb(baseUrl: string, webUrl: string, embedEnabled: boolean): { embed: boolean; reason?: string } {
  if (!embedEnabled) return { embed: false, reason: 'Embed is disabled (OPENCODE_WEB_EMBED=1).'};
  try {
    const base = new URL(baseUrl);
    const url = new URL(webUrl);
    if (base.origin !== url.origin) {
      return { embed: false, reason: 'Embedding requires same-origin URL (use /opencode proxy).' };
    }
  } catch {
    return { embed: false, reason: 'Invalid OPENCODE_WEB_URL.' };
  }
  return { embed: true };
}

function opencodeIntegrationPage(params: {
  lang: UiLang;
  p: { slug: string; name: string };
  integration: { status: string; connected_at: string | null; last_error: string | null } | null;
  creds: { expires_at: string | null; scopes: string | null; token_type: string | null; last_refresh_at: string | null } | null;
  runs: Array<{ id: string; status: string; created_at: string; started_at: string | null; finished_at: string | null; output_summary: string | null }>;
  canAdmin: boolean;
  notice?: { kind: 'success' | 'error'; title: string; message: string } | null;
  baseUrl: string;
  webConfig: { url: string | null; embedEnabled: boolean; enabled: boolean };
}): string {
  const { lang, p, integration, creds, canAdmin } = params;
  const status = integration?.status ?? 'disabled';
  const scopes = creds?.scopes ? String(creds.scopes).split(/\s+/).filter(Boolean) : [];

  const noticeCard = params.notice
    ? `
      <div class="card" style="border-color:${params.notice.kind === 'success' ? '#2dd4bf' : '#ff6b6b'};margin-bottom:16px">
        <div style="font-weight:900">${escapeHtml(params.notice.title)}</div>
        <div class="muted" style="margin-top:8px;white-space:pre-wrap">${escapeHtml(params.notice.message)}</div>
      </div>
    `
    : '';

  const statusBadge = (s: string) => {
    const v = String(s ?? '').toUpperCase();
    const cls = v === 'CONNECTED' ? 'badge-success' : v === 'EXPIRED' || v === 'ERROR' ? 'badge-danger' : 'badge-gray';
    return `<span class="badge ${cls}">${escapeHtml(v)}</span>`;
  };

  const details = `
    <div class="card">
      <div style="font-weight:900">OpenCode OAuth</div>
      <div class="muted" style="margin-top:6px">Project-scoped OAuth for OpenCode CLI (external auth).</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <span class="badge ${status === 'connected' ? 'badge-success' : 'badge-gray'}">Status: ${escapeHtml(status)}</span>
        ${statusBadge(status)}
      </div>
      <div class="muted" style="margin-top:12px">Connected at: ${escapeHtml(integration?.connected_at ?? '-')}</div>
      <div class="muted" style="margin-top:6px">Token expires: ${escapeHtml(creds?.expires_at ?? '-')}</div>
      <div class="muted" style="margin-top:6px">Last refresh: ${escapeHtml(creds?.last_refresh_at ?? '-')}</div>
      <div class="muted" style="margin-top:6px">Scopes: ${escapeHtml(scopes.length ? scopes.join(' ') : '-')}</div>
      <div class="muted" style="margin-top:6px">Last error: ${escapeHtml(integration?.last_error ?? '-')}</div>
    </div>
  `;

  const actions = canAdmin
    ? `
      <div class="card">
        <div style="font-weight:900">Actions</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <form method="post" action="/p/${escapeHtml(p.slug)}/integrations/opencode/connect">
            <button class="btn btn-primary btn-md" type="submit">Connect</button>
          </form>
          <form method="post" action="/p/${escapeHtml(p.slug)}/integrations/opencode/reconnect">
            <button class="btn btn-secondary btn-md" type="submit">Reconnect</button>
          </form>
          <form method="post" action="/p/${escapeHtml(p.slug)}/integrations/opencode/disconnect">
            <button class="btn btn-secondary btn-md" type="submit">Disconnect</button>
          </form>
        </div>
      </div>
    `
    : '';

  const webUrl = params.webConfig.url;
  const embedCfg = webUrl
    ? shouldEmbedOpenCodeWeb(params.baseUrl, webUrl, params.webConfig.embedEnabled)
    : { embed: false, reason: params.webConfig.embedEnabled ? 'OPENCODE_WEB_URL is not set.' : undefined };
  const webEmbed = webUrl && embedCfg.embed
    ? `<iframe src="${escapeHtml(webUrl)}" style="width:100%;height:520px;border:1px solid var(--border);border-radius:12px"></iframe>`
    : '';
  const suggestedUrl = `${params.baseUrl.replace(/\/$/, '')}/opencode`;
  const webCard = webUrl && params.webConfig.enabled
    ? `
      <div class="card">
        <div style="font-weight:900">OpenCode Web UI</div>
        <div class="muted" style="margin-top:6px">Open the OpenCode web interface (if running).</div>
        <div style="margin-top:12px">
          <a class="btn btn-secondary btn-md" href="${escapeHtml(webUrl)}" target="_blank" rel="noreferrer">Open OpenCode Web UI</a>
        </div>
        ${embedCfg.reason ? `<div class="muted" style="margin-top:10px">${escapeHtml(embedCfg.reason)}</div>` : ''}
        ${webEmbed ? `<div style="margin-top:12px">${webEmbed}</div>` : ''}
      </div>
    `
    : '';

  const configCard = `
    <div class="card">
      <div style="font-weight:900">OpenCode Web Config</div>
      <div class="muted" style="margin-top:6px">Environment-based settings for the embedded UI.</div>
      <div class="muted" style="margin-top:10px">PUBLIC_BASE_URL: ${escapeHtml(params.baseUrl)}</div>
      <div class="muted" style="margin-top:6px">OPENCODE_WEB_URL: ${escapeHtml(webUrl ?? 'not set')}</div>
      <div class="muted" style="margin-top:6px">OPENCODE_WEB_EMBED: ${params.webConfig.embedEnabled ? '1' : '0'}</div>
      <div class="muted" style="margin-top:6px">OPENCODE_WEB_ENABLED: ${params.webConfig.enabled ? '1' : '0'}</div>
      ${!webUrl ? `<div class="muted" style="margin-top:6px">Suggested OPENCODE_WEB_URL: ${escapeHtml(suggestedUrl)}</div>` : ''}
      ${params.webConfig.enabled && embedCfg.reason ? `<div class="muted" style="margin-top:6px">Embed: ${escapeHtml(embedCfg.reason)}</div>` : ''}
      ${!params.webConfig.enabled ? `<div class="muted" style="margin-top:6px">Enable in /admin → OpenCode Web UI.</div>` : ''}
    </div>
  `;

  const runsRows = params.runs
    .map((run) => {
      const href = `/p/${p.slug}/integrations/opencode/runs/${encodeURIComponent(run.id)}`;
      return `
        <tr>
          <td class="mono"><a href="${href}">${escapeHtml(run.id)}</a></td>
          <td>${escapeHtml(String(run.status ?? ''))}</td>
          <td class="muted">${escapeHtml(run.created_at ?? '')}</td>
          <td class="muted">${escapeHtml(run.started_at ?? '-') }</td>
          <td class="muted">${escapeHtml(run.finished_at ?? '-') }</td>
          <td class="muted">${escapeHtml(run.output_summary ?? '')}</td>
        </tr>
      `;
    })
    .join('');

  const runsCard = `
    <div class="card">
      <div style="font-weight:900">Agent Runs</div>
      <div class="muted" style="margin-top:6px">Latest ${params.runs.length} runs (most recent first).</div>
      <div style="overflow:auto;margin-top:10px">
        <table class="table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Status</th>
              <th>Created</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            ${runsRows || '<tr><td colspan="6" class="muted">No runs yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return projectShell(
    lang,
    p,
    'integrations',
    `/p/${p.slug}/integrations/opencode`,
    `${noticeCard}<div class="grid" style="gap:16px">${details}${actions}${configCard}${webCard}${runsCard}</div>`,
  );
}

function opencodeRunDetailsPage(params: {
  lang: UiLang;
  p: { slug: string; name: string };
  run: { id: string; status: string; created_at: string; started_at: string | null; finished_at: string | null; output_summary: string | null; input_spec: any };
  logs: Array<{ id: string; stream: string; message: string; created_at: string }>;
}): string {
  const { lang, p, run, logs } = params;
  const logText = logs
    .map((l) => `[${l.created_at}] [${l.stream}] ${l.message}`)
    .join('\n');

  const details = `
    <div class="card">
      <div style="font-weight:900">Run ${escapeHtml(run.id)}</div>
      <div class="muted" style="margin-top:6px">Status: ${escapeHtml(run.status)}</div>
      <div class="muted" style="margin-top:6px">Created: ${escapeHtml(run.created_at)}</div>
      <div class="muted" style="margin-top:6px">Started: ${escapeHtml(run.started_at ?? '-') }</div>
      <div class="muted" style="margin-top:6px">Finished: ${escapeHtml(run.finished_at ?? '-') }</div>
      <div class="muted" style="margin-top:6px">Summary: ${escapeHtml(run.output_summary ?? '-') }</div>
      <div class="muted" style="margin-top:10px">Input:</div>
      <pre class="code" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(run.input_spec ?? {}, null, 2))}</pre>
    </div>
  `;

  const logsCard = `
    <div class="card">
      <div style="font-weight:900">Logs</div>
      <div class="muted" id="opencode-run-live" style="margin-top:6px">Live: connecting...</div>
      <pre id="opencode-run-logs" data-last-id="${escapeHtml(logs[logs.length - 1]?.id ?? '')}" class="code" style="white-space:pre-wrap;max-height:520px;overflow:auto;margin-top:10px">${escapeHtml(logText || 'No logs available.')}</pre>
    </div>
  `;

  const streamScript = [
    '<script>',
    '(() => {',
    "  const pre = document.getElementById('opencode-run-logs');",
    "  const status = document.getElementById('opencode-run-live');",
    '  if (!pre || !status) return;',
    "  const lastId = pre.getAttribute('data-last-id');",
    '  const url = new URL(window.location.href);',
    "  const streamUrl = url.pathname + '/stream' + (lastId ? '?since_id=' + encodeURIComponent(lastId) : '');",
    '  const es = new EventSource(streamUrl);',
    '  const appendLine = (line) => {',
    '    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;',
    "    pre.textContent = pre.textContent && pre.textContent !== 'No logs available.' ? pre.textContent + '\\n' + line : line;",
    '    if (atBottom) pre.scrollTop = pre.scrollHeight;',
    '  };',
    "  es.addEventListener('open', () => { status.textContent = 'Live: connected'; });",
    "  es.addEventListener('error', () => { status.textContent = 'Live: disconnected (retrying)'; });",
    "  es.addEventListener('log', (evt) => {",
    '    try {',
    '      const log = JSON.parse(evt.data);',
    "      const line = '[' + log.created_at + '] [' + log.stream + '] ' + log.message;",
    '      appendLine(line);',
    '    } catch (err) {',
    "      appendLine(String(evt.data || 'log'));",
    '    }',
    '  });',
    '})();',
    '</script>',
  ].join('\n');

  return projectShell(
    lang,
    p,
    'integrations',
    `/p/${p.slug}/integrations/opencode/runs/${run.id}`,
    `<div class="grid" style="gap:16px">${details}${logsCard}</div>${streamScript}`,
  );
}



function projectSettingsPage(
  p: { slug: string; name: string },
  asanaProjects: string[],
  repos: Array<{ owner: string; repo: string; is_default: boolean }>,
  secrets: { hasAsanaPat: boolean; hasGithubToken: boolean; hasGithubWebhookSecret: boolean },
  asanaFieldCfg: { workspace_gid: string | null; auto_field_gid: string | null; repo_field_gid: string | null; status_field_gid: string | null } | null,
  statusMap: Array<{ option_name: string; mapped_status: string }>,
  repoMap: Array<{ option_name: string; owner: string; repo: string }>,
  opencodeCfg: OpenCodeProjectConfig,
  links: Array<{ id: string; kind: string; url: string; title: string | null; tags: string | null }>,
  contacts: Array<{ id: string; role: string; name: string | null; handle: string | null }>,
  lang: UiLang,
  notice?: { kind: 'success' | 'error'; title: string; message: string },
): string {
  const noticeCard = notice
    ? `
      <div class="card" style="border-color:${notice.kind === 'success' ? '#2dd4bf' : '#ff6b6b'};margin-bottom:16px">
        <div style="font-weight:900">${escapeHtml(notice.title)}</div>
        <div class="muted" style="margin-top:8px;white-space:pre-wrap">${escapeHtml(notice.message)}</div>
      </div>
    `
    : '';

  const secretBadges = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <span class="badge ${secrets.hasAsanaPat ? 'badge-success' : 'badge-gray'}">Asana PAT: ${secrets.hasAsanaPat ? 'set' : 'missing'}</span>
      <span class="badge ${secrets.hasGithubToken ? 'badge-success' : 'badge-gray'}">GitHub Token: ${secrets.hasGithubToken ? 'set' : 'missing'}</span>
      <span class="badge ${secrets.hasGithubWebhookSecret ? 'badge-success' : 'badge-gray'}">GH Webhook Secret: ${secrets.hasGithubWebhookSecret ? 'set' : 'missing'}</span>
    </div>
  `;

  const secretsCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.secrets'))}</div>
      <div class="muted" style="margin-top:6px">Encrypted in DB. Leave blank to keep existing values.</div>
      ${secretBadges}
      <form method="post" action="/p/${p.slug}/settings/secrets" style="margin-top:16px">
        <div class="row row-2">
          <div class="form-group">
            <label>Asana Personal Access Token</label>
            <input name="asana_pat" type="password" placeholder="1/..." />
          </div>
          <div class="form-group">
            <label>GitHub Personal Access Token</label>
            <input name="github_token" type="password" placeholder="ghp_..." />
          </div>
          <div class="form-group">
            <label>GitHub Webhook Secret</label>
            <input name="github_webhook_secret" type="password" placeholder="••••••••" />
          </div>
          <div class="form-group">
            <label>OpenCode Workdir (local launch)</label>
            <input name="opencode_workdir" placeholder="/Users/.../repo" />
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.save'))}</button>
        </div>
      </form>
    </div>
  `;

  const opencodeCard = `
    <div class="card">
      <div style="font-weight:900">OpenCode Runner</div>
      <div class="muted" style="margin-top:6px">Configure how OpenCode runs for this project. OAuth tokens are managed in Integrations.</div>
      <form method="post" action="/p/${p.slug}/settings/opencode" style="margin-top:16px">
        <div class="row row-2">
          <div class="form-group">
            <label>Mode</label>
            <select name="opencode_mode">
              <option value="github-actions" ${opencodeCfg.mode === 'github-actions' ? 'selected' : ''}>github-actions</option>
              <option value="server-runner" ${opencodeCfg.mode === 'server-runner' ? 'selected' : ''}>server-runner</option>
              <option value="off" ${opencodeCfg.mode === 'off' ? 'selected' : ''}>off</option>
            </select>
            <div class="helper">github-actions posts a trigger comment. server-runner runs opencode on this server.</div>
          </div>
          <div class="form-group">
            <label>Auth Mode</label>
            <select name="opencode_auth_mode">
              <option value="oauth" ${opencodeCfg.authMode === 'oauth' ? 'selected' : ''}>oauth</option>
              <option value="local-cli" ${opencodeCfg.authMode === 'local-cli' ? 'selected' : ''}>local-cli</option>
            </select>
            <div class="helper">oauth uses project OAuth tokens. local-cli uses server login (opencode login).</div>
          </div>
          <div class="form-group">
            <label>Write Mode</label>
            <select name="opencode_policy_write_mode">
              <option value="pr_only" ${opencodeCfg.policy.writeMode === 'pr_only' ? 'selected' : ''}>pr_only</option>
              <option value="working_tree" ${opencodeCfg.policy.writeMode === 'working_tree' ? 'selected' : ''}>working_tree</option>
              <option value="read_only" ${opencodeCfg.policy.writeMode === 'read_only' ? 'selected' : ''}>read_only</option>
            </select>
            <div class="helper">Server-runner supports only pr_only. Other modes will block execution.</div>
          </div>
          <div class="form-group">
            <label>Trigger Comment</label>
            <input name="opencode_command" value="${escapeHtml(opencodeCfg.command)}" placeholder="/opencode implement" />
            <div class="helper">Must include /opencode or /oc.</div>
          </div>
          <div class="form-group">
            <label>PR Timeout (minutes)</label>
            <input name="opencode_pr_timeout_min" value="${escapeHtml(String(opencodeCfg.prTimeoutMinutes))}" placeholder="60" />
            <div class="helper">If no PR appears, the task is marked FAILED.</div>
          </div>
          <div class="form-group">
            <label>Model</label>
            <input name="opencode_model" value="${escapeHtml(opencodeCfg.model)}" placeholder="openai/gpt-4o-mini" />
            <div class="helper">Used for server-runner.</div>
          </div>
          <div class="form-group">
            <label>Workspace Root</label>
            <input name="opencode_workspace_root" value="${escapeHtml(opencodeCfg.workspaceRoot ?? '')}" placeholder="/var/lib/opencode/workspaces" />
            <div class="helper">Root folder where repos are cloned (server-runner).</div>
          </div>
          <div class="form-group">
            <label>Local CLI Ready</label>
            <label class="checkbox">
              <input name="opencode_local_cli_ready" type="checkbox" ${opencodeCfg.localCliReady ? 'checked' : ''} />
              <span>OpenCode CLI is logged in on the server</span>
            </label>
            <div class="helper">Run: <span class="mono">docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec app opencode login</span></div>
          </div>
          <div class="form-group">
            <label>Max files changed</label>
            <input name="opencode_policy_max_files_changed" value="${escapeHtml(opencodeCfg.policy.maxFilesChanged ? String(opencodeCfg.policy.maxFilesChanged) : '')}" placeholder="" />
            <div class="helper">Leave empty for no limit.</div>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Deny paths</label>
            <textarea name="opencode_policy_deny_paths" rows="4" placeholder="src/billing/**\nsecrets/*">${escapeHtml(opencodeCfg.policy.denyPaths.join('\n'))}</textarea>
            <div class="helper">One pattern per line. Supports * and ** globs.</div>
          </div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary btn-md" type="submit">Save OpenCode</button></div>
      </form>
      <div class="muted" style="margin-top:12px">Connect OpenCode OAuth in <a href="/p/${p.slug}/integrations/opencode">Integrations</a>.</div>
    </div>
  `;

  const asanaFieldsCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.asana_fields'))}</div>
      <div class="muted" style="margin-top:6px">Workspace + custom field GIDs.</div>
      <form method="post" action="/p/${p.slug}/settings/asana-fields" style="margin-top:16px">
        <div class="row row-2">
          <div class="form-group">
            <label>Workspace GID</label>
            <input name="workspace_gid" value="${escapeHtml(asanaFieldCfg?.workspace_gid ?? '')}" placeholder="123..." />
          </div>
          <div class="form-group">
            <label>Auto Field GID (AutoTask)</label>
            <input name="auto_field_gid" value="${escapeHtml(asanaFieldCfg?.auto_field_gid ?? '')}" placeholder="field gid" />
          </div>
          <div class="form-group">
            <label>Repo Field GID (enum)</label>
            <input name="repo_field_gid" value="${escapeHtml(asanaFieldCfg?.repo_field_gid ?? '')}" placeholder="field gid" />
          </div>
          <div class="form-group">
            <label>Status Field GID (enum)</label>
            <input name="status_field_gid" value="${escapeHtml(asanaFieldCfg?.status_field_gid ?? '')}" placeholder="field gid" />
          </div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
      </form>

      <div class="divider" style="margin:16px 0"></div>
      <div style="font-weight:900">Auto-detect field GIDs</div>
      <div class="muted" style="margin-top:6px">Uses your saved Asana PAT. Paste a task URL/GID (or project URL/GID) from where the fields are visible.</div>
      <form method="post" action="/p/${p.slug}/settings/asana-fields/detect" style="margin-top:14px">
        <div class="row row-2">
          <div class="form-group">
            <label>Sample task/project (GID or URL)</label>
            <input name="sample_task_gid" placeholder="https://app.asana.com/0/PROJECT/TASK" />
            <div class="helper">Expected field names: AutoTask, Repo, STATUS. In Asana URLs it's usually the 2nd number.</div>
          </div>
        </div>
        <div style="margin-top:12px"><button class="btn btn-secondary btn-md" type="submit">Detect</button></div>
      </form>
    </div>
  `;

  const statusRows = statusMap
    .map((m) => {
      return `
        <tr>
          <td>${escapeHtml(m.option_name)}</td>
          <td><span class="badge badge-status">${escapeHtml(m.mapped_status)}</span></td>
          <td style="width:1%;white-space:nowrap">
            <form method="post" action="/p/${p.slug}/settings/asana-status-map/delete" style="display:inline">
              <input type="hidden" name="option_name" value="${escapeHtml(m.option_name)}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'common.delete'))}</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  const statusCard = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.status_mapping'))}</div>
          <div class="muted" style="margin-top:6px">Asana option name → ACTIVE/BLOCKED/CANCELLED</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-status-map">+ Add</button>
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Asana Option</th><th>Mapped Status</th><th>Actions</th></tr></thead>
          <tbody>${statusRows || `<tr><td colspan="3" class="muted">No mappings yet</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const repoMapRows = repoMap
    .map((m) => {
      return `
        <tr>
          <td>${escapeHtml(m.option_name)}</td>
          <td>${escapeHtml(m.owner)}</td>
          <td>${escapeHtml(m.repo)}</td>
          <td style="width:1%;white-space:nowrap">
            <form method="post" action="/p/${p.slug}/settings/repo-map/delete" style="display:inline">
              <input type="hidden" name="option_name" value="${escapeHtml(m.option_name)}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'common.delete'))}</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  const repoMapCard = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.repo_mapping'))}</div>
          <div class="muted" style="margin-top:6px">Override Asana option name → owner/repo</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-repo-map">+ Add</button>
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Asana Option</th><th>Owner</th><th>Repo</th><th>Actions</th></tr></thead>
          <tbody>${repoMapRows || `<tr><td colspan="4" class="muted">No overrides</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const asanaRows = asanaProjects
    .map((gid) => {
      return `
        <tr>
          <td class="mono">${escapeHtml(gid)}</td>
          <td style="width:1%;white-space:nowrap">
            <form method="post" action="/p/${p.slug}/settings/asana/remove" style="display:inline">
              <input type="hidden" name="asana_project_gid" value="${escapeHtml(gid)}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'common.delete'))}</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  const asanaProjectsCard = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.asana_projects'))}</div>
          <div class="muted" style="margin-top:6px">Project GIDs used for sync.</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-asana-project">+ Add</button>
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Project GID</th><th>Actions</th></tr></thead>
          <tbody>${asanaRows || `<tr><td colspan="2" class="muted">None</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const ghRows = repos
    .map((r) => {
      const label = `${r.owner}/${r.repo}`;
      return `
        <tr>
          <td class="mono">${escapeHtml(label)}</td>
          <td>${r.is_default ? `<span class="badge badge-success">default</span>` : `<span class="badge badge-gray">-</span>`}</td>
          <td style="width:1%;white-space:nowrap">
            <form method="post" action="/p/${p.slug}/settings/repos/default" style="display:inline">
              <input type="hidden" name="owner" value="${escapeHtml(r.owner)}" />
              <input type="hidden" name="repo" value="${escapeHtml(r.repo)}" />
              <button class="btn btn-secondary btn-sm" type="submit">Set default</button>
            </form>
            <form method="post" action="/p/${p.slug}/settings/repos/remove" style="display:inline;margin-left:8px">
              <input type="hidden" name="owner" value="${escapeHtml(r.owner)}" />
              <input type="hidden" name="repo" value="${escapeHtml(r.repo)}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'common.delete'))}</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  const githubReposCard = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.github_repos'))}</div>
          <div class="muted" style="margin-top:6px">Repos where issues/PRs are created.</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-github-repo">+ Add</button>
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Repository</th><th>Default</th><th>Actions</th></tr></thead>
          <tbody>${ghRows || `<tr><td colspan="3" class="muted">None</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const contactRows = contacts
    .map((c) => {
      return `
        <tr>
          <td>${escapeHtml(c.role)}</td>
          <td>${escapeHtml(c.name ?? '')}</td>
          <td>${escapeHtml(c.handle ?? '')}</td>
          <td style="width:1%;white-space:nowrap">
            <form method="post" action="/p/${p.slug}/settings/contacts/delete" style="display:inline">
              <input type="hidden" name="id" value="${escapeHtml(c.id)}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'common.delete'))}</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  const contactsCard = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.contacts'))}</div>
          <div class="muted" style="margin-top:6px">Team contacts (reference).</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-contact">+ Add</button>
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Role</th><th>Name</th><th>Handle</th><th>Actions</th></tr></thead>
          <tbody>${contactRows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const linkRows = links
    .map((l) => {
      return `
        <tr>
          <td>${escapeHtml(l.kind)}</td>
          <td>${escapeHtml(l.title ?? '')}</td>
          <td><a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.url)}</a></td>
          <td>${escapeHtml(l.tags ?? '')}</td>
          <td style="width:1%;white-space:nowrap">
            <form method="post" action="/p/${p.slug}/settings/links/delete" style="display:inline">
              <input type="hidden" name="id" value="${escapeHtml(l.id)}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'common.delete'))}</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join('');

  const linksCard = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.settings.links'))}</div>
          <div class="muted" style="margin-top:6px">Docs, dashboards, runbooks.</div>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-link">+ Add</button>
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Kind</th><th>Title</th><th>URL</th><th>Tags</th><th>Actions</th></tr></thead>
          <tbody>${linkRows || `<tr><td colspan="5" class="muted">None</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  const modalStatusMap = `
    <div class="modal-backdrop" id="modal-status-map" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Status Mapping</div>
          <button class="modal-close" type="button" data-close-modal="modal-status-map" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/settings/asana-status-map">
          <div class="modal-body">
            <div class="row row-2">
              <div class="form-group">
                <label>Asana option name</label>
                <input name="option_name" placeholder="Cancelled" />
              </div>
              <div class="form-group">
                <label>Mapped status</label>
                <input name="mapped_status" placeholder="CANCELLED" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-status-map">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalRepoMap = `
    <div class="modal-backdrop" id="modal-repo-map" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Repo Mapping</div>
          <button class="modal-close" type="button" data-close-modal="modal-repo-map" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/settings/repo-map">
          <div class="modal-body">
            <div class="row row-3">
              <div class="form-group">
                <label>Asana option name</label>
                <input name="option_name" placeholder="Frontend" />
              </div>
              <div class="form-group">
                <label>Owner</label>
                <input name="owner" placeholder="my-org" />
              </div>
              <div class="form-group">
                <label>Repo</label>
                <input name="repo" placeholder="frontend-repo" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-repo-map">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalAsanaProject = `
    <div class="modal-backdrop" id="modal-asana-project" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Asana Project</div>
          <button class="modal-close" type="button" data-close-modal="modal-asana-project" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/settings/asana/add">
          <div class="modal-body">
            <div class="form-group">
              <label>Asana Project GID</label>
              <input name="asana_project_gid" placeholder="123456..." />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-asana-project">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalGithubRepo = `
    <div class="modal-backdrop" id="modal-github-repo" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add GitHub Repository</div>
          <button class="modal-close" type="button" data-close-modal="modal-github-repo" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/settings/repos/add">
          <div class="modal-body">
            <div class="row row-2">
              <div class="form-group">
                <label>Owner</label>
                <input name="owner" placeholder="my-org" />
              </div>
              <div class="form-group">
                <label>Repository</label>
                <input name="repo" placeholder="my-repo" />
              </div>
            </div>
            <div class="form-group" style="margin-top:12px">
              <label style="text-transform:none;letter-spacing:0;font-weight:700">Set as default</label>
              <div style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" name="is_default" value="yes" style="width:auto" />
                <div class="muted" style="font-size:13px">Default repo for new issues</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-github-repo">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalContact = `
    <div class="modal-backdrop" id="modal-contact" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Contact</div>
          <button class="modal-close" type="button" data-close-modal="modal-contact" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/settings/contacts/add">
          <div class="modal-body">
            <div class="row row-3">
              <div class="form-group"><label>Role</label><input name="role" placeholder="Developer" /></div>
              <div class="form-group"><label>Name</label><input name="name" placeholder="John Doe" /></div>
              <div class="form-group"><label>Handle</label><input name="handle" placeholder="john_doe" /></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-contact">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalLink = `
    <div class="modal-backdrop" id="modal-link" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Add Link</div>
          <button class="modal-close" type="button" data-close-modal="modal-link" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/settings/links/add">
          <div class="modal-body">
            <div class="row row-2">
              <div class="form-group"><label>Kind</label><input name="kind" placeholder="Wiki" /></div>
              <div class="form-group"><label>Title</label><input name="title" placeholder="Setup Guide" /></div>
              <div class="form-group"><label>URL</label><input name="url" placeholder="https://..." /></div>
              <div class="form-group"><label>Tags</label><input name="tags" placeholder="setup, docs" /></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-link">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const inner = `
    ${noticeCard}
    <div class="grid">
      ${secretsCard}
      ${opencodeCard}
      ${asanaFieldsCard}
      ${statusCard}
      ${repoMapCard}
      ${asanaProjectsCard}
      ${githubReposCard}
      ${contactsCard}
      ${linksCard}
    </div>
    ${modalStatusMap}
    ${modalRepoMap}
    ${modalAsanaProject}
    ${modalGithubRepo}
    ${modalContact}
    ${modalLink}
  `;

  return projectShell(lang, p, 'settings', `/p/${p.slug}/settings`, inner);
}

function projectApiPage(
  p: { slug: string; name: string },
  tokens: Array<{ id: string; name: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null; token_hash: string }>,
  createdToken: string | null = null,
  canAdmin = false,
  lang: UiLang,
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
    ? `
      <div class="card" style="margin-bottom:16px">
        <div class="badge badge-warning" style="margin-bottom:12px">${escapeHtml(t(lang, 'screens.api.token_created'))}</div>
        <div class="muted" style="margin-bottom:12px">${escapeHtml(t(lang, 'screens.api.token_warning'))}</div>
        ${renderCodeBlock(createdToken, { copyLabel: t(lang, 'common.copy') })}
        <div class="muted" style="margin-top:12px">Example:</div>
        ${renderCodeBlock(`curl -H "Authorization: Bearer ${createdToken}" ${base}/api/v1/projects/${p.slug}/summary`, { copyLabel: t(lang, 'common.copy') })}
      </div>
    `
    : '';

  const tokenRows = tokens
    .map((t0) => {
      const status = t0.revoked_at ? 'revoked' : 'active';
      const label = (t0.name ?? '').trim() ? `${escapeHtml(t0.name ?? '')}` : '(unnamed)';
      const hashShort = escapeHtml(String(t0.token_hash).slice(0, 10));
      const revokeBtn =
        canAdmin && !t0.revoked_at
          ? `
            <form method="post" action="/p/${p.slug}/api/tokens/revoke" style="display:inline">
              <input type="hidden" name="token_id" value="${escapeHtml(String(t0.id))}" />
              <button class="btn btn-danger btn-sm" type="submit">${escapeHtml(t(lang, 'screens.api.revoke'))}</button>
            </form>
          `
          : '';
      return `
        <tr>
          <td class="mono">${escapeHtml(String(t0.id))}</td>
          <td>${label}</td>
          <td><span class="badge ${status === 'active' ? 'badge-success' : 'badge-gray'}">${escapeHtml(status)}</span></td>
          <td class="mono muted">${hashShort}...</td>
          <td class="muted">${escapeHtml(String(t0.created_at))}</td>
          <td class="muted">${escapeHtml(String(t0.last_used_at ?? ''))}</td>
          <td class="muted">${escapeHtml(String(t0.revoked_at ?? ''))}</td>
          <td style="width:1%;white-space:nowrap">${revokeBtn}</td>
        </tr>
      `;
    })
    .join('');

  const createTokenModal = canAdmin
    ? `
      <div class="modal-backdrop" id="modal-create-token" role="dialog" aria-modal="true">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">${escapeHtml(t(lang, 'screens.api.create_token'))}</div>
            <button class="modal-close" type="button" data-close-modal="modal-create-token" aria-label="Close">×</button>
          </div>
          <form method="post" action="/p/${p.slug}/api/tokens/create">
            <div class="modal-body">
              <div class="form-group">
                <label>Name (optional)</label>
                <input name="name" placeholder="CI dashboard" />
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-create-token">${escapeHtml(t(lang, 'common.cancel'))}</button>
              <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
            </div>
          </form>
        </div>
      </div>
    `
    : '';

  const endpoints = `${base}/api/v1/openapi.json

${base}/api/v1/projects/${p.slug}/summary
${base}/api/v1/projects/${p.slug}/settings
${base}/api/v1/projects/${p.slug}/links
${base}/api/v1/projects/${p.slug}/contacts
${base}/api/v1/projects/${p.slug}/repos
${base}/api/v1/projects/${p.slug}/asana-projects
${base}/api/v1/projects/${p.slug}/tasks
${base}/api/v1/projects/${p.slug}/tasks/:id
${base}/api/v1/projects/${p.slug}/tasks/:id/events

${base}/api/v1/projects/${p.slug}/funnel
${base}/api/v1/projects/${p.slug}/lead-time
${base}/api/v1/projects/${p.slug}/failures
${base}/api/v1/projects/${p.slug}/webhooks/health
${base}/api/v1/projects/${p.slug}/jobs/health`;

  const inner = `
    ${createdBlock}
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.api.endpoints'))}</div>
      <div style="margin-top:12px">${renderCodeBlock(endpoints, { copyLabel: t(lang, 'common.copy') })}</div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900">${escapeHtml(t(lang, 'screens.api.tokens'))}</div>
          <div class="muted" style="margin-top:6px">Project-scoped Bearer tokens.</div>
        </div>
        ${canAdmin ? `<button class="btn btn-primary btn-sm" type="button" data-open-modal="modal-create-token">+ ${escapeHtml(t(lang, 'screens.api.create_token'))}</button>` : ''}
      </div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Hash</th><th>Created</th><th>Last used</th><th>Revoked</th><th></th></tr></thead>
          <tbody>${tokenRows || `<tr><td colspan="8" class="muted">No tokens yet</td></tr>`}</tbody>
        </table>
      </div>
      ${canAdmin ? '' : `<div class="muted" style="margin-top:12px">Only project admins can create/revoke API tokens.</div>`}
    </div>
    ${createTokenModal}
  `;

  return projectShell(lang, p, 'api', `/p/${p.slug}/api`, inner);
}

function projectKnowledgePage(p: { slug: string; name: string }, md: string, lang: UiLang): string {
  const safe = md.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const inner = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.knowledge.title'))}</div>
      <div class="muted" style="margin-top:6px">${escapeHtml(t(lang, 'screens.knowledge.subtitle'))}</div>
      <form method="post" action="/p/${p.slug}/knowledge" style="margin-top:16px">
        <div class="form-group">
          <label>${escapeHtml(t(lang, 'screens.knowledge.markdown'))}</label>
          <textarea name="markdown" style="min-height:280px;font-family:var(--font-mono);font-size:13px">${safe}</textarea>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'screens.knowledge.save'))}</button>
        </div>
      </form>
    </div>
  `;

  return projectShell(lang, p, 'knowledge', `/p/${p.slug}/knowledge`, inner);
}
