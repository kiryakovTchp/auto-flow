import type { UiLang } from './i18n';

export function escapeHtml(input: string): string {
  const s = String(input ?? '');
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderLanguageToggle(lang: UiLang): string {
  const label = lang === 'ru' ? 'RU' : 'EN';
  const next = lang === 'ru' ? 'en' : 'ru';
  const title = lang === 'ru' ? 'Switch to English' : 'Переключить на русский';
  return `
    <button class="btn btn-ghost btn-sm" type="button" data-lang-next="${next}" title="${escapeHtml(title)}">
      <span class="mono" style="letter-spacing:0.08em">${label}</span>
    </button>
  `;
}

export function renderTabs(tabs: Array<{ key: string; label: string; href: string }>, activeKey: string): string {
  return `
    <nav class="tabs" aria-label="Tabs">
      ${tabs
        .map((t) => {
          const active = t.key === activeKey;
          return `<a class="tab" href="${t.href}" ${active ? 'aria-current="page"' : ''}>${escapeHtml(t.label)}</a>`;
        })
        .join('')}
    </nav>
  `;
}

export function renderTopbar(params: {
  title: string;
  subtitle?: string;
  tabsHtml?: string;
  rightHtml?: string;
}): string {
  return `
    <header class="topbar">
      <div class="topbar-left">
        <div class="topbar-title">${escapeHtml(params.title)}</div>
        ${params.subtitle ? `<div class="topbar-sub">${escapeHtml(params.subtitle)}</div>` : ''}
      </div>
      <div class="topbar-right">
        ${params.tabsHtml ?? ''}
        <div class="topbar-actions">${params.rightHtml ?? ''}</div>
      </div>
    </header>
  `;
}

export function renderCodeBlock(code: string, opts?: { copyLabel?: string; language?: string }): string {
  const copyLabel = opts?.copyLabel ? escapeHtml(opts.copyLabel) : 'Copy';
  const lang = opts?.language ? ` data-code-lang="${escapeHtml(opts.language)}"` : '';
  return `
    <div class="codeblock"${lang}>
      <button type="button" class="codeblock-copy" data-copy>${copyLabel}</button>
      <pre><code>${escapeHtml(code)}</code></pre>
    </div>
  `;
}

export function pageShell(params: {
  title: string;
  body: string;
  lang?: UiLang;
  variant?: 'app' | 'auth' | 'admin';
  headHtml?: string;
  scriptsHtml?: string;
}): string {
  const lang = params.lang ?? 'en';
  const variant = params.variant ?? 'app';

  const bodyClass = variant === 'auth' ? 'ui auth' : variant === 'admin' ? 'ui admin' : 'ui';

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  <style>
    :root{
      --bg:#FAFAFA;
      --card:#FFFFFF;
      --text:#1A1A1A;
      --muted:#6B7280;
      --muted2:#9CA3AF;
      --border:#E5E7EB;
      --shadow:0 1px 3px rgba(0,0,0,0.10);
      --shadow-lg:0 12px 28px rgba(0,0,0,0.14);
      --primary:#3B82F6;
      --primary-hover:#2563EB;
      --primary-active:#1D4ED8;
      --danger:#EF4444;
      --warning:#F59E0B;
      --success:#10B981;
      --info:#0369A1;
      --radius-card:8px;
      --radius-input:6px;
      --radius-btn:6px;
      --space:16px;
      --space2:24px;
      --font-ui:Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      --font-mono:"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-ui);}
    a{color:var(--primary);text-decoration:none;}
    a:hover{color:var(--primary-hover);}

    .container{max-width:1200px;margin:0 auto;padding:24px;}

    .card{background:var(--card);border-radius:var(--radius-card);box-shadow:var(--shadow);padding:24px;}

    .topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;}
    .topbar-title{font-size:18px;font-weight:700;line-height:1.2;}
    .topbar-sub{font-size:12px;color:var(--muted);margin-top:4px;}
    .topbar-right{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;justify-content:flex-end;}
    .topbar-actions{display:flex;align-items:center;gap:10px;}

    .tabs{display:flex;gap:14px;align-items:center;}
    .tab{color:var(--muted);padding:6px 2px;border-bottom:2px solid transparent;font-weight:600;font-size:13px;}
    .tab[aria-current="page"]{color:var(--text);border-bottom-color:var(--primary);}
    .tab:hover{color:var(--text);}

    .muted{color:var(--muted);}
    .mono{font-family:var(--font-mono);}

    .grid{display:grid;grid-template-columns:1fr;gap:24px;}
    @media(min-width:960px){.grid-2{grid-template-columns:1fr 1fr;}.grid-3{grid-template-columns:1fr 1fr 1fr;}}

    .row{display:grid;grid-template-columns:1fr;gap:16px;}
    @media(min-width:720px){.row-2{grid-template-columns:1fr 1fr;}.row-3{grid-template-columns:1fr 1fr 1fr;}}

    .form-group label{display:block;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;}
    .helper{color:var(--muted);font-size:12px;font-style:italic;margin-top:6px;}

    input,select,textarea{width:100%;box-sizing:border-box;background:#fff;border:1px solid var(--border);border-radius:var(--radius-input);padding:10px 12px;font-size:14px;font-family:var(--font-ui);color:var(--text);}
    textarea{min-height:110px;resize:vertical;}
    input:focus,select:focus,textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(59,130,246,0.18);}
    ::placeholder{color:var(--muted2);}

    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius-btn);border:1px solid transparent;font-weight:600;font-size:14px;cursor:pointer;user-select:none;}
    .btn:disabled{opacity:0.55;cursor:not-allowed;}
    .btn-sm{padding:8px 10px;}
    .btn-md{padding:10px 12px;}
    .btn-lg{padding:12px 14px;}
    .btn-primary{background:var(--primary);color:#fff;}
    .btn-primary:hover{background:var(--primary-hover);}
    .btn-primary:active{background:var(--primary-active);}
    .btn-secondary{background:#fff;color:var(--primary);border-color:var(--primary);}
    .btn-secondary:hover{background:rgba(59,130,246,0.06);}
    .btn-danger{background:var(--danger);color:#fff;}
    .btn-danger:hover{filter:brightness(0.95);}
    .btn-ghost{background:transparent;color:var(--primary);border-color:transparent;}
    .btn-ghost:hover{background:rgba(59,130,246,0.06);}

    .badge{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;}
    .badge-success{background:rgba(16,185,129,0.16);color:#047857;}
    .badge-warning{background:rgba(245,158,11,0.18);color:#92400E;}
    .badge-danger{background:rgba(239,68,68,0.16);color:#B91C1C;}
    .badge-gray{background:rgba(107,114,128,0.14);color:#374151;}
    .badge-status{background:#F3F4F6;color:#111827;}

    table{width:100%;border-collapse:separate;border-spacing:0;}
    thead th{background:#F9FAFB;color:#111827;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;text-align:left;padding:12px;border-bottom:1px solid var(--border);}
    tbody td{background:#fff;padding:12px;border-bottom:1px solid var(--border);vertical-align:top;}
    tbody tr:hover td{background:#F3F4F6;}

    pre{border:1px solid var(--border);background:#F3F4F6;border-radius:6px;padding:12px;white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;line-height:1.5;color:#111827;}

    .codeblock{position:relative;border:1px solid var(--border);background:#F3F4F6;border-radius:6px;padding:12px;}
    .codeblock pre{margin:0;white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;line-height:1.5;color:#111827;}
    .codeblock-copy{position:absolute;top:8px;right:8px;border:1px solid var(--border);background:#fff;border-radius:6px;padding:6px 8px;font-size:12px;font-weight:600;cursor:pointer;}
    .codeblock-copy:hover{background:#F9FAFB;}

    .toast-area{position:fixed;right:18px;bottom:18px;display:flex;flex-direction:column;gap:10px;z-index:9999;}
    .toast{min-width:260px;max-width:420px;border-radius:8px;box-shadow:var(--shadow-lg);padding:12px 12px;border-left:6px solid transparent;background:#fff;}
    .toast-title{font-weight:800;font-size:13px;margin:0 0 4px;}
    .toast-msg{font-size:13px;color:#111827;}
    .toast-success{background:#D1FAE5;border-left-color:#10B981;}
    .toast-success .toast-title{color:#047857;}
    .toast-error{background:#FEE2E2;border-left-color:#EF4444;}
    .toast-error .toast-title{color:#DC2626;}
    .toast-warning{background:#FEF3C7;border-left-color:#F59E0B;}
    .toast-warning .toast-title{color:#92400E;}
    .toast-info{background:#DBEAFE;border-left-color:#3B82F6;}
    .toast-info .toast-title{color:#0369A1;}

    .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:9998;padding:18px;}
    .modal-backdrop.open{display:flex;}
    .modal{width:min(720px, 100%);background:#fff;border-radius:8px;box-shadow:var(--shadow-lg);overflow:hidden;}
    .modal-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);}
    .modal-title{font-size:16px;font-weight:800;}
    .modal-close{border:0;background:transparent;font-size:18px;cursor:pointer;color:var(--muted);line-height:1;}
    .modal-body{padding:18px;}
    .modal-footer{padding:16px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}

    body.auth{background:#F3F4F6;}
    .auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
    .auth-card{width:min(440px, 100%);}
    .auth-logo{font-weight:900;font-size:18px;letter-spacing:0.02em;margin-bottom:8px;}
    .auth-top{position:fixed;top:14px;right:14px;z-index:9999;}

    body.admin{--primary:#3B82F6;}

    @media(max-width:768px){
      .container{padding:18px;}
      .tabs{gap:10px;flex-wrap:wrap;}
      .modal{width:100%;}
    }
  </style>
  ${params.headHtml ?? ''}
</head>
<body class="${bodyClass}">
  <div class="toast-area" id="toast-area" aria-live="polite" aria-atomic="true"></div>
  ${params.body}
  <script>
    (function(){
      function toast(type, title, msg){
        var area = document.getElementById('toast-area');
        if(!area) return;
        var el = document.createElement('div');
        el.className = 'toast toast-' + type;
        el.innerHTML = '<div class="toast-title">' + title + '</div><div class="toast-msg">' + msg + '</div>';
        area.appendChild(el);
        setTimeout(function(){ el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 3500);
        setTimeout(function(){ el.remove(); }, 4200);
      }
      window.toast = function(type, msg){
        var t = type === 'error' ? 'Error' : type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Info';
        toast(type, t, msg);
      };

      document.addEventListener('click', async function(e){
        var btn = e.target && e.target.closest ? e.target.closest('[data-copy]') : null;
        if(btn){
          var root = btn.closest('.codeblock');
          if(root){
            var code = root.querySelector('code');
            var text = code ? code.textContent || '' : '';
            try{
              await navigator.clipboard.writeText(text);
              btn.textContent = 'Copied!';
              setTimeout(function(){ btn.textContent = 'Copy'; }, 1100);
            }catch(err){
              window.toast('error', 'Copy failed');
            }
          }
        }
      });

      function openModal(id){
        var el = document.getElementById(id);
        if(!el) return;
        el.classList.add('open');
      }
      function closeModal(id){
        var el = document.getElementById(id);
        if(!el) return;
        el.classList.remove('open');
      }
      window.uiOpenModal = openModal;
      window.uiCloseModal = closeModal;

      document.addEventListener('click', function(e){
        var open = e.target && e.target.closest ? e.target.closest('[data-open-modal]') : null;
        if(open){
          var id = open.getAttribute('data-open-modal');
          if(id) openModal(id);
        }
        var close = e.target && e.target.closest ? e.target.closest('[data-close-modal]') : null;
        if(close){
          var id2 = close.getAttribute('data-close-modal');
          if(id2) closeModal(id2);
        }
        var backdrop = e.target && e.target.classList && e.target.classList.contains('modal-backdrop') ? e.target : null;
        if(backdrop){
          backdrop.classList.remove('open');
        }
      });

      document.addEventListener('keydown', function(e){
        if(e.key !== 'Escape') return;
        var open = document.querySelector('.modal-backdrop.open');
        if(open) open.classList.remove('open');
      });

      // Easter egg: press "C" 10 times -> cat emoji rain.
      (function(){
        var cCount = 0;
        var lastCAt = 0;
        var running = false;
        var STYLE_ID = 'cat-rain-style';
        var ROOT_ID = 'cat-rain-root';

        function isTypingTarget(t){
          if(!t) return false;
          var tag = (t.tagName || '').toLowerCase();
          if(tag === 'input' || tag === 'textarea' || tag === 'select') return true;
          if(t.isContentEditable) return true;
          return false;
        }

        function ensureStyle(){
          if(document.getElementById(STYLE_ID)) return;
          var style = document.createElement('style');
          style.id = STYLE_ID;
          style.textContent = '' +
            '#' + ROOT_ID + '{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:10000;}' +
            '#' + ROOT_ID + ' .cat-rain-emoji{position:absolute;top:-48px;left:0;will-change:transform,opacity;filter:drop-shadow(0 6px 10px rgba(0,0,0,0.18));}' +
            '@keyframes catRainFall{0%{transform:translate3d(var(--x,0px), -60px, 0) rotate(var(--r0,0deg));opacity:0;}10%{opacity:1;}100%{transform:translate3d(calc(var(--x,0px) + var(--drift, 0px)), calc(100vh + 80px), 0) rotate(var(--r1,360deg));opacity:0;}}';
          document.head.appendChild(style);
        }

        function random(min, max){
          return Math.random() * (max - min) + min;
        }

        function createRoot(){
          var existing = document.getElementById(ROOT_ID);
          if(existing) return existing;
          var el = document.createElement('div');
          el.id = ROOT_ID;
          el.setAttribute('aria-hidden', 'true');
          document.body.appendChild(el);
          return el;
        }

        function spawnEmoji(root){
          var el = document.createElement('span');
          el.className = 'cat-rain-emoji';

          // ASCII-only source via code points.
          var pick = (Math.random() * 12) | 0;
          el.textContent =
            pick === 0
              ? String.fromCodePoint(0x1f63a)
              : pick === 1
                ? String.fromCodePoint(0x1f638)
                : pick === 2
                  ? String.fromCodePoint(0x1f639)
                  : pick === 3
                    ? String.fromCodePoint(0x1f63b)
                    : pick === 4
                      ? String.fromCodePoint(0x1f63c)
                      : pick === 5
                        ? String.fromCodePoint(0x1f640)
                        : pick === 6
                          ? String.fromCodePoint(0x1f63d)
                          : pick === 7
                            ? String.fromCodePoint(0x1f63f)
                            : pick === 8
                              ? String.fromCodePoint(0x1f63e)
                              : pick === 9
                                ? String.fromCodePoint(0x1f431)
                                : pick === 10
                                  ? String.fromCodePoint(0x1f408)
                                  : String.fromCodePoint(0x1f408, 0x200d, 0x2b1b);

          var left = random(0, 100);
          var size = random(18, 38);
          var duration = random(1600, 3200);
          var delay = random(0, 250);
          var drift = random(-120, 120);
          var r0 = random(-30, 30);
          var r1 = r0 + random(240, 720);

          el.style.left = left + 'vw';
          el.style.fontSize = size + 'px';
          el.style.opacity = String(random(0.85, 1));
          el.style.setProperty('--x', '0px');
          el.style.setProperty('--drift', drift + 'px');
          el.style.setProperty('--r0', r0 + 'deg');
          el.style.setProperty('--r1', r1 + 'deg');
          el.style.animation = 'catRainFall ' + duration + 'ms linear ' + delay + 'ms 1 forwards';

          el.addEventListener('animationend', function(){
            try{ el.remove(); }catch(_e){}
          });
          root.appendChild(el);
        }

        function cleanup(){
          var root = document.getElementById(ROOT_ID);
          if(root) root.remove();
        }

        function startRain(){
          if(running) return;
          running = true;
          ensureStyle();
          var root = createRoot();

          var startedAt = Date.now();
          var rainForMs = 2600;
          var tick = setInterval(function(){
            if(Date.now() - startedAt > rainForMs){
              clearInterval(tick);
              return;
            }
            // Burst a few each tick for a "rain" feel.
            var burst = 4 + ((Math.random() * 3) | 0);
            for(var i = 0; i < burst; i++) spawnEmoji(root);
          }, 90);

          // Cleanup a bit after the last emoji should have finished.
          setTimeout(function(){
            clearInterval(tick);
            cleanup();
            running = false;
          }, rainForMs + 3800);
        }

        function bump(){
          if(running) return;
          var now = Date.now();
          if(now - lastCAt > 1200) cCount = 0;
          lastCAt = now;
          cCount++;
          if(cCount >= 10){
            cCount = 0;
            startRain();
          }
        }

        document.addEventListener('keydown', function(e){
          if(!e || !e.key) return;
          if(isTypingTarget(e.target)) return;
          if(e.key === 'c' || e.key === 'C') bump();
        });

        // Optional: if there is a dedicated "C" button somewhere in UI.
        document.addEventListener('click', function(e){
          var el = e.target && e.target.closest ? e.target.closest('[data-easter-c]') : null;
          if(!el) return;
          bump();
        });
      })();

      document.addEventListener('click', async function(e){
        var langBtn = e.target && e.target.closest ? e.target.closest('[data-lang-next]') : null;
        if(!langBtn) return;
        var next = langBtn.getAttribute('data-lang-next');
        if(!next) return;
        try{
          await fetch('/ui/lang', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ lang: next }) });
          location.reload();
        }catch(err){
          window.toast('error', 'Failed to switch language');
        }
      });
    })();
  </script>
  ${params.scriptsHtml ?? ''}
</body>
</html>`;
}
