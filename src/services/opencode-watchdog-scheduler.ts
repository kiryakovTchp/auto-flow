import { enqueueJob } from '../db/job-queue';
import { listProjects } from '../db/projects';
import { logger } from '../logger/logger';

export function startOpenCodeWatchdogScheduler(): void {
  const intervalMinutes = Number(process.env.OPENCODE_WATCHDOG_INTERVAL_MINUTES ?? 5);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    logger.info('OpenCode watchdog scheduler disabled');
    return;
  }

  const tick = async () => {
    try {
      const projects = await listProjects();
      for (const p of projects) {
        await enqueueJob({
          projectId: p.id,
          provider: 'internal',
          kind: 'opencode.watchdog',
          payload: { projectId: p.id },
        });
      }
    } catch (err) {
      logger.error({ err }, 'OpenCode watchdog scheduler tick failed');
    }
  };

  void tick();
  setInterval(tick, intervalMinutes * 60 * 1000);
  logger.info({ intervalMinutes }, 'OpenCode watchdog scheduler started');
}
