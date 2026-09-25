import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { todayIso } from '../../../shared/utils/date.util';
import { RentPaymentMethod, toMonthPath } from '../models/rent.models';
import { RentService } from '../rent.service';

/**
 * Record money received against one tenant's month, from wherever the debt is
 * on screen — an overdue row, a room in the month. Everything known is filled
 * in: the operator checks the amount, picks the method and confirms.
 */
@Component({
  selector: 'app-record-payment-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <app-dialog title="Record payment" [subtitle]="tenantName() + ' · ' + monthLabel()" (closed)="closed.emit()">
      <form id="record-payment" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="grid-auto">
          <label class="field">
            <span>Amount</span>
            <input type="number" step="0.01" min="0" formControlName="amountPaid">
            <app-field-error [control]="form.controls.amountPaid" label="Amount" />
          </label>
          <label class="field">
            <span>Payment date</span>
            <input type="date" formControlName="paymentDate">
          </label>
          <label class="field">
            <span>Method</span>
            <select formControlName="paymentMethod">
              <option value="MPESA">M-Pesa</option>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label class="field">
            <span>Reference</span>
            <input formControlName="receiptNumber" placeholder="M-Pesa code, cheque no.">
          </label>
        </div>
        <label class="field">
          <span>Notes</span>
          <textarea formControlName="notes" rows="2"></textarea>
        </label>

        @if (error(); as apiError) {
          <app-error-card title="Unable to record payment" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>

      <div dialog-actions>
        <button type="submit" form="record-payment" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Recording...' : 'Record payment' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordPaymentDialogComponent implements OnInit {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();
  readonly tenantName = input('Tenant');
  /** The month it covers: `YYYY-MM` or `YYYY-MM-DD`. */
  readonly month = input.required<string>();
  /** What is owed — the amount's starting value. */
  readonly amount = input<number | string | null>(null);

  readonly recorded = output<void>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    amountPaid: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paymentDate: [todayIso(), [Validators.required]],
    paymentMethod: 'MPESA' as RentPaymentMethod,
    receiptNumber: '',
    notes: ''
  });

  ngOnInit(): void {
    const amount = Number(this.amount());
    if (Number.isFinite(amount) && amount > 0) {
      this.form.controls.amountPaid.setValue(amount);
    }
  }

  monthLabel(): string {
    const date = new Date(`${toMonthPath(this.month())}T00:00:00`);
    return Number.isNaN(date.getTime()) ? this.month() : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.rent.createPayment(this.agencyId(), this.buildingId(), {
        tenantId: this.tenantId(),
        amountPaid: value.amountPaid!,
        paymentDate: value.paymentDate,
        paymentForMonth: toMonthPath(this.month()),
        paymentMethod: value.paymentMethod,
        receiptNumber: value.receiptNumber.trim() || null,
        notes: value.notes.trim() || null
      }));
      this.recorded.emit();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
