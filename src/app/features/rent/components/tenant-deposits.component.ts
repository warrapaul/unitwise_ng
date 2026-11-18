import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
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
import { HousingService } from '../../housing/housing.service';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { MoveOutService } from '../../tenants/move-out/move-out.service';

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
  imports: [ErrorStateComponent, MoneyInputDirective, RouterLink, DateDisplayDirective, MoneyPipe, CardTableDirective, 
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
              <button type="button" class="btn btn-secondary btn-sm" (click)="start('receipt')">Record payment</button>
            </app-permission-gate>
          }
          @if (toNumber(deposit.heldAmount) > 0) {
            <app-permission-gate [permissions]="['RENT_PAYMENT_WRITE', 'RENT_PAYMENT_WRITE_ALL']">
              <button type="button" class="btn btn-secondary btn-sm" (click)="start('refund')">Refund</button>
            </app-permission-gate>
          }
        } @else if (!loading()) {
          <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
            <button type="button" class="btn btn-secondary btn-sm" (click)="start('open')">Record payment</button>
          </app-permission-gate>
        }
      </ng-container>

      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading deposit…" />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load(agencyId(), buildingId(), tenantId())" />
      } @else if (current(); as deposit) {
        <dl class="figures">
          <!-- Required, received, balance: the three a landlord asks of a deposit, always in that order. -->
          <div><dt>Required</dt><dd>{{ deposit.expectedAmount != null ? (deposit.expectedAmount | money) : '-' }}</dd></div>
          <div><dt>Received</dt><dd>{{ (deposit.amountReceived ?? 0) | money }}</dd></div>
          <div><dt>Balance</dt><dd [class.owed]="toNumber(deposit.balanceDue) > 0"><strong>{{ (deposit.balanceDue ?? 0) | money }}</strong></dd></div>
          @if (toNumber(deposit.heldAmount) !== toNumber(deposit.amountReceived)) {
            <div><dt>Held now</dt><dd>{{ (deposit.heldAmount ?? 0) | money }}</dd></div>
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
        <p class="muted">
          @if (toNumber(agreedDeposit()) > 0) { Required: {{ agreedDeposit() | money }}. Nothing received yet. } @else { No deposit recorded. }
        </p>
      }

      @if (history().length > 0) {
        <details class="history">
          <summary>History</summary>
          <div class="table-scroll">
            <table appCardTable class="table">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Method</th><th>Reference / reason</th></tr></thead>
              <tbody>
                @for (entry of history(); track entry.id) {
                  <tr>
                    <td>{{ (entry.transactionDate || entry.createdAt) | date: 'd MMM y' }}</td>
                    <td>{{ entry.type | humanLabel }}</td>
                    <td>{{ entry.type === 'RECEIPT' ? '' : '−' }}{{ entry.amount | money }}</td>
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
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="expectedAmount"></span><small class="hint">Leave blank to use the lease's or the room's.</small>
                <small class="hint">Leave blank to use the lease's deposit, else the room's.</small>
              </label>
              <label class="field">
                <span>Received now</span>
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="amount"></span>
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
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="amount"></span>
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
              @if (fromInspection()) {
                <p class="muted small">Deductions from the <a class="text-link" [routerLink]="inspectionLink()">move-out inspection</a>. Change them if you agreed otherwise.</p>
              } @else {
                <p class="muted small">Damage to charge? Record it in the <a class="text-link" [routerLink]="inspectionLink()">move-out inspection</a> with photos first.</p>
              }
              <fieldset class="deductions">
                <legend>Deductions</legend>
                @for (row of deductions.controls; track $index; let i = $index) {
                  <div class="deduction" [formGroup]="row">
                    <input formControlName="reason" placeholder="e.g. Broken window" [attr.aria-label]="'Deduction ' + (i + 1) + ' reason'">
                    <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="amount" placeholder="Amount" [attr.aria-label]="'Deduction ' + (i + 1) + ' amount'"></span>
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
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="refundAmount"></span>
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
          <button type="submit" form="deposit-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
          <button type="button" class="btn btn-secondary" (click)="mode.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .owed { color: var(--danger); }
    /* Wide enough for "Partially refunded"; each figure may shrink, so a chip never spills past the card. */
    .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: var(--space-2) var(--space-4); margin: 0; }
    .figures div { display: grid; gap: var(--space-0-5); min-width: 0; }
    .figures dt { font-size: var(--text-xs); color: var(--text-muted); }
    .figures dd { margin: 0; display: flex; gap: var(--space-1-5); flex-wrap: wrap; }
    .history summary { cursor: pointer; font-weight: var(--weight-semibold); }
    .history[open] summary { margin-bottom: var(--space-2); }
    .deductions { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
    .deductions legend { font-weight: var(--weight-semibold); margin-bottom: var(--space-1); }
    .deduction { display: grid; grid-template-columns: 1fr 8rem auto; gap: var(--space-2); align-items: center; }
    .add-deduction { justify-self: start; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDepositsComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();
  /** Their room (or intended room) — whose deposit terms prefill a new deposit. */
  readonly roomId = input<number | null>(null);
  /** The deposit agreed for this tenant, when the page knows it; preferred over the room's. */
  readonly agreedDeposit = input<number | string | null>(null);

  private readonly housing = inject(HousingService);

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
    return mode === 'open' ? 'Record deposit payment' : mode === 'receipt' ? 'Record deposit payment' : 'Refund deposit';
  }

  /** Set when the deductions came from a completed move-out inspection. */
  readonly fromInspection = signal(false);
  private readonly moveOut = inject(MoveOutService);
  readonly inspectionLink = computed(() => RoutePaths.tenantMoveOut(this.agencyId(), this.buildingId(), this.tenantId()));

  /** A completed inspection's charges become the deductions; the landlord can still change them. */
  private async prefillFromInspection(): Promise<void> {
    this.fromInspection.set(false);
    try {
      const inspection = await firstValueFrom(this.moveOut.get(this.agencyId(), this.buildingId(), this.tenantId()));
      const charged = inspection.status === 'COMPLETED' ? inspection.items.filter((item) => Number(item.charge) > 0) : [];
      if (charged.length === 0 || this.mode() !== 'refund' || this.deductions.length > 0) {
        return;
      }
      for (const item of charged) {
        const row = this.deductionGroup();
        row.setValue({ reason: [item.area, item.note].filter(Boolean).join(': '), amount: Number(item.charge) });
        this.deductions.push(row);
      }
      this.fromInspection.set(true);
    } catch {
      // No inspection, or it could not be read: deductions are entered by hand as before.
    }
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
      void this.prefillAgreed();
    } else if (mode === 'receipt') {
      this.receiptForm.reset({ amount: this.toNumber(deposit?.balanceDue) || null, transactionDate: todayIso(), paymentMethod: 'MPESA', referenceNumber: '' });
    } else {
      this.deductions.clear();
      this.refundForm.reset({ refundAmount: this.toNumber(deposit?.heldAmount), transactionDate: todayIso(), paymentMethod: 'MPESA', referenceNumber: '', notes: '' });
      void this.prefillFromInspection();
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

  /**
   * The deposit the room asks for — its own, else its building's, else the
   * agency's — as both the agreed amount and the amount received. Either can
   * be changed before saving.
   */
  private async prefillAgreed(): Promise<void> {
    // The tenant's own agreement first: it is what they were offered, and may differ from the room.
    const agreed = Number(this.agreedDeposit());
    if (Number.isFinite(agreed) && agreed > 0) {
      this.openForm.patchValue({ expectedAmount: agreed, amount: agreed });
      return;
    }

    const roomId = this.roomId();
    if (!roomId) {
      return;
    }
    try {
      const terms = await firstValueFrom(this.housing.getRoomEffectiveTerms(this.agencyId(), this.buildingId(), roomId));
      const deposit = Number(terms.securityDeposit);
      if (Number.isFinite(deposit) && deposit > 0 && this.mode() === 'open' && this.openForm.pristine) {
        this.openForm.patchValue({ expectedAmount: deposit, amount: deposit });
      }
    } catch {
      // Blank still works: the server falls back to the lease or the room's terms.
    }
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

  async load(agencyId: number, buildingId: number, tenantId: number): Promise<void> {
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
