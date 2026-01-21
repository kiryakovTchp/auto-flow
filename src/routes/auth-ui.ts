import type { Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';

import { getEnv } from '../config/env';
import {
  consumeInvite,
  createSession,
  createUser,
  getInviteByTokenHash,
  getUserByUsername,
  deleteSession,
} from '../db/auth';
import { createMembership, createProject, getProjectBySlug, listProjects } from '../db/projects';
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
import { getProjectSecretPlain, setProjectSecret } from '../services/project-secure-config';
import { tokenHash } from '../security/init-admin';
import { authenticateUser, newSessionId, optionalSession, requireSession, SESSION_COOKIE } from '../security/sessions';

export function authUiRouter(): Router {
  const r = Router();

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
    const projects = await listProjects();
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


  r.get('/p/:slug/settings', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
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

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(projectSettingsPage(p, asanaProjects, repos, { hasAsanaPat, hasGithubToken, hasGithubWebhookSecret }, asanaFieldCfg, statusMap, repoMap));
  });

  r.post('/p/:slug/settings/secrets', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
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
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectSubPage(p, 'api'));
  });

  r.get('/p/:slug/knowledge', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
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
    `<div class="card">\n      <h1>Projects</h1>\n      <div class="muted">Logged in as ${username}</div>\n      <form method="post" action="/logout" style="margin-top:10px">\n        <button type="submit">Logout</button>\n      </form>\n      <div class="nav" style="margin-top:14px">${list || '<span class="muted">No projects yet</span>'}</div>\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      <h1>Create Project</h1>\n      <form method="post" action="/app/projects">\n        <div class="row">\n          <div>\n            <label>Slug</label>\n            <input name="slug" placeholder="my-tool" />\n          </div>\n          <div>\n            <label>Name</label>\n            <input name="name" placeholder="My Tool" />\n          </div>\n        </div>\n        <div style="margin-top:12px">\n          <button type="submit">Create</button>\n        </div>\n      </form>\n    </div>`,
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

function projectPage(p: { slug: string; name: string }): string {
  return layout(
    p.name,
    `<div class="card">\n      <h1>${p.name}</h1>\n      <div class="muted">/p/${p.slug}</div>\n      ${projectNav(p, 'home')}\n      <div class="muted">Stage 1 placeholder. Next stages add tasks list, integrations, and webhooks per project.</div>\n      <div style="margin-top:12px"><a href="/app">← Back to projects</a></div>\n    </div>`,
  );
}

function projectSubPage(p: { slug: string; name: string }, active: string): string {
  return layout(
    `${p.name} - ${active}`,
    `<div class="card">\n      <h1>${p.name}</h1>\n      <div class="muted">/p/${p.slug}/${active}</div>\n      ${projectNav(p, active)}\n      <div class="muted">Placeholder screen: ${active}.</div>\n      <div style="margin-top:12px"><a href="/p/${p.slug}">← Back</a></div>\n    </div>`,
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
      <div class="muted" style="margin-top:8px">MVP: paste GIDs manually. Next: UI picker from Asana API.</div>
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

  return layout(
    `${p.name} - settings`,
    `<div class="card">\n      <h1>${p.name}</h1>\n      <div class="muted">/p/${p.slug}/settings</div>\n      ${projectNav(p, 'settings')}\n      <div class="muted">Stage 2: edit project settings.</div>\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${secretsBlock}\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${asanaList}\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      ${repoList}\n      <div style="margin-top:12px"><a href="/p/${p.slug}">← Back</a></div>\n    </div>`,
  );
}

function projectWebhooksPage(p: { slug: string; name: string }, githubUrl: string, asanaUrls: string): string {
  const asanaBlock = asanaUrls
    ? `<pre style="white-space:pre-wrap">${escapeHtml(asanaUrls)}</pre>`
    : `<div class="muted">Add Asana project GIDs in Settings to see Asana webhook URLs.</div>`;

  return layout(
    `${p.name} - webhooks`,
    `<div class="card">\n      <h1>${p.name}</h1>\n      <div class="muted">/p/${p.slug}/webhooks</div>\n      ${projectNav(p, 'webhooks')}\n      <div class="muted">Stage 3: per-project webhook endpoints. Setup/validation UI will be added next.</div>\n      <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />\n      <div class="muted">GitHub webhook URL:</div>\n      <pre style="white-space:pre-wrap">${escapeHtml(githubUrl)}</pre>\n      <div class="muted" style="margin-top:12px">Asana webhook URL(s):</div>\n      ${asanaBlock}\n      <div class="muted" style="margin-top:12px">Validation: MVP is manual (GitHub Settings + Asana webhook setup). Auto-create is scheduled later.</div>\n      <div style="margin-top:12px"><a href="/p/${p.slug}">← Back</a></div>\n    </div>`,
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
