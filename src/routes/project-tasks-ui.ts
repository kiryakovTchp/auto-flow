import type { Request, Response } from 'express';
import { Router } from 'express';

import { getProjectBySlug } from '../db/projects';
import { getMembership } from '../db/projects';
import { getAsanaFieldConfig } from '../db/asana-config';
import { listProjectAsanaProjects, listProjectGithubRepos } from '../db/project-settings';
import { attachPrToTaskById, getTaskByProjectAsanaGid, listTasksByProject, type TaskStatus, getTaskById, updateTaskStatusById } from '../db/tasks-v2';
import { getLatestTaskSpec, listTaskSpecs } from '../db/taskspecs';
import { insertTaskEvent, listTaskEvents } from '../db/task-events';
import { requireSession } from '../security/sessions';
import { escapeHtml, pageShell } from '../services/html';
import { getProjectSecretPlain } from '../services/project-secure-config';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { processAsanaTaskStage5 } from '../services/pipeline-stage5';
import { setMergeCommitShaByTaskId } from '../db/tasks-extra';
import { finalizeTaskIfReady } from '../services/finalize';

export function projectTasksUiRouter(): Router {
  const r = Router();

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

  r.get('/p/:slug', requireSession, async (req: Request, res: Response) => {
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

    const status = String(req.query.status ?? '').trim() as TaskStatus;
    const statusFilter = status ? status : undefined;

    const tasks = await listTasksByProject(p.id, statusFilter);
    const asanaProjects = await listProjectAsanaProjects(p.id);
    const repos = await listProjectGithubRepos(p.id);

    const canEdit = membership.role === 'admin' || membership.role === 'editor';

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(projectDashboardPage(p, tasks, statusFilter, { asanaProjects, repos, canEdit }));
  });

  r.get('/p/:slug/t/:id', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    const specs = await listTaskSpecs(task.id);
    const latest = await getLatestTaskSpec(task.id);
    const events = await listTaskEvents(task.id);

    const repos = await listProjectGithubRepos(p.id);

    const canEdit = membership.role === 'admin' || membership.role === 'editor';

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(taskPage(p, task, latest?.markdown ?? null, specs, events, repos, { canEdit }));
  });

  r.post('/p/:slug/tasks/create', requireSession, async (req: Request, res: Response) => {
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

    const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
    const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
    if (!asanaPat || !ghToken) {
      res.status(400).send('Missing ASANA_PAT or GITHUB_TOKEN in project secrets');
      return;
    }

    const title = String((req.body as any)?.title ?? '').trim();
    const notes = String((req.body as any)?.notes ?? '').trim();
    if (!title) {
      res.status(400).send('Title is required');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const asanaProjectGid = String((req.body as any)?.asana_project_gid ?? '').trim() || asanaProjects[0];
    if (!asanaProjectGid || !asanaProjects.includes(asanaProjectGid)) {
      res.status(400).send('Invalid Asana project');
      return;
    }

    const autoEnabled = String((req.body as any)?.auto_enabled ?? '').trim() === 'on';
    const repoChoice = parseOwnerRepo(String((req.body as any)?.repo ?? ''));

    const asana = new AsanaClient(asanaPat);
    const created = await asana.createTask({ name: title, notes: notes || null, projects: [asanaProjectGid] });

    const fieldCfg = await getAsanaFieldConfig(p.id);
    if (fieldCfg) {
      const updates: Record<string, string | boolean | null> = {};
      if (fieldCfg.auto_field_gid) {
        updates[fieldCfg.auto_field_gid] = autoEnabled;
      }

      if (repoChoice && fieldCfg.repo_field_gid) {
        const options = await asana.getEnumOptionsForCustomField(fieldCfg.repo_field_gid);
        const opt = options.find((o) => o.name.trim() === `${repoChoice.owner}/${repoChoice.repo}`);
        if (!opt) {
          res.status(400).send('Repo option not found in Asana Repo field. Use "Sync repos to Asana field" first.');
          return;
        }
        updates[fieldCfg.repo_field_gid] = opt.gid;
      }

      if (Object.keys(updates).length) {
        await asana.setTaskCustomFields(created.taskGid, updates);
      }
    }

    await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: created.taskGid });
    const row = await getTaskByProjectAsanaGid(p.id, created.taskGid);
    if (row?.id) {
      await insertTaskEvent({
        taskId: row.id,
        kind: 'manual.create_task',
        message: `Created from UI in Asana project ${asanaProjectGid}`,
        userId: (req as any).auth.userId,
      });
      res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(row.id)}`);
      return;
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}`);
  });

  r.post('/p/:slug/t/:id/issue/create', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    if (task.github_issue_number) {
      res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
      return;
    }

    if (task.status !== 'NEEDS_REPO') {
      res.status(400).send('Task is not in NEEDS_REPO state');
      return;
    }

    const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
    if (!asanaPat) {
      res.status(400).send('Missing ASANA_PAT in project secrets');
      return;
    }

    const repoChoice = parseOwnerRepo(String((req.body as any)?.repo ?? ''));
    if (!repoChoice) {
      res.status(400).send('Invalid repo');
      return;
    }

    const fieldCfg = await getAsanaFieldConfig(p.id);
    if (!fieldCfg?.repo_field_gid) {
      res.status(400).send('Missing Asana repo field config (repo_field_gid) in project settings');
      return;
    }

    const asana = new AsanaClient(asanaPat);
    const options = await asana.getEnumOptionsForCustomField(fieldCfg.repo_field_gid);
    const opt = options.find((o) => o.name.trim() === `${repoChoice.owner}/${repoChoice.repo}`);
    if (!opt) {
      res.status(400).send('Repo option not found in Asana Repo field. Use "Sync repos to Asana field" first.');
      return;
    }

    await asana.setTaskCustomFields(task.asana_gid, { [fieldCfg.repo_field_gid]: opt.gid });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.repo_set',
      message: `Set repo to ${repoChoice.owner}/${repoChoice.repo} (Asana custom field)`,
      userId: (req as any).auth.userId,
    });

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      res.status(400).send('No Asana project GIDs configured in Settings');
      return;
    }

    await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.issue_create',
      message: 'Triggered pipeline after setting repo',
      userId: (req as any).auth.userId,
    });

    res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
  });

  r.post('/p/:slug/t/:id/retry', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      res.status(400).send('No Asana project GIDs configured in Settings');
      return;
    }

    await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    await insertTaskEvent({ taskId: task.id, kind: 'manual.retry', message: 'Retry pipeline', userId: (req as any).auth.userId });
    res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
  });

  r.post('/p/:slug/t/:id/repo/change', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    if (task.github_issue_number) {
      res.status(400).send('Cannot change repo after issue creation');
      return;
    }

    const repoChoice = parseOwnerRepo(String((req.body as any)?.repo ?? ''));
    if (!repoChoice) {
      res.status(400).send('Invalid repo');
      return;
    }

    const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
    if (!asanaPat) {
      res.status(400).send('Missing ASANA_PAT in project secrets');
      return;
    }

    const fieldCfg = await getAsanaFieldConfig(p.id);
    if (!fieldCfg?.repo_field_gid) {
      res.status(400).send('Missing Asana repo field config (repo_field_gid) in project settings');
      return;
    }

    const asana = new AsanaClient(asanaPat);
    const options = await asana.getEnumOptionsForCustomField(fieldCfg.repo_field_gid);
    const opt = options.find((o) => o.name.trim() === `${repoChoice.owner}/${repoChoice.repo}`);
    if (!opt) {
      res.status(400).send('Repo option not found in Asana Repo field. Use "Sync repos to Asana field" first.');
      return;
    }

    await asana.setTaskCustomFields(task.asana_gid, { [fieldCfg.repo_field_gid]: opt.gid });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.change_repo',
      message: `Changed repo to ${repoChoice.owner}/${repoChoice.repo}`,
      userId: (req as any).auth.userId,
    });

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      res.status(400).send('No Asana project GIDs configured in Settings');
      return;
    }

    await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
  });

  r.post('/p/:slug/t/:id/pr/force', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    if (!task.github_issue_number) {
      res.status(400).send('Task has no GitHub issue yet');
      return;
    }

    const prNumber = parsePrNumber(String((req.body as any)?.pr ?? ''));
    if (!prNumber) {
      res.status(400).send('Invalid PR (use number or PR URL)');
      return;
    }

    const repos = await listProjectGithubRepos(p.id);
    const repoChoiceRaw = String((req.body as any)?.repo ?? '').trim();
    const selected = repoChoiceRaw ? parseOwnerRepo(repoChoiceRaw) : null;
    const fallback = task.github_repo_owner && task.github_repo_name ? { owner: task.github_repo_owner, repo: task.github_repo_name } : null;
    const def = repos.find((r) => r.is_default) ?? repos[0] ?? null;
    const repoChoice = selected ?? fallback ?? (def ? { owner: def.owner, repo: def.repo } : null);
    if (!repoChoice) {
      res.status(400).send('No repo configured');
      return;
    }

    const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      res.status(400).send('Missing GITHUB_TOKEN in project secrets');
      return;
    }

    const gh = new GithubClient(ghToken, repoChoice.owner, repoChoice.repo);
    const pr = await gh.getPullRequest(prNumber);
    if (!pr.html_url) {
      res.status(400).send('Could not resolve PR');
      return;
    }

    await attachPrToTaskById({ taskId: task.id, prNumber: pr.number, prUrl: pr.html_url, sha: pr.head_sha || undefined });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.force_pr',
      message: `Linked PR #${pr.number} ${pr.html_url}`,
      userId: (req as any).auth.userId,
    });

    await updateTaskStatusById(task.id, pr.merged ? 'WAITING_CI' : 'PR_CREATED');

    if (pr.merged && pr.merge_commit_sha) {
      await setMergeCommitShaByTaskId({ taskId: task.id, sha: pr.merge_commit_sha });
    }

    // Refresh + attempt finalize if CI already present.
    const refreshed = await getTaskById(task.id);
    if (refreshed) {
      if (pr.merged) {
        await insertTaskEvent({
          taskId: task.id,
          kind: 'manual.force_pr',
          message: 'PR is merged; task moved to WAITING_CI',
          userId: (req as any).auth.userId,
        });
      }
      // Finalize requires Asana token.
      const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
      if (asanaPat) {
        const asana = new AsanaClient(asanaPat);
        await finalizeTaskIfReady({ task: refreshed, asana, github: gh });
      }
    }

    res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
  });

  r.post('/p/:slug/t/:id/resync', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    const asanaProjects = await listProjectAsanaProjects(p.id);
    const asanaProjectGid = asanaProjects[0];
    if (!asanaProjectGid) {
      res.status(400).send('No Asana project GIDs configured in Settings');
      return;
    }

    await processAsanaTaskStage5({ projectId: p.id, asanaProjectGid, asanaTaskGid: task.asana_gid });
    await insertTaskEvent({
      taskId: task.id,
      kind: 'manual.resync',
      message: 'Triggered manual resync from Asana',
      userId: (req as any).auth.userId,
    });

    res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
  });

  r.post('/p/:slug/t/:id/note', requireSession, async (req: Request, res: Response) => {
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

    const id = String(req.params.id);
    const task = await getTaskById(id);
    if (!task || task.project_id !== p.id) {
      res.status(404).send('Task not found');
      return;
    }

    const note = String((req.body as any)?.note ?? '').trim();
    if (!note) {
      res.status(400).send('Note is empty');
      return;
    }

    const asanaPat = await getProjectSecretPlain(p.id, 'ASANA_PAT');
    if (!asanaPat) {
      res.status(400).send('Missing ASANA_PAT in project secrets');
      return;
    }

    const asana = new AsanaClient(asanaPat);
    await asana.addComment(task.asana_gid, note);
    await insertTaskEvent({ taskId: task.id, kind: 'manual.note', message: note, userId: (req as any).auth.userId });

    res.redirect(`/p/${encodeURIComponent(p.slug)}/t/${encodeURIComponent(task.id)}`);
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

function projectDashboardPage(
  p: { slug: string; name: string },
  tasks: any[],
  status: string | undefined,
  opts: { asanaProjects: string[]; repos: Array<{ owner: string; repo: string }>; canEdit: boolean },
): string {
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

    ${opts.canEdit ? `
      <form method="post" action="/p/${p.slug}/tasks/create" style="margin:12px 0">
        <div class="row" style="display:grid;grid-template-columns: 1fr 1fr;gap:12px;align-items:end">
          <div>
            <label class="muted" style="display:block;margin-bottom:6px">Create task title</label>
            <input name="title" placeholder="New task" />
          </div>
          <div>
            <label class="muted" style="display:block;margin-bottom:6px">Asana project</label>
            <select name="asana_project_gid">
              ${opts.asanaProjects.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="margin-top:10px">
          <label class="muted" style="display:block;margin-bottom:6px">Notes</label>
          <textarea name="notes" style="width:100%;box-sizing:border-box;min-height:90px;border-radius:12px;border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);color:#e8eef7;padding:10px 12px;"></textarea>
        </div>
        <div class="row" style="display:grid;grid-template-columns: 1fr 220px 220px;gap:12px;align-items:end;margin-top:10px">
          <div>
            <label class="muted" style="display:block;margin-bottom:6px">Repo (optional)</label>
            <select name="repo">
              <option value="">(none)</option>
              ${opts.repos
                .map((r) => {
                  const v = `${r.owner}/${r.repo}`;
                  return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
                })
                .join('')}
            </select>
          </div>
          <div>
            <label class="muted" style="display:block;margin-bottom:6px">AutoTask</label>
            <input type="checkbox" name="auto_enabled" checked />
          </div>
          <div>
            <button type="submit">Create Task</button>
          </div>
        </div>
        <div class="muted" style="margin-top:8px">Creates an Asana task and runs the pipeline.</div>
      </form>
    ` : ''}

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
  events: Array<{ kind: string; message: string | null; created_at: string; source?: string | null; event_type?: string | null; delivery_id?: string | null }>,
  repos: Array<{ owner: string; repo: string }>,
  opts: { canEdit: boolean },
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
    .map((e) => {
      const src = e.source ?? '';
      const t = e.event_type ?? e.kind;
      const meta = e.delivery_id ? ` delivery=${e.delivery_id}` : '';
      return `<tr>
        <td>${escapeHtml(e.created_at)}</td>
        <td>${escapeHtml(src || '-')}${escapeHtml(meta)}</td>
        <td>${escapeHtml(t)}</td>
        <td>${escapeHtml(e.message ?? '')}</td>
      </tr>`;
    })
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

    ${opts.canEdit ? `
      <div style="margin-top:12px">
        <div class="muted">Actions</div>
        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/retry" style="margin-top:10px">
          <button type="submit">Retry pipeline</button>
        </form>
        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/resync" style="margin-top:10px">
          <button type="submit">Re-sync from Asana</button>
        </form>
        ${!task.github_issue_number ? `
          <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/repo/change" style="margin-top:10px">
            <div class="row" style="display:grid;grid-template-columns: 1fr 220px;gap:12px;align-items:end">
              <div>
                <label class="muted" style="display:block;margin-bottom:6px">Change repo (updates Asana Repo field)</label>
                <select name="repo">
                  ${repos
                    .map((r) => {
                      const v = `${r.owner}/${r.repo}`;
                      return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
                    })
                    .join('')}
                </select>
              </div>
              <div><button type="submit">Change Repo</button></div>
            </div>
          </form>
        ` : ''}

        ${task.github_issue_number ? `
          <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/pr/force" style="margin-top:10px">
            <div class="row" style="display:grid;grid-template-columns: 1fr 1fr 220px;gap:12px;align-items:end">
              <div>
                <label class="muted" style="display:block;margin-bottom:6px">Force link PR (number or URL)</label>
                <input name="pr" placeholder="123 or https://github.com/.../pull/123" />
              </div>
              <div>
                <label class="muted" style="display:block;margin-bottom:6px">Repo</label>
                <select name="repo">
                  <option value="">(use task/default)</option>
                  ${repos
                    .map((r) => {
                      const v = `${r.owner}/${r.repo}`;
                      return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
                    })
                    .join('')}
                </select>
              </div>
              <div><button type="submit">Force Link PR</button></div>
            </div>
            <div class="muted" style="margin-top:8px">Use when PR body is missing strict "Fixes #${escapeHtml(String(task.github_issue_number))}".</div>
          </form>
        ` : ''}

        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/note" style="margin-top:10px">
          <label class="muted" style="display:block;margin-bottom:6px">Add note (also posts to Asana)</label>
          <textarea name="note" style="width:100%;box-sizing:border-box;min-height:90px;border-radius:12px;border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);color:#e8eef7;padding:10px 12px;"></textarea>
          <div style="margin-top:10px"><button type="submit">Post Note</button></div>
        </form>
      </div>
    ` : ''}

    ${!task.github_issue_number && task.status === 'NEEDS_REPO' ? `
      <div style="margin-top:12px">
        <div class="muted">Repo Required</div>
        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/issue/create" style="margin-top:10px">
          <div class="row" style="display:grid;grid-template-columns: 1fr 220px;gap:12px;align-items:end">
            <div>
              <label class="muted" style="display:block;margin-bottom:6px">Select repo</label>
              <select name="repo">
                ${repos
                  .map((r) => {
                    const v = `${r.owner}/${r.repo}`;
                    return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
                  })
                  .join('')}
              </select>
            </div>
            <div>
              <button type="submit">Create Issue</button>
            </div>
          </div>
          <div class="muted" style="margin-top:8px">Used for status NEEDS_REPO or manual recovery.</div>
        </form>
      </div>
    ` : ''}

    <hr style="border:0;border-top:1px solid rgba(232,238,247,0.12);margin:16px 0" />

    <div class="muted">Title</div>
    <div style="margin-top:6px">${escapeHtml(task.title ?? '')}</div>

    <div class="muted" style="margin-top:16px">Latest TaskSpec</div>
    <pre>${escapeHtml(latestSpec ?? 'No TaskSpec yet')}</pre>

    <div class="muted" style="margin-top:16px">TaskSpec Versions</div>
    <div class="nav">${specList || '<span class="muted">No versions yet</span>'}</div>

    <div class="muted" style="margin-top:16px">Timeline</div>
     <table>
       <thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Message</th></tr></thead>
       <tbody>${eventList || '<tr><td colspan="4" class="muted">No events yet</td></tr>'}</tbody>
     </table>

    <div class="muted" style="margin-top:12px"><a href="/p/${p.slug}">← Back to dashboard</a></div>
  </div>`;

  return pageShell({ title: `Task ${task.id}`, body });
}
