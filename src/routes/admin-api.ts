import { Router } from 'express';
import { z } from 'zod';

import { upsertWebhookConfig } from '../db/secrets';
import { listTasks, getTaskByAsanaGid, updateTaskStatusByAsanaGid } from '../db/tasks-v2';
import { AsanaClient } from '../integrations/asana';
import { GithubClient } from '../integrations/github';
import { getRuntimeConfig, setConfig } from '../services/secure-config';
import { ensureGithubIssueForAsanaTask } from '../services/sync-from-asana';
import { joinUrl } from '../services/url';

import { openCodeRouter } from './opencode';

export function adminApiRouter(): Router {
  const r = Router();

  r.get('/tasks', async (_req, res, next) => {
    try {
      const rows = await listTasks();
      res.status(200).json({ tasks: rows });
    } catch (err) {
      next(err);
    }
  });

  r.get('/tasks/:asanaGid', async (req, res, next) => {
    try {
      const asanaGid = String(req.params.asanaGid);
      const task = await getTaskByAsanaGid(asanaGid);
      if (!task) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json({ task });
    } catch (err) {
      next(err);
    }
  });

  r.get('/config', async (_req, res, next) => {
    try {
      const cfg = await getRuntimeConfig();
      res.status(200).json({
        // Never return tokens.
        has_asana_pat: Boolean(cfg.ASANA_PAT),
        has_github_token: Boolean(cfg.GITHUB_TOKEN),
        github_owner: cfg.GITHUB_OWNER,
        github_repo: cfg.GITHUB_REPO,
        asana_project_gid: cfg.ASANA_PROJECT_GID,
        public_base_url: cfg.PUBLIC_BASE_URL,
        has_github_webhook_secret: Boolean(cfg.GITHUB_WEBHOOK_SECRET),
        has_asana_webhook_secret: Boolean(cfg.ASANA_WEBHOOK_SECRET),
        opencode: {
          mode: cfg.OPENCODE_MODE,
          has_workdir: Boolean(cfg.OPENCODE_WORKDIR),
          endpoint: cfg.OPENCODE_ENDPOINT,
        },
        notes: {
          deployed_means: 'PR merged + CI success (workflow_run.completed conclusion=success)',
          pr_must_contain: 'Fixes #<issue_number>',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  r.post('/config', async (req, res, next) => {
    try {
      const bodySchema = z
        .object({
          asana_pat: z.string().min(1).optional(),
          asana_project_gid: z.string().min(1).optional(),
          github_token: z.string().min(1).optional(),
          github_owner: z.string().min(1).optional(),
          github_repo: z.string().min(1).optional(),
          public_base_url: z.string().url().optional(),
          github_webhook_secret: z.string().min(1).optional(),
          asana_webhook_secret: z.string().min(1).optional(),
          opencode_mode: z.string().min(1).optional(),
          opencode_endpoint: z.string().url().optional(),
          opencode_workdir: z.string().min(1).optional(),
        })
        .strict();

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }

      const data = parsed.data;
      if (data.asana_pat) await setConfig('ASANA_PAT', data.asana_pat);
      if (data.asana_project_gid) await setConfig('ASANA_PROJECT_GID', data.asana_project_gid);
      if (data.github_token) await setConfig('GITHUB_TOKEN', data.github_token);
      if (data.github_owner) await setConfig('GITHUB_OWNER', data.github_owner);
      if (data.github_repo) await setConfig('GITHUB_REPO', data.github_repo);
      if (data.public_base_url) await setConfig('PUBLIC_BASE_URL', data.public_base_url);
      if (data.github_webhook_secret) await setConfig('GITHUB_WEBHOOK_SECRET', data.github_webhook_secret);
      if (data.asana_webhook_secret) await setConfig('ASANA_WEBHOOK_SECRET', data.asana_webhook_secret);
      if (data.opencode_mode) await setConfig('OPENCODE_MODE', data.opencode_mode);
      if (data.opencode_endpoint) await setConfig('OPENCODE_ENDPOINT', data.opencode_endpoint);
      if (data.opencode_workdir) await setConfig('OPENCODE_WORKDIR', data.opencode_workdir);

      res.status(200).json({ ok: true, saved: Object.keys(data) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/tasks/sync', async (req, res, next) => {
    try {
      const bodySchema = z.object({ asana_task_gid: z.string().min(1) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }

      const cfg = await getRuntimeConfig();
      if (!cfg.ASANA_PAT || !cfg.GITHUB_TOKEN || !cfg.GITHUB_OWNER || !cfg.GITHUB_REPO) {
        res.status(500).json({ error: 'Missing ASANA_PAT/GITHUB_* configuration' });
        return;
      }

      const asana = new AsanaClient(cfg.ASANA_PAT);
      const github = new GithubClient(cfg.GITHUB_TOKEN, cfg.GITHUB_OWNER, cfg.GITHUB_REPO);

      const result = await ensureGithubIssueForAsanaTask({
        asana,
        github,
        asanaTaskGid: parsed.data.asana_task_gid,
        asanaProjectGid: cfg.ASANA_PROJECT_GID ?? undefined,
      });

      res.status(200).json({ result });
    } catch (err) {
      next(err);
    }
  });

  r.post('/tasks/:asanaGid/retry', async (req, res, next) => {
    try {
      const asanaGid = String(req.params.asanaGid);

      const cfg = await getRuntimeConfig();
      if (!cfg.ASANA_PAT || !cfg.GITHUB_TOKEN || !cfg.GITHUB_OWNER || !cfg.GITHUB_REPO) {
        res.status(500).json({ error: 'Missing ASANA_PAT/GITHUB_* configuration' });
        return;
      }

      const asana = new AsanaClient(cfg.ASANA_PAT);
      const github = new GithubClient(cfg.GITHUB_TOKEN, cfg.GITHUB_OWNER, cfg.GITHUB_REPO);

      await updateTaskStatusByAsanaGid(asanaGid, 'RECEIVED');
      const result = await ensureGithubIssueForAsanaTask({
        asana,
        github,
        asanaTaskGid: asanaGid,
        asanaProjectGid: cfg.ASANA_PROJECT_GID ?? undefined,
      });

      res.status(200).json({ result });
    } catch (err) {
      next(err);
    }
  });

  r.post('/webhooks/secrets', async (req, res, next) => {
    try {
      const bodySchema = z.object({
        provider: z.enum(['asana', 'github']),
        secret: z.string().min(1).nullable(),
        webhook_gid: z.string().min(1).optional(),
        resource_gid: z.string().min(1).optional(),
        target_url: z.string().url().optional(),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }

      await upsertWebhookConfig({
        provider: parsed.data.provider,
        secret: parsed.data.secret,
        webhookGid: parsed.data.webhook_gid,
        resourceGid: parsed.data.resource_gid,
        targetUrl: parsed.data.target_url,
      });

      // Also write to encrypted app config (used by signature verification) if provided.
      if (parsed.data.provider === 'asana' && parsed.data.secret) await setConfig('ASANA_WEBHOOK_SECRET', parsed.data.secret);
      if (parsed.data.provider === 'github' && parsed.data.secret) await setConfig('GITHUB_WEBHOOK_SECRET', parsed.data.secret);

      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/asana/webhooks/setup', async (req, res, next) => {
    try {
      const bodySchema = z.object({
        resource_gid: z.string().min(1),
        target_url: z.string().url().optional(),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }

      const cfg = await getRuntimeConfig();
      if (!cfg.ASANA_PAT) {
        res.status(500).json({ error: 'Missing ASANA_PAT configuration' });
        return;
      }

      const targetUrl = parsed.data.target_url ?? (cfg.PUBLIC_BASE_URL ? joinUrl(cfg.PUBLIC_BASE_URL, '/webhooks/asana') : null);
      if (!targetUrl) {
        res.status(400).json({ error: 'target_url is required (or set PUBLIC_BASE_URL)' });
        return;
      }

      const asana = new AsanaClient(cfg.ASANA_PAT);
      const created = await asana.createWebhook({
        resourceGid: parsed.data.resource_gid,
        targetUrl,
        filters: [
          { resource_type: 'task', action: 'added' },
          { resource_type: 'task', action: 'changed', fields: ['completed'] },
        ],
      });

      // Save metadata; secret usually comes from response header (and/or handshake).
      await upsertWebhookConfig({
        provider: 'asana',
        secret: created.hookSecret,
        webhookGid: created.webhookGid,
        resourceGid: parsed.data.resource_gid,
        targetUrl,
      });

      if (created.hookSecret) {
        await setConfig('ASANA_WEBHOOK_SECRET', created.hookSecret);
      }

      res.status(200).json({
        webhook_gid: created.webhookGid,
        hook_secret_saved: Boolean(created.hookSecret),
        target_url: targetUrl,
      });
    } catch (err) {
      next(err);
    }
  });

  r.use('/opencode', openCodeRouter());

  return r;
}
