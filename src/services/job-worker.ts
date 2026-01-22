import crypto from 'node:crypto';

import { logger } from '../logger/logger';
import { claimNextJob, markJobDone, markJobFailed } from '../db/job-queue';
import { processAsanaProjectWebhookJob, processGithubProjectWebhookJob } from './webhook-job-handlers';
import { processOpenCodeWatchdogJob } from './opencode-watchdog';
import { processOpenCodeRunJob } from './opencode-server-runner-job';
import { reconcileProject } from './reconcile';
import { incJobDone, incJobFailed } from '../metrics/metrics';
import { insertProjectEvent } from '../db/project-events';

export function startJobWorker(): void {
  const workerId = `w-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Drain a small batch per tick.
      for (let i = 0; i < 10; i++) {
        const job = await claimNextJob(workerId);
        if (!job) return;

        try {
          if (job.provider === 'asana' && job.kind === 'asana.project_webhook') {
            await processAsanaProjectWebhookJob({
              projectId: String((job.payload as any)?.projectId ?? job.project_id ?? ''),
              asanaProjectGid: String((job.payload as any)?.asanaProjectGid ?? ''),
              payload: (job.payload as any)?.payload,
            });
            await markJobDone(job.id);
            incJobDone();
            continue;
          }

          if (job.provider === 'github' && job.kind === 'github.project_webhook') {
            await processGithubProjectWebhookJob({
              projectId: String((job.payload as any)?.projectId ?? job.project_id ?? ''),
              deliveryId: (job.payload as any)?.deliveryId ?? null,
              eventName: String((job.payload as any)?.eventName ?? ''),
              payload: (job.payload as any)?.payload,
            });
            await markJobDone(job.id);
            incJobDone();
            continue;
          }

          if (job.provider === 'internal' && job.kind === 'reconcile.project') {
            await reconcileProject({ projectId: String((job.payload as any)?.projectId ?? job.project_id ?? '') });
            await markJobDone(job.id);
            incJobDone();
            continue;
          }

          if (job.provider === 'internal' && job.kind === 'opencode.watchdog') {
            await processOpenCodeWatchdogJob({ projectId: String((job.payload as any)?.projectId ?? job.project_id ?? '') });
            await markJobDone(job.id);
            incJobDone();
            continue;
          }

          if (job.provider === 'internal' && job.kind === 'opencode.run') {
            await processOpenCodeRunJob({
              projectId: String((job.payload as any)?.projectId ?? job.project_id ?? ''),
              taskId: String((job.payload as any)?.taskId ?? ''),
            });
            await markJobDone(job.id);
            incJobDone();
            continue;
          }

          // Unknown job kind - mark as failed.
          await markJobFailed({
            jobId: job.id,
            attempts: job.attempts + 1,
            maxAttempts: job.max_attempts,
            error: `Unknown job kind: provider=${job.provider} kind=${job.kind}`,
          });
          incJobFailed(job.attempts + 1 >= job.max_attempts);

          if (job.project_id) {
            await insertProjectEvent({
              projectId: job.project_id,
              source: 'system',
              eventType: 'error',
              refJson: {
                jobId: job.id,
                provider: job.provider,
                kind: job.kind,
                attempts: job.attempts + 1,
                maxAttempts: job.max_attempts,
                error: `Unknown job kind: provider=${job.provider} kind=${job.kind}`,
              },
            });
          }
        } catch (err: any) {
          const msg = String(err?.stack ?? err?.message ?? err);
          logger.error({ jobId: job.id, provider: job.provider, kind: job.kind, err: msg }, 'Job failed');
          await markJobFailed({ jobId: job.id, attempts: job.attempts + 1, maxAttempts: job.max_attempts, error: msg });
          incJobFailed(job.attempts + 1 >= job.max_attempts);

          if (job.project_id) {
            await insertProjectEvent({
              projectId: job.project_id,
              source: 'system',
              eventType: 'error',
              refJson: {
                jobId: job.id,
                provider: job.provider,
                kind: job.kind,
                attempts: job.attempts + 1,
                maxAttempts: job.max_attempts,
                error: msg,
              },
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Job worker tick failed');
    } finally {
      running = false;
    }
  };

  // Start.
  void tick();
  setInterval(tick, 1000);
  logger.info({ workerId }, 'Job worker started');
}
