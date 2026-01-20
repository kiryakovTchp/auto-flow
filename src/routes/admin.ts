// Deprecated in favor of:
// - src/routes/admin-api.ts (JSON admin API)
// - src/routes/admin-ui.ts (browser UI)
//
// Kept to avoid breaking older references during refactor.

import { Router } from 'express';

export function adminRouter(): Router {
  const r = Router();
  r.get('/deprecated', (_req, res) => {
    res.status(410).json({ error: 'deprecated', hint: 'use /admin or /api/admin' });
  });
  return r;
}
