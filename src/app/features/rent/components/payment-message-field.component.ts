import { formatCurrency } from '../../../shared/utils/format.util';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReadMessageResult } from '../reconciliation.models';
import { ReconciliationService } from '../reconciliation.service';

/**
 * "Paste the confirmation message" for a landlord's payment form. The server reads it (the same
 * parser it uses when the payment is saved) and suggests the tenant from the account number, or
 * the payer's phone; the form takes what it wants from the result. Nothing is saved by reading.
 *
 * M-Pesa messages are read in full. TODOLATER: bank SMS and other wallets (Airtel Money, Equity,
 * KCB, …) need their own patterns on the server; until then they yield what the generic
 * reference and amount patterns catch, and the landlord types the rest.
 */
@Component({
  selector: 'app-payment-message-field',
  standalone: true,
  template: `
    <label class="field">
      <span>Payment message <span class="muted">(optional)</span></span>
      <textarea rows="3" [value]="text()" (input)="onInput($any($event.target).value)"
                placeholder="Paste the M-Pesa confirmation message as you received it — the form fills itself in"></textarea>
      @if (reading()) {
        <small class="hint">Reading the message…</small>
      } @else if (found().length > 0) {
        <!-- Each thing read on its own line, so what filled the form can be checked at a glance. -->
        <div class="read">
          <strong>Read from the message</strong>
          <ul>
            @for (item of found(); track item) { <li><span aria-hidden="true">✓</span> {{ item }}</li> }
          </ul>
          <small class="hint">Check the fields below before saving.</small>
        </div>
      } @else if (text().trim() && attempted()) {
        <small class="hint">Nothing could be read from this message. Fill in the fields below.</small>
      }
    </label>
  `,
  styles: [`
    .read { display: grid; gap: var(--space-1); padding: var(--space-2) var(--space-2-5); border-radius: var(--radius-sm); background: var(--success-tint); }
    .read ul { display: grid; gap: var(--space-0-5); margin: 0; padding: 0; list-style: none; }
    .read li span { color: var(--success); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentMessageFieldComponent {
  readonly agencyId = input.required<number>();
  /** What the message said; the form decides what to fill. */
  readonly read = output<ReadMessageResult>();
  /** The raw text, for forms that keep the message as evidence. */
  readonly textChange = output<string>();

  private readonly reconciliation = inject(ReconciliationService);

  readonly text = signal('');
  readonly reading = signal(false);
  readonly attempted = signal(false);
  private readonly result = signal<ReadMessageResult | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  /** What was read: what the landlord should check before saving. */
  readonly found = computed<string[]>(() => {
    const r = this.result();
    if (!r) {
      return [];
    }
    const parts: string[] = [];
    if (r.reference) { parts.push(`Code ${r.reference}`); }
    if (r.amount) { parts.push(formatCurrency(r.amount)); }
    if (r.paidOn) { parts.push(`Paid ${r.paidOn}`); }
    if (r.tenant) {
      parts.push(`${r.tenant.tenantName} · ${r.tenant.roomName ?? ''}${r.tenant.buildingName ? ', ' + r.tenant.buildingName : ''}`
        + (r.matchedBy === 'ACCOUNT' ? ` (account ${r.accountReference})` : ' (by phone)'));
    } else if (r.accountReference) {
      parts.push(`Account ${r.accountReference}, not one of your rooms`);
    }
    return parts;
  });

  onInput(value: string): void {
    this.text.set(value);
    this.textChange.emit(value);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    // A paste arrives whole; typing settles. Either way, read once the text stops changing.
    this.timer = setTimeout(() => void this.readNow(), 400);
  }

  /** Empties the field, for a form that was reset. */
  clear(): void {
    this.text.set('');
    this.result.set(null);
    this.attempted.set(false);
  }

  private async readNow(): Promise<void> {
    const message = this.text().trim();
    if (message.length < 15) {
      this.result.set(null);
      this.attempted.set(false);
      return;
    }
    const mine = ++this.sequence;
    this.reading.set(true);
    try {
      const result = await firstValueFrom(this.reconciliation.readMessage(this.agencyId(), message));
      if (mine !== this.sequence) {
        return; // a newer read is on its way
      }
      const anything = !!(result.reference || result.amount || result.tenant);
      this.result.set(anything ? result : null);
      this.attempted.set(true);
      if (anything) {
        this.read.emit(result);
      }
    } catch {
      this.result.set(null);
      this.attempted.set(true);
    } finally {
      if (mine === this.sequence) {
        this.reading.set(false);
      }
    }
  }
}
