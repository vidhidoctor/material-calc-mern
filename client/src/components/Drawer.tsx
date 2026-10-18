import { useEffect, useRef, type ReactNode } from 'react';

interface DrawerProps {
  title: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider panel for tables with many columns. */
  wide?: boolean;
}

/** Right-side panel on a native <dialog> (Esc closes, focus is trapped, clicking the backdrop closes). */
export function Drawer({ title, open, onClose, children, footer, wide = false }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? 'drawer drawer-wide' : 'drawer'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the <dialog> itself (not its content) is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="drawer-inner">
          <header className="modal-header">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </header>
          <div className="drawer-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
