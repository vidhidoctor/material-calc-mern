import { COMPANY_NAME } from '@app/shared';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';

interface Props {
  /** Shown between two lines under the company name, e.g. PURCHASE ORDER. */
  title: string;
  /** Lines under the title (.po-order-ref). */
  children: ReactNode;
  /** Printed above the date, e.g. the department a copy is for. */
  department?: string;
  date: string;
}

/** The header of every printed sheet: company, title, details, date and who printed it. */
export function PrintHeader({ title, children, department, date }: Props) {
  const { user } = useAuth();
  // The logged-in user's name, as in the app header; their email if the name is blank.
  const printedBy = user?.name.trim() || user?.email || '';
  return (
    <header className="po-slip-head">
      {/* Empty left column keeps the title centred. */}
      <div />
      <div className="po-slip-title">
        <h1 className="po-company">{COMPANY_NAME}</h1>
        <p className="po-doc-title">
          <span>{title}</span>
        </p>
        {children}
      </div>
      <div className="po-head-side">
        {department && <div className="po-department">{department}</div>}
        <div className="po-date">
          DATE : <strong>{formatDate(date)}</strong>
        </div>
        {printedBy && (
          <div className="po-printed-by">
            PRINT BY : <strong>{printedBy}</strong>
          </div>
        )}
      </div>
    </header>
  );
}
