import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { ErrorAlert, Field } from '../../../components/ui';
import { useUpdateProductName } from '../punching.hooks';

export function EditProductNameModal({ designNo, productName, onClose }: { designNo: string; productName: string; onClose: () => void }) {
  const update = useUpdateProductName(designNo);
  const [value, setValue] = useState(productName);

  return (
    <Modal
      open
      title={`Product name — ${designNo}`}
      onClose={onClose}
      onSubmit={() => update.mutate(value, { onSuccess: onClose })}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={update.isPending || value.trim() === productName}>
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <ErrorAlert error={update.error} />
        <Field label="Product Name" required hint="New orders use the new name; existing orders keep the name they were created with.">
          <input className="input upper" required autoFocus value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} />
        </Field>
      </div>
    </Modal>
  );
}
