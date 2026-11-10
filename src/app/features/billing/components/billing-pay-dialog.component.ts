import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { BillingInvoice, PayResponse, kes } from '../billing.models';
import { BillingService } from '../billing.service';

const KENYAN_MOBILE = /^\s*(\+?254|0)?\s*[17](\s*\d){8}\s*$/;

/**
 * Paying the platform: an invoice's balance, or any amount ahead (credit for the next invoice).
 * Sends an M-Pesa prompt to the number given and waits for Safaricom's answer; when prompts are
 * off, it shows the paybill steps instead (the invoice number, or the agency's code, as account).
 */
@Component({
  selector: 'app-billing-pay-dialog',
  standalone: true,
  imports: [DialogComponent, ErrorCardComponent],
  template: `
    <app-dialog [title]="invoice() ? 'Pay ' + invoice()!.invoiceNumber : 'Pay ahead'"
                [subtitle]="invoice() ? 'Balance ' + money(invoice()!.balance) : 'Paid in advance waits as credit and pays your next invoice.'"
                width="30rem" (closed)="closed.emit()">
      <div class="stack">
        @if (phase() === 'form') {
          <form id="billing-pay" class="stack" (submit)="$event.preventDefault(); send()">
            @if (!invoice()) {
              <label class="field">
                <span>Amount</span>
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input type="number" inputmode="decimal" min="1" step="1" [value]="amount() ?? ''" (input)="amount.set(+$any($event.target).value || null)" required></span>
              </label>
            }
            <label class="field">
              <span>M-Pesa number</span>
              <input inputmode="tel" [value]="phone()" (input)="phone.set($any($event.target).value)" required>
              @if (phone() && !phoneValid()) { <small class="error-text">Enter a Kenyan mobile number, e.g. 0712 345 678.</small> }
              @else { <small class="hint">A prompt appears on this phone; enter your M-Pesa PIN to pay.</small> }
            </label>
          </form>
        } @else if (phase() === 'waiting') {
          <p class="status" role="status">Prompt sent to {{ phone() }}. Enter your M-Pesa PIN on the phone… <span class="muted">Waiting for M-Pesa.</span></p>
        } @else if (phase() === 'done') {
          <p class="status status--ok" role="status">✓ Paid. Thank you — it may take a moment to show on the invoice.</p>
        } @else if (phase() === 'failed') {
          <p class="status status--bad" role="alert">{{ failure() || 'The payment did not go through.' }}</p>
        } @else if (phase() === 'timeout') {
          <p class="status" role="status">No answer from M-Pesa yet. If you paid, it will show here shortly; otherwise try again.</p>
        } @else if (phase() === 'manual' && result()?.instructions; as how) {
          <!-- Prompts are off: pay by paybill, with the account that matches the payment to this agency. -->
          <div class="manual">
            <p>{{ result()?.message || 'Pay by M-Pesa paybill:' }}</p>
            <dl class="facts">
              @if (how.payableNumber) { <div><dt>{{ how.method === 'BUY_GOODS' ? 'Till number' : 'Paybill' }}</dt><dd class="mono">{{ how.payableNumber }}</dd></div> }
              @if (how.accountReference) { <div><dt>Account number</dt><dd class="mono">{{ how.accountReference }}</dd></div> }
              @if (how.amount) { <div><dt>Amount</dt><dd>{{ money(how.amount) }}</dd></div> }
            </dl>
            @if ((how.steps ?? []).length > 0) {
              <ol class="steps">@for (step of how.steps ?? []; track $index) { <li>{{ step }}</li> }</ol>
            }
          </div>
        }
        @if (error(); as apiError) {
          <app-error-card title="Could not start the payment" [message]="apiError.message" [details]="apiError.details" />
        }
      </div>
      <div dialog-actions>
        @if (phase() === 'form' || phase() === 'failed' || phase() === 'timeout') {
          <button type="submit" form="billing-pay" class="btn btn-primary" [disabled]="busy() || !canSend()" (click)="phase() !== 'form' && send()">
            {{ busy() ? 'Sending…' : phase() === 'form' ? 'Send M-Pesa prompt' : 'Try again' }}
          </button>
        }
        <button type="button" class="btn btn-secondary" (click)="finish()">{{ phase() === 'done' || phase() === 'manual' ? 'Done' : 'Close' }}</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .status { margin: 0; font-weight: var(--weight-semibold); }
    .status--ok { color: var(--success); }
    .status--bad { color: var(--danger); }
    .manual { display: grid; gap: var(--space-2); }
    .manual p { margin: 0; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: var(--space-2); margin: 0; }
    .facts div { display: grid; gap: var(--space-0-5); }
    .facts dt { font-size: var(--font-label); color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: var(--weight-bold); font-size: var(--font-subsection); }
    .steps { margin: 0; padding-left: var(--space-5); display: grid; gap: var(--space-1); font-size: var(--font-dense); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingPayDialogComponent {
  readonly agencyId = input.required<number>();
  /** The invoice to pay; absent, the dialog pays ahead. */
  readonly invoice = input<BillingInvoice | null>(null);
  /** Something was paid (or may have been): the page reloads. */
  readonly paid = output<void>();
  readonly closed = output<void>();

  private readonly billing = inject(BillingService);

  readonly phone = signal('');
  readonly amount = signal<number | null>(null);
  readonly phase = signal<'form' | 'waiting' | 'done' | 'failed' | 'timeout' | 'manual'>('form');
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly failure = signal<string | null>(null);
  readonly result = signal<PayResponse | null>(null);

  readonly phoneValid = computed(() => KENYAN_MOBILE.test(this.phone()));
  readonly canSend = computed(() => this.phoneValid() && (!!this.invoice() || (this.amount() ?? 0) >= 1));

  async send(): Promise<void> {
    if (!this.canSend() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.failure.set(null);
    try {
      const invoice = this.invoice();
      const response = await firstValueFrom(invoice
        ? this.billing.payInvoice(this.agencyId(), invoice.id, this.phone().trim())
        : this.billing.prepay(this.agencyId(), this.phone().trim(), Math.round(this.amount()!)));
      this.result.set(response);
      if (response.promptSent && response.paymentId) {
        this.phase.set('waiting');
        await this.waitFor(response.paymentId);
      } else {
        this.phase.set('manual');
      }
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Safaricom answers the prompt within about a minute; ask every few seconds until then. */
  private async waitFor(paymentId: number): Promise<void> {
    for (let attempt = 0; attempt < 24 && this.phase() === 'waiting'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      try {
        const payment = await firstValueFrom(this.billing.paymentStatus(this.agencyId(), paymentId));
        if (payment.status === 'COMPLETED' || payment.status === 'UNMATCHED') {
          this.phase.set('done');
          this.paid.emit();
          return;
        }
        if (payment.status === 'FAILED') {
          this.failure.set(payment.failureReason || 'The payment was declined or timed out.');
          this.phase.set('failed');
          return;
        }
      } catch {
        // A blip while polling is not a failed payment; keep asking.
      }
    }
    if (this.phase() === 'waiting') {
      this.phase.set('timeout');
    }
  }

  finish(): void {
    if (this.phase() === 'done' || this.phase() === 'timeout' || this.phase() === 'manual') {
      this.paid.emit();
    }
    this.closed.emit();
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }
}
