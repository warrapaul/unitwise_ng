import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { parsePaymentMessage } from '../../rent/payment-message';
import { BillingInvoice, kes, PaymentMethod } from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * The agency's "we paid": for an M-Pesa prompt whose answer never came, a paybill payment that has
 * not shown up, or a bank transfer. Pasting the confirmation fills the fields; the platform checks
 * it against what it received and confirms it. Like a tenant reporting rent — evidence, not money.
 */
@Component({
  selector: 'app-report-billing-payment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent],
  template: `
    <app-dialog title="Report a payment" subtitle="Paid, but it has not shown up? Tell us and we will confirm it." width="34rem" (closed)="closed.emit()">
      <form id="report-billing-payment" class="stack" [formGroup]="form" (ngSubmit)="save()">
        <label class="field">
          <span>Confirmation message <span class="muted">(optional)</span></span>
          <textarea formControlName="message" rows="3" (input)="read()" placeholder="Paste the M-Pesa or bank message as you received it"></textarea>
          @if (readFields().length > 0) { <small class="hint read">Read from the message: {{ readFields().join(', ') }}. Check them below.</small> }
        </label>
        <div class="pairs">
          <label class="field">
            <span>For</span>
            <select formControlName="invoiceId">
              <option value="">My account in general</option>
              @for (invoice of openInvoices(); track invoice.id) {
                <option [value]="invoice.id">{{ invoice.invoiceNumber }} — {{ money(invoice.balance) }} owing</option>
              }
            </select>
          </label>
          <label class="field">
            <span>How you paid</span>
            <select formControlName="method">
              <option value="MPESA_PAYBILL">M-Pesa</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CASH">Cash</option>
            </select>
          </label>
          <label class="field">
            <span>{{ form.controls.method.value === 'BANK_TRANSFER' ? 'Bank reference' : form.controls.method.value === 'CASH' ? 'Receipt number' : 'M-Pesa code' }}</span>
            <input formControlName="reference" class="uppercase" placeholder="e.g. SJK4H2L9QX">
            <app-field-error [control]="form.controls.reference" label="Reference" />
          </label>
          <label class="field">
            <span>Amount (KES)</span>
            <input type="number" min="1" step="0.01" formControlName="amount">
            <app-field-error [control]="form.controls.amount" label="Amount" />
          </label>
          <label class="field">
            <span>Paid on</span>
            <input type="date" formControlName="paidOn" [max]="today">
          </label>
          <label class="field">
            <span>Note <span class="muted">(optional)</span></span>
            <input formControlName="note" maxlength="500" placeholder="e.g. Paid from the office phone">
          </label>
        </div>
        @if (error(); as apiError) {
          <app-error-card title="Not reported" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="report-billing-payment" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Sending…' : 'Report payment' }}</button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .pairs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3) var(--space-4); }
    .pairs .field input, .pairs .field select { max-width: none; }
    @media (max-width: 480px) { .pairs { grid-template-columns: minmax(0, 1fr); } }
    .uppercase { text-transform: uppercase; }
    .uppercase::placeholder { text-transform: none; }
    .read { color: var(--success); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportBillingPaymentDialogComponent {
  readonly agencyId = input.required<number>();
  readonly invoices = input<BillingInvoice[]>([]);
  readonly reported = output<void>();
  readonly closed = output<void>();

  private readonly billing = inject(BillingService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly today = new Date().toISOString().slice(0, 10);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly readFields = signal<string[]>([]);
  readonly openInvoices = computed(() => this.invoices().filter((invoice) => invoice.status === 'ISSUED' && Number(invoice.balance) > 0));

  readonly form = this.fb.group({
    message: '',
    invoiceId: '',
    method: 'MPESA_PAYBILL' as PaymentMethod,
    reference: ['', [Validators.required, Validators.maxLength(64)]],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    paidOn: this.today,
    note: ''
  });

  /** Fills what the message says; the server reads it again. */
  read(): void {
    const parsed = parsePaymentMessage(this.form.controls.message.value);
    const filled: string[] = [];
    if (parsed.method) {
      this.form.controls.method.setValue(parsed.method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'MPESA_PAYBILL');
    }
    if (parsed.reference) { this.form.controls.reference.setValue(parsed.reference); filled.push('code'); }
    if (parsed.amount !== null) { this.form.controls.amount.setValue(parsed.amount); filled.push('amount'); }
    if (parsed.paidOn) { this.form.controls.paidOn.setValue(parsed.paidOn); filled.push('date'); }
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
      await firstValueFrom(this.billing.reportPayment(this.agencyId(), {
        invoiceId: v.invoiceId ? Number(v.invoiceId) : null,
        method: v.method,
        reference: v.reference.trim().toUpperCase(),
        amount: v.amount,
        paidAt: v.paidOn ? paidAtOf(v.paidOn) : null,
        message: v.message.trim() || null,
        note: v.note.trim() || null
      }));
      this.reported.emit();
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

/** A day as a moment the server accepts as past: now for today, midday for an earlier day. */
function paidAtOf(day: string): string {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (day === today) {
    return `${day}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
  }
  return `${day}T12:00:00`;
}
