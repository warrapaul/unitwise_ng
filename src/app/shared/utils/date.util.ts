/**
 * Today and this month in the user's own time zone.
 *
 * `new Date().toISOString()` is UTC: in Nairobi (UTC+3) it still says
 * yesterday until 3am, so a payment recorded after midnight got the wrong date.
 */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `YYYY-MM`, for `<input type="month">`. */
export function thisMonthIso(): string {
  return todayIso().slice(0, 7);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
