import type { Request, Response } from 'express';
import { Router } from 'express';

import { getRuntimeConfig } from '../services/secure-config';

export function adminUiRouter(): Router {
  const r = Router();

  r.get('/', async (_req: Request, res: Response, next) => {
    try {
      const cfg = await getRuntimeConfig();

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Auto-Flow Admin</title>
  <style>
    :root {
      --bg0: #0b0f14;
      --bg1: #111826;
      --card: rgba(255,255,255,0.06);
      --card2: rgba(255,255,255,0.08);
      --text: #e8eef7;
      --muted: rgba(232,238,247,0.72);
      --line: rgba(232,238,247,0.12);
      --accent: #4fd1c5;
      --accent2: #7aa2ff;
      --danger: #ff6b6b;
      --shadow: 0 18px 60px rgba(0,0,0,0.55);
    }

    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1000px 600px at 20% -10%, rgba(79,209,197,0.18), transparent 60%),
        radial-gradient(900px 520px at 110% 10%, rgba(122,162,255,0.18), transparent 55%),
        linear-gradient(180deg, var(--bg0), var(--bg1));
      min-height: 100vh;
    }

    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px 18px 80px;
    }

    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 0 22px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.2px;
    }

    .sub {
      color: var(--muted);
      font-size: 13px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;
    }

    @media (min-width: 860px) {
      .grid { grid-template-columns: 1.1fr 0.9fr; }
    }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .card h2 {
      margin: 0 0 10px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(232,238,247,0.78);
    }

    .row { display: grid; grid-template-columns: 1fr; gap: 10px; }
    @media (min-width: 560px) { .row { grid-template-columns: 1fr 1fr; } }

    label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }

    input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(0,0,0,0.22);
      color: var(--text);
      outline: none;
    }

    input:focus {
      border-color: rgba(79,209,197,0.5);
      box-shadow: 0 0 0 4px rgba(79,209,197,0.12);
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    button {
      border: 1px solid var(--line);
      background: var(--card2);
      color: var(--text);
      padding: 10px 12px;
      border-radius: 12px;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease;
    }

    button:hover { transform: translateY(-1px); border-color: rgba(79,209,197,0.55); }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(0,0,0,0.22);
      color: var(--muted);
      font-size: 12px;
    }

    .dot {
      width: 9px; height: 9px;
      border-radius: 999px;
      background: var(--danger);
      box-shadow: 0 0 0 4px rgba(255,107,107,0.12);
    }

    .dot.ok {
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(79,209,197,0.12);
    }

    pre {
      margin: 10px 0 0;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(0,0,0,0.24);
      color: rgba(232,238,247,0.88);
      font-size: 12px;
      overflow: auto;
      max-height: 240px;
    }

    .hint { color: var(--muted); font-size: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>Auto-Flow Admin</h1>
        <div class="sub">Config is stored encrypted in Postgres. Master key: <code>data/master.key</code></div>
      </div>
      <div class="pill"><span class="dot ${cfg.ASANA_PAT && cfg.GITHUB_TOKEN ? 'ok' : ''}"></span> runtime ready</div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Credentials & Repo</h2>
        <div class="row">
          <div>
            <label>Asana PAT</label>
            <input id="asana_pat" type="password" placeholder="paste token" />
            <div class="hint">stored: ${cfg.ASANA_PAT ? 'yes' : 'no'}</div>
          </div>
          <div>
            <label>GitHub Token</label>
            <input id="github_token" type="password" placeholder="paste token" />
            <div class="hint">stored: ${cfg.GITHUB_TOKEN ? 'yes' : 'no'}</div>
          </div>
          <div>
            <label>GitHub Owner</label>
            <input id="github_owner" value="${escapeHtml(cfg.GITHUB_OWNER ?? '')}" placeholder="OWNER" />
          </div>
          <div>
            <label>GitHub Repo</label>
            <input id="github_repo" value="${escapeHtml(cfg.GITHUB_REPO ?? '')}" placeholder="REPO" />
          </div>
          <div>
            <label>Asana Project GID</label>
            <input id="asana_project_gid" value="${escapeHtml(cfg.ASANA_PROJECT_GID ?? '')}" placeholder="1212860651221793" />
          </div>
          <div>
            <label>Public Base URL</label>
            <input id="public_base_url" value="${escapeHtml(cfg.PUBLIC_BASE_URL ?? '')}" placeholder="https://yourdomain.com" />
          </div>
        </div>
        <div class="actions">
          <button id="save_config">Save Config</button>
          <button id="reload">Reload</button>
        </div>
      </div>

      <div class="card">
        <h2>OpenCode</h2>
        <div class="row">
          <div>
            <label>Mode</label>
            <input id="opencode_mode" value="${escapeHtml(cfg.OPENCODE_MODE ?? 'github-issue-command')}" placeholder="github-issue-command" />
            <div class="hint">MVP: orchestrator triggers OpenCode via GitHub issue command.</div>
          </div>
          <div>
            <label>Endpoint (optional)</label>
            <input id="opencode_endpoint" value="${escapeHtml(cfg.OPENCODE_ENDPOINT ?? '')}" placeholder="http://127.0.0.1:12345/health" />
            <div class="hint">Optional health URL (no execution), for visibility only.</div>
          </div>
          <div>
            <label>Local Repo Path (workdir)</label>
            <input id="opencode_workdir" value="${escapeHtml(cfg.OPENCODE_WORKDIR ?? '')}" placeholder="/Users/you/projects/target-repo" />
            <div class="hint">Used by Launch button to open Terminal in repo.</div>
          </div>
        </div>
        <div class="actions">
          <button id="save_opencode">Save OpenCode</button>
          <button id="launch_opencode">Launch OpenCode</button>
        </div>
      </div>

      <div class="card">
        <h2>Webhooks</h2>
        <div class="row">
          <div>
            <label>GitHub Webhook Secret</label>
            <input id="github_webhook_secret" type="password" placeholder="paste secret" />
            <div class="hint">stored: ${cfg.GITHUB_WEBHOOK_SECRET ? 'yes' : 'no'}</div>
          </div>
          <div>
            <label>Asana Webhook Secret</label>
            <input id="asana_webhook_secret" type="password" placeholder="(usually auto from handshake)" />
            <div class="hint">stored: ${cfg.ASANA_WEBHOOK_SECRET ? 'yes' : 'no'}</div>
          </div>
          <div>
            <label>Asana Resource GID (project)</label>
            <input id="asana_webhook_resource" placeholder="project gid" value="${escapeHtml(cfg.ASANA_PROJECT_GID ?? '')}" />
            <div class="hint">Used for setup call: POST /api/admin/asana/webhooks/setup</div>
          </div>
          <div>
            <label>Asana Target URL (optional)</label>
            <input id="asana_webhook_target" placeholder="defaults to PUBLIC_BASE_URL/webhooks/asana" />
          </div>
        </div>
        <div class="actions">
          <button id="save_webhook_secrets">Save Webhook Secrets</button>
          <button id="setup_asana_webhook">Setup Asana Webhook</button>
          <button id="list_tasks">List Tasks</button>
        </div>
        <pre id="out">Ready.</pre>
      </div>
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
</body>
</html>`;

      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (err) {
      next(err);
    }
  });

  return r;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
