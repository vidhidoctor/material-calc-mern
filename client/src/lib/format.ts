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
