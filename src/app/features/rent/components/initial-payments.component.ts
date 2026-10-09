import { ChangeDetectionStrategy, Component, effect, input } from '@angular/core';
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
 * never counted as rent). Both optional — a part with no amount is not sent.
 * Fields pair up two to a row, on a phone too.
 */
@Component({
  selector: 'app-initial-payments',
  standalone: true,
  imports: [ReactiveFormsModule, HumanLabelPipe],
  template: `
    <div class="money" [formGroup]="group()">
      <section class="money__part">
        <h3>Rent paid now</h3>
        <div class="money__grid">
          <label class="field">
            <span>Amount (KES)</span>
            <input type="number" step="0.01" min="0" formControlName="rentAmount" [placeholder]="agreedLabel(rent())">
            @if (canFill('rent')) {
              <button type="button" class="fill" (click)="fill('rent')">Use agreed {{ money(rent()) }}</button>
            }
          </label>
          <label class="field"><span>Covers month</span><input type="month" formControlName="rentMonth"></label>
          <label class="field"><span>Date paid</span><input type="date" formControlName="rentDate"></label>
          <label class="field"><span>Method</span>
            <select formControlName="rentMethod">
              @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
            </select>
          </label>
          <label class="field"><span>Reference</span><input formControlName="rentReference"></label>
        </div>
      </section>

      <section class="money__part">
        <h3>Deposit received</h3>
        <div class="money__grid">
          <label class="field">
            <span>Amount (KES)</span>
            <input type="number" step="0.01" min="0" formControlName="depositAmount" [placeholder]="agreedLabel(deposit())">
            @if (group().controls.depositAmount.errors?.['max']) {
              <small class="error-text" role="alert">More than the agreed deposit of {{ money(deposit()) }}.</small>
            } @else if (canFill('deposit')) {
              <button type="button" class="fill" (click)="fill('deposit')">Use agreed {{ money(deposit()) }}</button>
            }
          </label>
          <label class="field"><span>Date paid</span><input type="date" formControlName="depositDate"></label>
          <label class="field"><span>Method</span>
            <select formControlName="depositMethod">
              @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
            </select>
          </label>
          <label class="field"><span>Reference</span><input formControlName="depositReference"></label>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .money { display: grid; gap: 1.25rem; }
    .money__part { display: grid; gap: 0.6rem; }
    .money__part h3 { margin: 0; font-size: 0.95rem; }
    /* Three to a row on a wide screen, two on a phone — never one long column of short answers. */
    .money__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.9rem 0.75rem; align-items: start; }
    .money__grid .field input, .money__grid .field select { width: 100%; max-width: none; }
    @media (max-width: 700px) { .money__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .fill { justify-self: start; padding: 0; border: 0; background: none; font: inherit; font-size: 0.82rem; font-weight: 600;
            color: var(--primary-strong); cursor: pointer; text-decoration: underline; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InitialPaymentsComponent {
  readonly group = input.required<InitialPaymentsGroup>();
  /** The agreed rent and deposit, to fill an opened section. */
  readonly rent = input<number | string | null | undefined>(null);
  readonly deposit = input<number | string | null | undefined>(null);

  readonly methods: RentPaymentMethod[] = ['MPESA', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

  constructor() {
    // The deposit taken can be less than agreed (a part payment), never more: the server refuses
    // it, so say so at the field instead of after the whole verification is submitted.
    effect(() => {
      const control = this.group().controls.depositAmount;
      const agreed = Number(this.deposit());
      control.setValidators(Number.isFinite(agreed) && agreed > 0
        ? [Validators.min(0), Validators.max(agreed)]
        : [Validators.min(0)]);
      control.updateValueAndValidity({ emitEvent: false });
    });
  }

  /**
   * Fill in what was agreed — a visible link, not a value that appears on its own: an amount
   * filled silently would be recorded as money received whether or not it was.
   */
  fill(kind: 'rent' | 'deposit'): void {
    const controls = this.group().controls;
    const control = kind === 'rent' ? controls.rentAmount : controls.depositAmount;
    const agreed = Number(kind === 'rent' ? this.rent() : this.deposit());
    if (Number.isFinite(agreed) && agreed > 0) {
      control.setValue(agreed);
      control.markAsDirty();
    }
  }

  canFill(kind: 'rent' | 'deposit'): boolean {
    const control = kind === 'rent' ? this.group().controls.rentAmount : this.group().controls.depositAmount;
    const agreed = Number(kind === 'rent' ? this.rent() : this.deposit());
    return Number.isFinite(agreed) && agreed > 0 && Number(control.value) !== agreed;
  }

  agreedLabel(value: number | string | null | undefined): string {
    const agreed = Number(value);
    return Number.isFinite(agreed) && agreed > 0 ? `Agreed ${this.money(value)}` : '';
  }

  money(value: number | string | null | undefined): string {
    return `KES ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}
