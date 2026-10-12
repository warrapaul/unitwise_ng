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

type AdjustmentAction = 'charge' | 'waive' | 'adjust';

@Component({
  selector: 'app-rent-adjustment-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
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
          <!-- What this page is for, in one line, so it can be pointed to from billing. -->
          <p class="hint">
            Between the month's bills being created and being confirmed: add a charge to one or more rooms,
            waive a charge for them, or change a charge's amount. Every change is recorded below.
          </p>

          <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <!-- Three to a row on a wide screen, two on a phone: the answers are short. -->
            <div class="adjust-grid">
              <label class="field">
                <span>Action</span>
                <select [value]="action()" (change)="onActionChange($event)">
                  <option value="charge">Add a charge</option>
                  <option value="waive">Waive a charge</option>
                  <option value="adjust">Change a charge's amount</option>
                </select>
              </label>

              @if (action() === 'adjust') {
                <label class="field">
                  <span>Charge ID</span>
                  <input type="number" min="1" formControlName="chargeId">
                  @if (form.controls.chargeId.invalid && form.controls.chargeId.touched) {
                    <small class="error-text">A charge ID is required.</small>
                  }
                </label>
                <label class="field">
                  <span>New amount</span>
                  <input type="number" step="0.01" min="0" formControlName="newAmount">
                  @if (form.controls.newAmount.invalid && form.controls.newAmount.touched) {
                    <small class="error-text">A new amount is required.</small>
                  }
                </label>
              } @else {
                <label class="field">
                  <span>Charge</span>
                  <!-- The platform's list keeps recurring names spelled one way; Other takes anything. -->
                  <select [value]="chargeChoice()" (change)="onChargeChoice($any($event.target).value)">
                    <option value="" disabled>Choose a charge</option>
                    @for (name of catalogCharges(); track name) { <option [value]="name">{{ name }}</option> }
                    <option value="__OTHER__">Other…</option>
                  </select>
                  @if (chargeChoice() !== '__OTHER__' && form.controls.name.invalid && form.controls.name.touched) {
                    <small class="error-text">Choose a charge.</small>
                  }
                </label>
                @if (chargeChoice() === '__OTHER__') {
                  <label class="field">
                    <span>Charge name</span>
                    <input formControlName="name" placeholder="e.g. Repairs levy">
                    @if (form.controls.name.invalid && form.controls.name.touched) {
                      <small class="error-text">Name the charge.</small>
                    }
                  </label>
                }
                <label class="field">
                  <span>Billed month</span>
                  <input type="month" formControlName="billedMonth">
                  @if (form.controls.billedMonth.invalid && form.controls.billedMonth.touched) {
                    <small class="error-text">Choose the month to bill.</small>
                  }
                </label>
                @if (action() === 'charge') {
                  <label class="field">
                    <span>Amount (KES)</span>
                    <input type="number" step="0.01" min="0.01" formControlName="amount">
                    @if (form.controls.amount.invalid && form.controls.amount.touched) {
                      <small class="error-text">An amount is required.</small>
                    }
                  </label>
                }
              }

            </div>

            <!-- Reason and notes share a row on a wide screen: both optional, both short. -->
            <div class="notes-row">
              <label class="field">
                <span>Reason <span class="muted">(optional)</span></span>
                <input formControlName="reason" placeholder="The charge name is usually enough">
              </label>
              <label class="field">
                <span>Notes <span class="muted">(optional)</span></span>
                <textarea formControlName="notes" rows="1"></textarea>
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
    .adjust-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem 0.9rem; align-items: start; }
    .adjust-grid .field input, .adjust-grid .field select { width: 100%; max-width: none; }
    @media (max-width: 760px) { .adjust-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem 0.6rem; } }
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    /* The buttons sit beside the label they act on, not at the far edge of the row. */
    .room-pick__head {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .notes-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem 0.9rem; margin-top: 1rem; }
    .notes-row .field input, .notes-row .field textarea { width: 100%; max-width: none; }
    @media (max-width: 760px) { .notes-row { grid-template-columns: minmax(0, 1fr); } }

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
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);

  readonly catalogCharges = toSignal(this.rentService.getChargeCatalog().pipe(
    map((items) => items.map((item) => item.name)),
    catchError(() => of([] as string[]))
  ), { initialValue: [] as string[] });
  private readonly context = inject(ActiveContextService);

  readonly scope = this.context.active;
  readonly action = signal<AdjustmentAction>('charge');
  /** The charge chosen from the list, or '__OTHER__' when typing one. */
  readonly chargeChoice = signal('');

  readonly submitting = signal(false);
  readonly submitError = signal<ApiError | null>(null);
  readonly bulkResult = signal<BulkAdjustmentResult | null>(null);
  readonly notice = signal<string | null>(null);

  readonly isBulk = computed(() => this.action() === 'charge' || this.action() === 'waive');
  readonly roomOptions = signal<SelectOption[]>([]);
  readonly roomsLoading = signal(false);
  readonly roomsError = signal<string | null>(null);

  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);
  readonly history = signal<AdjustmentDetail[]>([]);

  readonly form = this.formBuilder.group({
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
    this.applyValidators('charge');
    // Rooms are part of adding or waiving, which the page opens on.
    queueMicrotask(() => void this.loadRooms());
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

  onChargeChoice(value: string): void {
    this.chargeChoice.set(value);
    this.form.controls.name.setValue(value === '__OTHER__' ? '' : value);
    this.form.controls.name.markAsTouched();
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
        case 'adjust':
          await firstValueFrom(this.rentService.adjustCharge(scope.agencyId, scope.buildingId, {
            chargeId: value.chargeId!,
            newAmount: value.newAmount!,
            reason: value.reason || null,
            notes: value.notes || null
          }));
          this.notice.set('Charge adjusted.');
          break;

        case 'charge':
          this.bulkResult.set(await firstValueFrom(this.rentService.bulkCharge(scope.agencyId, scope.buildingId, {
            tenantIds: value.tenantIds,
            name: value.name,
            amount: value.amount!,
            reason: value.reason || null,
            notes: value.notes || null,
            billedMonth: value.billedMonth
          })));
          break;

        case 'waive':
          this.bulkResult.set(await firstValueFrom(this.rentService.bulkWaive(scope.agencyId, scope.buildingId, {
            tenantIds: value.tenantIds,
            billedMonth: value.billedMonth,
            chargeName: value.name,
            reason: value.reason || null,
            notes: value.notes || null
          })));
          break;
      }

      // Done: clear what was entered for the next one. The action and month stay — the next
      // adjustment is usually of the same kind, for the same month.
      this.form.reset({
        ...this.form.getRawValue(),
        tenantIds: [],
        chargeId: null,
        name: '',
        amount: null,
        newAmount: null,
        reason: '',
        notes: ''
      });
      this.chargeChoice.set('');
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

    controls.tenantIds.setValidators(action === 'charge' || action === 'waive' ? [nonEmptyList] : []);
    controls.chargeId.setValidators(action === 'adjust' ? [Validators.required, Validators.min(1)] : []);
    controls.name.setValidators(action === 'adjust' ? [] : [Validators.required]);
    controls.amount.setValidators(action === 'charge' ? [Validators.required, Validators.min(0.01)] : []);
    controls.newAmount.setValidators(action === 'adjust' ? [Validators.required, Validators.min(0)] : []);
    controls.billedMonth.setValidators(action === 'adjust' ? [] : [Validators.required]);
    controls.reason.setValidators([Validators.maxLength(500)]);

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
