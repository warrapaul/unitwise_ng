import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { formatCurrency, monthLabel } from '../../../shared/utils/format.util';
import { RoomPaymentStatus } from '../models/rent.models';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { mpesaCodeRequired, paymentReferenceSpec, paymentReferenceValidator } from '../payment-reference';
import { PaymentMessageFieldComponent } from '../components/payment-message-field.component';
import { ReadMessageResult } from '../reconciliation.models';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { thisMonthIso, todayIso } from '../../../shared/utils/date.util';
import { toMonthPath } from '../models/rent.models';
import { ChangeDetectionStrategy, Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { CreateRentPaymentRequest } from '../models/rent.models';

/**
 * Records a rent payment against a tenant in the building in context.
 *
 * `RentService.createPayment` existed with no page: an agency admin holding
 * RENT_PAYMENT_CREATE could read payments but never enter one, which is the
 * single most routine thing the role does.
 */
@Component({
  selector: 'app-rent-payment-form-page',
  standalone: true,
  imports: [MoneyInputDirective, 
    ReactiveFormsModule,
    RouterLink,
    ContextGuardComponent,
    SectionCardComponent,
    EntityPickerComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    FormFeedbackDirective,
    PaymentMessageFieldComponent
  ],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="true" [requirePermission]="Permissions.RENT_PAYMENT_CREATE">
        <app-section-card
          title="Record a rent payment"
          [subtitle]="context.active().buildingName ? 'For ' + context.active().buildingName : null"
        >

          <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <!-- Paste the M-Pesa message and the amount, code, date and (from the account number or phone) the tenant fill in. -->
            @if (context.agencyId(); as agencyId) {
              <details class="autofill">
                <summary>Autofill from M-Pesa message</summary>
                <app-payment-message-field [agencyId]="agencyId" (read)="prefill($event)" />
              </details>
            }
            <div class="grid-auto">
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker
                  [config]="pickers.tenant"
                  [required]="true"
                  formControlName="tenantId"
                  placeholder="Search for the tenant"
                />
                <app-field-error [control]="form.controls.tenantId" label="Tenant" />
              </label>
              <label class="field">
                <span>For month</span>
                <input type="month" formControlName="paymentForMonth">
                <app-field-error [control]="form.controls.paymentForMonth" label="Payment month" />
              </label>
              <label class="field">
                <span>Amount paid</span>
                <span class="input-prefix"><span class="input-prefix__unit">KES</span>
                  <input appMoneyInput formControlName="amountPaid"></span>
                <app-field-error [control]="form.controls.amountPaid" label="Amount paid" />
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
                <!-- Follows the method, as in the record-payment dialog. -->
                <span>{{ reference().label }}</span>
                <input formControlName="receiptNumber" [placeholder]="reference().placeholder"
                       [class.uppercase]="reference().upper" (input)="normaliseReference()">
                @if (form.controls.receiptNumber.errors?.['referencePattern']; as message) {
                  @if (form.controls.receiptNumber.touched) { <small class="error-text">{{ message }}</small> }
                } @else if (reference().hint; as hint) {
                  <small class="hint">{{ hint }}</small>
                }
              </label>
              <label class="field">
                <span>Payment date</span>
                <input type="date" formControlName="paymentDate">
                <app-field-error [control]="form.controls.paymentDate" label="Payment date" />
              </label>
              <label class="field">
                <span>Late fee</span>
                <span class="input-prefix"><span class="input-prefix__unit">KES</span>
                  <input appMoneyInput formControlName="lateFee"></span>
                <small class="hint">Added to this month's bill, on top of the rent. Leave empty if there is none.</small>
              </label>
              <label class="field field--full">
                <span>Notes</span>
                <textarea formControlName="notes" rows="2"></textarea>
              </label>
            </div>

            <!-- Read back once a tenant is chosen: where they live and what the payment does to their balance. -->
            @if (tenantIdValue() !== null) {
              <div class="tenant-facts" role="status">
                @if (tenantRoom(); as room) {
                  <p><strong>Room {{ room.roomName || room.roomNumber }}</strong> · {{ monthText() }}</p>
                  @if (room.rentRecordGenerated === false) {
                    <p class="muted">Not billed for this month yet.</p>
                  } @else {
                    <p>Balance: <strong>{{ money(room.outstanding) }}</strong> of {{ money(room.totalDue) }}</p>
                    @if (balanceAfter() !== null) {
                      @if (balanceAfter()! > 0) {
                        <p class="muted">Part payment: {{ money(balanceAfter()) }} will still be owed.</p>
                      } @else if (balanceAfter()! < 0) {
                        <p class="muted">{{ money(-balanceAfter()!) }} over the balance, carried forward as credit.</p>
                      } @else {
                        <p class="muted">Clears the month.</p>
                      }
                    }
                  }
                  @if ((room.oldestOverdueDays ?? 0) > 0) {
                    <p class="muted">Oldest unpaid bill: {{ room.oldestOverdueDays }} {{ room.oldestOverdueDays === 1 ? 'day' : 'days' }} late.</p>
                  }
                } @else if (roomsLoading()) {
                  <p class="muted">Looking up their balance...</p>
                } @else {
                  <p class="muted">No room in this building for that month.</p>
                }
              </div>
            }

            @if (saveError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'This payment is already recorded' : 'Unable to record the payment'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                {{ saving() ? 'Recording...' : 'Record payment' }}
              </button>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.rentPayments">Cancel</a>
            </div>
          </form>
        </app-section-card>
      </app-context-guard>
    </section>
  `,
  styles: [`
    .tenant-facts { display: grid; gap: var(--space-1); padding: var(--space-2-5) var(--space-3); border-radius: var(--radius-sm); background: var(--surface-2); }
    .tenant-facts p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentPaymentFormPageComponent implements HasUnsavedChanges {
  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  /** What the reference field asks for, by payment method. */
  readonly reference = computed(() => paymentReferenceSpec(this.methodValue()));

  normaliseReference(): void {
    if (this.reference().upper) {
      const control = this.form.controls.receiptNumber;
      const upper = control.value.toUpperCase();
      if (upper !== control.value) {
        control.setValue(upper, { emitEvent: false });
      }
    }
  }
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly context = inject(ActiveContextService);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rent = inject(RentService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    tenantId: [null as number | null, [Validators.required]],
    amountPaid: [null as number | null, [Validators.required, Validators.min(0)]],
    paymentDate: [todayIso(), [Validators.required]],
    paymentForMonth: [thisMonthIso(), [Validators.required]],
    paymentMethod: ['MPESA', [Validators.required]],
    lateFee: [null as number | null, [Validators.min(0)]],
    receiptNumber: ['', [mpesaCodeRequired(), paymentReferenceValidator()]],
    notes: ['']
  });

  readonly tenantIdValue = toSignal(this.form.controls.tenantId.valueChanges, { initialValue: this.form.controls.tenantId.value });
  private readonly monthValue = toSignal(this.form.controls.paymentForMonth.valueChanges, { initialValue: this.form.controls.paymentForMonth.value });
  private readonly amountValue = toSignal(this.form.controls.amountPaid.valueChanges, { initialValue: this.form.controls.amountPaid.value });
  private readonly monthRooms = signal<RoomPaymentStatus[]>([]);
  readonly roomsLoading = signal(false);
  private roomsRequest = 0;

  readonly tenantRoom = computed(() => this.monthRooms().find((room) => room.tenantId === this.tenantIdValue()) ?? null);
  readonly monthText = computed(() => monthLabel(this.monthValue()));
  /** Negative is credit. Null until there is a bill and an amount to compare. */
  readonly balanceAfter = computed(() => {
    const room = this.tenantRoom();
    const paid = this.amountValue();
    return room && paid !== null && paid !== undefined
      ? Math.round((Number(room.outstanding ?? 0) - Number(paid)) * 100) / 100
      : null;
  });

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  private async loadMonthRooms(agencyId: number, buildingId: number, month: string): Promise<void> {
    const request = ++this.roomsRequest;
    this.roomsLoading.set(true);
    try {
      const page = await firstValueFrom(this.rent.getRoomPaymentStatuses(agencyId, buildingId, month, { page: 0, size: 200 }));
      if (request === this.roomsRequest) {
        this.monthRooms.set(page.items ?? []);
      }
    } catch {
      // Only a read-back: the payment can still be recorded without it.
      if (request === this.roomsRequest) {
        this.monthRooms.set([]);
      }
    } finally {
      if (request === this.roomsRequest) {
        this.roomsLoading.set(false);
      }
    }
  }

  private readonly methodValue = toSignal(this.form.controls.paymentMethod.valueChanges, { initialValue: this.form.controls.paymentMethod.value });
  private readonly revalidateReference = this.form.controls.paymentMethod.valueChanges.pipe(takeUntilDestroyed())
    .subscribe(() => this.form.controls.receiptNumber.updateValueAndValidity());

  /**
   * Fills the form from a pasted message. A tenant found in another building switches the
   * building first: payments are recorded within the building in context.
   */
  prefill(read: ReadMessageResult): void {
    const controls = this.form.controls;
    if (read.method) { controls.paymentMethod.setValue(read.method); }
    if (read.reference) { controls.receiptNumber.setValue(read.reference.toUpperCase()); }
    if (read.amount) { controls.amountPaid.setValue(Number(read.amount)); }
    if (read.paidOn) { controls.paymentDate.setValue(read.paidOn); }
    if (read.tenant) {
      if (read.tenant.buildingId !== this.context.buildingId()) {
        this.context.selectBuilding(read.tenant.buildingId, read.tenant.buildingName ?? null);
      }
      controls.tenantId.setValue(read.tenant.tenantId);
    }
    if (read.payerName && !controls.notes.value) {
      controls.notes.setValue(`Paid by ${read.payerName}${read.payerPhone ? ' (' + read.payerPhone + ')' : ''}`);
    }
  }

  constructor() {
    effect(() => {
      const scope = this.context.active();
      const month = this.monthValue();
      if (scope.agencyId !== null && scope.buildingId !== null && month) {
        const [agencyId, buildingId] = [scope.agencyId, scope.buildingId];
        untracked(() => void this.loadMonthRooms(agencyId, buildingId, month));
      }
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const scope = this.context.active();
    const value = this.form.getRawValue();
    if (scope.agencyId === null || scope.buildingId === null || value.tenantId === null || value.amountPaid === null) {
      return;
    }

    const request: CreateRentPaymentRequest = {
      tenantId: value.tenantId,
      amountPaid: value.amountPaid,
      paymentDate: value.paymentDate,
      paymentForMonth: toMonthPath(value.paymentForMonth),
      paymentMethod: value.paymentMethod as CreateRentPaymentRequest['paymentMethod'],
      lateFee: value.lateFee,
      receiptNumber: value.receiptNumber || null,
      notes: value.notes || null
    };

    this.saving.set(true);
    this.saveError.set(null);

    try {
      const created = await firstValueFrom(this.rent.createPayment(scope.agencyId, scope.buildingId, request));
      this.form.markAsPristine();
      await this.router.navigateByUrl(RoutePaths.rentPaymentDetail(scope.agencyId, scope.buildingId, created.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
