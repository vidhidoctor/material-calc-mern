import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field } from '../../../components/ui';
import { useUpdateDesign } from '../punching.hooks';

/** Edit the Design Number and Product Name. The number cannot change once orders use the design. */
export function EditDesignModal({ designNo, productName, onClose }: { designNo: string; productName: string; onClose: () => void }) {
  const navigate = useNavigate();
  const update = useUpdateDesign(designNo);
  const [number, setNumber] = useState(designNo);
  const [product, setProduct] = useState(productName);
  const unchanged = number.trim() === designNo && product.trim() === productName;

  const onSubmit = () =>
    update.mutate(
      { designNo: number.trim(), productName: product.trim() },
      {
        onSuccess: (design) => {
          onClose();
          if (design.designNo !== designNo) navigate(`/punching/${encodeURIComponent(design.designNo)}`, { replace: true });
        },
      },
    );

  return (
    <Modal
      open
      title={`Edit design ${designNo}`}
      onClose={onClose}
      onSubmit={onSubmit}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={update.isPending || unchanged}>
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={update.error} />
        <Field label="Design Number" required hint="Can only be changed while no order uses this design.">
          <input className="input upper" required autoFocus value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Product Name" required hint="New orders use the new name; existing orders keep theirs.">
          <input className="input upper" required value={product} onChange={(e) => setProduct(e.target.value.toUpperCase())} />
        </Field>
      </div>
    </Modal>
  );
}
