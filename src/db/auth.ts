import { pool } from './pool';

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  session_id: string;
  expires_at: string;
  created_at: string;
};

export type InviteRow = {
  id: string;
  token_hash: string;
  expires_at: string;
  created_by: string | null;
  created_at: string;
};

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const res = await pool.query<UserRow>('select * from users where username = $1 limit 1', [username]);
  return res.rows[0] ?? null;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const res = await pool.query<UserRow>('select * from users where id = $1 limit 1', [id]);
  return res.rows[0] ?? null;
}

export async function createUser(params: { username: string; passwordHash: string }): Promise<UserRow> {
  const res = await pool.query<UserRow>(
    `
      insert into users (username, password_hash)
      values ($1, $2)
      returning *
    `,
    [params.username, params.passwordHash],
  );
  return res.rows[0]!;
}

export async function createSession(params: { userId: string; sessionId: string; expiresAt: Date }): Promise<SessionRow> {
  const res = await pool.query<SessionRow>(
    `
      insert into sessions (user_id, session_id, expires_at)
      values ($1, $2, $3)
      returning *
    `,
    [params.userId, params.sessionId, params.expiresAt.toISOString()],
  );
  return res.rows[0]!;
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const res = await pool.query<SessionRow>(
    'select * from sessions where session_id = $1 and expires_at > now() limit 1',
    [sessionId],
  );
  return res.rows[0] ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await pool.query('delete from sessions where session_id = $1', [sessionId]);
}

export async function createInvite(params: { tokenHash: string; expiresAt: Date; createdBy: string | null }): Promise<InviteRow> {
  const res = await pool.query<InviteRow>(
    `
      insert into invites (token_hash, expires_at, created_by)
      values ($1, $2, $3)
      returning *
    `,
    [params.tokenHash, params.expiresAt.toISOString(), params.createdBy],
  );
  return res.rows[0]!;
}

export async function getInviteByTokenHash(tokenHash: string): Promise<InviteRow | null> {
  const res = await pool.query<InviteRow>(
    'select * from invites where token_hash = $1 and expires_at > now() limit 1',
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

export async function consumeInvite(id: string): Promise<void> {
  await pool.query('delete from invites where id = $1', [id]);
}
