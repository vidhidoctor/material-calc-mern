import { AUDIT_ACTIONS, AUDIT_MODULES, type AuditEventDto } from '@app/shared';
import { Fragment, useState } from 'react';
import { Icon } from '../../components/Icon';
import { ErrorAlert, PageHeader, QueryState } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { listAuditLog, type AuditFilters } from './audit.api';
import { useAuditLog } from './audit.hooks';
import { ChangeList } from './components/HistoryPanel';

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 5000;

interface Form {
  from: string;
  to: string;
  user: string;
  module: string;
  action: string;
  q: string;
}
const EMPTY: Form = { from: '', to: '', user: '', module: '', action: '', q: '' };

/** Local midnight of a YYYY-MM-DD date as an ISO instant; `nextDay` for an exclusive end. */
function localMidnight(date: string, nextDay = false): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00`);
  if (nextDay) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function toFilters(form: Form, page: number, pageSize = PAGE_SIZE): AuditFilters {
  return {
    from: localMidnight(form.from),
    to: localMidnight(form.to, true),
    user: form.user.trim() || undefined,
    module: form.module || undefined,
    action: form.action || undefined,
    q: form.q.trim() || undefined,
    page,
    pageSize,
  };
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The filtered log (up to 5,000 entries) as CSV for Excel: one line per changed field. */
function downloadCsv(events: AuditEventDto[]) {
  const rows: string[][] = [['When', 'User', 'Email', 'Role', 'Action', 'Module', 'Record', 'Detail', 'Field', 'Before', 'After', 'IP']];
  for (const e of events) {
    const base = [formatDateTime(e.at), e.actor?.name ?? '', e.actor?.email ?? '', e.actor?.role ?? '', e.actionLabel, e.module, e.entity?.label ?? '', e.detail ?? ''];
    if (e.changes.length === 0) rows.push([...base, '', '', '', e.ip ?? '']);
    for (const c of e.changes) rows.push([...base, c.field, c.from ?? '', c.to ?? '', e.ip ?? '']);
  }
  const blob = new Blob(['﻿', rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Audit log ${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Admin → Audit Log: every change made in the app — who, when, what (before → after) — newest first.
 * Entries are recorded by the server and can never be edited or deleted.
 */
export function AuditLogPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [applied, setApplied] = useState<Form>(EMPTY);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const log = useAuditLog(toFilters(applied, page));

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const apply = () => {
    setApplied(form);
    setPage(1);
  };
  const clear = () => {
    setForm(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  };
  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      downloadCsv((await listAuditLog(toFilters(applied, 1, EXPORT_LIMIT))).items);
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every change in the app: who made it, when, and what changed. Entries cannot be edited or deleted."
        actions={
          <button type="button" className="btn" disabled={exporting} onClick={onExport}>
            <Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Export (Excel)'}
          </button>
        }
      />
      <ErrorAlert error={exportError} />

      <form
        className="card audit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label>
          <span className="muted small">From</span>
          <input className="input" type="date" value={form.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label>
          <span className="muted small">To</span>
          <input className="input" type="date" value={form.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label>
          <span className="muted small">User</span>
          <input className="input" placeholder="Name or email" value={form.user} onChange={(e) => set({ user: e.target.value })} />
        </label>
        <label>
          <span className="muted small">Area</span>
          <select className="input" value={form.module} onChange={(e) => set({ module: e.target.value })}>
            <option value="">All</option>
            {AUDIT_MODULES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Action</span>
          <select className="input" value={form.action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">All</option>
            {Object.entries(AUDIT_ACTIONS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="audit-search">
          <span className="muted small">Record</span>
          <input className="input" placeholder="Order, design no., material…" value={form.q} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <div className="audit-filter-actions">
          <button type="submit" className="btn btn-primary">
            Apply
          </button>
          <button type="button" className="btn btn-ghost" onClick={clear}>
            Clear
          </button>
        </div>
      </form>

      <QueryState query={log}>
        {(data) => (
          <section className={`card ${log.isPlaceholderData ? 'is-stale' : ''}`}>
            {data.items.length === 0 ? (
              <p className="muted small section-body">Nothing recorded for these filters.</p>
            ) : (
              <div className="table-wrap">
                <table className="table audit-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Record</th>
                      <th className="align-right">Changes</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e) => (
                      <Fragment key={e.id}>
                        <tr className={`audit-row ${open === e.id ? 'is-open' : ''}`} onClick={() => setOpen(open === e.id ? null : e.id)}>
                          <td className="nowrap">{formatDateTime(e.at)}</td>
                          <td>
                            <strong>{e.actor?.name || e.actor?.email || '—'}</strong>
                            {e.actor && <span className="muted small audit-sub">{[e.actor.email, e.actor.role].filter(Boolean).join(' · ')}</span>}
                          </td>
                          <td>
                            <span className={`badge audit-${e.module === 'Auth' ? 'auth' : 'change'} ${e.action.endsWith('FAILED') || e.action === 'ACCESS_DENIED' ? 'audit-alert' : ''}`}>
                              {e.actionLabel}
                            </span>
                            <span className="muted small audit-sub">{e.module}</span>
                          </td>
                          <td>
                            {e.entity?.label ?? '—'}
                            {e.detail && <span className="muted small audit-sub">{e.detail}</span>}
                          </td>
                          <td className="align-right">{e.changes.length > 0 ? `${e.changes.length} ▾` : '—'}</td>
                          <td className="muted small">{e.ip ?? '—'}</td>
                        </tr>
                        {open === e.id && (
                          <tr className="audit-detail">
                            <td colSpan={6}>{e.changes.length > 0 ? <ChangeList changes={e.changes} /> : <span className="muted small">No field changes.</span>}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="audit-pager">
              <span className="muted small">
                {data.total === 0
                  ? '0 entries'
                  : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString('en-IN')}`}
              </span>
              <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Newer
              </button>
              <button type="button" className="btn btn-sm" disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage((p) => p + 1)}>
                Older →
              </button>
            </div>
          </section>
        )}
      </QueryState>
    </>
  );
}
