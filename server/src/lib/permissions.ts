import { PERMISSION_CODES, type PermissionCode } from '@app/shared';

/** Known codes only, without duplicates, in the canonical PERMISSIONS order. */
export function sortPermissions(codes: Iterable<string>): PermissionCode[] {
  const set = new Set<string>(codes);
  return PERMISSION_CODES.filter((code) => set.has(code));
}

/** Codes in `wanted` that the holder does not have. */
export function missingPermissions(wanted: Iterable<string>, held: ReadonlySet<string>): string[] {
  return [...new Set(wanted)].filter((code) => !held.has(code));
}
