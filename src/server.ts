import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import dotenv from 'dotenv';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';

import { logger } from './logger/logger';
import { ensureDefaultAdminUser } from './db/bootstrap';
import { adminProtectedApiRouter } from './routes/admin-protected';
import { adminUiProtectedRouter } from './routes/admin-ui-protected';
import path from 'node:path';
import fs from 'node:fs';

import { uiApiRouter } from './routes/ui-api';
import { apiV1Router } from './routes/api-v1';
import { runMigrations } from './db/migrations';
import { asanaWebhookHandler } from './webhooks/asana-handler';
import { githubWebhookHandler } from './webhooks/github-handler';
import { asanaProjectWebhookHandler } from './webhooks/asana-project-handler';
import { githubProjectWebhookHandler } from './webhooks/github-project-handler';
import { startJobWorker } from './services/job-worker';
import { startReconcileScheduler } from './services/reconcile-scheduler';
import { startOpenCodeWatchdogScheduler } from './services/opencode-watchdog-scheduler';
import { getMetricsText, isMetricsRequestAllowed } from './metrics/metrics';

dotenv.config();

const app = express();

// For webhooks we need raw body to validate signatures.
// We accept JSON everywhere, and keep raw bytes in (req as any).rawBody.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);

// HTML forms in the UI are submitted as application/x-www-form-urlencoded.
app.use(express.urlencoded({ extended: false }));

app.use(cookieParser());

app.use(
  pinoHttp({
    logger,
    redact: {
      paths: ['req.headers.authorization'],
      remove: true,
    },
  }),
);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/metrics', async (req: Request, res: Response) => {
  if (!isMetricsRequestAllowed(req)) {
    res.status(401).send('Unauthorized');
    return;
  }

  try {
    const text = await getMetricsText();
    res.status(200).setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(text);
  } catch (err) {
    logger.error({ err }, 'Failed to render metrics');
    res.status(500).send('metrics error');
  }
});

// UI API
app.use('/api/ui', uiApiRouter());

app.use('/api/v1', apiV1Router());

const uiDistPath = path.resolve(__dirname, '..', 'public', 'ui');
const uiIndexPath = path.join(uiDistPath, 'index.html');
if (fs.existsSync(uiDistPath)) {
  app.use(express.static(uiDistPath));
}

app.get(['/', '/login', '/init', '/invite/:token', '/projects', '/docs', '/p/:slug', '/p/:slug/:path*'], (req: Request, res: Response) => {
  if (!fs.existsSync(uiIndexPath)) {
    res.status(503).send('UI build not found. Run the UI build to generate public/ui.');
    return;
  }
  res.status(200).sendFile(uiIndexPath);
});

// Legacy Basic-Auth admin UI (kept temporarily)
app.use('/admin', adminUiProtectedRouter());
app.use('/api/admin', adminProtectedApiRouter());

app.post('/webhooks/asana', asanaWebhookHandler);
app.post('/webhooks/github', githubWebhookHandler);

// Stage 3: per-project endpoints
app.all('/webhooks/asana/:projectId', asanaProjectWebhookHandler);
app.all('/webhooks/github/:projectId', githubProjectWebhookHandler);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled request error');
  res.status(500).json({ error: 'Internal Server Error' });
});

async function main(): Promise<void> {
  await runMigrations();
  await ensureDefaultAdminUser();

  startJobWorker();
  startReconcileScheduler();
  startOpenCodeWatchdogScheduler();

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});

// Small utility we will reuse for signature checks.
export function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'utf8');
  const b = Buffer.from(bHex, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
