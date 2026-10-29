/**
 * Every status the app shows, with one tone and, where the enum's own words read badly, one
 * label. A status reads and looks the same on every page because both come from here, never from
 * a page's own switch statement.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'unknown';

/**
 * The shared meaning of a status value.
 *
 * Four tones, and which one a value gets is decided by what the operator has to
 * do about it, not by whether the word sounds positive:
 *
 * - `success` — settled, and settled well. Nothing to do.
 * - `warning` — in flight, or waiting on somebody. Something to do.
 * - `danger`  — failed, refused or ended badly. Something went wrong.
 * - `neutral` — inert. Switched off, filed away, not applicable.
 * - `unknown` — the map has never seen this value. Not a state of the record,
 *   a state of this table: a new backend enum arrived without a tone.
 */
export const STATUS_TONES: Record<string, StatusTone> = {
  // Settled well
  ACTIVE: 'success',
  BILLED: 'success',
  CONFIRMED: 'success',
  MATCHED: 'success',
  CONNECTED: 'success',
  APPROVED: 'success',
  COLLECTED: 'success',
  COMPLETED: 'success',
  DELIVERED: 'success',
  OK: 'success',
  OVERPAID: 'success',
  PAID: 'success',
  RESOLVED: 'success',
  UP_TO_DATE: 'success',
  VERIFIED: 'success',

  // Waiting on someone
  ACKNOWLEDGED: 'warning',
  NOT_CONNECTED: 'warning',
  AWAITING_TENANT_ACCEPTANCE: 'warning',
  DRAFT: 'warning',
  IN_PROGRESS: 'warning',
  NEEDS_REPAIR: 'warning',
  NEW: 'warning',
  NOTICE_GIVEN: 'warning',
  ON_HOLD: 'warning',
  OUT_FOR_DELIVERY: 'warning',
  PARTIAL: 'warning',
  PARTIALLY_PAID: 'warning',
  PENDING_INPUT: 'warning',
  AWAITING_INPUT: 'warning',
  PROVISIONAL: 'warning',
  NOT_BILLED: 'neutral',
  UNMATCHED: 'warning',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  PENDING_CLAIM: 'warning',
  PENDING_SIGNATURE: 'warning',
  PENDING_USER: 'warning',
  PROCESSING: 'warning',
  READY_FOR_PICKUP: 'warning',
  RESERVED: 'warning',
  SUBMITTED: 'warning',
  UNDER_MAINTENANCE: 'warning',
  UPDATE_AVAILABLE: 'warning',
  WAITING_PAYMENT_CONFIRMATION: 'warning',
  WAITING_PAYMENT_COMPLETION: 'warning',
  PENDING_PARTIAL_PAYMENT: 'warning',

  // Went wrong
  CANCELLED: 'danger',
  DISABLED: 'danger',
  EVICTED: 'danger',
  EXHAUSTED: 'danger',
  EXPIRED: 'danger',
  FAILED: 'danger',
  FORCE_UPDATE: 'danger',
  LOCKED: 'danger',
  OUT_OF_STOCK: 'danger',
  OVERDUE: 'danger',
  PAYMENT_FAILED: 'danger',
  PAYMENT_TIMEOUT: 'danger',
  TIMEOUT: 'danger',
  REJECTED: 'danger',
  DECLINED: 'danger',
  TERMINATED: 'danger',
  UNPAID: 'danger',

  // Inert
  ARCHIVED: 'neutral',
  /*
   * A withdrawn consent and a sealed snapshot are both working as intended:
   * the tenant stopped sharing, the tenancy ended and the files closed. Neither
   * is a failure, so neither gets danger.
   */
  REVOKED: 'neutral',
  SEALED: 'neutral',
  /*
   * Listed rather than left to the fallback, because it was the conflict: an
   * agency painted it danger, chat neutral, a tenant message success. "Ended"
   * is the one meaning all three share — a closed agency is not an error and a
   * closed thread is not an achievement — so neutral, everywhere.
   */
  CLOSED: 'neutral',
  INACTIVE: 'neutral',
  REFUNDED: 'neutral',
  WITHDRAWN: 'neutral'
};

/**
 * Labels for the values whose humanised enum would be wrong or vague. Everything else reads as
 * its enum, sentence-cased ("PENDING_SIGNATURE" → "Pending signature").
 */
export const STATUS_LABELS: Record<string, string> = {
  PARTIAL: 'Partially paid',
  PARTIALLY_PAID: 'Partially paid',
  PENDING_INPUT: 'Reading needed',
  AWAITING_INPUT: 'Readings needed',
  NOT_BILLED: 'Not billed',
  PROVISIONAL: 'Ready to confirm',
  OVERPAID: 'In credit',
  AWAITING_TENANT_ACCEPTANCE: 'Awaiting tenant',
  NOTICE_GIVEN: 'On notice'
};

/** The tone a status is shown in: the shared map, else `unknown`. */
export function statusTone(status: string | null | undefined): StatusTone {
  return STATUS_TONES[(status ?? '').toUpperCase()] ?? 'unknown';
}
