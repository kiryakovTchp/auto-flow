import { Router } from 'express';

import { getOpenCodeLaunchConfig } from '../services/opencode-config';
import { launchOpenCodeInTerminal } from '../services/opencode-launch';

export function openCodeRouter(): Router {
  const r = Router();

  r.post('/launch', async (_req, res, next) => {
    try {
      const cfg = await getOpenCodeLaunchConfig();
      if (!cfg.workdir) {
        res.status(400).json({ error: 'OPENCODE_WORKDIR is not set' });
        return;
      }

      await launchOpenCodeInTerminal({ workdir: cfg.workdir, command: cfg.command ?? undefined });
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
