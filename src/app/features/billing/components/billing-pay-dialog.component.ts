import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { CopyButtonComponent } from '../../../shared/components/copy-button/copy-button.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { BillingInvoice, Money, PayResponse, kes } from '../billing.models';
import { BillingService } from '../billing.service';

const KENYAN_MOBILE = /^\s*(\+?254|0)?\s*[17](\s*\d){8}\s*$/;
/** M-Pesa takes whole shillings; below this a payment is more likely a typo than a top-up. */
const MIN_AMOUNT = 10;

/**
 * Paying the platform: an invoice's balance, or any amount ahead (credit for the next invoice).
 * Sends an M-Pesa prompt to the number given and waits for Safaricom's answer; when prompts are
 * off, or the payer prefers it, the paybill details instead (the invoice number, or the agency's
 * code, as the account).
 */
@Component({
  selector: 'app-billing-pay-dialog',
  standalone: true,
  imports: [NgTemplateOutlet, DialogComponent, ErrorCardComponent, CopyButtonComponent],
  template: `
    <app-dialog [title]="invoice() ? 'Pay invoice ' + invoice()!.invoiceNumber : 'Pay ahead'"
                [subtitle]="subtitle()" width="30rem" (closed)="finish()">
      <div class="stack">
        @if (phase() === 'form') {
          <div class="ways" role="tablist" aria-label="How to pay">
            <button type="button" role="tab" class="way" [attr.aria-selected]="way() === 'prompt'" (click)="way.set('prompt')">M-Pesa prompt</button>
            <button type="button" role="tab" class="way" [attr.aria-selected]="way() === 'paybill'" (click)="way.set('paybill')">{{ buyGoods() ? 'Till' : 'Paybill' }}</button>
          </div>
        }

        @if (phase() === 'form' && way() === 'prompt') {
          <form id="billing-pay" class="stack" (submit)="$event.preventDefault(); send()">
            @if (!invoice()) {
              <div class="field">
                <label for="pay-amount">Amount</label>
                @if (quickAmounts().length > 0) {
                  <div class="quick" role="group" aria-label="Quick amounts">
                    @for (quick of quickAmounts(); track quick.label) {
                      <button type="button" class="chip" [attr.aria-pressed]="amount() === quick.value" (click)="amount.set(quick.value)">
                        {{ quick.label }} · {{ money(quick.value) }}
                      </button>
                    }
                  </div>
                }
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span>
                  <input id="pay-amount" type="number" inputmode="numeric" [min]="minAmount" step="1" [value]="amount() ?? ''"
                         (input)="amount.set(+$any($event.target).value || null)" aria-describedby="pay-amount-hint" required></span>
                @if ((tried() || amount() !== null) && (amount() ?? 0) < minAmount) {
                  <small class="error-text" id="pay-amount-hint">The smallest amount is {{ money(minAmount) }}.</small>
                } @else {
                  <small class="hint" id="pay-amount-hint">Kept as credit; it pays your next invoice when it is issued.</small>
                }
              </div>
            }
            <div class="field">
              <label for="pay-phone">M-Pesa number</label>
              <input id="pay-phone" type="tel" inputmode="tel" autocomplete="tel"
                     [value]="phone()" (input)="phone.set($any($event.target).value)" aria-describedby="pay-phone-hint" required>
              @if ((tried() || phone()) && !phoneValid()) {
                <small class="error-text" id="pay-phone-hint">Enter a Kenyan mobile number: 07…, 01… or +254….</small>
              } @else {
                <small class="hint" id="pay-phone-hint">The phone that gets the prompt: 07…, 01… or +254….</small>
              }
            </div>
            <p class="info"><span aria-hidden="true">ⓘ</span> A prompt appears on that phone. Enter your M-Pesa PIN there to pay.</p>
          </form>
        } @else if (phase() === 'form') {
          <ng-container *ngTemplateOutlet="paybill" />
        } @else if (phase() === 'waiting') {
          <p class="status" role="status" aria-live="polite"><strong>Check your phone.</strong> Enter your M-Pesa PIN on {{ phone() }} to pay. Waiting for M-Pesa…</p>
        } @else if (phase() === 'done') {
          <p class="status status--ok" role="status" aria-live="polite">✓ Paid. Thank you — it shows on your account in a moment.</p>
        } @else if (phase() === 'failed') {
          <p class="status status--bad" role="alert">{{ failure() || 'The payment did not go through.' }}</p>
        } @else if (phase() === 'timeout') {
          <p class="status" role="status" aria-live="polite">No answer from M-Pesa yet. If you paid, it shows on your account shortly; if not, try again or pay by {{ buyGoods() ? 'till' : 'paybill' }}.</p>
        } @else if (phase() === 'manual') {
          <p class="status" role="status">{{ result()?.message || 'Pay by M-Pesa ' + (buyGoods() ? 'till' : 'paybill') + ':' }}</p>
          <ng-container *ngTemplateOutlet="paybill" />
        }

        <ng-template #paybill>
          <!-- What to type in M-Pesa, each with a copy button: the account is what matches the money to this agency. -->
          <dl class="facts">
            @if (payNumber(); as number) {
              <div><dt>{{ buyGoods() ? 'Till number' : 'Business number' }}</dt><dd><span class="mono">{{ number }}</span> <app-copy-button [value]="number" [label]="buyGoods() ? 'Copy till number' : 'Copy business number'" /></dd></div>
            }
            @if (!buyGoods() && payAccount(); as account) {
              <div><dt>Account number</dt><dd><span class="mono">{{ account }}</span> <app-copy-button [value]="account" label="Copy account number" /></dd></div>
            }
            @if (invoice()) { <div><dt>Amount</dt><dd>{{ money(invoice()!.balance) }}</dd></div> }
          </dl>
          @if (!payNumber()) { <p class="muted">Paybill details are not set up yet. Use the M-Pesa prompt, or contact us.</p> }
          @if (!buyGoods()) {
            <p class="hint">{{ invoice() ? 'The invoice number as the account settles this invoice.' : 'Your account code as the account keeps the money as credit for your next invoice.' }}
              Then use “Report a payment” if it has not shown up within an hour.</p>
          }
        </ng-template>

        @if (error(); as apiError) {
          <app-error-card title="Could not start the payment" [message]="apiError.message" [details]="apiError.details" />
        }
      </div>
      <div dialog-actions class="actions">
        @if ((phase() === 'form' && way() === 'prompt') || phase() === 'failed' || phase() === 'timeout') {
          <button type="submit" form="billing-pay" class="btn btn-primary btn-block" [disabled]="busy()" (click)="phase() !== 'form' && send()">
            {{ busy() ? 'Sending…' : phase() === 'form' ? 'Send M-Pesa prompt' + (sendAmount() ? ' for ' + money(sendAmount()) : '') : 'Try again' }}
          </button>
        } @else if (phase() === 'done' || phase() === 'manual' || way() === 'paybill') {
          <button type="button" class="btn btn-primary btn-block" (click)="finish()">Done</button>
        }
      </div>
    </app-dialog>
  `,
  styles: [`
    .status { margin: 0; }
    .status--ok { color: var(--success); font-weight: var(--weight-semibold); }
    .status--bad { color: var(--danger); font-weight: var(--weight-semibold); }
    .ways { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-1); padding: var(--space-1); border-radius: var(--radius-sm); background: var(--surface-2); }
    .way { min-height: 2.75rem; border: 0; border-radius: var(--radius-sm); background: transparent; font: inherit; font-weight: var(--weight-semibold); color: var(--text-muted); cursor: pointer; }
    .way[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
    .quick { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-1); }
    .chip { min-height: 2.75rem; padding: 0 var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); font: inherit; cursor: pointer; }
    .chip[aria-pressed="true"] { border-color: var(--primary); background: var(--primary-tint); color: var(--primary-strong); font-weight: var(--weight-semibold); }
    .info { display: flex; gap: var(--space-2); margin: 0; padding: var(--space-2-5) var(--space-3); border-radius: var(--radius-sm); background: var(--info-tint); }
    .facts { display: grid; gap: var(--space-3); margin: 0; }
    .facts div { display: grid; gap: var(--space-0-5); }
    .facts dt { color: var(--text-muted); }
    .facts dd { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-weight: var(--weight-bold); font-size: var(--font-subsection); }
    .hint { margin: 0; }
    .actions { display: grid; }
    .btn-block { width: 100%; }
    @media (prefers-reduced-motion: no-preference) { .way { transition: background .15s; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingPayDialogComponent {
  readonly minAmount = MIN_AMOUNT;
  readonly agencyId = input.required<number>();
  /** The invoice to pay; absent, the dialog pays ahead. */
  readonly invoice = input<BillingInvoice | null>(null);
  /** For paying ahead: what is already there, and what the next invoice will roughly be. */
  readonly credit = input<Money | null>(null);
  readonly nextInvoice = input<Money | null>(null);
  /** Paybill details from the billing summary. */
  readonly payNumber = input<string | null>(null);
  readonly accountCode = input<string | null>(null);
  readonly buyGoods = input(false);
  /** Something was paid (or may have been): the page reloads. */
  readonly paid = output<void>();
  readonly closed = output<void>();

  private readonly billing = inject(BillingService);
  private readonly session = inject(AuthSessionService);

  readonly way = signal<'prompt' | 'paybill'>('prompt');
  readonly phone = signal(this.session.userProfile()?.phoneNumber ?? '');
  readonly amount = signal<number | null>(null);
  readonly phase = signal<'form' | 'waiting' | 'done' | 'failed' | 'timeout' | 'manual'>('form');
  readonly busy = signal(false);
  /** Send was pressed: missing fields now say so. */
  readonly tried = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly failure = signal<string | null>(null);
  readonly result = signal<PayResponse | null>(null);

  readonly payAccount = computed(() => this.invoice()?.invoiceNumber ?? this.accountCode());
  readonly subtitle = computed(() => {
    const invoice = this.invoice();
    if (invoice) {
      return `Balance ${this.money(invoice.balance)}`;
    }
    const credit = Number(this.credit()) || 0;
    const next = Number(this.nextInvoice()) || 0;
    return [credit > 0 ? `Credit now ${this.money(credit)}` : 'No credit yet', next > 0 ? `next invoice about ${this.money(next)}` : null]
      .filter(Boolean).join(' · ');
  });

  /** The next invoice less what credit already covers, and three months of it. */
  readonly quickAmounts = computed(() => {
    const next = Math.ceil(Number(this.nextInvoice()) || 0);
    const short = Math.max(0, next - Math.floor(Number(this.credit()) || 0));
    const options: { label: string; value: number }[] = [];
    if (short >= MIN_AMOUNT) options.push({ label: 'Next invoice', value: short });
    if (next >= MIN_AMOUNT) options.push({ label: '3 months', value: next * 3 });
    return options;
  });

  readonly sendAmount = computed(() => this.invoice() ? Number(this.invoice()!.balance) : this.amount());
  readonly phoneValid = computed(() => KENYAN_MOBILE.test(this.phone()));
  readonly canSend = computed(() => this.phoneValid() && (!!this.invoice() || (this.amount() ?? 0) >= MIN_AMOUNT));

  async send(): Promise<void> {
    if (this.busy()) {
      return;
    }
    if (!this.canSend()) {
      // Pressed with something missing: say what, rather than a button that silently does nothing.
      this.tried.set(true);
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
