import { paymentReferenceSpec, paymentReferenceValidator } from '../payment-reference';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal, computed } from '@angular/core';
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
        <div class="field-pair">
          <label class="field">
            <span>Amount</span>
            <span class="input-prefix"><span class="input-prefix__unit">KES</span>
              <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="amountPaid"></span>
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
          <!-- Follows the method: what the reference IS for M-Pesa, a cheque, a bank transfer. -->
          <label class="field">
            <span>{{ reference().label }}</span>
            <input formControlName="receiptNumber" [placeholder]="reference().placeholder"
                   [class.uppercase]="reference().upper" (input)="normaliseReference()">
            @if (form.controls.receiptNumber.errors?.['referencePattern']; as message) {
              @if (form.controls.receiptNumber.touched) { <small class="error-text">{{ message }}</small> }
            } @else if (reference().hint; as hint) {
              <small class="hint">{{ hint }}</small>
            }
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
    receiptNumber: ['', [paymentReferenceValidator()]],
    notes: ''
  });

  private readonly method = toSignal(this.form.controls.paymentMethod.valueChanges, { initialValue: this.form.controls.paymentMethod.value });
  readonly reference = computed(() => paymentReferenceSpec(this.method()));

  constructor() {
    // A changed method changes what a valid reference looks like.
    this.form.controls.paymentMethod.valueChanges.pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.receiptNumber.updateValueAndValidity());
  }

  /** M-Pesa codes are upper case; typing them in lower case is not a mistake worth flagging. */
  normaliseReference(): void {
    if (this.reference().upper) {
      const control = this.form.controls.receiptNumber;
      const upper = control.value.toUpperCase();
      if (upper !== control.value) {
        control.setValue(upper, { emitEvent: false });
      }
    }
  }

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
