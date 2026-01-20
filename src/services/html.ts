export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function pageShell(params: { title: string; body: string }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.title)}</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0f14;color:#e8eef7;}
  a{color:#7aa2ff;text-decoration:none;}
  .wrap{max-width:980px;margin:0 auto;padding:24px 16px;}
  .card{border:1px solid rgba(232,238,247,0.12);background:rgba(255,255,255,0.06);border-radius:14px;padding:16px;}
  .muted{color:rgba(232,238,247,0.72);font-size:13px;}
  .nav{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;}
  .pill{border:1px solid rgba(232,238,247,0.12);padding:6px 10px;border-radius:999px;background:rgba(0,0,0,0.22);}
  table{width:100%;border-collapse:separate;border-spacing:0 8px;}
  th{font-size:12px;color:rgba(232,238,247,0.72);text-align:left;font-weight:600;padding:0 10px;}
  td{padding:10px 10px;border-top:1px solid rgba(232,238,247,0.12);border-bottom:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);}
  tr td:first-child{border-left:1px solid rgba(232,238,247,0.12);border-top-left-radius:12px;border-bottom-left-radius:12px;}
  tr td:last-child{border-right:1px solid rgba(232,238,247,0.12);border-top-right-radius:12px;border-bottom-right-radius:12px;}
  input,select,textarea{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);color:#e8eef7;padding:10px 12px;}
  button{border:1px solid rgba(232,238,247,0.12);background:rgba(255,255,255,0.08);color:#e8eef7;padding:10px 12px;border-radius:12px;cursor:pointer;}
  pre{border:1px solid rgba(232,238,247,0.12);background:rgba(0,0,0,0.22);border-radius:12px;padding:10px 12px;white-space:pre-wrap;}
</style>
</head>
<body>
<div class="wrap">
${params.body}
</div>
</body>
</html>`;
}
