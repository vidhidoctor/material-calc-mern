import type { MaterialCategoryDto } from '@app/shared';
import { useRef, useState } from 'react';
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
  const [purchaseStep, setPurchaseStep] = useState(category?.purchaseStep ?? '');

  const usedFields = fields.filter((f) => f.key.trim() || f.label.trim());
  const usedSteps = steps.filter((s) => s.key.trim() || s.formula.trim());
  const incomplete =
    !code.trim() ||
    !name.trim() ||
    !unit.trim() ||
    usedSteps.length === 0 ||
    usedFields.some((f) => !f.key.trim() || !f.label.trim()) ||
    usedSteps.some((s) => !s.key.trim() || !s.formula.trim()) ||
    !usedSteps.some((s) => s.key.trim().toUpperCase() === purchaseStep.toUpperCase());

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
        <ErrorAlert error={save.error} />

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
                        checked={!!s.key && s.key.toUpperCase() === purchaseStep.toUpperCase()}
                        onChange={() => setPurchaseStep(s.key.toUpperCase())}
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
          <div className="formula-list">
            <span className="muted small">Names you can use:</span>
            {names.map((n) => (
              <span key={n} className="formula">
                {n}
              </span>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
