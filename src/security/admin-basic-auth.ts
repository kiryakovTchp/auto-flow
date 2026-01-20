import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { getAdminUser } from '../db/admin-users';

function decodeBasicAuth(authHeader: string): { username: string; password: string } | null {
  if (!authHeader.startsWith('Basic ')) return null;
  const raw = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
  const idx = raw.indexOf(':');
  if (idx < 0) return null;
  return { username: raw.slice(0, idx), password: raw.slice(idx + 1) };
}

export async function requireAdminBasicAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.header('authorization');
  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).send('Auth required');
    return;
  }

  const creds = decodeBasicAuth(auth);
  if (!creds) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).send('Invalid auth');
    return;
  }

  const user = await getAdminUser(creds.username);
  if (!user) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).send('Invalid credentials');
    return;
  }

  const ok = await bcrypt.compare(creds.password, user.password_hash);
  if (!ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).send('Invalid credentials');
    return;
  }

  (req as any).adminUser = { username: user.username };
  next();
}
