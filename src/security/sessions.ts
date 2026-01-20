import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { getSession, getUserById, getUserByUsername } from '../db/auth';

export const SESSION_COOKIE = 'af_session';

export function newSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function authenticateUser(username: string, password: string): Promise<{ userId: string } | null> {
  const user = await getUserByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { userId: user.id };
}

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sid = (req as any).cookies?.[SESSION_COOKIE];
  if (!sid || typeof sid !== 'string') {
    res.redirect('/login');
    return;
  }

  const session = await getSession(sid);
  if (!session) {
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/login');
    return;
  }

  const user = await getUserById(session.user_id);
  if (!user) {
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/login');
    return;
  }

  (req as any).auth = { userId: user.id, username: user.username };
  next();
}

export async function optionalSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sid = (req as any).cookies?.[SESSION_COOKIE];
  if (sid && typeof sid === 'string') {
    const session = await getSession(sid);
    if (session) {
      const user = await getUserById(session.user_id);
      if (user) {
        (req as any).auth = { userId: user.id, username: user.username };
      }
    }
  }
  next();
}
