import { Pool } from 'pg';

// node-postgres reads PG* env vars by default.
export const pool = new Pool();

pool.on('error', (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('PostgreSQL pool error', err);
});
