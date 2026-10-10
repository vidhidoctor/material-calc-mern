import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field } from '../../../components/ui';
import { useCreateDesign } from '../punching.hooks';

/** Design Number + Product Name → opens the new design with the component editor. */
export function NewDesignModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateDesign();
  const [designNo, setDesignNo] = useState('');
  const [productName, setProductName] = useState('');

  const onSubmit = () =>
    create.mutate(
      { designNo, productName },
      { onSuccess: (design) => navigate(`/punching/${encodeURIComponent(design.designNo)}?component=new`) },
    );

  return (
    <Modal
      open
      title="New design"
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create & add components'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={create.error} />
        <Field label="Design Number" required hint="e.g. 26-49. Stored in capitals.">
          <input className="input upper" required autoFocus value={designNo} onChange={(e) => setDesignNo(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Product Name" required hint="e.g. Lehenga Choli.">
          <input className="input upper" required value={productName} onChange={(e) => setProductName(e.target.value.toUpperCase())} />
        </Field>
      </div>
    </Modal>
  );
}
