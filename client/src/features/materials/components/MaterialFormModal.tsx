import type { MaterialCategoryDto, MaterialDto } from '@app/shared';
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { DenierCalculator } from '../../../components/DenierCalculator';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import type { MaterialBody } from '../materials.api';
import { useSaveMaterial } from '../materials.hooks';

interface Props {
  material: MaterialDto | null;
  categories: MaterialCategoryDto[];
  onClose: () => void;
}

/** Code + category; the rule fields come from the chosen category. */
export function MaterialFormModal({ material, categories, onClose }: Props) {
  const save = useSaveMaterial();
  const [code, setCode] = useState(material?.code ?? '');
  const [categoryCode, setCategoryCode] = useState(material?.category ?? categories[0]?.code ?? '');
  const [rules, setRules] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(material?.rules ?? {}).map(([k, v]) => [k, String(v)])),
  );

  const category = categories.find((c) => c.code === categoryCode);
  const missing = !category || category.fields.some((f) => f.required && !(parseNumberInput(rules[f.key] ?? '') ?? 0));

  const onSubmit = () => {
    if (!category) return;
    const body: MaterialBody = {
      category: category.code,
      rules: Object.fromEntries(category.fields.map((f) => [f.key, parseNumberInput(rules[f.key] ?? '')])),
    };
    save.mutate({ code: code.trim().toUpperCase(), body, isNew: material === null }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      title={material ? `Edit ${material.code}` : 'New material'}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || missing}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={save.error} />
        <Field label="Code" required hint={material ? 'The code cannot change after it is created.' : 'e.g. SEQ-3MM. Stored in capitals.'}>
          <input
            className="input mono upper"
            required
            autoFocus={!material}
            disabled={!!material}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Category" required hint={category ? `Unit: ${category.unit}` : 'Add a category in the Categories tab first.'}>
          <select className="input" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {category && (
          <fieldset className="fieldset">
            <legend>Conversion rule</legend>
            {category.fields.length === 0 ? (
              <p className="muted small">This category has no fields to fill in.</p>
            ) : (
              <div className="grid-2">
                {category.fields.map((field) => (
                  <Field key={field.key} label={field.label} required={field.required} hint={field.required ? undefined : 'Optional'}>
                    <NumberInput decimal value={rules[field.key] ?? ''} onChange={(value) => setRules((r) => ({ ...r, [field.key]: value }))} />
                  </Field>
                ))}
              </div>
            )}
            {category.fields.some((f) => f.key === 'denier') && (
              <DenierCalculator onUse={(denier) => setRules((r) => ({ ...r, denier: String(denier) }))} />
            )}
            <div className="formula-list">
              {category.steps.map((s) => (
                <span key={s.key} className={`formula ${s.key === category.purchaseStep ? 'formula-purchase' : ''}`}>
                  {s.key} = {s.formula}
                </span>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
