import type { Request, Response } from 'express';
import { Router } from 'express';

import { getProjectBySlug } from '../db/projects';
import { getMembership } from '../db/projects';
import { listProjectAsanaProjects, listProjectGithubRepos } from '../db/project-settings';
import { listProjectWebhooks, upsertProjectWebhook } from '../db/project-webhooks';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { getProjectSecretPlain } from '../services/project-secure-config';
import { joinUrl } from '../services/url';
import { requireSession } from '../security/sessions';
import { syncReposToAsanaRepoField } from '../services/sync-repos-to-asana';
import { escapeHtml, pageShell, renderCodeBlock, renderLanguageToggle, renderTabs, renderTopbar } from '../services/html';
import { getLangFromRequest, t, type UiLang } from '../services/i18n';

export function projectWebhooksUiRouter(): Router {
  const r = Router();

  const resolveBaseUrl = (req: Request): string => {
    const envBase = String(process.env.PUBLIC_BASE_URL ?? '').trim();
    return envBase || String(req.protocol + '://' + req.get('host'));
  };

  r.get('/p/:slug/webhooks', requireSession, async (req: Request, res: Response) => {
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

    const base = resolveBaseUrl(req);
    const asanaProjects = await listProjectAsanaProjects(p.id);

    const asanaUrls = asanaProjects.map((gid) => `${base}/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(gid)}`);
    const githubUrl = `${base}/webhooks/github/${encodeURIComponent(p.slug)}`;

    const hooks = await listProjectWebhooks(p.id);

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(webhooksPage({ lang, p, githubUrl, asanaUrls, hooks, githubValidation: null, repoSyncResult: null, canAdmin: membership.role === 'admin' }));
  });

  r.post('/p/:slug/webhooks/asana/setup', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit webhooks');
      return;
    }

    const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
    if (!asanaPat) {
      res.status(400).send('Missing ASANA_PAT in project secrets');
      return;
    }

    const baseUrl = String((req.body as any)?.public_base_url ?? '').trim();
    if (!baseUrl) {
      res.status(400).send('public_base_url required');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const asana = new AsanaClient(asanaPat);

    for (const asanaProjectGid of asanaProjects) {
      const targetUrl = joinUrl(baseUrl, `/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(asanaProjectGid)}`);

      const created = await asana.createWebhook({
        resourceGid: asanaProjectGid,
        targetUrl,
        filters: [
          { resource_type: 'task', action: 'added' },
          // Stage 5: react to AutoTask/repo/status custom field changes.
          // Subscribe to all task changes.
          { resource_type: 'task', action: 'changed' },
        ],
      });

      await upsertProjectWebhook({
        projectId: p.id,
        provider: 'asana',
        asanaProjectGid,
        webhookGid: created.webhookGid,
        encryptedSecret: created.hookSecret ? (await import('../services/project-webhook-secrets')).encryptWebhookSecret(created.hookSecret) : null,
        targetUrl,
      });
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/webhooks`);
  });

  r.post('/p/:slug/webhooks/asana/sync-repos', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit webhooks');
      return;
    }

    try {
      const r0 = await syncReposToAsanaRepoField({ projectId: p.id });
      const base = resolveBaseUrl(req);
      const asanaUrls = (await listProjectAsanaProjects(p.id)).map((gid) => `${base}/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(gid)}`);
      const githubUrl = `${base}/webhooks/github/${encodeURIComponent(p.slug)}`;
      const hooks = await listProjectWebhooks(p.id);
      const html = webhooksPage({
        lang,
        p,
        githubUrl,
        asanaUrls,
        hooks,
        githubValidation: null,
        repoSyncResult: JSON.stringify(r0),
        canAdmin: membership.role === 'admin',
      });
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (err: any) {
      res.status(500).send(String(err?.message ?? err));
    }
  });

  r.post('/p/:slug/webhooks/github/validate', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || membership.role !== 'admin') {
      res.status(403).send('Only project admins can edit webhooks');
      return;
    }

    const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      res.status(400).send('Missing GITHUB_TOKEN in project secrets');
      return;
    }

    const base = resolveBaseUrl(req);
    const expectedUrl = `${base}/webhooks/github/${encodeURIComponent(p.slug)}`;

    const repos = await listProjectGithubRepos(p.id);
    const report: string[] = [];

    for (const r0 of repos) {
      const gh = new GithubClient(ghToken, r0.owner, r0.repo);
      const hooks = await gh.listWebhooks();
      const match = hooks.find((h) => h.config?.url === expectedUrl);
      report.push(`${r0.owner}/${r0.repo}: ${match ? 'OK' : 'MISSING'}`);
    }

    const html = webhooksPage({
      lang,
      p,
      githubUrl: expectedUrl,
      asanaUrls: (await listProjectAsanaProjects(p.id)).map((gid) => `${base}/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(gid)}`),
      hooks: await listProjectWebhooks(p.id),
      githubValidation: report.join('\n'),
      repoSyncResult: null,
      canAdmin: membership.role === 'admin',
    });

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  return r;
}

function webhooksPage(params: {
  lang: UiLang;
  p: { slug: string; name: string };
  githubUrl: string;
  asanaUrls: string[];
  hooks: Array<{ provider: string; asana_project_gid: string; webhook_gid: string | null; target_url: string | null; last_delivery_at: string | null }>;
  githubValidation: string | null;
  repoSyncResult: string | null;
  canAdmin: boolean;
}): string {
  const lang = params.lang;
  const p = params.p;

  const tabs = renderTabs(
    [
      { key: 'home', label: 'Home', href: `/p/${p.slug}` },
      { key: 'settings', label: t(lang, 'screens.settings.title'), href: `/p/${p.slug}/settings` },
      { key: 'webhooks', label: t(lang, 'screens.webhooks.title'), href: `/p/${p.slug}/webhooks` },
      { key: 'api', label: t(lang, 'screens.api.title'), href: `/p/${p.slug}/api` },
      { key: 'knowledge', label: t(lang, 'screens.knowledge.title'), href: `/p/${p.slug}/knowledge` },
    ],
    'webhooks',
  );

  const top = renderTopbar({
    title: p.name,
    subtitle: `/p/${p.slug}/webhooks`,
    tabsHtml: tabs,
    rightHtml: `<a class="btn btn-secondary btn-sm" href="/p/${p.slug}">${escapeHtml(t(lang, 'common.back'))}</a>${renderLanguageToggle(lang)}`,
  });

  const githubSetupText = [
    `Payload URL: ${params.githubUrl}`,
    'Content type: application/json',
    'Secret: (Project Settings -> Secrets)',
    'Events: Issues, Issue comments, Pull requests, Workflow runs',
  ].join('\n');

  const hooksText = params.hooks.length
    ? params.hooks
        .map((h) => {
          const extra = h.asana_project_gid ? ` asana_project_gid=${h.asana_project_gid}` : '';
          return `${h.provider}${extra} webhook_gid=${h.webhook_gid ?? '-'} last=${h.last_delivery_at ?? '-'}`;
        })
        .join('\n')
    : 'No deliveries yet';

  const githubCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.webhooks.github_webhook_url'))}</div>
      <div style="margin-top:12px">${renderCodeBlock(params.githubUrl, { copyLabel: t(lang, 'common.copy') })}</div>
      <div class="muted" style="margin-top:12px">GitHub Settings -> Webhooks</div>
      <div style="margin-top:10px">${renderCodeBlock(githubSetupText, { copyLabel: t(lang, 'common.copy') })}</div>
    </div>
  `;

  const asanaCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.webhooks.asana_webhook_urls'))}</div>
      <div style="margin-top:12px">${renderCodeBlock(params.asanaUrls.join('\n'), { copyLabel: t(lang, 'common.copy') })}</div>
    </div>
  `;

  const setupCard = params.canAdmin
    ? `
      <div class="card">
        <div style="font-weight:900">${escapeHtml(t(lang, 'screens.webhooks.setup_asana'))}</div>
        <form method="post" action="/p/${escapeHtml(p.slug)}/webhooks/asana/setup" style="margin-top:16px">
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.webhooks.public_base_url'))}</label>
            <input name="public_base_url" placeholder="https://xxxx.ngrok-free.app" />
            <div class="helper">Base URL for webhook callbacks (no trailing slash)</div>
          </div>
          <div style="margin-top:12px"><button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'screens.webhooks.setup_asana'))}</button></div>
        </form>
      </div>
    `
    : '';

  const actionsCard = params.canAdmin
    ? `
      <div class="card">
        <div style="font-weight:900">Validation</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <form method="post" action="/p/${escapeHtml(p.slug)}/webhooks/asana/sync-repos" style="display:inline">
            <button class="btn btn-secondary btn-md" type="submit">${escapeHtml(t(lang, 'screens.webhooks.sync_repos'))}</button>
          </form>
          <form method="post" action="/p/${escapeHtml(p.slug)}/webhooks/github/validate" style="display:inline">
            <button class="btn btn-secondary btn-md" type="submit">${escapeHtml(t(lang, 'screens.webhooks.validate_github'))}</button>
          </form>
        </div>
        <div class="muted" style="margin-top:14px">Repo sync result</div>
        <div style="margin-top:10px">${renderCodeBlock(params.repoSyncResult ?? 'Not run yet', { copyLabel: t(lang, 'common.copy') })}</div>
        <div class="muted" style="margin-top:14px">GitHub validation</div>
        <div style="margin-top:10px">${renderCodeBlock(params.githubValidation ?? 'Not checked yet', { copyLabel: t(lang, 'common.copy') })}</div>
      </div>
    `
    : '';

  const healthCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.webhooks.health'))}</div>
      <div style="margin-top:12px">${renderCodeBlock(hooksText, { copyLabel: t(lang, 'common.copy') })}</div>
    </div>
  `;

  const body = `
    <div class="container">
      ${top}
      <div class="grid" style="gap:16px">
        ${githubCard}
        ${asanaCard}
        ${setupCard}
        ${actionsCard}
        ${healthCard}
      </div>
    </div>
  `;

  return pageShell({ title: `${p.name} - webhooks`, lang, body });
}
