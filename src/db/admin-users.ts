import { pool } from './pool';

export type AdminUser = {
  username: string;
  password_hash: string;
};

export async function getAdminUser(username: string): Promise<AdminUser | null> {
  const res = await pool.query<AdminUser>('select username, password_hash from admin_users where username = $1 limit 1', [username]);
  return res.rows[0] ?? null;
}

export async function upsertAdminUser(params: { username: string; passwordHash: string }): Promise<void> {
  await pool.query(
    `
      insert into admin_users (username, password_hash)
      values ($1, $2)
      on conflict (username) do update
      set password_hash = excluded.password_hash, updated_at = now()
    `,
    [params.username, params.passwordHash],
  );
}
