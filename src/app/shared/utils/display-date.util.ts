/**
 * One way to write a date across the app: "24 Sep 2026".
 *
 * `toLocaleDateString()` with no arguments follows the browser, which gave
 * "9/24/2026" on one machine and "24/09/2026" on the next — and a reader cannot
 * tell 3/4 from 4/3. A day, a short month name and a four-digit year can only be
 * read one way. Fixed to en-GB so the day comes first everywhere.
 */
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
});

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "24 Sep 2026", or '-' for nothing. */
export function displayDate(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? DATE.format(date) : '-';
}

/** "24 Sep 2026, 15:35", or '-' for nothing. */
export function displayDateTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : '-';
}

/**
 * A span of time: "24 Sep 2026 – 23 Sep 2027", and "24 Sep 2026 – Ongoing" when
 * it has no end. A trailing dash for "no end date" reads as missing data.
 */
export function displayRange(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
  return `${displayDate(start)} – ${toDate(end) ? displayDate(end) : 'Ongoing'}`;
}
