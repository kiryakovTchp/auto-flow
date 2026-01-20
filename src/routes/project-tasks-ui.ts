import type { Request, Response } from 'express';
import { Router } from 'express';

import { getProjectBySlug } from '../db/projects';
import { listTasksByProject, type TaskStatus, getTaskById } from '../db/tasks-v2';
import { getLatestTaskSpec, listTaskSpecs } from '../db/taskspecs';
import { listTaskEvents } from '../db/task-events';
import { requireSession } from '../security/sessions';
import { escapeHtml, pageShell } from '../services/html';

export function projectTasksUiRouter(): Router {
  const r = Router();

  r.get('/p/:slug', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const status = String(req.query.status ?? '').trim() as TaskStatus;
    const statusFilter = status ? status : undefined;

    const tasks = await listTasksByProject(p.id, statusFilter);

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(projectDashboardPage(p, tasks, statusFilter));
  });

  r.get('/p/:slug/t/:id', requireSession, async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const p = await getProjectBySlug(slug);
    if (!p) {
      res.status(404).send('Project not found');
      return;
    }

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    const specs = await listTaskSpecs(task.id);
    const latest = await getLatestTaskSpec(task.id);
    const events = await listTaskEvents(task.id);

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(taskPage(p, task, latest?.markdown ?? null, specs, events));
  });

  return r;
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

function projectDashboardPage(p: { slug: string; name: string }, tasks: any[], status: string | undefined): string {
  const statusOptions = ['','RECEIVED','TASKSPEC_CREATED','NEEDS_REPO','AUTO_DISABLED','CANCELLED','BLOCKED','ISSUE_CREATED','PR_CREATED','WAITING_CI','DEPLOYED','FAILED'];
  const rows = tasks
    .map((t) => {
      const issue = t.github_issue_url ? `<a href="${escapeHtml(t.github_issue_url)}" target="_blank">Issue</a>` : '-';
      const pr = t.github_pr_url ? `<a href="${escapeHtml(t.github_pr_url)}" target="_blank">PR</a>` : '-';
      const ci = t.ci_url ? `<a href="${escapeHtml(t.ci_url)}" target="_blank">CI</a>` : '-';
      return `<tr>
        <td><a href="/p/${p.slug}/t/${t.id}">${escapeHtml(String(t.id))}</a></td>
        <td>${escapeHtml(String(t.status))}</td>
        <td>${escapeHtml(t.title ?? '')}</td>
        <td>${issue}</td>
        <td>${pr}</td>
        <td>${ci}</td>
        <td class="muted">${escapeHtml(String(t.updated_at ?? ''))}</td>
      </tr>`;
    })
    .join('');

  const body = `
  <div class="card">
    <h1 style="margin:0 0 8px">${escapeHtml(p.name)}</h1>
    <div class="muted">/p/${escapeHtml(p.slug)}</div>
    ${projectNav(p, 'home')}

    <form method="get" action="/p/${p.slug}" style="margin:12px 0">
      <div class="row" style="display:grid;grid-template-columns: 220px 1fr;gap:12px;align-items:end">
        <div>
          <label class="muted" style="display:block;margin-bottom:6px">Status</label>
          <select name="status">
            ${statusOptions
              .map((s) => `<option value="${s}" ${s === (status ?? '') ? 'selected' : ''}>${s || 'ALL'}</option>`)
              .join('')}
          </select>
        </div>
        <div class="muted">Showing ${tasks.length} tasks</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
        <button type="submit">Apply</button>
      </div>
    </form>

    <form method="post" action="/p/${p.slug}/import/asana" style="margin:12px 0">
      <div class="row" style="display:grid;grid-template-columns: 220px 1fr;gap:12px;align-items:end">
        <div>
          <label class="muted" style="display:block;margin-bottom:6px">Import last N days</label>
          <input name="days" value="90" />
        </div>
        <div class="muted">Imports tasks updated recently from configured Asana project(s)</div>
      </div>
      <div style="margin-top:12px"><button type="submit">Sync from Asana</button></div>
    </form>

    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Status</th>
          <th>Title</th>
          <th>Issue</th>
          <th>PR</th>
          <th>CI</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="muted">No tasks yet. Fill /settings, then press Sync from Asana.</td></tr>'}
      </tbody>
    </table>

    <div class="muted" style="margin-top:12px"><a href="/app">← Back to projects</a></div>
  </div>`;

  return pageShell({ title: `${p.name} - tasks`, body });
}

function taskPage(
  p: { slug: string; name: string },
  task: any,
  latestSpec: string | null,
  specs: Array<{ version: number; markdown: string; created_at: string }>,
  events: Array<{ kind: string; message: string | null; created_at: string }>,
): string {
  const links = [
    task.github_issue_url ? `<a href="${escapeHtml(task.github_issue_url)}" target="_blank">GitHub Issue</a>` : null,
    task.github_pr_url ? `<a href="${escapeHtml(task.github_pr_url)}" target="_blank">PR</a>` : null,
    task.ci_url ? `<a href="${escapeHtml(task.ci_url)}" target="_blank">CI</a>` : null,
  ].filter(Boolean).join(' | ');

  const specList = specs
    .map((s) => `<div class="pill">v${s.version} <span class="muted">${escapeHtml(s.created_at)}</span></div>`)
    .join('');

  const eventList = events
    .map((e) => `<tr><td>${escapeHtml(e.created_at)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.message ?? '')}</td></tr>`)
    .join('');

  const body = `
  <div class="card">
    <h1 style="margin:0 0 8px">Task ${escapeHtml(String(task.id))}</h1>
    <div class="muted">Project: <a href="/p/${p.slug}">${escapeHtml(p.name)}</a></div>
    ${projectNav(p, '')}

    <div class="nav" style="margin-top:12px">
      <div class="pill">Status: ${escapeHtml(String(task.status))}</div>
      <div class="pill">Asana GID: ${escapeHtml(String(task.asana_gid))}</div>
    </div>

    <div style="margin-top:8px">${links || '<span class="muted">No links yet</span>'}</div>

    <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />

    <div class="muted">Title</div>
    <div style="margin-top:6px">${escapeHtml(task.title ?? '')}</div>

    <div class="muted" style="margin-top:16px">Latest TaskSpec</div>
    <pre>${escapeHtml(latestSpec ?? 'No TaskSpec yet')}</pre>

    <div class="muted" style="margin-top:16px">TaskSpec Versions</div>
    <div class="nav">${specList || '<span class="muted">No versions yet</span>'}</div>

    <div class="muted" style="margin-top:16px">Timeline</div>
    <table>
      <thead><tr><th>Time</th><th>Kind</th><th>Message</th></tr></thead>
      <tbody>${eventList || '<tr><td colspan="3" class="muted">No events yet</td></tr>'}</tbody>
    </table>

    <div class="muted" style="margin-top:12px"><a href="/p/${p.slug}">← Back to dashboard</a></div>
  </div>`;

  return pageShell({ title: `Task ${task.id}`, body });
}
