/**
 * Numbers written one way on every page. A rate rounded to whole percent on one card and to one
 * decimal on the next reads as two different figures ("17%" beside "16.7%"), so every percentage,
 * amount and month label goes through here.
 */

/** A percentage to one decimal: 16.7%, 100%, 0%. Null or not a number is an em dash. */
export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  const rounded = Math.round(numeric * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** Part of a whole as a percentage number to one decimal; 0 when the whole is 0. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part * 1000) / whole) / 10 : 0;
}

/** Whole shillings with grouping: 14,001. The currency, when given, leads: KES 14,001. */
/**
 * The one money format: whole shillings with separators ("13,400"), and cents only
 * when there are any ("1,234.5"). Every money formatter in the app uses these options,
 * so the same amount never reads "13,400" on one page and "13,400.00" on the next.
 */
export const MONEY_LOCALE: Intl.NumberFormatOptions = { minimumFractionDigits: 0, maximumFractionDigits: 2 };

/** The platform's currency until it is configurable per agency. */
export const CURRENCY = 'KES';

/**
 * Every amount the app shows: "KES 13,400", "KES 1,234.5", or '-' for nothing.
 * The one formatter — pages call this (or the `money` pipe), never their own toLocaleString.
 */
export function formatCurrency(value: number | string | null | undefined, currency: string | null = CURRENCY): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '-';
  }
  const text = numeric.toLocaleString('en-KE', MONEY_LOCALE);
  // A no-break space: "KES" and its figure must never part across two lines.
  return currency ? `${currency}\u00A0${text}` : text;
}

/**
 * The rent for a move-in month: the days from the move-in day to month end, in whole shillings.
 * Null when it is the full rent (moving in on the 1st) or there is nothing to work from. The server
 * uses the same rule; this is for showing the landlord the figure before they commit.
 */
export function proRatedRent(rent: number | string | null | undefined, moveInDate: string | null | undefined): number | null {
  const amount = Number(rent);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(moveInDate ?? '');
  if (!match || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const daysInMonth = new Date(year, month, 0).getDate();
  return day === 1 ? null : Math.round((amount * (daysInMonth - day + 1)) / daysInMonth);
}

/** A price per unit: "KES 200 / m³". */
/** Day-first, with the three-letter month used everywhere else: this locale alone would write "Sept". */
export function shortDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-KE', options).replace('Sept', 'Sep');
}

/** A room as it should read on its own. */
export function roomTitle(room: string | number | null | undefined): string {
  const name = String(room ?? '').trim();
  return !name || /^room\b/i.test(name) ? name : `Room ${name}`;
}

/** A chat with this number: wa.me wants it international, and people type 07XX. */
export function whatsappLink(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = `254${digits.slice(1)}`;
  } else if (digits.length === 9) {
    digits = `254${digits}`;
  }
  return digits ? `https://wa.me/${digits}` : null;
}

/** Metres as they are written: "m3" is stored, m³ is read. */
export function unitLabel(unit: string | null | undefined): string {
  return (unit ?? '').replace(/\bm3\b/i, 'm³').replace(/\bm2\b/i, 'm²');
}

export function formatRate(value: number | string | null | undefined, unit?: string | null): string {
  return unit ? `${formatCurrency(value)} / ${unitLabel(unit)}` : formatCurrency(value);
}

export function formatMoney(value: number | string | null | undefined, currency?: string | null): string {
  const numeric = Number(value ?? 0);
  const text = Number.isFinite(numeric) ? numeric.toLocaleString('en-KE', MONEY_LOCALE) : '—';
  // A no-break space: "KES" and its figure must never part across two lines.
  return currency ? `${currency}\u00A0${text}` : text;
}

/** `YYYY-MM` for a date. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "October 2026" for `2026-10` or `2026-10-01`. */
export function monthLabel(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
}

/** First and last day of a `YYYY-MM` month, as the stats endpoints take them. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(year, mon, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
