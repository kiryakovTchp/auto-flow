import { logger } from '../logger/logger';
import { listProjects } from '../db/projects';
import { enqueueJob } from '../db/job-queue';

export function startReconcileScheduler(): void {
  const tick = async () => {
    try {
      const projects = await listProjects();
      for (const p of projects) {
        await enqueueJob({
          projectId: p.id,
          provider: 'internal',
          kind: 'reconcile.project',
          payload: { projectId: p.id },
        });
      }
    } catch (err) {
      logger.error({ err }, 'Reconcile scheduler tick failed');
    }
  };

  // Run immediately and then every 5 minutes.
  void tick();
  setInterval(tick, 5 * 60 * 1000);
  logger.info('Reconcile scheduler started');
}
