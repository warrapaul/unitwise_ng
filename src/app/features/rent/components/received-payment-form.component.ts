import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { todayIso } from '../../../shared/utils/date.util';
import { RentPaymentMethod } from '../models/rent.models';
import { parsePaymentMessage } from '../payment-message';
import { paymentReferenceSpec, paymentReferenceValidator } from '../payment-reference';
import { ReceivedPayment } from '../reconciliation.models';
import { ReconciliationService } from '../reconciliation.service';

/**
 * The landlord's side of a payment: paste the M-Pesa or bank message, check what it says, and
 * UnitWise looks for the tenant's report with the same reference and amount — or keeps it until
 * one arrives. Saving never records money; confirming the match does.
 */
@Component({
  selector: 'app-received-payment-form',
  standalone: true,
  imports: [ReactiveFormsModule, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
      <label class="field">
        <span>Payment message</span>
        <textarea formControlName="message" rows="3" (input)="read()"
                  placeholder="Paste the M-Pesa or bank confirmation message, as you received it"></textarea>
        @if (readFields().length > 0) {
          <small class="hint">Read from the message: {{ readFields().join(', ') }}. Check them below.</small>
        }
      </label>

      <div class="grid-auto">
        <label class="field">
          <span>{{ reference().label }}</span>
          <input formControlName="referenceNumber" class="uppercase" [placeholder]="reference().placeholder">
          @if (form.controls.referenceNumber.errors?.['referencePattern']; as message) {
            @if (form.controls.referenceNumber.touched) { <small class="error-text">{{ message }}</small> }
          } @else {
            <app-field-error [control]="form.controls.referenceNumber" label="The reference" />
          }
        </label>
        <label class="field">
          <span>Amount received</span>
          <span class="input-prefix"><span class="input-prefix__unit">KES</span>
            <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="amount"></span>
          <app-field-error [control]="form.controls.amount" label="Amount" />
        </label>
        <label class="field">
          <span>Date received</span>
          <input type="date" formControlName="paidOn" [max]="today">
        </label>
        <label class="field">
          <span>Method</span>
          <select formControlName="paymentMethod">
            <option value="MPESA">M-Pesa</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>

      @if (error(); as apiError) {
        <app-error-card [title]="apiError.status === 409 ? 'Already entered' : 'Not saved'"
                        [message]="apiError.message" [details]="apiError.details" />
      }
      <div class="button-row">
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Looking...' : 'Find match' }}</button>
        @if (hasInput()) {
          <button type="button" class="btn btn-secondary" (click)="reset()">Clear</button>
        }
      </div>
    </form>
  `,
  styles: [`
    .uppercase { text-transform: uppercase; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceivedPaymentFormComponent {
  readonly agencyId = input.required<number>();
  readonly recorded = output<ReceivedPayment>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly reconciliation = inject(ReconciliationService);

  readonly today = todayIso();
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly readFields = signal<string[]>([]);

  readonly form = this.fb.group({
    message: '',
    referenceNumber: ['', [Validators.required, paymentReferenceValidator()]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    paidOn: todayIso(),
    paymentMethod: 'MPESA' as RentPaymentMethod
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly reference = computed(() => paymentReferenceSpec(this.values().paymentMethod));
  readonly hasInput = computed(() => !!this.values().message || !!this.values().referenceNumber);

  /** Fills what the message says; the server reads it again when it is saved. */
  read(): void {
    const parsed = parsePaymentMessage(this.form.controls.message.value);
    const controls = this.form.controls;
    const filled: string[] = [];
    if (parsed.method) {
      controls.paymentMethod.setValue(parsed.method);
    }
    if (parsed.reference) {
      controls.referenceNumber.setValue(parsed.reference);
      filled.push('reference');
    }
    if (parsed.amount !== null) {
      controls.amount.setValue(parsed.amount);
      filled.push('amount');
    }
    if (parsed.paidOn) {
      controls.paidOn.setValue(parsed.paidOn);
      filled.push('date');
    }
    this.readFields.set(filled);
  }

  reset(): void {
    this.form.reset({ message: '', referenceNumber: '', amount: null, paidOn: todayIso(), paymentMethod: 'MPESA' });
    this.readFields.set([]);
    this.error.set(null);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.reconciliation.record(this.agencyId(), {
        message: value.message.trim() || null,
        referenceNumber: value.referenceNumber.trim().toUpperCase(),
        amount: value.amount,
        paidOn: value.paidOn || null,
        paymentMethod: value.paymentMethod
      }));
      this.reset();
      this.recorded.emit(saved);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
