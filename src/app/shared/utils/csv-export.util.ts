import { todayIso } from './date.util';
/**
 * CSV downloads: the format every spreadsheet opens — Excel, Google Sheets, Numbers, a phone.
 *
 * Starts with a UTF-8 byte-order mark so Excel reads names and symbols correctly, and neutralises
 * a cell that begins with = + - @ so opening the file can never run a formula someone typed into
 * a tenant's name.
 */

/** A value a spreadsheet must not reinterpret: a phone number (keeps its leading 0), a room "1-2" (not a date), a reference. */
export interface CsvText { text: string | number | null | undefined; }

export type CsvValue = string | number | boolean | null | undefined | CsvText;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

/** Most rows one export will gather, so a huge account cannot freeze the browser. */
export const CSV_MAX_ROWS = 10_000;

/** Marks a cell as text, so a spreadsheet shows it exactly as written. */
export function asText(text: string | number | null | undefined): CsvText {
  return { text };
}

const LOOKS_NUMERIC = /^[0-9+\-/ .:]+$/;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const text = value.text == null ? '' : String(value.text);
    // Only what a spreadsheet would turn into a number or a date needs the ="..." form. It is
    // built here from digits and separators only, never from free text, so it carries no formula.
    return text !== '' && LOOKS_NUMERIC.test(text) ? `"=""${text}"""` : cell(text);
  }
  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) || safe !== text ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => cell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(column.value(row))).join(','));
  }
  return lines.join('\r\n');
}

/** Saves the rows as `<name>-<yyyy-mm-dd>.csv`; a name that already ends in a date keeps just that one. */
export function downloadCsv<T>(name: string, rows: readonly T[], columns: readonly CsvColumn<T>[]): void {
  const dated = /\d{4}-\d{2}(-\d{2})?$/.test(name);
  const stamp = dated ? '' : `-${todayIso()}`;
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()}${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Every page of a paginated list, for an export of the whole filtered list rather than the page on
 * screen. Stops at the last page or at CSV_MAX_ROWS; `truncated` says which.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, size: number) => Promise<{ items: T[]; pagination?: { isLast?: boolean; totalPages?: number } | null }>,
  pageSize = 200
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const result = await fetchPage(page, pageSize);
    rows.push(...result.items);
    const last = result.pagination?.isLast
      ?? (result.pagination?.totalPages != null ? page + 1 >= result.pagination.totalPages : result.items.length < pageSize);
    if (last || result.items.length === 0) return { rows, truncated: false };
    if (rows.length >= CSV_MAX_ROWS) return { rows: rows.slice(0, CSV_MAX_ROWS), truncated: true };
  }
}

/**
 * The whole filtered list as a spreadsheet, with the toast saying how many rows went out — or that
 * the list was cut at CSV_MAX_ROWS. `fetchPage` is the page's own fetch with its current filters.
 */
export async function exportAllPages<T>(options: {
  file: string;
  /** Singular and plural: ['building', 'buildings']. */
  noun: readonly [string, string];
  fetchPage: (page: number, size: number) => Promise<{ items: T[]; pagination?: { isLast?: boolean; totalPages?: number } | null }>;
  columns: readonly CsvColumn<T>[];
  notify: (tone: 'success' | 'warning' | 'error', text: string) => void;
}): Promise<void> {
  const { rows, truncated } = await fetchAllPages(options.fetchPage);
  if (rows.length === 0) {
    options.notify('warning', `No ${options.noun[1]} to export.`);
    return;
  }
  downloadCsv(options.file, rows, options.columns);
  const count = rows.length.toLocaleString('en-KE');
  options.notify(truncated ? 'warning' : 'success', truncated
    ? `Exported the first ${count} ${options.noun[1]}. Narrow the filters to export the rest.`
    : `Exported ${count} ${rows.length === 1 ? options.noun[0] : options.noun[1]}.`);
}
