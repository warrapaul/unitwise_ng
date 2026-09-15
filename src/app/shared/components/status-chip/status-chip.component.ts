import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HumanLabelPipe } from '../../pipes/human-label.pipe';

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
const TONES: Record<string, StatusTone> = {
  // Settled well
  ACTIVE: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  DELIVERED: 'success',
  OK: 'success',
  OVERPAID: 'success',
  PAID: 'success',
  RESOLVED: 'success',
  UP_TO_DATE: 'success',
  VERIFIED: 'success',

  // Waiting on someone
  AWAITING_TENANT_ACCEPTANCE: 'warning',
  DRAFT: 'warning',
  IN_PROGRESS: 'warning',
  NEEDS_REPAIR: 'warning',
  NEW: 'warning',
  NOTICE_GIVEN: 'warning',
  OUT_FOR_DELIVERY: 'warning',
  PARTIAL: 'warning',
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
 * A status value, humanised and coloured the same way everywhere.
 *
 * Twenty-nine components each carried their own `statusClass()` switch, and
 * they disagreed: `CLOSED` was danger on an agency, neutral in chat and success
 * on a tenant message; `INACTIVE` was warning on an agency and neutral on a
 * voucher. The same word in the same product rendered in three different
 * colours depending on which page you were standing on.
 *
 * `CLOSED` was the sharpest case and is settled in the map rather than per page:
 * "ended" is the meaning an agency, a chat and a message thread all share.
 * `[tone]` exists for a chip whose text is not a status enum at all — a
 * computed "In stock", say — not for overriding one value on one page, which
 * would put the switch statements straight back.
 *
 * Colour is never the only channel — the word itself is always in the chip, so
 * WCAG 1.4.1 is satisfied by the label rather than by decoration. The glyphs the
 * chips used to prepend (✓ ● ✕ –) said nothing the word did not, and four of
 * them down a status column read as bullet points on the data.
 */
@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [HumanLabelPipe],
  template: `
    @if (status()) {
      <span class="status-chip" [class]="'status-chip--' + resolved()">{{ status() | humanLabel }}</span>
    } @else {
      <span class="muted">{{ empty() }}</span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusChipComponent {
  readonly status = input<string | null | undefined>(null);
  /** Set only where the value's meaning depends on the record it is on. */
  readonly tone = input<StatusTone | null>(null);
  readonly empty = input('-');

  /** An explicit tone wins; otherwise the shared map; otherwise `unknown`. */
  readonly resolved = computed<StatusTone>(() =>
    this.tone() ?? TONES[(this.status() ?? '').toUpperCase()] ?? 'unknown');
}

/** For the few places that still need the class rather than the component. */
export function statusTone(status: string | null | undefined): StatusTone {
  return TONES[(status ?? '').toUpperCase()] ?? 'unknown';
}
