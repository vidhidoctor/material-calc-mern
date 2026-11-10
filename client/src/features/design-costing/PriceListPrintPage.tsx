import { APP_NAME } from '@app/shared';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { PrintHeader } from '../../components/PrintHeader';
import { QueryState } from '../../components/ui';
import { formatRupees } from '../../lib/format';
import { rowKey } from './costing-draft';
import { useDesignCosting } from './design-costing.hooks';

/** Printable price list, in the purchase order template: the saved final prices, with the Remarks typed by the owner. */
export function PriceListPrintPage() {
  const designNo = useParams().designNo ?? '';
  const query = useDesignCosting(designNo);

  useEffect(() => {
    document.title = `Price list ${designNo}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [designNo]);

  return (
    <div className="po-print">
      <div className="po-toolbar no-print">
        <Link to={`/design-costing/${encodeURIComponent(designNo)}`} className="btn btn-ghost">
          ← Design Costing
        </Link>
        <span className="muted small po-toolbar-note">Prints the saved costing. Type the Remarks in Rate & Pricing.</span>
        <button type="button" className="btn btn-primary" disabled={!query.data} onClick={() => window.print()}>
          Print
        </button>
      </div>

      <QueryState query={query}>
        {(data) => {
          const notes = new Map(data.saved.rows.map((r) => [rowKey(r.component, r.size), r.note]));
          return (
            <div className="po-page">
              <article className="po-slip">
                <PrintHeader title="PRICE LIST" date={new Date().toISOString()}>
                  <p className="po-order-ref">
                    D.N. <strong>{data.design.designNo}</strong> · {data.design.productName}
                  </p>
                </PrintHeader>
                {data.calculation.components.map((component, index) => (
                  <section key={component.name} className="po-section">
                    <h3 className="po-section-tab">
                      {index + 1}. {component.name}
                    </h3>
                    <table className="po-slip-table po-price-table">
                      <colgroup>
                        <col className="po-col-size" />
                        <col className="po-col-price" />
                        <col className="po-col-remarks" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Size</th>
                          <th>Final Price</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {component.sizes.map((s) => (
                          <tr key={s.size}>
                            <td>{s.size}</td>
                            <td className="po-qty">{formatRupees(s.finalPrice)}</td>
                            <td className="po-remarks">{notes.get(rowKey(component.name, s.size)) ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
                {data.calculation.components.length === 0 && <p className="po-empty">No components in this design yet.</p>}
              </article>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
