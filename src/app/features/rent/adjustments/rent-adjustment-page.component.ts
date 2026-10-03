import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { distinctUntilChanged, firstValueFrom, map, catchError, of } from 'rxjs';
import { MultiSelectComponent } from '../../../shared/components/multi-select/multi-select.component';
import { SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ContextSwitcherComponent } from '../../../shared/components/context-switcher/context-switcher.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { AdjustmentDetail, BulkAdjustmentResult } from '../models/rent.models';

/** `Validators.required` passes an empty array, so a bulk action needs its own check. */
function nonEmptyList(control: AbstractControl): ValidationErrors | null {
  return Array.isArray(control.value) && control.value.length > 0 ? null : { required: true };
}

type AdjustmentAction = 'one-off' | 'waive' | 'adjust' | 'bulk-charge' | 'bulk-waive';

@Component({
  selector: 'app-rent-adjustment-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    EntityPickerComponent,
    ErrorCardComponent,
    ContextSwitcherComponent,
    ContextGuardComponent,
    FilterPanelComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    MultiSelectComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Rent adjustments">
        <app-context-switcher />
      </app-section-card>

      <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">

      @if (!scope()) {
        <app-empty-state title="Select a building" description="Adjustments are applied per building." />
      } @else {
        <app-section-card title="Apply an adjustment">
          <label class="field">
            <span>Action</span>
            <select [value]="action()" (change)="onActionChange($event)">
              <option value="one-off">Add a one-off charge</option>
              <option value="waive">Waive a charge</option>
              <option value="adjust">Adjust a charge amount</option>
              <option value="bulk-charge">Charge selected rooms</option>
              <option value="bulk-waive">Waive for selected rooms</option>
            </select>
          </label>

          <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <div class="grid-auto">
              @if (action() === 'one-off') {
                <label class="field">
                  <span>Tenant</span>
                  <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Search for the tenant" />
                  @if (form.controls.tenantId.invalid && form.controls.tenantId.touched) {
                    <small class="error-text">Choose a tenant.</small>
                  }
                </label>
              }


              @if (action() === 'waive' || action() === 'adjust') {
                <label class="field">
                  <span>Charge ID</span>
                  <input type="number" min="1" formControlName="chargeId">
                  @if (form.controls.chargeId.invalid && form.controls.chargeId.touched) {
                    <small class="error-text">A charge ID is required.</small>
                  }
                </label>
              }

              @if (action() === 'one-off' || action() === 'bulk-charge' || action() === 'bulk-waive') {
                <label class="field">
                  <span>Charge name</span>
                  <!-- Any name will do for a one-off; the platform list is offered so recurring ones stay spelled one way. -->
                  <input formControlName="name" placeholder="Repairs levy" list="catalog-charges">
                  <datalist id="catalog-charges">
                    @for (name of catalogCharges(); track name) { <option [value]="name"></option> }
                  </datalist>
                  @if (form.controls.name.invalid && form.controls.name.touched) {
                    <small class="error-text">A charge name is required.</small>
                  }
                </label>
                <label class="field">
                  <span>Billed month</span>
                  <input type="month" formControlName="billedMonth">
                  @if (form.controls.billedMonth.invalid && form.controls.billedMonth.touched) {
                    <small class="error-text">Choose the month to bill.</small>
                  }
                </label>
              }

              @if (action() === 'one-off' || action() === 'bulk-charge') {
                <label class="field">
                  <span>Amount</span>
                  <input type="number" step="0.01" min="0.01" formControlName="amount">
                  @if (form.controls.amount.invalid && form.controls.amount.touched) {
                    <small class="error-text">An amount is required and cannot be negative.</small>
                  }
                </label>
              }

              @if (action() === 'adjust') {
                <label class="field">
                  <span>New amount</span>
                  <input type="number" step="0.01" min="0" formControlName="newAmount">
                  @if (form.controls.newAmount.invalid && form.controls.newAmount.touched) {
                    <small class="error-text">A new amount is required.</small>
                  }
                </label>
              }

              <label class="field">
                <span>Reason</span>
                <input formControlName="reason">
                @if (form.controls.reason.invalid && form.controls.reason.touched) {
                  <small class="error-text">A reason is required for the audit trail.</small>
                }
              </label>
            </div>

            <!--
              Occupied rooms in the building for the billed month, picked by room
              and tenant name. Select all covers the whole building; untick the
              ones it should not reach.
            -->
            @if (isBulk()) {
              <div class="field room-pick">
                <div class="room-pick__head">
                  <span>Rooms ({{ form.controls.tenantIds.value.length }} of {{ roomOptions().length }} selected)</span>
                  <div class="room-pick__bulk">
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="roomOptions().length === 0" (click)="selectAllRooms()">Select all</button>
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="form.controls.tenantIds.value.length === 0" (click)="clearRooms()">Clear</button>
                  </div>
                </div>
                @if (roomsLoading()) {
                  <app-loading-state [compact]="true" label="Loading rooms..." />
                } @else if (roomsError()) {
                  <app-error-state [message]="roomsError()!" (retry)="loadRooms()" />
                } @else {
                  <app-multi-select formControlName="tenantIds" [options]="roomOptions()"
                                    searchPlaceholder="Filter by room or tenant"
                                    emptyMessage="No occupied rooms in this building for that month." />
                }
                @if (form.controls.tenantIds.invalid && form.controls.tenantIds.touched) {
                  <small class="error-text">Select at least one room.</small>
                }
              </div>
            }

            <label class="field field--wide">
              <span>Notes</span>
              <textarea formControlName="notes" rows="2"></textarea>
            </label>

            @if (submitError(); as apiError) {
              <app-error-card title="Unable to apply adjustment" [message]="apiError.message" [details]="apiError.details" />
            }

            @if (bulkResult(); as result) {
              <section class="alert" [class.alert-success]="!result.failed" [class.alert-error]="!!result.failed" role="status">
                <strong>{{ result.succeeded ?? 0 }} of {{ result.totalRequested ?? 0 }} applied</strong>
                @if (result.bulkReference) {
                  <p class="mono">Reference {{ result.bulkReference }}</p>
                }
                @if ((result.errors ?? []).length > 0) {
                  <ul>
                    @for (message of result.errors ?? []; track message) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                }
              </section>
            }

            @if (notice()) {
              <section class="alert alert-success" role="status">{{ notice() }}</section>
            }

            <div class="button-row">
              <app-permission-gate [permissions]="[Permissions.RENT_ARREAR_WRITE]">
                <button type="submit" class="btn btn-primary" [disabled]="submitting()">
                  {{ submitting() ? 'Applying...' : 'Apply adjustment' }}
                </button>
              </app-permission-gate>
            </div>
          </form>
        </app-section-card>

        <app-section-card title="Adjustment history">
          <app-filter-panel actions [form]="historyForm" [scopeControls]=\"['month']\">
            <form class="filters" [formGroup]="historyForm" appFormFeedback (ngSubmit)="loadHistory()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Month</span><input type="month" formControlName="month"></label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-secondary">Load history</button>
              </div>
            </form>
          </app-filter-panel>

          @if (historyLoading()) {
            <app-loading-state label="Loading history..." />
          } @else if (historyError()) {
            <app-error-state [message]="historyError()!" (retry)="loadHistory()" />
          } @else if (history().length === 0) {
            <app-empty-state title="No adjustments" description="Nothing was adjusted in that month." />
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Type</th><th>Original</th><th>Adjusted</th><th>Delta</th><th>Reason</th><th>By</th><th>When</th></tr>
                </thead>
                <tbody>
                  @for (adjustment of history(); track adjustment.id) {
                    <tr>
                      <td>
                        {{ adjustment.adjustmentTypeLabel || adjustment.adjustmentType || '-' }}
                        @if (adjustment.isBulk) {
                          <span class="status-chip status-chip--info">Bulk</span>
                        }
                      </td>
                      <td>{{ adjustment.originalAmount ?? '-' }}</td>
                      <td>{{ adjustment.adjustedAmount ?? '-' }}</td>
                      <td>{{ adjustment.delta ?? '-' }}</td>
                      <td>{{ adjustment.reason || '-' }}</td>
                      <td>{{ adjustment.performedByName || '-' }}</td>
                      <td>{{ formatDateTime(adjustment.performedAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

          }
        </app-section-card>
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .room-pick__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .room-pick__bulk {
      display: flex;
      gap: 0.4rem;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }

    .alert ul {
      margin: 0.5rem 0 0;
      padding-left: 1.1rem;
      font-size: 0.88rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentAdjustmentPageComponent {
  readonly Permissions = PermissionConstants;
  readonly pickers = inject(EntityPickerRegistry);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);

  readonly catalogCharges = toSignal(this.rentService.getChargeCatalog().pipe(
    map((items) => items.map((item) => item.name)),
    catchError(() => of([] as string[]))
  ), { initialValue: [] as string[] });
  private readonly context = inject(ActiveContextService);

  readonly scope = this.context.active;
  readonly action = signal<AdjustmentAction>('one-off');

  readonly submitting = signal(false);
  readonly submitError = signal<ApiError | null>(null);
  readonly bulkResult = signal<BulkAdjustmentResult | null>(null);
  readonly notice = signal<string | null>(null);

  readonly isBulk = computed(() => this.action() === 'bulk-charge' || this.action() === 'bulk-waive');
  readonly roomOptions = signal<SelectOption[]>([]);
  readonly roomsLoading = signal(false);
  readonly roomsError = signal<string | null>(null);

  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);
  readonly history = signal<AdjustmentDetail[]>([]);

  readonly form = this.formBuilder.group({
    tenantId: [null as number | null],
    tenantIds: [[] as number[]],
    chargeId: [null as number | null],
    name: '',
    amount: [null as number | null],
    newAmount: [null as number | null],
    billedMonth: this.currentMonth(),
    reason: '',
    notes: ''
  });

  readonly historyForm = this.formBuilder.group({
    month: this.currentMonth()
  });

  constructor() {
    this.applyValidators('one-off');
    effect(() => {
      const scope = this.scope();
      if (scope.agencyId !== null && scope.buildingId !== null) {
        void this.loadHistory();
        if (untracked(this.isBulk)) {
          void untracked(() => this.loadRooms());
        }
      }
    });

    // Who lives where depends on the month being billed.
    this.form.controls.billedMonth.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        if (this.isBulk()) {
          void this.loadRooms();
        }
      });
  }

  onActionChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const action = target.value as AdjustmentAction;
    this.action.set(action);
    this.submitError.set(null);
    this.bulkResult.set(null);
    this.notice.set(null);
    this.applyValidators(action);
    if (this.isBulk() && this.roomOptions().length === 0) {
      void this.loadRooms();
    }
  }


  async submit(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.bulkResult.set(null);
    this.notice.set(null);

    const value = this.form.getRawValue();

    try {
      switch (this.action()) {
        case 'one-off':
          await firstValueFrom(this.rentService.addOneOffCharge(scope.agencyId, scope.buildingId, {
            tenantId: value.tenantId!,
            name: value.name,
            amount: value.amount!,
            reason: value.reason || null,
            notes: value.notes || null,
            billedMonth: value.billedMonth
          }));
          this.notice.set('Charge added.');
          break;

        case 'waive':
          await firstValueFrom(this.rentService.waiveCharge(scope.agencyId, scope.buildingId, {
            chargeId: value.chargeId!,
            reason: value.reason || null,
            notes: value.notes || null
          }));
          this.notice.set('Charge waived.');
          break;

        case 'adjust':
          await firstValueFrom(this.rentService.adjustCharge(scope.agencyId, scope.buildingId, {
            chargeId: value.chargeId!,
            newAmount: value.newAmount!,
            reason: value.reason || null,
            notes: value.notes || null
          }));
          this.notice.set('Charge adjusted.');
          break;

        case 'bulk-charge':
          this.bulkResult.set(await firstValueFrom(this.rentService.bulkCharge(scope.agencyId, scope.buildingId, {
            tenantIds: value.tenantIds,
            name: value.name,
            amount: value.amount!,
            reason: value.reason || null,
            notes: value.notes || null,
            billedMonth: value.billedMonth
          })));
          break;

        case 'bulk-waive':
          this.bulkResult.set(await firstValueFrom(this.rentService.bulkWaive(scope.agencyId, scope.buildingId, {
            tenantIds: value.tenantIds,
            billedMonth: value.billedMonth,
            chargeName: value.name,
            reason: value.reason || null,
            notes: value.notes || null
          })));
          break;
      }

      await this.loadHistory();
    } catch (error) {
      this.submitError.set(toApiError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  async loadHistory(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    this.historyLoading.set(true);
    this.historyError.set(null);

    try {
      const result = await firstValueFrom(this.rentService.getMonthAdjustmentHistory(
        scope.agencyId,
        scope.buildingId,
        this.historyForm.getRawValue().month
      ));
      this.history.set(result);
    } catch (error) {
      this.historyError.set(extractErrorMessage(error));
    } finally {
      this.historyLoading.set(false);
    }
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDateTime(date);
  }

  private applyValidators(action: AdjustmentAction): void {
    const controls = this.form.controls;

    controls.tenantId.setValidators(action === 'one-off' ? [Validators.required, Validators.min(1)] : []);
    controls.tenantIds.setValidators(action === 'bulk-charge' || action === 'bulk-waive' ? [nonEmptyList] : []);
    controls.chargeId.setValidators(action === 'waive' || action === 'adjust' ? [Validators.required, Validators.min(1)] : []);
    controls.name.setValidators(action === 'waive' || action === 'adjust' ? [] : [Validators.required]);
    controls.amount.setValidators(action === 'one-off' || action === 'bulk-charge' ? [Validators.required, Validators.min(0.01)] : []);
    controls.newAmount.setValidators(action === 'adjust' ? [Validators.required, Validators.min(0)] : []);
    controls.billedMonth.setValidators(action === 'waive' || action === 'adjust' ? [] : [Validators.required]);
    controls.reason.setValidators([Validators.required, Validators.maxLength(500)]);

    for (const control of Object.values(controls)) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  async loadRooms(): Promise<void> {
    const scope = this.scope();
    const month = this.form.controls.billedMonth.value;
    if (scope.agencyId === null || scope.buildingId === null || !month) {
      return;
    }

    this.roomsLoading.set(true);
    this.roomsError.set(null);

    try {
      const result = await firstValueFrom(this.rentService.getRoomPaymentStatuses(scope.agencyId, scope.buildingId, month, {
        page: 0,
        size: 500,
        sort: ['roomName,asc']
      }));
      const options = result.items
        .filter((room) => room.isOccupied && room.tenantId)
        .map((room) => ({
          value: room.tenantId!,
          label: `${room.roomName || (room.roomNumber ? 'Room ' + room.roomNumber : 'Room')} · ${room.tenantName || 'Tenant'}`
        }));
      this.roomOptions.set(options);

      // A tenant who is not in the building that month cannot stay selected.
      const present = new Set(options.map((option) => option.value));
      const kept = this.form.controls.tenantIds.value.filter((id) => present.has(id));
      this.form.controls.tenantIds.setValue(kept);
    } catch (error) {
      this.roomsError.set(extractErrorMessage(error));
    } finally {
      this.roomsLoading.set(false);
    }
  }

  selectAllRooms(): void {
    this.form.controls.tenantIds.setValue(this.roomOptions().map((option) => option.value));
    this.form.controls.tenantIds.markAsTouched();
  }

  clearRooms(): void {
    this.form.controls.tenantIds.setValue([]);
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
