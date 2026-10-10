import type { UseQueryResult } from '@tanstack/react-query';
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { ApiError } from '../api/client';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function detailMessages(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((d) => (typeof d === 'object' && d !== null && 'message' in d ? String((d as { message: unknown }).message) : null))
    .filter((m): m is string => m !== null);
}

/** Shows an API error message and, when there are several, the list of details. */
export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const details = error instanceof ApiError ? detailMessages(error.details) : [];
  return (
    <div className="alert alert-error" role="alert">
      {title && <strong>{title}</strong>}
      <p>{message}</p>
      {details.length > 1 && (
        <ul>
          {details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading({ fullPage, label = 'Loading…' }: { fullPage?: boolean; label?: string }) {
  return (
    <div className={fullPage ? 'center-page' : 'loading'} role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Forbidden() {
  return (
    <div className="card">
      <EmptyState title="You don't have access to this page.">Ask an Admin if you need it.</EmptyState>
    </div>
  );
}

/** Loading / error wrapper for a query; renders children with the data once it is there. */
export function QueryState<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorAlert error={query.error} />;
  return <>{children(query.data)}</>;
}

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
  /** Allow a decimal point (default: whole numbers only). */
  decimal?: boolean;
};

const BLOCKED_KEYS = new Set(['-', '+', 'e', 'E']);

/** Non-negative number as text: "-" and "e" are blocked, anything else non-numeric is ignored. */
export function NumberInput({ value, onChange, decimal, className, ...rest }: NumberInputProps) {
  const pattern = decimal ? /^\d*\.?\d*$/ : /^\d*$/;
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={`input num ${className ?? ''}`}
      value={value}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (BLOCKED_KEYS.has(event.key)) event.preventDefault();
        rest.onKeyDown?.(event);
      }}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value.trim();
        if (pattern.test(next)) onChange(next);
      }}
    />
  );
}

/** "12.5" → 12.5, "" → null. */
export function parseNumberInput(value: string): number | null {
  if (value === '' || value === '.') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function StatusBadge({ tone, children }: { tone: 'green' | 'amber' | 'grey' | 'red' | 'blue'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
