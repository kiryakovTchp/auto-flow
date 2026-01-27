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
import { escapeHtml, pageShell, renderLanguageToggle, renderTabs, renderTopbar } from '../services/html';
import { getLangFromRequest, t, type UiLang } from '../services/i18n';
import { getProjectSecretPlain } from '../services/project-secure-config';
import { getOpenCodeProjectConfig, type OpenCodePolicyConfig } from '../services/opencode-runner';
import { enqueueJob } from '../db/job-queue';
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

  function parseBoolFromString(s: string): boolean | null {
    const v = s.trim().toLowerCase();
    if (!v) return null;
    if (['true', 'yes', 'on', 'enabled', 'enable', '1'].includes(v)) return true;
    if (['false', 'no', 'off', 'disabled', 'disable', '0'].includes(v)) return false;
    return null;
  }

  function resolveNextUrl(input: unknown, fallback: string): string {
    const s = String(input ?? '').trim();
    if (s.startsWith('/')) return s;
    return fallback;
  }

  r.get('/p/:slug', requireSession, async (req: Request, res: Response) => {
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

    const status = String(req.query.status ?? '').trim() as TaskStatus;
    const statusFilter = status ? status : undefined;

    const tasks = await listTasksByProject(p.id, statusFilter);
    const asanaProjects = await listProjectAsanaProjects(p.id);
    const repos = await listProjectGithubRepos(p.id);
    const opencodeCfg = await getOpenCodeProjectConfig(p.id);

    const canEdit = membership.role === 'admin' || membership.role === 'editor';

    res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        projectDashboardPage(lang, p, tasks, statusFilter, {
          asanaProjects,
          repos,
          canEdit,
          opencodeMode: opencodeCfg.mode,
          opencodePolicy: opencodeCfg.policy,
        }),
      );
  });

  r.get('/p/:slug/t/:id', requireSession, async (req: Request, res: Response) => {
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
      .send(taskPage(lang, p, task, latest?.markdown ?? null, specs, events, repos, { canEdit }));
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
        // AutoTask can be either a checkbox (boolean) or an enum (True/False).
        let autoValue: string | boolean | null = autoEnabled;
        try {
          const createdTask = await asana.getTask(created.taskGid);
          const cfs = Array.isArray((createdTask as any)?.custom_fields) ? (createdTask as any).custom_fields : [];
          const f = cfs.find((x: any) => String(x?.gid ?? '') === String(fieldCfg.auto_field_gid));
          const subtype = typeof f?.resource_subtype === 'string' ? String(f.resource_subtype) : '';
          if (subtype === 'enum') {
            const options = await asana.getEnumOptionsForCustomField(fieldCfg.auto_field_gid);
            const opt = options.find((o) => parseBoolFromString(o.name) === autoEnabled);
            if (!opt) {
              res.status(400).send('AutoTask field is enum but does not have a True/False option. Create options named True and False.');
              return;
            }
            autoValue = opt.gid;
          }
        } catch {
          // best-effort detection; fall back to boolean
        }
        updates[fieldCfg.auto_field_gid] = autoValue;
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

  r.post('/p/:slug/t/:id/opencode/run', requireSession, async (req: Request, res: Response) => {
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

    if (task.github_pr_number) {
      res.status(400).send('Task already has a PR linked');
      return;
    }

    const opencodeCfg = await getOpenCodeProjectConfig(p.id);
    if (opencodeCfg.mode === 'off') {
      res.status(400).send('OpenCode mode is off');
      return;
    }

    const nextUrl = resolveNextUrl((req.body as any)?.next, `/p/${encodeURIComponent(p.slug)}`);

    if (opencodeCfg.mode === 'server-runner') {
      await enqueueJob({
        projectId: p.id,
        provider: 'internal',
        kind: 'opencode.run',
        payload: { projectId: p.id, taskId: task.id },
      });
      await insertTaskEvent({
        taskId: task.id,
        kind: 'opencode.job_enqueued',
        message: 'Manual OpenCode run enqueued',
        userId: (req as any).auth.userId,
      });
      res.redirect(nextUrl);
      return;
    }

    const repoOwner = task.github_repo_owner;
    const repoName = task.github_repo_name;
    if (!repoOwner || !repoName) {
      res.status(400).send('Missing repo metadata on task');
      return;
    }

    const ghToken = await getProjectSecretPlain(p.id, 'GITHUB_TOKEN');
    if (!ghToken) {
      res.status(400).send('Missing GITHUB_TOKEN in project secrets');
      return;
    }

    const gh = new GithubClient(ghToken, repoOwner, repoName);
    await gh.addIssueComment(task.github_issue_number, opencodeCfg.command);
    await insertTaskEvent({
      taskId: task.id,
      kind: 'github.issue_commented',
      message: `Manual OpenCode trigger posted: ${opencodeCfg.command}`,
      userId: (req as any).auth.userId,
      refJson: { issueNumber: task.github_issue_number, comment: opencodeCfg.command },
    });

    res.redirect(nextUrl);
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

function projectTabs(p: { slug: string }, active: string, lang: UiLang): string {
  return renderTabs(
    [
      { key: 'home', label: 'Home', href: `/p/${p.slug}` },
      { key: 'settings', label: t(lang, 'screens.settings.title'), href: `/p/${p.slug}/settings` },
      { key: 'webhooks', label: t(lang, 'screens.webhooks.title'), href: `/p/${p.slug}/webhooks` },
      { key: 'integrations', label: t(lang, 'screens.integrations.title'), href: `/p/${p.slug}/integrations/opencode` },
      { key: 'api', label: t(lang, 'screens.api.title'), href: `/p/${p.slug}/api` },
      { key: 'knowledge', label: t(lang, 'screens.knowledge.title'), href: `/p/${p.slug}/knowledge` },
    ],
    active,
  );
}

function statusBadge(status: string): string {
  const s = String(status ?? '').toUpperCase();
  const cls =
    s === 'DEPLOYED'
      ? 'badge-success'
      : s === 'FAILED'
        ? 'badge-danger'
        : s === 'BLOCKED' || s === 'NEEDS_REPO'
          ? 'badge-warning'
          : s === 'CANCELLED' || s === 'AUTO_DISABLED'
            ? 'badge-gray'
            : 'badge-status';
  return `<span class="badge ${cls}">${escapeHtml(s)}</span>`;
}

function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function projectDashboardPage(
  lang: UiLang,
  p: { slug: string; name: string },
  tasks: any[],
  status: string | undefined,
  opts: {
    asanaProjects: string[];
    repos: Array<{ owner: string; repo: string }>;
    canEdit: boolean;
    opencodeMode: string;
    opencodePolicy: OpenCodePolicyConfig;
  },
): string {
  const top = renderTopbar({
    title: p.name,
    subtitle: `/p/${p.slug}`,
    tabsHtml: projectTabs(p, 'home', lang),
    rightHtml: `<a class="btn btn-secondary btn-sm" href="/app">${escapeHtml(t(lang, 'common.back'))}</a>${renderLanguageToggle(lang)}`,
  });

  const statusOptions = [
    '',
    'RECEIVED',
    'TASKSPEC_CREATED',
    'NEEDS_REPO',
    'AUTO_DISABLED',
    'CANCELLED',
    'BLOCKED',
    'ISSUE_CREATED',
    'PR_CREATED',
    'WAITING_CI',
    'DEPLOYED',
    'FAILED',
  ];

  const nextUrl = status ? `/p/${p.slug}?status=${encodeURIComponent(status)}` : `/p/${p.slug}`;

  const rows = tasks
    .map((t0) => {
      const href = `/p/${p.slug}/t/${encodeURIComponent(String(t0.id))}`;
      const issue = t0.github_issue_url ? `<a href="${escapeHtml(t0.github_issue_url)}" target="_blank" rel="noreferrer">Issue</a>` : '';
      const pr = t0.github_pr_url ? `<a href="${escapeHtml(t0.github_pr_url)}" target="_blank" rel="noreferrer">PR</a>` : '';
      const ci = t0.ci_url ? `<a href="${escapeHtml(t0.ci_url)}" target="_blank" rel="noreferrer">CI</a>` : '';
      const actionNotes: string[] = [];
      if (!opts.canEdit) actionNotes.push('Read-only');
      if (!t0.github_issue_number) actionNotes.push('No issue');
      if (t0.github_pr_number) actionNotes.push('PR linked');
      if (opts.opencodeMode === 'off') actionNotes.push('OpenCode off');
      if (opts.opencodeMode === 'server-runner' && opts.opencodePolicy.writeMode !== 'pr_only') {
        actionNotes.push(`Policy write_mode=${opts.opencodePolicy.writeMode}`);
      }

      const canRun =
        opts.canEdit &&
        opts.opencodeMode !== 'off' &&
        opts.opencodePolicy.writeMode === 'pr_only' &&
        Boolean(t0.github_issue_number) &&
        !t0.github_pr_number;

      const lastError =
        t0.status === 'FAILED' && t0.last_error
          ? `Last error: ${truncateText(String(t0.last_error), 140)}`
          : '';
      if (lastError) actionNotes.push(lastError);

      const notesHtml = actionNotes.length
        ? `<div class="muted" style="margin-top:6px;white-space:pre-line">${escapeHtml(actionNotes.join('\n'))}</div>`
        : '';

      const runButton = canRun
        ? `
          <form method="post" action="/p/${p.slug}/t/${encodeURIComponent(String(t0.id))}/opencode/run" style="display:inline">
            <input type="hidden" name="next" value="${escapeHtml(nextUrl)}" />
            <button class="btn btn-secondary btn-sm" type="submit">${escapeHtml(t(lang, 'screens.dashboard.run_now'))}</button>
          </form>
        `
        : '';
      const actionCell = `${runButton}${notesHtml || (runButton ? '' : '<span class="muted">-</span>')}`;
      return `
        <tr data-row-href="${href}">
          <td class="mono"><a href="${href}">${escapeHtml(String(t0.id))}</a></td>
          <td>${statusBadge(String(t0.status))}</td>
          <td>${escapeHtml(t0.title ?? '')}</td>
          <td>${issue || '<span class="muted">-</span>'}</td>
          <td>${pr || '<span class="muted">-</span>'}</td>
          <td>${ci || '<span class="muted">-</span>'}</td>
          <td class="muted">${escapeHtml(String(t0.updated_at ?? ''))}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join('');

  const actions = `
    <div class="card" style="margin-bottom:16px">
      <div class="row row-3" style="align-items:end">
        <form method="get" action="/p/${p.slug}" class="row row-3" style="align-items:end">
          <div class="form-group">
            <label>${escapeHtml(t(lang, 'screens.dashboard.status'))}</label>
            <select name="status">
              ${statusOptions
                .map((s) => `<option value="${s}" ${s === (status ?? '') ? 'selected' : ''}>${escapeHtml(s || 'ALL')}</option>`)
                .join('')}
            </select>
          </div>
          <div class="muted" style="padding-bottom:10px">Showing ${tasks.length} tasks</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-secondary btn-md" type="submit">${escapeHtml(t(lang, 'screens.dashboard.apply'))}</button>
            <button class="btn btn-secondary btn-md" type="button" data-open-modal="modal-import">${escapeHtml(t(lang, 'screens.dashboard.sync_asana'))}</button>
            ${opts.canEdit ? `<button class="btn btn-primary btn-md" type="button" data-open-modal="modal-create-task">${escapeHtml(t(lang, 'screens.dashboard.create_task'))}</button>` : ''}
          </div>
        </form>
      </div>
    </div>
  `;

  const importModal = `
    <div class="modal-backdrop" id="modal-import" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(t(lang, 'screens.dashboard.import_title'))}</div>
          <button class="modal-close" type="button" data-close-modal="modal-import" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${p.slug}/import/asana">
          <div class="modal-body">
            <div class="form-group">
              <label>${escapeHtml(t(lang, 'screens.dashboard.import_days'))}</label>
              <input name="days" value="90" />
              <div class="helper">${escapeHtml(t(lang, 'screens.dashboard.import_days_help'))}</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-import">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'screens.dashboard.sync_asana'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const repoOptions = opts.repos
    .map((r) => {
      const v = `${r.owner}/${r.repo}`;
      return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
    })
    .join('');

  const asanaOptions = opts.asanaProjects.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');

  const createTaskModal = opts.canEdit
    ? `
      <div class="modal-backdrop" id="modal-create-task" role="dialog" aria-modal="true">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">${escapeHtml(t(lang, 'screens.dashboard.create_task_title'))}</div>
            <button class="modal-close" type="button" data-close-modal="modal-create-task" aria-label="Close">×</button>
          </div>
          <form method="post" action="/p/${p.slug}/tasks/create">
            <div class="modal-body">
              <div class="row">
                <div class="form-group">
                  <label>${escapeHtml(t(lang, 'screens.dashboard.task_title'))}</label>
                  <input name="title" placeholder="Fix login button alignment" />
                </div>
                <div class="row row-2">
                  <div class="form-group">
                    <label>Asana Project</label>
                    <select name="asana_project_gid">${asanaOptions}</select>
                  </div>
                  <div class="form-group">
                    <label>${escapeHtml(t(lang, 'screens.dashboard.task_repo'))}</label>
                    <select name="repo"><option value="">(none)</option>${repoOptions}</select>
                  </div>
                </div>
                <div class="form-group">
                  <label>${escapeHtml(t(lang, 'screens.dashboard.task_notes'))}</label>
                  <textarea name="notes" placeholder="Additional task details..."></textarea>
                </div>
                <div class="form-group">
                  <label style="text-transform:none;letter-spacing:0;font-weight:700">${escapeHtml(t(lang, 'screens.dashboard.task_auto'))}</label>
                  <div style="display:flex;align-items:center;gap:10px">
                    <input type="checkbox" name="auto_enabled" checked style="width:auto" />
                    <div class="muted" style="font-size:13px">Automatically run pipeline on creation</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-create-task">${escapeHtml(t(lang, 'common.cancel'))}</button>
              <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'screens.dashboard.create_task'))}</button>
            </div>
          </form>
        </div>
      </div>
    `
    : '';

  const table = `
    <div class="card">
      <div style="font-weight:900;margin-bottom:12px">Tasks</div>
      <div style="overflow:auto">
        <table>
          <thead><tr><th>ID</th><th>Status</th><th>Title</th><th>Issue</th><th>PR</th><th>CI</th><th>Updated</th><th>${escapeHtml(t(lang, 'screens.task.actions'))}</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8" class="muted">${escapeHtml(t(lang, 'screens.dashboard.empty'))}</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  return pageShell({
    title: `${p.name} - tasks`,
    lang,
    body: `<div class="container">${top}${actions}${table}</div>${importModal}${createTaskModal}`,
    scriptsHtml: `
      <script>
        (function(){
          document.addEventListener('click', function(e){
            var tr = e.target && e.target.closest ? e.target.closest('tr[data-row-href]') : null;
            if(!tr) return;
            if(e.target && e.target.closest && e.target.closest('a,button,select,input,textarea,form')) return;
            var href = tr.getAttribute('data-row-href');
            if(href) location.href = href;
          });
        })();
      </script>
    `,
  });
}

function taskPage(
  lang: UiLang,
  p: { slug: string; name: string },
  task: any,
  latestSpec: string | null,
  specs: Array<{ version: number; markdown: string; created_at: string }>,
  events: Array<{
    kind: string;
    message: string | null;
    created_at: string;
    source?: string | null;
    event_type?: string | null;
    delivery_id?: string | null;
    user_id?: string | null;
    username?: string | null;
  }>,
  repos: Array<{ owner: string; repo: string }>,
  opts: { canEdit: boolean },
): string {
  const top = renderTopbar({
    title: `${t(lang, 'screens.task.title')} #${task.id}`,
    subtitle: `${p.name} /p/${p.slug}/t/${task.id}`,
    tabsHtml: projectTabs(p, 'home', lang),
    rightHtml: `<a class="btn btn-secondary btn-sm" href="/p/${p.slug}">${escapeHtml(t(lang, 'common.back'))}</a>${renderLanguageToggle(lang)}`,
  });

  const links = [
    task.github_issue_url ? `<a href="${escapeHtml(task.github_issue_url)}" target="_blank" rel="noreferrer">GitHub Issue</a>` : null,
    task.github_pr_url ? `<a href="${escapeHtml(task.github_pr_url)}" target="_blank" rel="noreferrer">PR</a>` : null,
    task.ci_url ? `<a href="${escapeHtml(task.ci_url)}" target="_blank" rel="noreferrer">CI</a>` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const repoOptions = repos
    .map((r) => {
      const v = `${r.owner}/${r.repo}`;
      return `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
    })
    .join('');

  const versions = specs
    .map((s) => {
      return `
        <details style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:#fff">
          <summary style="cursor:pointer;font-weight:700">v${s.version} <span class="muted" style="font-weight:400">${escapeHtml(s.created_at)}</span></summary>
          <div style="margin-top:10px"><pre style="margin:0">${escapeHtml(s.markdown)}</pre></div>
        </details>
      `;
    })
    .join('');

  const eventRows = events
    .map((e) => {
      const src = e.source ?? '';
      const kind = e.event_type ?? e.kind;
      const meta = e.delivery_id ? ` delivery=${e.delivery_id}` : '';
      const who = e.username ? e.username : e.user_id ? `user#${e.user_id}` : '';
      return `
        <tr>
          <td class="mono">${escapeHtml(e.created_at)}</td>
          <td>${escapeHtml(src || '-')}${escapeHtml(meta)}</td>
          <td>${escapeHtml(who || '-')}</td>
          <td class="mono">${escapeHtml(kind)}</td>
          <td>${escapeHtml(e.message ?? '')}</td>
        </tr>
      `;
    })
    .join('');

  const headerCard = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:900;font-size:16px">${escapeHtml(task.title ?? '')}</div>
          <div class="muted" style="margin-top:6px">Asana GID: <span class="mono">${escapeHtml(String(task.asana_gid))}</span></div>
        </div>
        <div>${statusBadge(String(task.status))}</div>
      </div>
      <div style="margin-top:10px">${links || '<span class="muted">No links yet</span>'}</div>
    </div>
  `;

  const actionsCard = opts.canEdit
    ? `
      <div class="card">
        <div style="font-weight:900">${escapeHtml(t(lang, 'screens.task.actions'))}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/retry" style="display:inline">
            <button class="btn btn-secondary btn-md" type="submit">${escapeHtml(t(lang, 'screens.task.retry'))}</button>
          </form>
          <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/resync" style="display:inline">
            <button class="btn btn-secondary btn-md" type="submit">${escapeHtml(t(lang, 'screens.task.resync'))}</button>
          </form>
          ${!task.github_issue_number && task.status === 'NEEDS_REPO' ? `<button class="btn btn-primary btn-md" type="button" data-open-modal="modal-create-issue">${escapeHtml(t(lang, 'screens.task.create_issue'))}</button>` : ''}
          ${!task.github_issue_number ? `<button class="btn btn-secondary btn-md" type="button" data-open-modal="modal-change-repo">${escapeHtml(t(lang, 'screens.task.change_repo'))}</button>` : ''}
          ${task.github_issue_number ? `<button class="btn btn-primary btn-md" type="button" data-open-modal="modal-link-pr">${escapeHtml(t(lang, 'screens.task.link_pr'))}</button>` : ''}
        </div>

        <div style="margin-top:16px">
          <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/note">
            <div class="form-group">
              <label>${escapeHtml(t(lang, 'screens.task.add_note'))}</label>
              <textarea name="note" placeholder="Your comment..."></textarea>
              <div class="helper">Will be posted as comment in Asana</div>
            </div>
            <div style="margin-top:12px">
              <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'screens.task.post_note'))}</button>
            </div>
          </form>
        </div>
      </div>
    `
    : `
      <div class="card">
        <div class="muted">Read-only: your role cannot perform actions.</div>
      </div>
    `;

  const specCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.task.latest_spec'))}</div>
      <div style="margin-top:12px"><pre style="margin:0">${escapeHtml(latestSpec ?? 'No TaskSpec yet')}</pre></div>
      <div style="font-weight:900;margin-top:16px">${escapeHtml(t(lang, 'screens.task.spec_versions'))}</div>
      <div style="display:grid;gap:10px;margin-top:12px">${versions || '<div class="muted">No versions yet</div>'}</div>
    </div>
  `;

  const timelineCard = `
    <div class="card">
      <div style="font-weight:900">${escapeHtml(t(lang, 'screens.task.timeline'))}</div>
      <div style="margin-top:14px;overflow:auto">
        <table>
          <thead><tr><th>Timestamp</th><th>Source</th><th>Who</th><th>Type</th><th>Message</th></tr></thead>
          <tbody>${eventRows || '<tr><td colspan="5" class="muted">No activity yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  const modalCreateIssue = `
    <div class="modal-backdrop" id="modal-create-issue" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(t(lang, 'screens.task.create_issue'))}</div>
          <button class="modal-close" type="button" data-close-modal="modal-create-issue" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/issue/create">
          <div class="modal-body">
            <div class="form-group">
              <label>Repository</label>
              <select name="repo">${repoOptions}</select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-create-issue">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalChangeRepo = `
    <div class="modal-backdrop" id="modal-change-repo" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(t(lang, 'screens.task.change_repo'))}</div>
          <button class="modal-close" type="button" data-close-modal="modal-change-repo" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/repo/change">
          <div class="modal-body">
            <div class="form-group">
              <label>Repository</label>
              <select name="repo">${repoOptions}</select>
              <div class="helper">Updates Asana Repo custom field (only before issue creation).</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-change-repo">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.save'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalLinkPr = `
    <div class="modal-backdrop" id="modal-link-pr" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(t(lang, 'screens.task.link_pr'))}</div>
          <button class="modal-close" type="button" data-close-modal="modal-link-pr" aria-label="Close">×</button>
        </div>
        <form method="post" action="/p/${escapeHtml(p.slug)}/t/${escapeHtml(String(task.id))}/pr/force">
          <div class="modal-body">
            <div class="row row-2">
              <div class="form-group">
                <label>PR Number or URL</label>
                <input name="pr" placeholder="123 or https://github.com/.../pull/123" />
              </div>
              <div class="form-group">
                <label>Repository (optional)</label>
                <select name="repo"><option value="">(use task/default)</option>${repoOptions}</select>
              </div>
            </div>
            <div class="helper">Use when PR body is missing strict "Fixes #${escapeHtml(String(task.github_issue_number))}".</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-md" type="button" data-close-modal="modal-link-pr">${escapeHtml(t(lang, 'common.cancel'))}</button>
            <button class="btn btn-primary btn-md" type="submit">${escapeHtml(t(lang, 'common.save'))}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const left = `<div class="grid" style="gap:16px">${actionsCard}${specCard}</div>`;
  const right = `<div class="grid" style="gap:16px">${timelineCard}</div>`;

  return pageShell({
    title: `Task ${task.id}`,
    lang,
    body: `<div class="container">${top}${headerCard}<div class="grid grid-2">${left}${right}</div></div>${modalCreateIssue}${modalChangeRepo}${modalLinkPr}`,
  });
}
