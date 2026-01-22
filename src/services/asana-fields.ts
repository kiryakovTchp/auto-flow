import type { AsanaTask } from '../integrations/asana';

export function getAutoTaskEnabled(task: any, autoFieldGid: string | null): boolean | null {
  if (!autoFieldGid) return null;
  const cf = task?.custom_fields;
  if (!Array.isArray(cf)) return null;

  const f = cf.find((x: any) => String(x?.gid) === String(autoFieldGid));
  if (!f) return null;

  if (typeof f.boolean_value === 'boolean') return f.boolean_value;

  // Some Asana accounts/plans may not support checkbox fields in UI.
  // In that case we allow AutoTask to be implemented as an enum field
  // with values like True/False.
  const evName = f?.enum_value?.name;
  if (typeof evName === 'string' && evName.trim()) {
    return parseBoolFromString(evName);
  }

  const mev = f?.multi_enum_values;
  if (Array.isArray(mev) && mev.length) {
    const names = mev
      .map((x: any) => (typeof x?.name === 'string' ? x.name.trim() : ''))
      .filter((x: string) => x);

    const hasTrue = names.some((n) => parseBoolFromString(n) === true);
    const hasFalse = names.some((n) => parseBoolFromString(n) === false);
    if (hasTrue && !hasFalse) return true;
    if (hasFalse && !hasTrue) return false;
    return null;
  }

  return null;
}

function parseBoolFromString(s: string): boolean | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;

  if (['true', 'yes', 'on', 'enabled', 'enable', '1'].includes(v)) return true;
  if (['false', 'no', 'off', 'disabled', 'disable', '0'].includes(v)) return false;
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

  // Some fields may be configured as multi-enum. If exactly one option is selected,
  // treat it as the effective value.
  const mev = f?.multi_enum_values;
  if (Array.isArray(mev) && mev.length === 1) {
    const n = mev[0]?.name;
    if (typeof n === 'string' && n.trim()) return n.trim();
  }

  return null;
}
