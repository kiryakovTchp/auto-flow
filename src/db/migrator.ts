import fs from 'node:fs';
import path from 'node:path';

import { pool } from './pool';

export type SqlMigration = {
  version: number;
  name: string;
  filePath: string;
};

// In dev (ts-node) __dirname points to src/db.
// In prod (compiled) __dirname points to dist/db.
// SQL migrations live in src/db/sql in the repository.
const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'sql');

export async function runSqlMigrations(): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      version integer primary key,
      name text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const migrations = loadMigrations();
  if (!migrations.length) return;

  const applied = await pool.query<{ version: number }>('select version from schema_migrations order by version asc');
  const appliedSet = new Set(applied.rows.map((r) => r.version));

  // One-time bootstrap: older installs may already have tables but no schema_migrations.
  const tasksExistsRes = await pool.query<{ exists: boolean }>(
    `select exists(select 1 from information_schema.tables where table_schema='public' and table_name='tasks') as exists`,
  );
  const tasksExists = Boolean(tasksExistsRes.rows[0]?.exists);
  if (tasksExists && !appliedSet.has(1)) {
    await pool.query('insert into schema_migrations (version, name) values ($1, $2) on conflict do nothing', [1, 'init']);
    appliedSet.add(1);
  }

  for (const m of migrations) {
    if (appliedSet.has(m.version)) continue;

    const sql = fs.readFileSync(m.filePath, 'utf8');

    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations (version, name) values ($1, $2)', [m.version, m.name]);
      await pool.query('commit');
    } catch (err) {
      await pool.query('rollback');
      throw err;
    }
  }
}

function loadMigrations(): SqlMigration[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  const migrations: SqlMigration[] = [];
  for (const f of files) {
    const m = f.match(/^(\d+)_([a-z0-9_-]+)\.sql$/i);
    if (!m) continue;
    migrations.push({
      version: Number(m[1]),
      name: m[2],
      filePath: path.join(MIGRATIONS_DIR, f),
    });
  }

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}
