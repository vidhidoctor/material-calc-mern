import { COLOR_PATTERN, normalizeType, type MaterialCategoryDto } from '@app/shared';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field } from '../../../components/ui';
import type { CategoryBody } from '../materials.api';
import { useSaveCategory } from '../materials.hooks';

interface FieldRow {
  id: number;
  key: string;
  label: string;
  required: boolean;
  missingMessage: string | null;
}

interface StepRow {
  id: number;
  key: string;
  label: string;
  formula: string;
}

const UNITS = ['PCS', 'MTR', 'KG', 'GRAM'];

/** Category editor: name + unit, the fields each material fills in, and the formula steps. */
export function CategoryFormModal({ category, onClose }: { category: MaterialCategoryDto | null; onClose: () => void }) {
  const save = useSaveCategory();
  const nextId = useRef(0);
  const id = () => nextId.current++;

  const [code, setCode] = useState(category?.code ?? '');
  const [name, setName] = useState(category?.name ?? '');
  const [unit, setUnit] = useState(category?.unit ?? 'PCS');
  const [fields, setFields] = useState<FieldRow[]>(() =>
    (category?.fields ?? [{ key: '', label: '', required: true, missingMessage: null }]).map((f) => ({ ...f, id: id() })),
  );
  const [steps, setSteps] = useState<StepRow[]>(() => (category?.steps ?? [{ key: '', label: '', formula: '' }]).map((s) => ({ ...s, id: id() })));
  // The purchase step is a row, not a name: it can be chosen before the step is named, and survives a rename.
  const [purchaseRow, setPurchaseRow] = useState<number | null>(() => steps.find((s) => s.key === category?.purchaseStep)?.id ?? null);
  const purchaseStep = steps.find((s) => s.id === purchaseRow)?.key.trim().toUpperCase() ?? '';
  const [orderStep, setOrderStep] = useState(category?.orderStep ?? '');
  const [wholeUnits, setWholeUnits] = useState(category?.wholeUnits ?? false);
  const [types, setTypes] = useState<string[]>(category?.types ?? []);
  const [newType, setNewType] = useState('');
  const typeName = normalizeType(newType);
  const canAddType = typeName !== null && COLOR_PATTERN.test(typeName) && !types.includes(typeName);
  const addType = () => {
    if (!canAddType) return;
    setTypes((t) => [...t, typeName!]);
    setNewType('');
  };

  const usedFields = fields.filter((f) => f.key.trim() || f.label.trim());
  const usedSteps = steps.filter((s) => s.key.trim() || s.formula.trim());
  /** What still stops the category being saved, shown beside the Save button; null = ready. */
  const missing = !code.trim()
    ? 'Enter the Code.'
    : !name.trim()
      ? 'Enter the Name.'
      : !unit.trim()
        ? 'Enter the Unit.'
        : usedFields.some((f) => !f.key.trim() || !f.label.trim())
          ? 'Each field needs both a name and a label (or clear the row).'
          : usedSteps.length === 0
            ? 'Add a formula step: a step name and a formula.'
            : usedSteps.some((s) => !s.key.trim() || !s.formula.trim())
              ? 'Each formula step needs both a step name and a formula.'
              : !purchaseStep || !usedSteps.some((s) => s.id === purchaseRow)
                ? 'Select the step that is the purchase quantity (Purchase column).'
                : null;
  const incomplete = missing !== null;

  // The error shows at the top of the form, which can be scrolled out of view at the Save button.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (save.error) errorRef.current?.scrollIntoView({ block: 'center' });
  }, [save.error]);

  const updateField = (rowId: number, patch: Partial<FieldRow>) => setFields((rows) => rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  const updateStep = (rowId: number, patch: Partial<StepRow>) => setSteps((rows) => rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const names = ['TOTAL', ...usedFields.map((f) => f.key.trim()), ...usedSteps.map((s) => s.key.trim().toUpperCase())].filter(Boolean);

  const onSubmit = () => {
    if (incomplete) return;
    const body: CategoryBody = {
      name: name.trim(),
      unit: unit.trim().toUpperCase(),
      fields: usedFields.map((f) => ({ key: f.key.trim(), label: f.label.trim(), required: f.required, missingMessage: f.missingMessage })),
      steps: usedSteps.map((s) => ({ key: s.key.trim().toUpperCase(), label: s.label.trim() || s.key.trim().toUpperCase(), formula: s.formula.trim() })),
      purchaseStep: purchaseStep.toUpperCase(),
      // A removed step falls back to the purchase step.
      orderStep: usedSteps.some((s) => s.key.trim().toUpperCase() === orderStep.toUpperCase()) ? orderStep.toUpperCase() : null,
      wholeUnits,
      types,
    };
    save.mutate({ code: code.trim().toUpperCase(), body, isNew: category === null }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      wide
      title={category ? `Edit category — ${category.name}` : 'New category'}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          {missing && <span className="muted small footer-note">{missing}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || incomplete}>
            {save.isPending ? 'Saving…' : 'Save category'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div ref={errorRef}>
          <ErrorAlert error={save.error} />
        </div>

        <div className="category-top">
          <Field label="Code" required hint={category ? 'Cannot change (materials refer to it).' : 'e.g. ZARDOSHI'}>
            <input className="input mono upper" required disabled={!!category} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Name" required>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zardoshi" />
          </Field>
          <Field label="Unit" required hint="Unit of consumption and required quantity.">
            <input className="input upper" required list="unit-options" value={unit} onChange={(e) => setUnit(e.target.value.toUpperCase())} />
            <datalist id="unit-options">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
        </div>

        <section className="editor-section">
          <h3>1. Fields each material fills in</h3>
          <p className="muted small">The name is what you use in formulas (letters, numbers, _), e.g. pcsPerKg.</p>
          <div className="table-wrap bordered">
            <table className="table">
              <thead>
                <tr>
                  <th>Name in formula</th>
                  <th>Label shown</th>
                  <th className="align-center">Required</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <input className="input input-sm mono" placeholder="pcsPerKg" value={f.key} onChange={(e) => updateField(f.id, { key: e.target.value })} />
                    </td>
                    <td>
                      <input className="input input-sm" placeholder="Pieces per KG" value={f.label} onChange={(e) => updateField(f.id, { label: e.target.value })} />
                    </td>
                    <td className="align-center">
                      <input type="checkbox" aria-label="Required" checked={f.required} onChange={(e) => updateField(f.id, { required: e.target.checked })} />
                    </td>
                    <td>
                      <button type="button" className="icon-btn" aria-label="Remove field" onClick={() => setFields((rows) => rows.filter((r) => r.id !== f.id))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setFields((rows) => [...rows, { id: id(), key: '', label: '', required: true, missingMessage: null }])}
          >
            + Add field
          </button>
        </section>

        <section className="editor-section">
          <h3>2. Formula steps</h3>
          <p className="muted small">
            Worked out top to bottom. Use <code>TOTAL</code> (required quantity in {unit || 'the unit'}), field names, earlier steps, numbers and
            + − × ÷ ( ). Tick the step that is the <strong>purchase quantity</strong>.
          </p>
          <div className="table-wrap bordered">
            <table className="table">
              <thead>
                <tr>
                  <th>Step name</th>
                  <th>Label shown</th>
                  <th>Formula</th>
                  <th className="align-center">Purchase</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input className="input input-sm mono upper" placeholder="KG" value={s.key} onChange={(e) => updateStep(s.id, { key: e.target.value.toUpperCase() })} />
                    </td>
                    <td>
                      <input className="input input-sm" placeholder="KG" value={s.label} onChange={(e) => updateStep(s.id, { label: e.target.value })} />
                    </td>
                    <td className="formula-cell">
                      <input
                        className="input input-sm mono"
                        placeholder="TOTAL / pcsPerKg"
                        value={s.formula}
                        onChange={(e) => updateStep(s.id, { formula: e.target.value })}
                      />
                    </td>
                    <td className="align-center">
                      <input
                        type="radio"
                        name="purchase-step"
                        aria-label="Purchase quantity"
                        checked={s.id === purchaseRow}
                        onChange={() => setPurchaseRow(s.id)}
                      />
                    </td>
                    <td>
                      <button type="button" className="icon-btn" aria-label="Remove step" onClick={() => setSteps((rows) => rows.filter((r) => r.id !== s.id))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setSteps((rows) => [...rows, { id: id(), key: '', label: '', formula: '' }])}>
            + Add step
          </button>
          <div className="order-unit-row">
            <Field label="Show on orders in" hint="The unit the order details and purchase summary use, e.g. CD for sequences.">
              <select className="input input-sm" value={orderStep.toUpperCase()} onChange={(e) => setOrderStep(e.target.value)}>
                <option value="">Purchase step{purchaseStep ? ` (${purchaseStep})` : ''}</option>
                {usedSteps
                  .filter((s) => s.key.trim())
                  .map((s) => (
                    <option key={s.id} value={s.key.trim().toUpperCase()}>
                      {s.label.trim() || s.key.trim().toUpperCase()}
                    </option>
                  ))}
              </select>
            </Field>
            <label className="checkbox-label">
              <input type="checkbox" checked={wholeUnits} onChange={(e) => setWholeUnits(e.target.checked)} />
              Buy in whole units (round the order total up, e.g. 51.4 → 52 CD)
            </label>
          </div>
          <div className="formula-list">
            <span className="muted small">Names you can use:</span>
            {names.map((n) => (
              <span key={n} className="formula">
                {n}
              </span>
            ))}
          </div>
        </section>

        <section className="editor-section">
          <h3>3. Types (chosen per order in Production)</h3>
          <p className="muted small">
            Optional, e.g. sequence finish: PURE GLASS, COLOR GLASS, MATT, METAL. When a category has types, Punching must enter a colour for its
            materials and Production picks the type for each colour in every order. Each type gets its own rate in Rates &amp; costs.
          </p>
          <div className="material-picker-row">
            {types.length === 0 && <span className="muted small">No types — this category is priced per material.</span>}
            {types.map((t) => (
              <span key={t} className="tag material-tag">
                {t}
                <button type="button" className="tag-remove" aria-label={`Remove type ${t}`} onClick={() => setTypes((list) => list.filter((x) => x !== t))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="material-picker-row add-column">
            <input
              className={`input input-sm upper ${!typeName || COLOR_PATTERN.test(typeName) ? '' : 'invalid'}`}
              placeholder="New type, e.g. MATT"
              aria-label="New type"
              value={newType}
              onChange={(e) => setNewType(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addType();
                }
              }}
            />
            <button type="button" className="btn btn-sm" disabled={!canAddType} onClick={addType}>
              + Add type
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
