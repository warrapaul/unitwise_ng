import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { humanizeLabel } from '../../pipes/human-label.pipe';
import { STATUS_LABELS, StatusTone, statusTone } from '../../constants/status-badges';

export type { StatusTone } from '../../constants/status-badges';
export { statusTone } from '../../constants/status-badges';

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
  template: `
    @if (status()) {
      <span class="status-chip" [class]="'status-chip--' + resolved()">{{ label() }}</span>
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
  readonly resolved = computed<StatusTone>(() => this.tone() ?? statusTone(this.status()));

  /** The shared label when the enum's own words read badly; otherwise the enum, humanised. */
  readonly label = computed(() => STATUS_LABELS[(this.status() ?? '').toUpperCase()] ?? humanizeLabel(this.status()));
}
