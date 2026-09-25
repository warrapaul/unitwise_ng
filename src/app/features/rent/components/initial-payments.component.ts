import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { thisMonthIso, todayIso } from '../../../shared/utils/date.util';
import { DepositReceiptRequest, InitialRentPayment, RentPaymentMethod, toMonthPath } from '../models/rent.models';

export type InitialPaymentsGroup = FormGroup<{
  rentAmount: FormControl<number | null>;
  rentMonth: FormControl<string>;
  rentDate: FormControl<string>;
  rentMethod: FormControl<RentPaymentMethod>;
  rentReference: FormControl<string>;
  depositAmount: FormControl<number | null>;
  depositDate: FormControl<string>;
  depositMethod: FormControl<RentPaymentMethod>;
  depositReference: FormControl<string>;
}>;

/** The form group behind `app-initial-payments`; the page owns it. */
export function initialPaymentsGroup(fb: NonNullableFormBuilder): InitialPaymentsGroup {
  return fb.group({
    rentAmount: fb.control<number | null>(null, [Validators.min(0)]),
    rentMonth: fb.control(thisMonthIso()),
    rentDate: fb.control(todayIso()),
    rentMethod: fb.control<RentPaymentMethod>('MPESA'),
    rentReference: fb.control(''),
    depositAmount: fb.control<number | null>(null, [Validators.min(0)]),
    depositDate: fb.control(todayIso()),
    depositMethod: fb.control<RentPaymentMethod>('MPESA'),
    depositReference: fb.control('')
  });
}

/** What was entered, as request blocks; a section with no amount is null. */
export function toInitialPayments(group: InitialPaymentsGroup): {
  initialRentPayment: InitialRentPayment | null;
  depositPayment: DepositReceiptRequest | null;
} {
  const value = group.getRawValue();
  return {
    initialRentPayment: value.rentAmount ? {
      amountPaid: value.rentAmount,
      paymentForMonth: toMonthPath(value.rentMonth),
      paymentDate: value.rentDate || null,
      paymentMethod: value.rentMethod,
      receiptNumber: value.rentReference.trim() || null
    } : null,
    depositPayment: value.depositAmount ? {
      amount: value.depositAmount,
      transactionDate: value.depositDate || null,
      paymentMethod: value.depositMethod,
      referenceNumber: value.depositReference.trim() || null
    } : null
  };
}

/**
 * Money received as a tenancy starts: rent, and the deposit (its own ledger,
 * never counted as rent). Both collapsed and optional; opening one fills in the
 * agreed amount if nothing is typed yet.
 */
@Component({
  selector: 'app-initial-payments',
  standalone: true,
  imports: [ReactiveFormsModule, HumanLabelPipe],
  template: `
    <div class="money" [formGroup]="group()">
      <details class="disclosure" (toggle)="fill('rent', $event)">
        <summary>Rent paid now</summary>
        <div class="grid-auto">
          <label class="field"><span>Amount</span><input type="number" step="0.01" min="0" formControlName="rentAmount"></label>
          <label class="field"><span>Covers month</span><input type="month" formControlName="rentMonth"></label>
          <label class="field"><span>Date</span><input type="date" formControlName="rentDate"></label>
          <label class="field"><span>Method</span>
            <select formControlName="rentMethod">
              @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
            </select>
          </label>
          <label class="field"><span>Reference</span><input formControlName="rentReference"></label>
        </div>
      </details>

      <details class="disclosure" (toggle)="fill('deposit', $event)">
        <summary>Deposit received</summary>
        <div class="grid-auto">
          <label class="field"><span>Amount</span><input type="number" step="0.01" min="0" formControlName="depositAmount"></label>
          <label class="field"><span>Date</span><input type="date" formControlName="depositDate"></label>
          <label class="field"><span>Method</span>
            <select formControlName="depositMethod">
              @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
            </select>
          </label>
          <label class="field"><span>Reference</span><input formControlName="depositReference"></label>
        </div>
      </details>
    </div>
  `,
  styles: [`
    .money { display: grid; gap: 0.5rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InitialPaymentsComponent {
  readonly group = input.required<InitialPaymentsGroup>();
  /** The agreed rent and deposit, to fill an opened section. */
  readonly rent = input<number | string | null | undefined>(null);
  readonly deposit = input<number | string | null | undefined>(null);

  readonly methods: RentPaymentMethod[] = ['MPESA', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

  fill(kind: 'rent' | 'deposit', event: Event): void {
    if (!(event.target as HTMLDetailsElement).open) {
      return;
    }
    const controls = this.group().controls;
    const control = kind === 'rent' ? controls.rentAmount : controls.depositAmount;
    const agreed = Number(kind === 'rent' ? this.rent() : this.deposit());
    if (control.value === null && Number.isFinite(agreed) && agreed > 0) {
      control.setValue(agreed);
    }
  }
}
