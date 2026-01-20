import { Router } from 'express';

import { listTasks } from '../db/tasks-v2';

export function publicRouter(): Router {
  const r = Router();

  r.get('/tasks', async (_req, res, next) => {
    try {
      const rows = await listTasks();
      res.status(200).json({ tasks: rows });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
