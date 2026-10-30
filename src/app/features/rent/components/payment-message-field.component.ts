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
      } @else if (summary(); as line) {
        <small class="hint read">{{ line }}</small>
      } @else if (text().trim() && attempted()) {
        <small class="hint">Nothing could be read from this message. Fill in the fields below.</small>
      }
    </label>
  `,
  styles: [`
    .read { color: var(--success); }
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

  /** What was read, in one line: what the landlord should check before saving. */
  readonly summary = computed(() => {
    const r = this.result();
    if (!r) {
      return null;
    }
    const parts: string[] = [];
    if (r.reference) { parts.push(`code ${r.reference}`); }
    if (r.amount) { parts.push(`KES ${Number(r.amount).toLocaleString()}`); }
    if (r.paidOn) { parts.push(`paid ${r.paidOn}`); }
    if (r.tenant) {
      parts.push(`${r.tenant.tenantName} · ${r.tenant.roomName ?? ''}${r.tenant.buildingName ? ', ' + r.tenant.buildingName : ''}`
        + (r.matchedBy === 'ACCOUNT' ? ` (account ${r.accountReference})` : ' (by phone)'));
    } else if (r.accountReference) {
      parts.push(`account ${r.accountReference}, not one of your rooms`);
    }
    return parts.length > 0 ? `Read: ${parts.join(' · ')}. Check the fields below.` : null;
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
