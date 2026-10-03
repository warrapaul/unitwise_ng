import { Pipe, PipeTransform } from '@angular/core';

/** Shorter than this, a lease number is shown whole. */
const KEEP_WHOLE = 18;
/** Characters kept from the start ("L-20260924" — prefix and issue date) and the end. */
const HEAD = 10;
const TAIL = 6;

/**
 * A lease number shortened, not rewritten.
 *
 * The backend issues `L-<yyyyMMddHHmmssSSS>-<random>` — e.g.
 * `L-20260924153536310-F9D80D` — unique but too long to scan. Shown as
 * `L-20260924…F9D80D`: the real start (prefix and issue date) and the real end,
 * so every character on screen is part of the actual number and still matches
 * what someone searches for or reads out. The full number stays in the tooltip,
 * file names and search.
 */
export function leaseRef(leaseNumber: string | null | undefined, fallbackId?: number | null): string {
  if (!leaseNumber) {
    return fallbackId ? `Lease #${fallbackId}` : '-';
  }
  const value = leaseNumber.trim();
  return value.length <= KEEP_WHOLE ? value : `${value.slice(0, HEAD)}…${value.slice(-TAIL)}`;
}

@Pipe({ name: 'leaseRef', standalone: true })
export class LeaseRefPipe implements PipeTransform {
  transform(leaseNumber: string | null | undefined, fallbackId?: number | null): string {
    return leaseRef(leaseNumber, fallbackId);
  }
}
