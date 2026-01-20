import type { Request } from 'express';

import { getEnv } from '../config/env';

export function getBearerToken(req: Request): string | null {
  const auth = req.header('authorization');
  if (!auth) return null;
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length);
}

export function isAdminRequest(req: Request): boolean {
  const env = getEnv();
  const token = getBearerToken(req);
  return Boolean(env.ADMIN_API_TOKEN) && token === env.ADMIN_API_TOKEN;
}
