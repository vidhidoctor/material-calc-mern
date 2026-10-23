import { COLOR_PATTERN, normalizeColor, parseVariantKey, sortVariantKeys, variantKey, variantLabel, type DesignDetailDto, type DesignSizeDto } from '@app/shared';
import { useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import { useComponentNames } from '../../materials/materials.hooks';
import { usePutComponent } from '../punching.hooks';
import type { SizeRowBody } from '../punching.api';

const OTHER = '__other__';
/** Suggested colours; any other colour can be typed. */
const COMMON_COLORS = ['WHITE', 'BLACK', 'RED', 'GOLD', 'SILVER', 'COPPER', 'LIGHT PINK', 'DARK PINK', 'MAROON', 'GREEN', 'BLUE', 'CREAM'];
const STANDARD_SIZES = ['18', '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40'];

interface Row {
  key: number;
  size: string;
  stitch: string;
  laser: string;
  /** materialCode → qty as typed ("" = 0). */
  consumption: Record<string, string>;
}

interface Props {
  design: DesignDetailDto;
  /** null = add a new component. */
  componentName: string | null;
  onClose: () => void;
}

/**
 * Grid editor: one row per size with Size, Stitch, Laser and one input per column chosen for this
 * component (shared by all its sizes). A column is a material, optionally in a colour (SEQ-3MM · WHITE).
 * Saving replaces the sizes.
 */
export function ComponentEditor({ design, componentName, onClose }: Props) {
  const save = usePutComponent(design.designNo);
  const componentNames = useComponentNames();
  const nextKey = useRef(0);
  const existing = design.components.find((c) => c.name === componentName) ?? null;
  const isNew = existing === null;

  const toRow = (s?: DesignSizeDto, size = ''): Row => ({
    key: nextKey.current++,
    size: s?.size ?? size,
    stitch: s ? String(s.stitch) : '',
    laser: s?.laser != null ? String(s.laser) : '',
    consumption: Object.fromEntries(Object.entries(s?.consumption ?? {}).map(([code, qty]) => [code, String(qty)])),
  });

  const [name, setName] = useState(existing?.name ?? '');
  /** "Other…" chosen in the dropdown: the name is typed instead. */
  const [custom, setCustom] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => (existing ? existing.sizes.map((s) => toRow(s)) : [toRow()]));
  const [dirty, setDirty] = useState(false);
  /** Columns chosen for this component (variant keys such as "SEQ-3MM|WHITE"), by material then colour. */
  const [selected, setSelected] = useState<string[]>(() => existing?.columns ?? []);
  const materialOrder = design.materials.map((m) => m.code);
  const materialByCode = new Map(design.materials.map((m) => [m.code, m]));
  const columns = selected.map((key) => ({ key, ...parseVariantKey(key), unit: materialByCode.get(parseVariantKey(key).code)?.unit ?? '' }));

  // "Add column": a material, optionally with a colour.
  const [newMaterial, setNewMaterial] = useState('');
  const [newColor, setNewColor] = useState('');
  const newKey = newMaterial ? variantKey(newMaterial, newColor) : '';
  const colorOk = !normalizeColor(newColor) || COLOR_PATTERN.test(normalizeColor(newColor)!);
  /** Typed materials (e.g. sequence): the type is chosen per order in Production, so a colour is required here. */
  const colorRequired = !!materialByCode.get(newMaterial)?.typed && !normalizeColor(newColor);
  const canAddColumn = newKey !== '' && colorOk && !colorRequired && !selected.includes(newKey);
  const usedColors = [...new Set(design.components.flatMap((c) => c.columns.map((k) => parseVariantKey(k).color)).filter(Boolean))] as string[];
  const colorSuggestions = [...new Set([...usedColors, ...COMMON_COLORS])];

  const addColumn = () => {
    if (!canAddColumn) return;
    setDirty(true);
    setSelected((current) => sortVariantKeys([...current, newKey], materialOrder));
    setNewColor('');
  };

  const removeColumn = (key: string) => {
    const hasValues = rows.some((r) => (parseNumberInput(r.consumption[key] ?? '') ?? 0) > 0);
    if (hasValues && !window.confirm(`Remove ${variantLabel(key)} from this component? Its quantities in every size will be cleared.`)) return;
    setDirty(true);
    setSelected((current) => current.filter((c) => c !== key));
    setRows((rs) =>
      rs.map((r) => {
        const { [key]: _removed, ...rest } = r.consumption;
        return { ...r, consumption: rest };
      }),
    );
  };

  const taken = new Set(design.components.map((c) => c.name));
  // The component list from Material Master → Components, minus the ones this design already has.
  const suggestions = (componentNames.data ?? []).map((c) => c.name).filter((c) => !taken.has(c));

  // Completely empty rows are ignored on save; in other rows a missing/duplicate Size or a missing
  // Stitch is outlined in red (no message list).
  const { filled, invalid, canSave } = useMemo(() => {
    const filledRows = rows.filter((r) => r.size.trim() || r.stitch || r.laser || Object.values(r.consumption).some(Boolean));
    const bad = new Map<number, { size: boolean; stitch: boolean }>();
    const seen = new Set<string>();
    for (const row of filledRows) {
      const size = row.size.trim();
      const sizeBad = !size || seen.has(size);
      seen.add(size);
      if (sizeBad || row.stitch === '') bad.set(row.key, { size: sizeBad, stitch: row.stitch === '' });
    }
    const trimmedName = name.trim();
    const nameOk = trimmedName !== '' && !(isNew && taken.has(trimmedName));
    return { filled: filledRows, invalid: bad, canSave: nameOk && filledRows.length > 0 && bad.size === 0 };
  }, [name, rows, isNew, taken]);

  const update = (key: number, change: (row: Row) => Row) => {
    setDirty(true);
    setRows((rs) => rs.map((r) => (r.key === key ? change(r) : r)));
  };

  const addStandardSizes = () => {
    const present = new Set(rows.map((r) => r.size.trim()));
    const blankOnly = rows.length === 1 && !rows[0]!.size && !rows[0]!.stitch;
    const added = STANDARD_SIZES.filter((s) => !present.has(s)).map((s) => toRow(undefined, s));
    setDirty(true);
    setRows((rs) => [...(blankOnly ? [] : rs), ...added]);
  };

  const close = () => {
    if (!dirty || window.confirm('Discard your changes to this component?')) onClose();
  };

  const onSubmit = () => {
    if (!canSave) return;
    const sizes: SizeRowBody[] = filled.map((row) => ({
      size: row.size.trim(),
      stitch: parseNumberInput(row.stitch) ?? 0,
      laser: parseNumberInput(row.laser),
      consumption: Object.fromEntries(
        Object.entries(row.consumption)
          .filter(([code]) => selected.includes(code))
          .map(([code, value]) => [code, parseNumberInput(value) ?? 0] as const)
          .filter(([, qty]) => qty > 0),
      ),
    }));
    save.mutate({ name: name.trim(), columns: selected, sizes }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      wide
      title={isNew ? `Add component to ${design.designNo}` : `Edit ${existing.name} — ${design.designNo}`}
      onClose={close}
      onSubmit={onSubmit}
      footer={
        <>
          <span className="muted small footer-note">Blank consumption = 0. Saving replaces all sizes of this component.</span>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !canSave}>
            {save.isPending ? 'Saving…' : 'Save component'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={save.error} />

        <div className="editor-top">
          {isNew ? (
            <>
              <Field label="Component" required>
                <select
                  className="input"
                  required
                  autoFocus
                  value={custom ? OTHER : name}
                  onChange={(e) => {
                    setDirty(true);
                    const value = e.target.value;
                    setCustom(value === OTHER);
                    setName(value === OTHER ? '' : value);
                  }}
                >
                  <option value="" disabled>
                    {componentNames.isPending ? 'Loading components…' : 'Select a component…'}
                  </option>
                  {suggestions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value={OTHER}>Other…</option>
                </select>
              </Field>
              {custom && (
                <Field label="Component name" required>
                  <input
                    className="input upper"
                    required
                    autoFocus
                    placeholder="e.g. DUPATTA"
                    value={name}
                    onChange={(e) => {
                      setDirty(true);
                      setName(e.target.value.toUpperCase());
                    }}
                  />
                </Field>
              )}
            </>
          ) : (
            <Field label="Component" hint="The name cannot be changed.">
              <input className="input" disabled value={name} />
            </Field>
          )}
        </div>

        {design.materials.length === 0 ? (
          <div className="alert alert-info">No materials yet. Add them in Admin → Material Master to enter consumption.</div>
        ) : (
          <div className="material-picker">
            <span className="field-label">Materials used by this component</span>
            <div className="material-picker-row">
              {columns.length === 0 && <span className="muted small">None yet — add the materials (and colours) this component consumes.</span>}
              {columns.map((c) => (
                <span key={c.key} className="tag material-tag">
                  {c.code}
                  {c.color && <span className="tag-color">{c.color}</span>}
                  <button type="button" className="tag-remove" aria-label={`Remove ${variantLabel(c.key)}`} onClick={() => removeColumn(c.key)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="material-picker-row add-column">
              <select className="input input-sm material-add" aria-label="Material" value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)}>
                <option value="">Material…</option>
                {[...new Set(design.materials.map((m) => m.category))].map((category) => (
                  <optgroup key={category} label={category}>
                    {design.materials
                      .filter((m) => m.category === category)
                      .map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.code} ({m.unit})
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <input
                className={`input input-sm upper color-input ${colorOk ? '' : 'invalid'}`}
                aria-label={materialByCode.get(newMaterial)?.typed ? 'Colour (required)' : 'Colour (optional)'}
                placeholder={materialByCode.get(newMaterial)?.typed ? 'Colour (required)' : 'Colour (optional)'}
                list="color-suggestions"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addColumn();
                  }
                }}
              />
              <datalist id="color-suggestions">
                {colorSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button type="button" className="btn btn-sm" disabled={!canAddColumn} onClick={addColumn}>
                + Add column
              </button>
              {newKey && selected.includes(newKey) && <span className="muted small">{variantLabel(newKey)} is already a column.</span>}
              {colorRequired && (
                <span className="muted small">Enter the colour — the {newMaterial} type (Matt, Glass …) is chosen per order in Production.</span>
              )}
            </div>
          </div>
        )}

        <div className="table-wrap editor-grid">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">Size</th>
                <th className="align-right">Stitch *</th>
                <th className="align-right">Laser</th>
                {columns.map((c) => (
                  <th key={c.key} className="align-right" title={`${variantLabel(c.key)} — ${c.unit} per piece`}>
                    {c.code}
                    <span className="th-unit">{c.color ? `${c.color} · ${c.unit}` : c.unit}</span>
                  </th>
                ))}
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="sticky-col">
                    <input
                      className={`input input-sm upper size-input ${invalid.get(row.key)?.size ? 'invalid' : ''}`}
                      aria-label="Size"
                      value={row.size}
                      onChange={(e) => update(row.key, (r) => ({ ...r, size: e.target.value.toUpperCase() }))}
                    />
                  </td>
                  <td>
                    <NumberInput
                      className={`input-sm ${invalid.get(row.key)?.stitch ? 'invalid' : ''}`}
                      aria-label={`${row.size} stitch`}
                      value={row.stitch}
                      onChange={(v) => update(row.key, (r) => ({ ...r, stitch: v }))}
                    />
                  </td>
                  <td>
                    <NumberInput
                      className="input-sm"
                      aria-label={`${row.size} laser`}
                      value={row.laser}
                      onChange={(v) => update(row.key, (r) => ({ ...r, laser: v }))}
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <NumberInput
                        decimal
                        className="input-sm"
                        aria-label={`${row.size} ${variantLabel(c.key)}`}
                        placeholder="0"
                        value={row.consumption[c.key] ?? ''}
                        onChange={(v) => update(row.key, (r) => ({ ...r, consumption: { ...r.consumption, [c.key]: v } }))}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove size ${row.size}`}
                      onClick={() => {
                        setDirty(true);
                        setRows((rs) => rs.filter((r) => r.key !== row.key));
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="row-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setDirty(true);
              setRows((rs) => [...rs, toRow()]);
            }}
          >
            + Add size
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={addStandardSizes}>
            + Sizes 18–40
          </button>
        </div>

      </div>
    </Modal>
  );
}
