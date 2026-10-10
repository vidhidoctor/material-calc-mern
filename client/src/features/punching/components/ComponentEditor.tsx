import type { DesignDetailDto, DesignSizeDto } from '@app/shared';
import { useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import { usePutComponent } from '../punching.hooks';
import type { SizeRowBody } from '../punching.api';

const SUGGESTED_COMPONENTS = ['FROCK', 'KALI', 'BLOUSE', 'BELT', 'GALISH'];
const OTHER = '__other__';
const STANDARD_SIZES =['18', '20', '22', '24', '26', '28', '30', '32', '34', '36', '38', '40'];

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

/** Grid editor: one row per size with Size, Stitch, Laser and one input per material. Saving replaces the sizes. */
export function ComponentEditor({ design, componentName, onClose }: Props) {
  const save = usePutComponent(design.designNo);
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

  const taken = new Set(design.components.map((c) => c.name));
  const suggestions = SUGGESTED_COMPONENTS.filter((c) => !taken.has(c));

  const problems = useMemo(() => {
    const list: string[] = [];
    const trimmedName = name.trim();
    if (!trimmedName) list.push('Enter a component name.');
    else if (isNew && taken.has(trimmedName)) list.push(`${trimmedName} already exists in this design — use Edit on its card.`);
    if (rows.length === 0) list.push('Add at least one size.');
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const size = row.size.trim();
      if (!size) list.push(`Row ${i + 1}: enter a size.`);
      else if (seen.has(size)) list.push(`Size ${size} is listed twice.`);
      seen.add(size);
      if (row.stitch === '') list.push(`${size || `Row ${i + 1}`}: Stitch is required.`);
    });
    return list;
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
    if (problems.length > 0) return;
    const sizes: SizeRowBody[] = rows.map((row) => ({
      size: row.size.trim(),
      stitch: parseNumberInput(row.stitch) ?? 0,
      laser: parseNumberInput(row.laser),
      consumption: Object.fromEntries(
        Object.entries(row.consumption)
          .map(([code, value]) => [code, parseNumberInput(value) ?? 0] as const)
          .filter(([, qty]) => qty > 0),
      ),
    }));
    save.mutate({ name: name.trim(), sizes }, { onSuccess: onClose });
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
          <button type="submit" className="btn btn-primary" disabled={save.isPending || problems.length > 0}>
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
                    Select a component…
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

        {design.materials.length === 0 && (
          <div className="alert alert-info">No materials yet. Add them in Admin → Material Master to enter consumption.</div>
        )}

        <div className="table-wrap editor-grid">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">Size</th>
                <th className="align-right">Stitch *</th>
                <th className="align-right">Laser</th>
                {design.materials.map((m) => (
                  <th key={m.code} className="align-right" title={`${m.name} — ${m.unit} per piece`}>
                    {m.code}
                    <span className="th-unit">{m.unit}</span>
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
                      className="input input-sm upper size-input"
                      aria-label="Size"
                      value={row.size}
                      onChange={(e) => update(row.key, (r) => ({ ...r, size: e.target.value.toUpperCase() }))}
                    />
                  </td>
                  <td>
                    <NumberInput
                      className="input-sm"
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
                  {design.materials.map((m) => (
                    <td key={m.code}>
                      <NumberInput
                        decimal
                        className="input-sm"
                        aria-label={`${row.size} ${m.code}`}
                        placeholder="0"
                        value={row.consumption[m.code] ?? ''}
                        onChange={(v) => update(row.key, (r) => ({ ...r, consumption: { ...r.consumption, [m.code]: v } }))}
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

        {dirty && problems.length > 0 && (
          <ul className="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
