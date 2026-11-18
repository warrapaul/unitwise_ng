import { DateDisplayDirective } from '../directives/date-display.directive';
/**
 * Today and this month in the user's own time zone.
 *
 * `new Date().toISOString()` is UTC: in Nairobi (UTC+3) it still says
 * yesterday until 3am, so a payment recorded after midnight got the wrong date.
 */
export function todayIso(offsetDays = 0): string {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return isoDate(day);
}

/** `YYYY-MM-DD` of a date as the user's clock reads it (never `toISOString`, which is UTC). */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-01`: the first of the month the date falls in. */
export function firstOfMonthIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
}

/** `YYYY-MM`, for `<input type="month">`. */
export function thisMonthIso(): string {
  return todayIso().slice(0, 7);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
