import type { AuditChange } from './audit-log.model.js';

/**
 * Field-by-field changes between two snapshots (plain JSON), readable for people:
 * "lines › KALI 18 › quantity: 460 → 500". Lists of records are matched by their natural key (component +
 * size, name, size, material + colour, key, code, email), so a moved row is not reported as changed.
 * Secret fields (password, token, hash) are never shown: only that they changed.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const SECRET = /password|token|hash/i;
const MAX_CHANGES = 300;
const MAX_VALUE = 500;

const isObject = (value: unknown): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Natural key of a record in a list, or null. */
function identity(value: Json): string | null {
  if (!isObject(value)) return null;
  if ('material' in value && 'color' in value) return value.color ? `${String(value.material)} · ${String(value.color)}` : String(value.material);
  if ('component' in value && 'size' in value) return `${String(value.component)} ${String(value.size)}`;
  for (const key of ['name', 'size', 'key', 'code', 'email']) {
    const id = value[key];
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return null;
}

function show(value: Json | undefined): string | null {
  if (value === null || value === undefined) return null;
  let text: string;
  if (Array.isArray(value) && value.every((v) => !isObject(v) && !Array.isArray(v))) text = value.map(String).join(', ');
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const join = (path: string, key: string) => (path ? `${path} › ${key}` : key);

function walk(before: Json | undefined, after: Json | undefined, path: string, out: AuditChange[]): void {
  if (out.length >= MAX_CHANGES || same(before, after)) return;
  const field = path.split(' › ').at(-1) ?? path;
  if (SECRET.test(field)) {
    out.push({ field: path, from: before == null ? null : '•••', to: after == null ? null : '••• (changed)' });
    return;
  }
  if ((isObject(before) || before == null) && (isObject(after) || after == null) && (isObject(before) || isObject(after))) {
    const b = isObject(before) ? before : {};
    const a = isObject(after) ? after : {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) walk(b[key], a[key], join(path, key), out);
    return;
  }
  const listOf = (v: Json | undefined) => (Array.isArray(v) ? v : v == null ? [] : null);
  const bl = listOf(before);
  const al = listOf(after);
  if (bl && al && [...bl, ...al].length > 0 && [...bl, ...al].every((v) => identity(v) !== null)) {
    const bm = new Map(bl.map((v) => [identity(v)!, v]));
    const am = new Map(al.map((v) => [identity(v)!, v]));
    for (const id of new Set([...bm.keys(), ...am.keys()])) walk(bm.get(id), am.get(id), join(path, id), out);
    return;
  }
  out.push({ field: path || '(value)', from: show(before), to: show(after) });
}

/** Changes from `before` to `after` (either may be null: created / deleted). */
export function diffSnapshots(before: unknown, after: unknown): AuditChange[] {
  const out: AuditChange[] = [];
  walk(toJson(before), toJson(after), '', out);
  return out;
}

/** Plain JSON copy (ObjectIds and dates become strings). */
export function toJson(value: unknown): Json {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);
}
