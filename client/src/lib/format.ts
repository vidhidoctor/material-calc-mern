const numberFormats = new Map<number, Intl.NumberFormat>();

function numberFormat(maxDecimals: number): Intl.NumberFormat {
  let format = numberFormats.get(maxDecimals);
  if (!format) {
    format = new Intl.NumberFormat('en-IN', { maximumFractionDigits: maxDecimals, roundingMode: 'halfExpand' } as Intl.NumberFormatOptions);
    numberFormats.set(maxDecimals, format);
  }
  return format;
}

/**
 * Indian grouping (1,00,000), rounded half-up. Decimal strings from the API are formatted
 * exactly (Intl accepts numeric strings), so "0.575" shows as 0.58.
 */
export function formatNumber(value: number | string | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  return numberFormat(maxDecimals).format(value as Intl.StringNumericLiteral);
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Dates are shown in UTC ("YYYY-MM-DD" order dates are UTC midnight). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

/** ₹ amount, Indian grouping; small unit costs keep more decimals (₹0.0126). */
export function formatMoney(value: number | string | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  return `₹${formatNumber(value, maxDecimals)}`;
}

const rupeesFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹ amount with exactly 2 decimals, for columns of prices (₹59.90, not ₹59.9). */
export function formatRupees(value: string): string {
  return `₹${rupeesFormat.format(value as Intl.StringNumericLiteral)}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Date and time in the viewer's time zone, e.g. "23 Oct 2026, 02:32 pm". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date);
}

/** "just now", "5 min ago", "2 hours ago", "3 days ago", else the date. */
export function timeAgo(value: string): string {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}
