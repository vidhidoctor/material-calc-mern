import type { AuditChangeDto, AuditEntityType, AuditEventDto } from '@app/shared';
import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { Modal } from '../../../components/Modal';
import { QueryState } from '../../../components/ui';
import { formatDateTime, timeAgo } from '../../../lib/format';
import { useEntityHistory } from '../audit.hooks';

const empty = <span className="muted">—</span>;

/** Before → after list of one event. */
export function ChangeList({ changes }: { changes: AuditChangeDto[] }) {
  if (changes.length === 0) return null;
  return (
    <table className="change-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => (
          <tr key={`${c.field}-${i}`}>
            <td className="change-field">{c.field}</td>
            <td className="change-from">{c.from ?? empty}</td>
            <td className="change-to">{c.to ?? empty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryEvent({ event }: { event: AuditEventDto }) {
  return (
    <li className="history-event">
      <div className="history-head">
        <strong>{event.actionLabel}</strong>
        {event.detail && <span className="tag">{event.detail}</span>}
        <span className="muted small history-when" title={formatDateTime(event.at)}>
          {formatDateTime(event.at)} · {timeAgo(event.at)}
        </span>
      </div>
      <div className="muted small">
        by <strong className="history-actor">{event.actor?.name || event.actor?.email || 'System'}</strong>
        {event.actor?.role && ` · ${event.actor.role}`}
      </div>
      <ChangeList changes={event.changes} />
    </li>
  );
}

/** A record's history, newest first: who changed what and when. */
export function HistoryPanel({ type, id }: { type: AuditEntityType; id: string }) {
  const history = useEntityHistory(type, id);
  return (
    <QueryState query={history}>
      {(events) =>
        events.length === 0 ? (
          <p className="muted small">No changes recorded yet. Changes are recorded from the day the audit log was switched on.</p>
        ) : (
          <ol className="history-list">
            {events.map((e) => (
              <HistoryEvent key={e.id} event={e} />
            ))}
          </ol>
        )
      }
    </QueryState>
  );
}

/** "History" button opening the record's history in a popup. */
export function HistoryButton({ type, id, title, small = false }: { type: AuditEntityType; id: string; title: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ${small ? 'btn-sm' : ''}`} onClick={() => setOpen(true)}>
        <Icon name="history" size={small ? 14 : 16} /> History
      </button>
      {open && (
        <Modal open wide title={`History — ${title}`} onClose={() => setOpen(false)}>
          <HistoryPanel type={type} id={id} />
        </Modal>
      )}
    </>
  );
}

/** "Last changed by Simran · 2 hours ago", from the record's history. */
export function LastChanged({ type, id }: { type: AuditEntityType; id: string }) {
  const history = useEntityHistory(type, id);
  const last = history.data?.[0];
  if (!last) return null;
  return (
    <span className="muted small last-changed" title={formatDateTime(last.at)}>
      Last changed by <strong>{last.actor?.name || last.actor?.email || 'System'}</strong> · {timeAgo(last.at)}
    </span>
  );
}
