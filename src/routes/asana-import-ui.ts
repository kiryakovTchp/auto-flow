import type { Request, Response } from 'express';
import { Router } from 'express';

import { getProjectBySlug } from '../db/projects';
import { requireSession } from '../security/sessions';
import { importAsanaTasksForProject } from '../services/import-from-asana';
import { pageShell, escapeHtml } from '../services/html';

export function asanaImportUiRouter(): Router {
  const r = Router();

  r.post('/p/:slug/import/asana', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const daysRaw = String((req.body as any)?.days ?? '90');
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 90));

    try {
      const result = await importAsanaTasksForProject({ projectId: p.id, projectSlug: p.slug, days });
      const body = `
        <div class="card">
          <h1 style="margin:0 0 8px">Import from Asana</h1>
          <div class="muted">Project: <a href="/p/${escapeHtml(p.slug)}">${escapeHtml(p.name)}</a></div>
          <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
          <div style="margin-top:12px"><a href="/p/${escapeHtml(p.slug)}">← Back</a></div>
        </div>
      `;
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(pageShell({ title: 'Asana import', body }));
    } catch (err: any) {
      const body = `
        <div class="card">
          <h1 style="margin:0 0 8px">Import from Asana - error</h1>
          <pre>${escapeHtml(String(err?.message ?? err))}</pre>
          <div style="margin-top:12px"><a href="/p/${escapeHtml(p.slug)}">← Back</a></div>
        </div>
      `;
      res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(pageShell({ title: 'Asana import error', body }));
    }
  });

  return r;
}
