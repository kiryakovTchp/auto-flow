import type { Request, Response } from 'express';
import { Router } from 'express';

import { getProjectBySlug } from '../db/projects';
import { getMembership } from '../db/projects';
import { requireSession } from '../security/sessions';
import { importAsanaTasksForProject } from '../services/import-from-asana';
import { escapeHtml, pageShell, renderLanguageToggle, renderTopbar } from '../services/html';
import { getLangFromRequest } from '../services/i18n';

export function asanaImportUiRouter(): Router {
  const r = Router();

  r.post('/p/:slug/import/asana', requireSession, async (req: Request, res: Response) => {
    const lang = getLangFromRequest(req);
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const membership = await getMembership({ userId: (req as any).auth.userId, projectId: p.id });
    if (!membership || (membership.role !== 'admin' && membership.role !== 'editor')) {
      res.status(403).send('Forbidden');
      return;
    }

    const daysRaw = String((req.body as any)?.days ?? '90');
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 90));

    try {
      const result = await importAsanaTasksForProject({ projectId: p.id, projectSlug: p.slug, days });
      const top = renderTopbar({
        title: 'Import from Asana',
        subtitle: p.name,
        rightHtml: `<a class="btn btn-secondary btn-sm" href="/p/${escapeHtml(p.slug)}">Back</a>${renderLanguageToggle(lang)}`,
      });
      const body = `
        <div class="container">
          ${top}
          <div class="card"><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></div>
        </div>
      `;
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(pageShell({ title: 'Asana import', lang, body }));
    } catch (err: any) {
      const top = renderTopbar({
        title: 'Import from Asana - error',
        subtitle: p.name,
        rightHtml: `<a class="btn btn-secondary btn-sm" href="/p/${escapeHtml(p.slug)}">Back</a>${renderLanguageToggle(lang)}`,
      });
      const body = `
        <div class="container">
          ${top}
          <div class="card"><pre>${escapeHtml(String(err?.message ?? err))}</pre></div>
        </div>
      `;
      res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(pageShell({ title: 'Asana import error', lang, body }));
    }
  });

  return r;
}
