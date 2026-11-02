import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { Field, NumberInput } from '../../../components/ui';

export interface BulkRates {
  /** null = every component. */
  component: string | null;
  stitch: string;
  laser: string;
  stitchHeads: string;
  laserHeads: string;
}

interface Props {
  components: string[];
  onApply: (rates: BulkRates) => void;
  onClose: () => void;
}

/** Fills one rate into many sizes at once; a blank rate leaves the sizes as they are. */
export function BulkRateModal({ components, onApply, onClose }: Props) {
  const [component, setComponent] = useState('');
  const [stitch, setStitch] = useState('');
  const [laser, setLaser] = useState('');
  const [stitchHeads, setStitchHeads] = useState('');
  const [laserHeads, setLaserHeads] = useState('');
  const canApply = stitch !== '' || laser !== '' || stitchHeads !== '' || laserHeads !== '';

  return (
    <Modal
      open
      title="Bulk update"
      onClose={onClose}
      onSubmit={() => {
        if (canApply) onApply({ component: component || null, stitch, laser, stitchHeads, laserHeads });
      }}
      footer={
        <>
          <span className="muted small footer-note">Blank = leave as it is. Every size can still be changed on its own. Nothing is saved until you save.</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canApply}>
            Apply
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Apply to">
          <select className="input" value={component} onChange={(e) => setComponent(e.target.value)}>
            <option value="">All components</option>
            {components.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <div className="order-top">
          <Field label="Stitch rate (₹ / 1000)">
            <NumberInput decimal autoFocus value={stitch} onChange={setStitch} />
          </Field>
          <Field label="Stitch heads">
            <NumberInput decimal value={stitchHeads} onChange={setStitchHeads} />
          </Field>
          <Field label="Laser rate (₹ / 1000)">
            <NumberInput decimal value={laser} onChange={setLaser} />
          </Field>
          <Field label="Laser heads">
            <NumberInput decimal value={laserHeads} onChange={setLaserHeads} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
