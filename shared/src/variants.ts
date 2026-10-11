// Material colour variants: a consumption column is a material code, optionally with a colour,
// e.g. "SEQ-3MM" or "SEQ-3MM|WHITE". Colours are entered in Punching (no admin field needed).

export const VARIANT_SEPARATOR = '|';

/** Colours: letters, numbers, spaces, dots, dashes, & and /; stored upper-case. */
export const COLOR_PATTERN = /^[A-Z0-9][A-Z0-9 .&/-]*$/;

export interface VariantParts {
  code: string;
  color: string | null;
}

export function normalizeColor(color: string | null | undefined): string | null {
  const value = (color ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return value === '' ? null : value;
}

/** "SEQ-3MM" + "white" → "SEQ-3MM|WHITE"; no colour → "SEQ-3MM". */
export function variantKey(code: string, color?: string | null): string {
  const c = normalizeColor(color);
  return c ? `${code.trim().toUpperCase()}${VARIANT_SEPARATOR}${c}` : code.trim().toUpperCase();
}

export function parseVariantKey(key: string): VariantParts {
  const index = key.indexOf(VARIANT_SEPARATOR);
  if (index === -1) return { code: key.trim().toUpperCase(), color: null };
  return { code: key.slice(0, index).trim().toUpperCase(), color: normalizeColor(key.slice(index + 1)) };
}

/** "SEQ-3MM · WHITE" for display. */
export function variantLabel(key: string): string {
  const { code, color } = parseVariantKey(key);
  return color ? `${code} · ${color}` : code;
}

/**
 * Orders variant keys by material (Material Master order), the plain material first, then its
 * colours in the order given. Unknown codes go last.
 */
export function sortVariantKeys(keys: Iterable<string>, materialOrder: readonly string[]): string[] {
  const position = new Map(materialOrder.map((code, i) => [code, i]));
  const unique = [...new Set(keys)];
  return unique
    .map((key, index) => ({ key, index, ...parseVariantKey(key) }))
    .sort(
      (a, b) =>
        (position.get(a.code) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.code) ?? Number.MAX_SAFE_INTEGER) ||
        a.code.localeCompare(b.code) ||
        (a.color === null ? -1 : 0) - (b.color === null ? -1 : 0) ||
        a.index - b.index,
    )
    .map((v) => v.key);
}

// ---- Material types (e.g. sequence finish: MATT, METAL, PURE GLASS) ----
// Types belong to a category (Admin), are chosen per ORDER in Production for each colour column, and
// set the rate. A typed key adds the type to a column key: "SEQ-3MM|PINK^MATT".

export const TYPE_SEPARATOR = '^';

/** Type names: same characters as colours; stored upper-case. */
export function normalizeType(type: string | null | undefined): string | null {
  return normalizeColor(type);
}

/** "SEQ-3MM|PINK" + "matt" → "SEQ-3MM|PINK^MATT"; no type → the column key itself. */
export function typedKey(columnKey: string, type?: string | null): string {
  const t = normalizeType(type);
  return t ? `${columnKey}${TYPE_SEPARATOR}${t}` : columnKey;
}

export function parseTypedKey(key: string): VariantParts & { columnKey: string; type: string | null } {
  const index = key.indexOf(TYPE_SEPARATOR);
  const columnKey = index === -1 ? key : key.slice(0, index);
  const type = index === -1 ? null : normalizeType(key.slice(index + 1));
  return { ...parseVariantKey(columnKey), columnKey, type };
}

/** "SEQ-3MM · PINK · MATT" for display. */
export function typedLabel(key: string): string {
  const { columnKey, type } = parseTypedKey(key);
  return type ? `${variantLabel(columnKey)} · ${type}` : variantLabel(columnKey);
}
