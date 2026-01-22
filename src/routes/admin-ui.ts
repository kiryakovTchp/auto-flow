import type { Request, Response } from 'express';
import { Router } from 'express';

import { getRuntimeConfig } from '../services/secure-config';
import { escapeHtml, pageShell, renderLanguageToggle, renderTopbar } from '../services/html';
import { getLangFromRequest, t } from '../services/i18n';

export function adminUiRouter(): Router {
  const r = Router();

  r.get('/', async (_req: Request, res: Response, next) => {
    try {
      const lang = getLangFromRequest(_req);
      const cfg = await getRuntimeConfig();

      const ready = cfg.ASANA_PAT && cfg.GITHUB_TOKEN;
      const header = renderTopbar({
        title: t(lang, 'screens.admin.title'),
        subtitle: 'Instance-level configuration (legacy). Encrypted in Postgres.',
        rightHtml: `${ready ? '<span class="badge badge-success">runtime ready</span>' : '<span class="badge badge-warning">missing config</span>'}${renderLanguageToggle(lang)}`,
      });

      const body = `
        <div class="container">
          ${header}
          <div class="badge badge-warning" style="margin-bottom:16px">DANGER ZONE: instance-level changes</div>

          <div class="grid grid-2" style="gap:16px">
            <div class="card">
              <div style="font-weight:900">${escapeHtml(t(lang, 'screens.admin.credentials'))}</div>
              <div class="muted" style="margin-top:6px">Master key: <span class="mono">data/master.key</span></div>
              <div class="row row-2" style="margin-top:16px">
                <div class="form-group">
                  <label>Asana PAT</label>
                  <input id="asana_pat" type="password" placeholder="paste token" />
                  <div class="helper">stored: ${cfg.ASANA_PAT ? 'yes' : 'no'}</div>
                </div>
                <div class="form-group">
                  <label>GitHub Token</label>
                  <input id="github_token" type="password" placeholder="paste token" />
                  <div class="helper">stored: ${cfg.GITHUB_TOKEN ? 'yes' : 'no'}</div>
                </div>
                <div class="form-group">
                  <label>GitHub Owner</label>
                  <input id="github_owner" value="${escapeHtml(cfg.GITHUB_OWNER ?? '')}" placeholder="OWNER" />
                </div>
                <div class="form-group">
                  <label>GitHub Repo</label>
                  <input id="github_repo" value="${escapeHtml(cfg.GITHUB_REPO ?? '')}" placeholder="REPO" />
                </div>
                <div class="form-group">
                  <label>Asana Project GID</label>
                  <input id="asana_project_gid" value="${escapeHtml(cfg.ASANA_PROJECT_GID ?? '')}" placeholder="123..." />
                </div>
                <div class="form-group">
                  <label>Public Base URL</label>
                  <input id="public_base_url" value="${escapeHtml(cfg.PUBLIC_BASE_URL ?? '')}" placeholder="https://yourdomain.com" />
                </div>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
                <button class="btn btn-primary btn-md" id="save_config" type="button">${escapeHtml(t(lang, 'screens.admin.save_config'))}</button>
                <button class="btn btn-secondary btn-md" id="reload" type="button">${escapeHtml(t(lang, 'screens.admin.reload'))}</button>
              </div>
            </div>

            <div class="card">
              <div style="font-weight:900">${escapeHtml(t(lang, 'screens.admin.opencode'))}</div>
              <div class="muted" style="margin-top:6px">Optional: launch OpenCode in Terminal.</div>
              <div class="row" style="margin-top:16px">
                <div class="form-group">
                  <label>Mode</label>
                  <input id="opencode_mode" value="${escapeHtml(cfg.OPENCODE_MODE ?? 'github-issue-command')}" placeholder="github-issue-command" />
                </div>
                <div class="form-group">
                  <label>Endpoint (optional)</label>
                  <input id="opencode_endpoint" value="${escapeHtml(cfg.OPENCODE_ENDPOINT ?? '')}" placeholder="http://127.0.0.1:12345/health" />
                </div>
                <div class="form-group">
                  <label>Local Repo Path (workdir)</label>
                  <input id="opencode_workdir" value="${escapeHtml(cfg.OPENCODE_WORKDIR ?? '')}" placeholder="/Users/you/projects/target-repo" />
                </div>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
                <button class="btn btn-primary btn-md" id="save_opencode" type="button">Save OpenCode</button>
                <button class="btn btn-secondary btn-md" id="launch_opencode" type="button">${escapeHtml(t(lang, 'screens.admin.launch'))}</button>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top:16px">
            <div style="font-weight:900">${escapeHtml(t(lang, 'screens.admin.webhooks'))}</div>
            <div class="row row-2" style="margin-top:16px">
              <div class="form-group">
                <label>GitHub Webhook Secret</label>
                <input id="github_webhook_secret" type="password" placeholder="paste secret" />
                <div class="helper">stored: ${cfg.GITHUB_WEBHOOK_SECRET ? 'yes' : 'no'}</div>
              </div>
              <div class="form-group">
                <label>Asana Webhook Secret</label>
                <input id="asana_webhook_secret" type="password" placeholder="(usually auto from handshake)" />
                <div class="helper">stored: ${cfg.ASANA_WEBHOOK_SECRET ? 'yes' : 'no'}</div>
              </div>
              <div class="form-group">
                <label>Asana Resource GID (project)</label>
                <input id="asana_webhook_resource" placeholder="project gid" value="${escapeHtml(cfg.ASANA_PROJECT_GID ?? '')}" />
              </div>
              <div class="form-group">
                <label>Asana Target URL (optional)</label>
                <input id="asana_webhook_target" placeholder="defaults to PUBLIC_BASE_URL/webhooks/asana" />
              </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
              <button class="btn btn-primary btn-md" id="save_webhook_secrets" type="button">Save Webhook Secrets</button>
              <button class="btn btn-secondary btn-md" id="setup_asana_webhook" type="button">${escapeHtml(t(lang, 'screens.admin.setup'))}</button>
              <button class="btn btn-ghost btn-md" id="list_tasks" type="button">${escapeHtml(t(lang, 'screens.admin.list_tasks'))}</button>
            </div>
            <div style="margin-top:16px"><pre id="out">Ready.</pre></div>
          </div>
        </div>

        <script>
          const out = document.getElementById('out');
          function log(msg) {
            const ts = new Date().toISOString();
            out.textContent = '[' + ts + '] ' + msg + '\n' + out.textContent;
          }
          async function j(url, opts) {
            const res = await fetch(url, Object.assign({
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin'
            }, opts || {}));
            const text = await res.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
            if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ': ' + JSON.stringify(data));
            return data;
          }

          document.getElementById('reload').addEventListener('click', () => location.reload());

          document.getElementById('save_config').addEventListener('click', async () => {
            try {
              const body = {
                asana_pat: document.getElementById('asana_pat').value || undefined,
                github_token: document.getElementById('github_token').value || undefined,
                github_owner: document.getElementById('github_owner').value || undefined,
                github_repo: document.getElementById('github_repo').value || undefined,
                asana_project_gid: document.getElementById('asana_project_gid').value || undefined,
                public_base_url: document.getElementById('public_base_url').value || undefined,
              };
              await j('/api/admin/config', { method: 'POST', body: JSON.stringify(body) });
              log('Config saved');
              setTimeout(() => location.reload(), 200);
            } catch (e) {
              log('ERROR saving config: ' + e.message);
            }
          });

          document.getElementById('save_opencode').addEventListener('click', async () => {
            try {
              const body = {
                opencode_mode: document.getElementById('opencode_mode').value || undefined,
                opencode_endpoint: document.getElementById('opencode_endpoint').value || undefined,
                opencode_workdir: document.getElementById('opencode_workdir').value || undefined,
              };
              await j('/api/admin/config', { method: 'POST', body: JSON.stringify(body) });
              log('OpenCode config saved');
              setTimeout(() => location.reload(), 200);
            } catch (e) {
              log('ERROR saving OpenCode config: ' + e.message);
            }
          });

          document.getElementById('launch_opencode').addEventListener('click', async () => {
            try {
              await j('/api/admin/opencode/launch', { method: 'POST' });
              log('OpenCode launched in Terminal');
            } catch (e) {
              log('ERROR launching OpenCode: ' + e.message);
            }
          });

          document.getElementById('save_webhook_secrets').addEventListener('click', async () => {
            try {
              const gh = document.getElementById('github_webhook_secret').value;
              const as = document.getElementById('asana_webhook_secret').value;

              if (gh) {
                await j('/api/admin/webhooks/secrets', { method: 'POST', body: JSON.stringify({ provider: 'github', secret: gh }) });
                log('GitHub webhook secret saved');
              }
              if (as) {
                await j('/api/admin/webhooks/secrets', { method: 'POST', body: JSON.stringify({ provider: 'asana', secret: as }) });
                log('Asana webhook secret saved');
              }
              if (!gh && !as) log('No secrets provided');
            } catch (e) {
              log('ERROR saving webhook secrets: ' + e.message);
            }
          });

          document.getElementById('setup_asana_webhook').addEventListener('click', async () => {
            try {
              const resource_gid = document.getElementById('asana_webhook_resource').value;
              const target_url = document.getElementById('asana_webhook_target').value || undefined;
              const data = await j('/api/admin/asana/webhooks/setup', {
                method: 'POST',
                body: JSON.stringify({ resource_gid, target_url })
              });
              log('Asana webhook setup: ' + JSON.stringify(data));
            } catch (e) {
              log('ERROR setting up Asana webhook: ' + e.message);
            }
          });

          document.getElementById('list_tasks').addEventListener('click', async () => {
            try {
              const data = await j('/api/admin/tasks', { method: 'GET' });
              log('Tasks: ' + JSON.stringify(data).slice(0, 1500));
            } catch (e) {
              log('ERROR loading tasks: ' + e.message);
            }
          });
        </script>
      `;

      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(pageShell({ title: 'Instance Admin', lang, variant: 'admin', body }));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
