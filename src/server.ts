import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import dotenv from 'dotenv';
import pinoHttp from 'pino-http';

import { logger } from './logger/logger';
import { ensureDefaultAdminUser } from './db/bootstrap';
import { adminProtectedApiRouter } from './routes/admin-protected';
import { adminUiProtectedRouter } from './routes/admin-ui-protected';
import { publicRouter } from './routes/public';
import { runMigrations } from './db/migrations';
import { asanaWebhookHandler } from './webhooks/asana-handler';
import { githubWebhookHandler } from './webhooks/github-handler';

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

app.use('/api', publicRouter());

// Browser UI (Basic Auth)
app.use('/admin', adminUiProtectedRouter());

// Admin JSON API (Basic Auth)
app.use('/api/admin', adminProtectedApiRouter());

app.post('/webhooks/asana', asanaWebhookHandler);
app.post('/webhooks/github', githubWebhookHandler);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled request error');
  res.status(500).json({ error: 'Internal Server Error' });
});

async function main(): Promise<void> {
  await runMigrations();
  await ensureDefaultAdminUser();

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
