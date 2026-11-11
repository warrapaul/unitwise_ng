import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency, formatPhone } from '../../../shared/utils/format.util';
import { phoneValidator } from '../../../shared/utils/phone.validator';
import { MpesaTillInstructions } from '../models/rent.models';
import { RentService } from '../rent.service';

type Stage = 'form' | 'sending' | 'waiting' | 'paid' | 'failed' | 'timeout' | 'by-hand';

/** How long to keep asking after the prompt went out; M-Pesa gives up on an unanswered prompt in about a minute. */
const WAIT_MS = 120_000;
const POLL_MS = 5_000;

/**
 * Paying a month by M-Pesa prompt: the amount (the balance, editable), the number the prompt goes
 * to (the tenancy's, changeable), then what happened. The prompt is answered on the phone, so the
 * dialog keeps asking the server until it is settled, refused or the prompt has expired.
 */
@Component({
  selector: 'app-tenant-pay-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FormFeedbackDirective, MoneyInputDirective],
  template: `
    <app-dialog [title]="'Pay ' + monthName()" width="26rem" (closed)="close()">
      @switch (stage()) {
        @case ('form') {
          <form id="pay-form" class="pay" [formGroup]="form" appFormFeedback (ngSubmit)="pay()">
            <label class="field">
              <span>Amount</span>
              <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span>
                <input appMoneyInput formControlName="amount" aria-label="Amount in KES"></span>
            </label>
            @if (editingPhone()) {
              <label class="field">
                <span>M-Pesa number</span>
                <input type="tel" inputmode="tel" autocomplete="tel" formControlName="phone">
              </label>
            } @else {
              <p class="to">
                You’ll get an M-Pesa prompt on <strong>{{ shownPhone() }}</strong>.
                <button type="button" class="text-link" (click)="editingPhone.set(true)">Change</button>
              </p>
            }
            @if (error(); as apiError) {
              <app-error-card title="Could not start the payment" [message]="apiError.message" [details]="apiError.details" />
            }
          </form>
        }
        @case ('sending') {
          <p class="state" role="status">Sending the prompt…</p>
        }
        @case ('waiting') {
          <div class="state" role="status">
            <span class="spinner" aria-hidden="true"></span>
            <p><strong>Check your phone.</strong> Enter your M-Pesa PIN to pay {{ money(form.getRawValue().amount) }}.</p>
          </div>
        }
        @case ('paid') {
          <div class="state state--good" role="status">
            <p><strong>Paid.</strong> {{ money(form.getRawValue().amount) }} is on your {{ monthName() }} bill.</p>
          </div>
        }
        @case ('failed') {
          <div class="state state--bad" role="alert">
            <p><strong>Not paid.</strong> {{ statusMessage() || 'The prompt was cancelled or declined. Nothing was taken.' }}</p>
          </div>
        }
        @case ('timeout') {
          <div class="state" role="status">
            <p><strong>No answer yet.</strong> If you paid, it shows here once M-Pesa confirms it. If no money left your account, try again.</p>
          </div>
        }
        @case ('by-hand') {
          <div class="state" role="status">
            <p>{{ statusMessage() || 'Pay with these details:' }}</p>
            @if (till(); as t) {
              <dl class="till">
                @if (t.payableNumber) { <div><dt>Paybill / till</dt><dd>{{ t.payableNumber }}</dd></div> }
                @if (t.accountReference) { <div><dt>Account</dt><dd>{{ t.accountReference }}</dd></div> }
                <div><dt>Amount</dt><dd>{{ money(t.amount) }}</dd></div>
              </dl>
            }
          </div>
        }
      }

      <div dialog-actions>
        @switch (stage()) {
          @case ('form') {
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button type="submit" form="pay-form" class="btn btn-primary">Pay {{ money(form.getRawValue().amount) }}</button>
          }
          @case ('waiting') {
            <button type="button" class="btn btn-secondary" (click)="close()">Close</button>
          }
          @case ('sending') {}
          @case ('failed') {
            <button type="button" class="btn btn-secondary" (click)="close()">Close</button>
            <button type="button" class="btn btn-primary" (click)="stage.set('form')">Try again</button>
          }
          @case ('timeout') {
            <button type="button" class="btn btn-secondary" (click)="stage.set('form')">Try again</button>
            <button type="button" class="btn btn-primary" (click)="checkAgain()">Check again</button>
          }
          @default {
            <button type="button" class="btn btn-primary" (click)="close()">Done</button>
          }
        }
      </div>
    </app-dialog>
  `,
  styles: [`
    .pay { display: grid; gap: var(--space-4); }
    .to { margin: 0; }
    .state { display: grid; gap: var(--space-3); justify-items: start; }
    .state p { margin: 0; }
    .state--good strong { color: var(--success); }
    .state--bad strong { color: var(--danger); }
    .spinner { width: 1.75rem; height: 1.75rem; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%;
               animation: spin 0.9s linear infinite; }
    @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .till { display: grid; gap: var(--space-2); margin: 0; }
    .till div { display: flex; justify-content: space-between; gap: var(--space-3); }
    .till dt { color: var(--text-muted); }
    .till dd { margin: 0; font-weight: var(--weight-semibold); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantPayDialogComponent implements OnInit {
  readonly tenantId = input.required<number>();
  /** First of the month being paid, `YYYY-MM-01`. */
  readonly month = input.required<string>();
  readonly monthName = input.required<string>();
  /** What is left on the month; the amount starts here. */
  readonly balance = input<number | null>(null);
  /** The number on the tenancy, where the prompt goes unless changed. */
  readonly phone = input<string | null>(null);

  readonly paid = output<void>();
  readonly closed = output<void>();

  private readonly rent = inject(RentService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly stage = signal<Stage>('form');
  readonly error = signal<ApiError | null>(null);
  readonly statusMessage = signal<string | null>(null);
  readonly till = signal<MpesaTillInstructions | null>(null);
  readonly editingPhone = signal(false);

  readonly form = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    phone: ['', [phoneValidator()]]
  });

  readonly shownPhone = computed(() => formatPhone(this.phone()));

  private checkoutId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  ngOnInit(): void {
    this.form.patchValue({ amount: this.balance() && this.balance()! > 0 ? this.balance() : null, phone: this.phone() ?? '' });
    // No number on the tenancy: ask for one rather than show an empty sentence.
    if (!this.phone()) {
      this.editingPhone.set(true);
      this.form.controls.phone.addValidators(Validators.required);
      this.form.controls.phone.updateValueAndValidity();
    }
  }

  async pay(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.stage.set('sending');
    this.error.set(null);
    this.statusMessage.set(null);
    try {
      const checkout = await firstValueFrom(this.rent.initiateMyMpesaPayment({
        tenantId: this.tenantId(),
        month: this.month(),
        amount: value.amount,
        phoneNumber: this.editingPhone() ? value.phone : null
      }));
      this.statusMessage.set(checkout.message ?? null);
      if (checkout.outcome === 'STK_PUSH_SENT' && checkout.checkoutRequestId) {
        this.checkoutId = checkout.checkoutRequestId;
        this.stage.set('waiting');
        this.deadline = Date.now() + WAIT_MS;
        this.schedule();
      } else {
        this.till.set(checkout.tillInstructions ?? null);
        this.stage.set('by-hand');
      }
    } catch (error) {
      this.error.set(toApiError(error));
      this.stage.set('form');
    }
  }

  checkAgain(): void {
    this.stage.set('waiting');
    this.deadline = Date.now() + POLL_MS * 3;
    void this.poll();
  }

  close(): void {
    this.stopPolling();
    this.closed.emit();
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  private schedule(): void {
    this.stopPolling();
    this.timer = setTimeout(() => void this.poll(), POLL_MS);
  }

  private async poll(): Promise<void> {
    if (!this.checkoutId) {
      return;
    }
    try {
      const status = await firstValueFrom(this.rent.getMyMpesaPaymentStatus(this.checkoutId));
      if (status.settled || status.status === 'COMPLETED') {
        this.stage.set('paid');
        this.paid.emit();
        return;
      }
      if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        this.statusMessage.set(status.message ?? null);
        this.stage.set('failed');
        return;
      }
    } catch {
      // A failed check is not a failed payment: keep asking until the deadline.
    }
    if (Date.now() >= this.deadline) {
      this.stage.set('timeout');
      return;
    }
    this.schedule();
  }

  private stopPolling(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
