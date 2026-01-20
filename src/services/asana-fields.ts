import type { AsanaTask } from '../integrations/asana';

export function getAutoTaskEnabled(task: any, autoFieldGid: string | null): boolean | null {
  if (!autoFieldGid) return null;
  const cf = task?.custom_fields;
  if (!Array.isArray(cf)) return null;

  const f = cf.find((x: any) => String(x?.gid) === String(autoFieldGid));
  if (!f) return null;

  if (typeof f.boolean_value === 'boolean') return f.boolean_value;
  return null;
}

export function getEnumOptionName(task: any, fieldGid: string | null): string | null {
  if (!fieldGid) return null;
  const cf = task?.custom_fields;
  if (!Array.isArray(cf)) return null;

  const f = cf.find((x: any) => String(x?.gid) === String(fieldGid));
  if (!f) return null;

  const ev = f.enum_value;
  const name = ev?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return null;
}
