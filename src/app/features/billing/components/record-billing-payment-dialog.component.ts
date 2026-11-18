import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { BillingInvoice, PAYMENT_METHOD_LABELS, PaymentMethod, kes } from '../billing.models';
import { BillingService } from '../billing.service';
import { parsePaymentMessage } from '../../rent/payment-message';

/**
 * A payment the platform received outside the M-Pesa callbacks: a bank transfer, cash, or a
 * paybill payment that never reached us. The reference is required and may be recorded once.
 * Naming no invoice pays the oldest unpaid one, or waits as credit.
 */
@Component({
  selector: 'app-record-billing-payment-dialog',
  standalone: true,
  imports: [FormFeedbackDirective, MoneyInputDirective, ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent],
  styles: [`
    .read { color: var(--success); }
    .uppercase { text-transform: uppercase; }
    .uppercase::placeholder { text-transform: none; }
  `],
  template: `
    <app-dialog [title]="title()" subtitle="Money the agency paid that did not come through an M-Pesa prompt — another channel, or a message you were sent." width="34rem" (closed)="closed.emit()">
      <form appFormFeedback id="record-billing-payment" class="stack" [formGroup]="form" (ngSubmit)="save()">
        <!-- A message the agency forwarded: paste it and the fields fill in. -->
        <label class="field">
          <span>Confirmation message <span class="muted">(optional)</span></span>
          <textarea formControlName="message" rows="2" (input)="read()" placeholder="Paste the M-Pesa or bank message"></textarea>
          @if (readFields().length > 0) { <small class="hint read">Read: {{ readFields().join(', ') }}. Check them below.</small> }
        </label>
        <div class="pairs">
          <label class="field">
            <span>For</span>
            <select formControlName="invoiceId">
              <option value="">The account (oldest unpaid first, then credit)</option>
              @for (invoice of openInvoices(); track invoice.id) {
                <option [value]="invoice.id">{{ invoice.invoiceNumber }} — balance {{ money(invoice.balance) }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>Method</span>
            <select formControlName="method">
              @for (method of methods; track method) { <option [value]="method">{{ methodLabels[method] }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Amount</span>
            <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="amount" aria-label="Amount in KES"></span>
            <app-field-error [control]="form.controls.amount" label="Amount" />
          </label>
          <label class="field">
            <span>Reference</span>
            <input formControlName="reference">
            <app-field-error [control]="form.controls.reference" label="Reference" />
          </label>
          <label class="field">
            <span>Paid on</span>
            <input type="datetime-local" formControlName="paidAt" [max]="now">
            <app-field-error [control]="form.controls.paidAt" label="Paid on" />
          </label>
        </div>
        <label class="field">
          <span>Note</span>
          <textarea formControlName="notes" rows="2" maxlength="500" placeholder="e.g. Equity transfer seen on the statement for 3 Nov"></textarea>
          <app-field-error [control]="form.controls.notes" label="Note" />
        </label>
        @if (error(); as apiError) {
          <app-error-card [title]="apiError.status === 409 ? 'Already recorded' : 'Not recorded'" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="record-billing-payment" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Recording…' : 'Record payment' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordPaymentDialogComponent {
  readonly agencyId = input.required<number>();
  readonly invoices = input<BillingInvoice[]>([]);
  /** Opened on one invoice ("Mark as paid"): it is preselected and its balance filled in. */
  readonly forInvoice = input<BillingInvoice | null>(null);
  readonly title = computed(() => this.forInvoice() ? `Mark ${this.forInvoice()!.invoiceNumber} as paid` : 'Record a payment');
  readonly readFields = signal<string[]>([]);
  readonly recorded = output<void>();
  readonly closed = output<void>();

  private readonly billing = inject(BillingService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly methods: PaymentMethod[] = ['BANK_TRANSFER', 'MPESA_PAYBILL', 'CASH', 'MANUAL'];
  readonly methodLabels = PAYMENT_METHOD_LABELS;
  readonly now = new Date().toISOString().slice(0, 16);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly openInvoices = computed(() => {
    const open = this.invoices().filter((invoice) => invoice.status === 'ISSUED' && Number(invoice.balance) > 0);
    const one = this.forInvoice();
    return one && !open.some((invoice) => invoice.id === one.id) ? [one, ...open] : open;
  });

  readonly form = this.fb.group({
    message: '',
    invoiceId: '',
    method: 'BANK_TRANSFER' as PaymentMethod,
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    reference: ['', [Validators.required, Validators.maxLength(64)]],
    paidAt: [this.now, [Validators.required]],
    notes: ['', [Validators.required, Validators.maxLength(500)]]
  });

  constructor() {
    queueMicrotask(() => {
      const invoice = this.forInvoice();
      if (invoice) {
        this.form.patchValue({ invoiceId: String(invoice.id), amount: Number(invoice.balance) || null, method: 'MANUAL' });
      }
    });
  }

  /** Fills what a pasted message says; every field stays editable. */
  read(): void {
    const parsed = parsePaymentMessage(this.form.controls.message.value);
    const filled: string[] = [];
    if (parsed.method) { this.form.controls.method.setValue(parsed.method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'MPESA_PAYBILL'); }
    if (parsed.reference) { this.form.controls.reference.setValue(parsed.reference); filled.push('reference'); }
    if (parsed.amount !== null) { this.form.controls.amount.setValue(parsed.amount); filled.push('amount'); }
    if (parsed.paidOn) {
      // Today's date is now (the server refuses a time in the future); an earlier day is midday.
      this.form.controls.paidAt.setValue(parsed.paidOn === this.now.slice(0, 10) ? this.now : `${parsed.paidOn}T12:00`);
      filled.push('date');
    }
    this.readFields.set(filled);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.billing.recordPayment(this.agencyId(), {
        invoiceId: v.invoiceId ? Number(v.invoiceId) : null,
        method: v.method,
        amount: v.amount!,
        reference: v.reference.trim(),
        paidAt: `${v.paidAt}:00`,
        notes: v.message.trim() ? `${v.notes.trim()} — message: ${v.message.trim()}`.slice(0, 500) : v.notes.trim()
      }));
      this.recorded.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }
}
