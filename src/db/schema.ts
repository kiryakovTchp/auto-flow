import { pool } from './pool';

export async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = $1
      ) as exists
    `,
    [tableName],
  );
  return Boolean(res.rows[0]?.exists);
}

export async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2
      ) as exists
    `,
    [tableName, columnName],
  );
  return Boolean(res.rows[0]?.exists);
}
