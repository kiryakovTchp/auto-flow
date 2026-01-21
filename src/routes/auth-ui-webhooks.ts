import type { Request, Response } from 'express';
import { Router } from 'express';

import { getProjectBySlug } from '../db/projects';
import { listProjectAsanaProjects, listProjectGithubRepos } from '../db/project-settings';
import { listProjectWebhooks, upsertProjectWebhook } from '../db/project-webhooks';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { getProjectSecretPlain } from '../services/project-secure-config';
import { joinUrl } from '../services/url';
import { requireSession } from '../security/sessions';
import { syncReposToAsanaRepoField } from '../services/sync-repos-to-asana';

export function projectWebhooksUiRouter(): Router {
  const r = Router();

  r.get('/p/:slug/webhooks', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const base = String(req.protocol + '://' + req.get('host'));
    const asanaProjects = await listProjectAsanaProjects(p.id);

    const asanaUrls = asanaProjects.map((gid) => `${base}/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(gid)}`);
    const githubUrl = `${base}/webhooks/github/${encodeURIComponent(p.slug)}`;

    const hooks = await listProjectWebhooks(p.id);

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(webhooksPage({
      slug: p.slug,
      name: p.name,
      githubUrl,
      asanaUrls,
      hooks,
      githubValidation: null,
      repoSyncResult: null,
    }));
  });

  r.post('/p/:slug/webhooks/asana/setup', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
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
          // MVP: subscribe to all task changes.
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
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    try {
      const r0 = await syncReposToAsanaRepoField({ projectId: p.id });
      const base = String(req.protocol + '://' + req.get('host'));
      const asanaUrls = (await listProjectAsanaProjects(p.id)).map((gid) => `${base}/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(gid)}`);
      const githubUrl = `${base}/webhooks/github/${encodeURIComponent(p.slug)}`;
      const hooks = await listProjectWebhooks(p.id);
      const html = webhooksPage({
        slug: p.slug,
        name: p.name,
        githubUrl,
        asanaUrls,
        hooks,
        githubValidation: null,
        repoSyncResult: JSON.stringify(r0),
      });
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (err: any) {
      res.status(500).send(String(err?.message ?? err));
    }
  });

  r.post('/p/:slug/webhooks/github/validate', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      res.status(400).send('Missing GITHUB_TOKEN in project secrets');
      return;
    }

    const base = String(req.protocol + '://' + req.get('host'));
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
      slug: p.slug,
      name: p.name,
      githubUrl: expectedUrl,
      asanaUrls: (await listProjectAsanaProjects(p.id)).map((gid) => `${base}/webhooks/asana/${encodeURIComponent(p.slug)}?asana_project_gid=${encodeURIComponent(gid)}`),
      hooks: await listProjectWebhooks(p.id),
      githubValidation: report.join('\n'),
      repoSyncResult: null,
    });

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  return r;
}

function webhooksPage(params: {
  slug: string;
  name: string;
  githubUrl: string;
  asanaUrls: string[];
  hooks: Array<{ provider: string; asana_project_gid: string; webhook_gid: string | null; target_url: string | null; last_delivery_at: string | null }>;
  githubValidation: string | null;
  repoSyncResult: string | null;
}): string {
  const asanaList = params.asanaUrls.length ? params.asanaUrls.join('\n') : '';

  const hooksText = params.hooks.length
    ? params.hooks
        .map((h) => {
          const extra = h.asana_project_gid ? ` asana_project_gid=${h.asana_project_gid}` : '';
          return `${h.provider}${extra} webhook_gid=${h.webhook_gid ?? '-'} last=${h.last_delivery_at ?? '-'}`;
        })
        .join('\n')
    : 'No deliveries yet';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.name)} - webhooks</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0f14;color:#e8eef7;}
  .wrap{max-width:860px;margin:0 auto;padding:24px 16px;}
  .card{border:1px solid rgba(232,238,247,0.12);background:rgba(255,255,255,0.06);border-radius:14px;padding:16px;}
  pre{border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);border-radius:12px;padding:10px 12px;white-space:pre-wrap;}
  label{font-size:12px;color:rgba(232,238,247,0.72);display:block;margin-bottom:6px;}
  input{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);color:#e8eef7;padding:10px 12px;}
  button{border:1px solid rgba(232,238,247,0.12);background:rgba(255,255,255,0.08);color:#e8eef7;padding:10px 12px;border-radius:12px;cursor:pointer;}
  a{color:#7aa2ff;text-decoration:none;}
  .muted{color:rgba(232,238,247,0.72);font-size:13px;}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1 style="margin:0 0 8px">${escapeHtml(params.name)} / webhooks</h1>
    <div class="muted">/p/${escapeHtml(params.slug)}/webhooks</div>
    <div style="margin-top:12px" class="muted">GitHub webhook URL:</div>
    <pre>${escapeHtml(params.githubUrl)}</pre>

    <div style="margin-top:12px" class="muted">Copy/paste: GitHub Settings → Webhooks</div>
    <pre>${escapeHtml(
      'Payload URL: ' + params.githubUrl +
      '\nContent type: application/json' +
      '\nSecret: (from Project Settings → Secrets)' +
      '\nEvents: Issues, Issue comments, Pull requests, Workflow runs'
    )}</pre>

    <div style="margin-top:12px" class="muted">Asana webhook URL(s):</div>
    <pre>${escapeHtml(asanaList)}</pre>

    <div style="margin-top:12px" class="muted">Setup Asana webhooks (needs public base URL):</div>
    <form method="post" action="/p/${escapeHtml(params.slug)}/webhooks/asana/setup">
      <label>Public Base URL</label>
      <input name="public_base_url" placeholder="https://xxxx.ngrok-free.app" />
      <div style="margin-top:12px">
        <button type="submit">Setup Asana Webhooks</button>
      </div>
    </form>

    <div style="margin-top:12px" class="muted">Repo field helper (MVP): add enum options for each configured repo</div>
    <form method="post" action="/p/${escapeHtml(params.slug)}/webhooks/asana/sync-repos">
      <div style="margin-top:12px">
        <button type="submit">Sync repos to Asana Repo field</button>
      </div>
    </form>
    <div style="margin-top:12px" class="muted">Repo sync result:</div>
    <pre>${escapeHtml(params.repoSyncResult ?? 'Not run yet')}</pre>

    <div style="margin-top:12px" class="muted">Validate GitHub webhooks (manual-only MVP):</div>
    <form method="post" action="/p/${escapeHtml(params.slug)}/webhooks/github/validate">
      <div style="margin-top:12px">
        <button type="submit">Validate GitHub Webhooks</button>
      </div>
    </form>

    <div style="margin-top:12px" class="muted">Result (copy):</div>
    <pre>${escapeHtml(params.githubValidation ?? 'Not checked yet')}</pre>

    <div style="margin-top:12px" class="muted">Webhook health:</div>
    <pre>${escapeHtml(hooksText)}</pre>

    <div style="margin-top:12px"><a href="/p/${escapeHtml(params.slug)}">← Back</a></div>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
