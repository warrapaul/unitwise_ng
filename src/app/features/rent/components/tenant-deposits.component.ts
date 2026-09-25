import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { todayIso } from '../../../shared/utils/date.util';
import { RentPaymentMethod, TenantDeposit } from '../models/rent.models';
import { RentService } from '../rent.service';

type Mode = 'open' | 'receipt' | 'refund';

const OPEN_STATUSES = new Set(['PENDING', 'HELD', 'PARTIALLY_REFUNDED']);

/**
 * A tenant's deposit — money held, not rent. It never counts towards arrears,
 * overpayment or credit, and it goes back (less any deductions) when they leave.
 * One open deposit per room; a settled one stays as history, so a tenant who
 * returns can be given a new one.
 */
@Component({
  selector: 'app-tenant-deposits',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    SectionCardComponent,
    DialogComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    LoadingStateComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    HumanLabelPipe
  ],
  template: `
    <app-section-card title="Deposit">
      <ng-container actions>
        @if (current(); as deposit) {
          @if (toNumber(deposit.balanceDue) > 0) {
            <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
              <button type="button" class="btn btn-secondary btn-sm" (click)="start('receipt')">Record receipt</button>
            </app-permission-gate>
          }
          @if (toNumber(deposit.heldAmount) > 0) {
            <app-permission-gate [permissions]="['RENT_PAYMENT_WRITE', 'RENT_PAYMENT_WRITE_ALL']">
              <button type="button" class="btn btn-secondary btn-sm" (click)="start('refund')">Refund</button>
            </app-permission-gate>
          }
        } @else if (!loading()) {
          <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
            <button type="button" class="btn btn-secondary btn-sm" (click)="start('open')">Record deposit</button>
          </app-permission-gate>
        }
      </ng-container>

      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading deposit..." />
      } @else if (loadError()) {
        <p class="error-text">{{ loadError() }}</p>
      } @else if (current(); as deposit) {
        <dl class="figures">
          <div><dt>Agreed</dt><dd>{{ deposit.expectedAmount ?? '-' }}</dd></div>
          <div><dt>Received</dt><dd>{{ deposit.amountReceived ?? 0 }}</dd></div>
          <div><dt>Held</dt><dd><strong>{{ deposit.heldAmount ?? 0 }}</strong></dd></div>
          @if (toNumber(deposit.balanceDue) > 0) {
            <div><dt>Still to pay</dt><dd>{{ deposit.balanceDue }}</dd></div>
          }
          <div>
            <dt>Status</dt>
            <dd>
              <span class="status-chip" [class.status-chip--warning]="deposit.status === 'PENDING'" [class.status-chip--success]="deposit.status === 'HELD'"
                    [class.status-chip--neutral]="deposit.status === 'PARTIALLY_REFUNDED'">{{ deposit.status | humanLabel }}</span>
              @if (deposit.awaitingRefund) {
                <span class="status-chip status-chip--danger">Awaiting refund</span>
              }
            </dd>
          </div>
        </dl>
      } @else {
        <p class="muted">None recorded.</p>
      }

      @if (history().length > 0) {
        <details class="history">
          <summary>History</summary>
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference / reason</th></tr></thead>
              <tbody>
                @for (entry of history(); track entry.id) {
                  <tr>
                    <td>{{ (entry.transactionDate || entry.createdAt) | date: 'd MMM y' }}</td>
                    <td>{{ entry.type | humanLabel }}</td>
                    <td>{{ entry.type === 'RECEIPT' ? '' : '−' }}{{ entry.amount }}</td>
                    <td>{{ entry.paymentMethod ? (entry.paymentMethod | humanLabel) : '-' }}</td>
                    <td>{{ entry.reason || entry.referenceNumber || '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </app-section-card>

    @if (mode(); as active) {
      <app-dialog [title]="dialogTitle(active)" (closed)="mode.set(null)">
        @switch (active) {
          @case ('open') {
            <form id="deposit-form" class="stack" [formGroup]="openForm" appFormFeedback (ngSubmit)="open()">
              <label class="field">
                <span>Agreed amount</span>
                <input type="number" step="0.01" min="0" formControlName="expectedAmount" placeholder="From the lease or room">
                <small class="hint">Leave blank to use the lease's deposit, else the room's.</small>
              </label>
              <label class="field">
                <span>Received now</span>
                <input type="number" step="0.01" min="0" formControlName="amount" placeholder="Nothing yet">
              </label>
              @if (openForm.controls.amount.value) {
                <div class="grid-auto">
                  <label class="field"><span>Date</span><input type="date" formControlName="transactionDate"></label>
                  <label class="field"><span>Method</span>
                    <select formControlName="paymentMethod">
                      @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
                    </select>
                  </label>
                  <label class="field"><span>Reference</span><input formControlName="referenceNumber"></label>
                </div>
              }
            </form>
          }
          @case ('receipt') {
            <form id="deposit-form" class="stack" [formGroup]="receiptForm" appFormFeedback (ngSubmit)="receive()">
              <div class="grid-auto">
                <label class="field">
                  <span>Amount</span>
                  <input type="number" step="0.01" min="0" formControlName="amount">
                  <app-field-error [control]="receiptForm.controls.amount" label="Amount" />
                </label>
                <label class="field"><span>Date</span><input type="date" formControlName="transactionDate"></label>
                <label class="field"><span>Method</span>
                  <select formControlName="paymentMethod">
                    @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
                  </select>
                </label>
                <label class="field"><span>Reference</span><input formControlName="referenceNumber"></label>
              </div>
            </form>
          }
          @case ('refund') {
            <form id="deposit-form" class="stack" [formGroup]="refundForm" appFormFeedback (ngSubmit)="refund()">
              <!-- What is kept, each with a reason; the rest goes back. -->
              <fieldset class="deductions">
                <legend>Deductions</legend>
                @for (row of deductions.controls; track $index; let i = $index) {
                  <div class="deduction" [formGroup]="row">
                    <input formControlName="reason" placeholder="e.g. Broken window" [attr.aria-label]="'Deduction ' + (i + 1) + ' reason'">
                    <input type="number" step="0.01" min="0" formControlName="amount" placeholder="Amount" [attr.aria-label]="'Deduction ' + (i + 1) + ' amount'">
                    <button type="button" class="icon-action icon-action--danger" (click)="removeDeduction(i)" aria-label="Remove deduction" title="Remove">
                      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg>
                    </button>
                  </div>
                }
                <button type="button" class="btn btn-secondary btn-sm add-deduction" (click)="addDeduction()">Add deduction</button>
              </fieldset>

              <div class="grid-auto">
                <label class="field">
                  <span>Refund to tenant</span>
                  <input type="number" step="0.01" min="0" formControlName="refundAmount">
                  <small class="hint">Held {{ current()?.heldAmount ?? 0 }} · kept {{ deductionTotal() }} · left after {{ remainder() }}</small>
                </label>
                <label class="field"><span>Date</span><input type="date" formControlName="transactionDate"></label>
                <label class="field"><span>Method</span>
                  <select formControlName="paymentMethod">
                    @for (method of methods; track method) { <option [value]="method">{{ method | humanLabel }}</option> }
                  </select>
                </label>
                <label class="field"><span>Reference</span><input formControlName="referenceNumber"></label>
              </div>
              <label class="field"><span>Notes</span><textarea formControlName="notes" rows="2"></textarea></label>
            </form>
          }
        }

        @if (actionError(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }

        <div dialog-actions>
          <button type="submit" form="deposit-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save' }}</button>
          <button type="button" class="btn btn-secondary" (click)="mode.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .figures div { display: grid; gap: 0.15rem; }
    .figures dt { font-size: 0.75rem; color: var(--text-muted); }
    .figures dd { margin: 0; display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .history summary { cursor: pointer; font-weight: 600; }
    .history[open] summary { margin-bottom: 0.5rem; }
    .deductions { display: grid; gap: 0.5rem; margin: 0; padding: 0; border: 0; }
    .deductions legend { font-weight: 600; margin-bottom: 0.3rem; }
    .deduction { display: grid; grid-template-columns: 1fr 8rem auto; gap: 0.5rem; align-items: center; }
    .add-deduction { justify-self: start; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDepositsComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);

  readonly methods: RentPaymentMethod[] = ['MPESA', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

  readonly deposits = signal<TenantDeposit[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly mode = signal<Mode | null>(null);
  readonly saving = signal(false);
  readonly actionError = signal<ApiError | null>(null);

  /** The one still open, if any. */
  readonly current = computed(() => this.deposits().find((deposit) => OPEN_STATUSES.has(deposit.status)) ?? null);

  /** Every movement, across this and past deposits, newest first. */
  readonly history = computed(() => this.deposits()
    .flatMap((deposit) => deposit.transactions ?? [])
    .sort((a, b) => (b.transactionDate ?? b.createdAt ?? '').localeCompare(a.transactionDate ?? a.createdAt ?? '')));

  readonly openForm = this.fb.group({
    expectedAmount: [null as number | null, [Validators.min(0)]],
    amount: [null as number | null, [Validators.min(0)]],
    transactionDate: todayIso(),
    paymentMethod: 'MPESA' as RentPaymentMethod,
    referenceNumber: ''
  });

  readonly receiptForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    transactionDate: todayIso(),
    paymentMethod: 'MPESA' as RentPaymentMethod,
    referenceNumber: ''
  });

  readonly refundForm = this.fb.group({
    deductions: this.fb.array<ReturnType<TenantDepositsComponent['deductionGroup']>>([]),
    refundAmount: [0, [Validators.required, Validators.min(0)]],
    transactionDate: todayIso(),
    paymentMethod: 'MPESA' as RentPaymentMethod,
    referenceNumber: '',
    notes: ''
  });

  get deductions(): FormArray<ReturnType<TenantDepositsComponent['deductionGroup']>> {
    return this.refundForm.controls.deductions;
  }

  private readonly refundValues = toSignal(this.refundForm.valueChanges, { initialValue: this.refundForm.getRawValue() });

  readonly deductionTotal = computed(() =>
    (this.refundValues().deductions ?? []).reduce((sum, row) => sum + (Number(row?.amount) || 0), 0));

  readonly remainder = computed(() =>
    Math.round((this.toNumber(this.current()?.heldAmount) - this.deductionTotal() - (Number(this.refundValues().refundAmount) || 0)) * 100) / 100);

  constructor() {
    effect(() => {
      const ids = [this.agencyId(), this.buildingId(), this.tenantId()] as const;
      untracked(() => void this.load(...ids));
    });

    // Refund defaults to whatever is held and not kept; the operator can change it.
    this.deductions.valueChanges.subscribe(() => {
      const held = this.toNumber(this.current()?.heldAmount);
      this.refundForm.controls.refundAmount.setValue(Math.max(0, Math.round((held - this.deductionTotalNow()) * 100) / 100), { emitEvent: true });
    });
  }

  toNumber(value: number | string | null | undefined): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  dialogTitle(mode: Mode): string {
    return mode === 'open' ? 'Record deposit' : mode === 'receipt' ? 'Record deposit received' : 'Refund deposit';
  }

  deductionGroup() {
    return this.fb.group({
      reason: ['', Validators.required],
      amount: [null as number | null, [Validators.required, Validators.min(0.01)]]
    });
  }

  addDeduction(): void {
    this.deductions.push(this.deductionGroup());
  }

  removeDeduction(index: number): void {
    this.deductions.removeAt(index);
  }

  start(mode: Mode): void {
    this.actionError.set(null);
    const deposit = this.current();
    if (mode === 'open') {
      this.openForm.reset({ expectedAmount: null, amount: null, transactionDate: todayIso(), paymentMethod: 'MPESA', referenceNumber: '' });
    } else if (mode === 'receipt') {
      this.receiptForm.reset({ amount: this.toNumber(deposit?.balanceDue) || null, transactionDate: todayIso(), paymentMethod: 'MPESA', referenceNumber: '' });
    } else {
      this.deductions.clear();
      this.refundForm.reset({ refundAmount: this.toNumber(deposit?.heldAmount), transactionDate: todayIso(), paymentMethod: 'MPESA', referenceNumber: '', notes: '' });
    }
    this.mode.set(mode);
  }

  async open(): Promise<void> {
    const value = this.openForm.getRawValue();
    await this.run(() => firstValueFrom(this.rent.openDeposit(this.agencyId(), this.buildingId(), this.tenantId(), {
      expectedAmount: value.expectedAmount,
      initialReceipt: value.amount ? {
        amount: value.amount,
        transactionDate: value.transactionDate || null,
        paymentMethod: value.paymentMethod,
        referenceNumber: value.referenceNumber.trim() || null
      } : null
    })));
  }

  async receive(): Promise<void> {
    const deposit = this.current();
    if (this.receiptForm.invalid || !deposit) {
      this.receiptForm.markAllAsTouched();
      return;
    }
    const value = this.receiptForm.getRawValue();
    await this.run(() => firstValueFrom(this.rent.recordDepositReceipt(this.agencyId(), this.buildingId(), deposit.id, {
      amount: value.amount!,
      transactionDate: value.transactionDate || null,
      paymentMethod: value.paymentMethod,
      referenceNumber: value.referenceNumber.trim() || null
    })));
  }

  async refund(): Promise<void> {
    const deposit = this.current();
    if (this.refundForm.invalid || !deposit) {
      this.refundForm.markAllAsTouched();
      return;
    }
    if (this.remainder() < 0) {
      this.actionError.set({ message: 'The refund and deductions add up to more than is held.' } as ApiError);
      return;
    }
    const value = this.refundForm.getRawValue();
    await this.run(() => firstValueFrom(this.rent.refundDeposit(this.agencyId(), this.buildingId(), deposit.id, {
      refundAmount: value.refundAmount,
      deductions: value.deductions.map((row) => ({ reason: row.reason.trim(), amount: row.amount! })),
      paymentMethod: value.refundAmount > 0 ? value.paymentMethod : null,
      referenceNumber: value.referenceNumber.trim() || null,
      transactionDate: value.transactionDate || null,
      notes: value.notes.trim() || null
    })));
  }

  private deductionTotalNow(): number {
    return this.deductions.getRawValue().reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.saving.set(true);
    this.actionError.set(null);
    try {
      await action();
      this.mode.set(null);
      await this.load(this.agencyId(), this.buildingId(), this.tenantId());
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(agencyId: number, buildingId: number, tenantId: number): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.deposits.set(await firstValueFrom(this.rent.getTenantDeposits(agencyId, buildingId, tenantId)));
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
