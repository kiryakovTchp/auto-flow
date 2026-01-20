import { runSqlMigrations } from './migrator';

export async function runMigrations(): Promise<void> {
  await runSqlMigrations();
}
