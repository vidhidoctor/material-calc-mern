import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_UNITS,
  RULE_FIELD_LABELS,
  RULE_FIELDS,
  type MaterialCategory,
  type MaterialDto,
  type MaterialRuleField,
} from '@app/shared';
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field, NumberInput, parseNumberInput } from '../../../components/ui';
import type { MaterialBody } from '../materials.api';
import { useSaveMaterial } from '../materials.hooks';

const RULE_HINTS: Record<MaterialRuleField, string> = {
  seqPerCd: 'CD = Required PCS ÷ Sequence per CD',
  cdPerRoll: 'Rolls = CD ÷ CD per roll',
  cdPerRound: 'Optional, for reference',
  pcsPerKg: 'KG = Required PCS ÷ Pieces per KG',
  denier: 'grams = MTR × Denier ÷ 9000',
};

export function MaterialFormModal({ material, onClose }: { material: MaterialDto | null; onClose: () => void }) {
  const save = useSaveMaterial();
  const [code, setCode] = useState(material?.code ?? '');
  const [category, setCategory] = useState<MaterialCategory>(material?.category ?? 'SEQUENCE');
  const [rules, setRules] = useState<Record<MaterialRuleField, string>>({
    seqPerCd: material?.seqPerCd?.toString() ?? '',
    cdPerRoll: material?.cdPerRoll?.toString() ?? '',
    cdPerRound: material?.cdPerRound?.toString() ?? '',
    pcsPerKg: material?.pcsPerKg?.toString() ?? '',
    denier: material?.denier?.toString() ?? '',
  });

  const { required, optional } = RULE_FIELDS[category];
  const fields = [...required, ...optional];
  const missing = required.some((f) => !(parseNumberInput(rules[f]) ?? 0));

  const onSubmit = () => {
    const body: MaterialBody = { category };
    for (const field of fields) body[field] = parseNumberInput(rules[field]);
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
        <Field label="Category" required hint={`Unit: ${MATERIAL_UNITS[category]}`}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)}>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MATERIAL_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="fieldset">
          <legend>Conversion rule</legend>
          <div className="grid-2">
            {fields.map((field) => (
              <Field key={field} label={RULE_FIELD_LABELS[field]} required={required.includes(field)} hint={RULE_HINTS[field]}>
                <NumberInput decimal value={rules[field]} onChange={(value) => setRules((r) => ({ ...r, [field]: value }))} />
              </Field>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
