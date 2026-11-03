import type { PrintConfigDto, PrintSheet } from '@app/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { usePrintConfig, useSavePrintConfig } from '../features/design-costing/print-config.hooks';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { PrintHeader } from './PrintHeader';
import { ErrorAlert, QueryState } from './ui';

export interface SheetColumn<Row, Total> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Left out for columns that do not add up (quantities, rates). */
  total?: (total: Total) => ReactNode;
  strong?: boolean;
}

interface Selection {
  columns: string[];
  totals: boolean;
}

interface Props<Row, Total> {
  /** Which saved print configuration this sheet uses. */
  sheet: PrintSheet;
  /** Sheet heading, e.g. RATE & COSTING. */
  title: string;
  /** Lines under the heading (.po-order-ref). */
  children: ReactNode;
  backTo: string;
  backLabel: string;
  /** In the order of the table on screen; the sheet keeps that order. */
  columns: readonly SheetColumn<Row, Total>[];
  components: { name: string; rows: (Row & { size: string })[]; total: Total }[];
}

/** More columns than this do not fit A4 portrait at a readable size. */
const PORTRAIT_MAX_COLUMNS = 7;

function Sheet<Row, Total>({ config, sheet, title, children, backTo, backLabel, columns, components }: Props<Row, Total> & { config: PrintConfigDto }) {
  const auth = useAuth();
  const canEdit = auth.can('DESIGN_COSTING_MANAGE');
  const save = useSavePrintConfig(sheet);
  /** The panel's unsaved choice; null = not editing, the sheet shows the saved configuration. */
  const [draft, setDraft] = useState<Selection | null>(null);
  const selection = draft ?? config;

  const allIds = columns.map((c) => c.id);
  const shown = columns.filter((c) => selection.columns.includes(c.id));
  const showTotals = selection.totals && shown.some((c) => c.total);
  const landscape = shown.length > PORTRAIT_MAX_COLUMNS;

  const change = (update: (current: Selection) => Selection) => setDraft((d) => (d ? update(d) : d));
  const toggle = (id: string, on: boolean) => change((d) => ({ ...d, columns: on ? [...d.columns, id] : d.columns.filter((c) => c !== id) }));

  return (
    <>
      {landscape && <style>{'@page { size: A4 landscape; margin: 8mm; }'}</style>}
      <div className="po-toolbar no-print">
        <Link to={backTo} className="btn btn-ghost">
          ← {backLabel}
        </Link>
        <span className="muted small po-toolbar-note">
          {draft
            ? 'Save the print configuration to use it for every print.'
            : config.savedAt
              ? `Print settings saved ${formatDateTime(config.savedAt)} by ${config.savedBy}.`
              : 'Using the standard print settings.'}
        </span>
        {canEdit && !draft && (
          <button type="button" className="btn" onClick={() => setDraft({ columns: config.columns, totals: config.totals })}>
            Edit print settings
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={draft !== null} title={draft ? 'Save or cancel the print settings first.' : undefined} onClick={() => window.print()}>
          Print
        </button>
      </div>

      {draft && (
        <fieldset className="po-columns no-print">
          <legend>Columns to print</legend>
          <ErrorAlert error={save.error} />
          <div className="row-actions po-columns-actions">
            <button type="button" className="btn btn-sm" disabled={shown.length === columns.length} onClick={() => change((d) => ({ ...d, columns: allIds }))}>
              Select all
            </button>
            <button type="button" className="btn btn-sm" disabled={shown.length === 0} onClick={() => change((d) => ({ ...d, columns: [] }))}>
              Deselect all
            </button>
          </div>
          <div className="po-columns-list">
            {columns.map((c) => (
              <label key={c.id} className="checkbox-label">
                <input type="checkbox" checked={draft.columns.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
                {c.header}
              </label>
            ))}
            <label className="checkbox-label po-columns-totals">
              <input type="checkbox" checked={draft.totals} onChange={(e) => change((d) => ({ ...d, totals: e.target.checked }))} />
              Component totals
            </label>
          </div>
          <div className="row-actions po-columns-save">
            <button type="button" className="btn btn-ghost" disabled={save.isPending} onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={shown.length === 0 || save.isPending} onClick={() => save.mutate(draft, { onSuccess: () => setDraft(null) })}>
              {save.isPending ? 'Saving…' : 'Save print configuration'}
            </button>
          </div>
        </fieldset>
      )}

      {shown.length === 0 ? (
        <p className="no-print muted po-columns-empty">Tick at least one column to print.</p>
      ) : (
        <div className={`po-page ${landscape ? 'po-landscape' : ''}`}>
          <article className="po-slip">
            <PrintHeader title={title} date={new Date().toISOString()}>
              {children}
            </PrintHeader>
            {components.map((component, index) => (
              <section key={component.name} className="po-section">
                <h3 className="po-section-tab">
                  {index + 1}. {component.name}
                </h3>
                <table className="po-slip-table">
                  <thead>
                    <tr>
                      {shown.map((c) => (
                        <th key={c.id}>{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {component.rows.map((row) => (
                      <tr key={row.size}>
                        {shown.map((c) => (
                          <td key={c.id} className={c.strong ? 'po-qty' : undefined}>
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {showTotals && (
                      <tr className="po-total-row">
                        {shown.map((c, i) => (
                          <td key={c.id}>{c.total ? c.total(component.total) : i === 0 ? 'Total' : ''}</td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            ))}
            {components.length === 0 && <p className="po-empty">No components in this design yet.</p>}
          </article>
        </div>
      )}
    </>
  );
}

/**
 * Printable costing in the purchase order template, with the columns saved for this sheet. Whoever may
 * edit them can reopen a panel (never printed) to change and save them for everyone. The panel only
 * changes what is shown: the figures come from the saved costing.
 */
export function ColumnPrintSheet<Row, Total>(props: Props<Row, Total>) {
  const config = usePrintConfig(props.sheet);
  return <QueryState query={config}>{(data) => <Sheet {...props} config={data} />}</QueryState>;
}
