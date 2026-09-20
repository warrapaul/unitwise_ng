import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ContextSwitcherComponent } from '../../../shared/components/context-switcher/context-switcher.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { BulkMeterReadingResult, PendingReadingTask, toMonthPath } from '../models/rent.models';

@Component({
  selector: 'app-meter-reading-page',
  standalone: true,
  imports: [
    PluralPipe,
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    ContextSwitcherComponent,
    ContextGuardComponent,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Meter readings">
        <app-context-switcher />

        <app-filter-panel actions [form]="monthForm" [scopeControls]=\"['month']\">
          <form class="filters" [formGroup]="monthForm" appFormFeedback (ngSubmit)="reload()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Month</span><input type="month" formControlName="month"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="!scope()">Load pending readings</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">

      @if (!scope()) {
        <app-empty-state title="Select a building" description="Readings are entered per building." />
      } @else {
        <app-section-card title="Apply one reading to everyone">
          <p class="hint">Use this when every unit shares a meter or the same flat consumption.</p>

          <form [formGroup]="uniformForm" appFormFeedback (ngSubmit)="applyUniform()">
            <div class="grid-auto">
              <label class="field">
                <span>Charge name</span>
                <input formControlName="chargeName" placeholder="Water">
                @if (uniformForm.controls.chargeName.invalid && uniformForm.controls.chargeName.touched) {
                  <small class="error-text">A charge name is required.</small>
                }
              </label>
              <label class="field"><span>Consumption</span><input type="number" step="0.01" min="0" formControlName="consumption"></label>
              <label class="field"><span>Amount</span><input type="number" step="0.01" min="0" formControlName="amount"></label>
              <label class="field">
                <span>Billing timing</span>
                <select formControlName="billingTiming">
                  <option value="PRIOR_MONTH_ARREARS">Prior month arrears</option>
                  <option value="CURRENT_MONTH">Current month</option>
                  <option value="ADVANCE">Advance</option>
                </select>
              </label>
              <label class="field">
                <span>Limit to tenant IDs</span>
                <input formControlName="tenantIds" placeholder="12, 18, 24">
                <small class="hint">Leave empty to apply to every tenant in the building.</small>
              </label>
            </div>

            @if (uniformError(); as apiError) {
              <app-error-card title="Unable to apply readings" [message]="apiError.message" [details]="apiError.details" />
            }

            @if (uniformResult(); as result) {
              <section class="alert" [class.alert-success]="!result.failed" [class.alert-error]="!!result.failed" role="status">
                <strong>{{ result.created ?? 0 }} created, {{ result.updated ?? 0 }} updated, {{ result.failed ?? 0 }} failed</strong>
                <p>{{ (result.remainingPendingCount ?? 0) | plural: 'reading' }} still pending.</p>
                @if ((result.errors ?? []).length > 0) {
                  <ul>
                    @for (message of result.errors ?? []; track message) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                }
              </section>
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="applyingUniform()">
                {{ applyingUniform() ? 'Applying...' : 'Apply reading' }}
              </button>
            </div>
          </form>
        </app-section-card>

        @if (loading()) {
          <app-loading-state label="Loading pending readings..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (tasks().length === 0) {
          <app-empty-state title="No pending readings" description="All caught up for this month." />
        } @else {
          <app-section-card title="Pending readings">
            <ng-container actions>
              <span class="muted">{{ tasks().length }} awaiting input</span>
            </ng-container>

            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Tenant</th>
                    <th>Room</th>
                    <th>Previous</th>
                    <th>Current reading</th>
                    <th>Rate</th>
                    <th class="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (task of tasks(); track task.chargeId) {
                    <tr>
                      <td>{{ task.chargeName || '-' }}</td>
                      <td>{{ task.tenantName || '-' }}</td>
                      <td>{{ task.roomName || '-' }}</td>
                      <td>{{ task.previousReading ?? '-' }}</td>
                      <td>
                        <input
                          class="reading-input"
                          type="number"
                          step="0.01"
                          min="0"
                          [value]="readings()[task.chargeId] ?? ''"
                          (input)="onReadingInput(task.chargeId, $event)"
                        >
                      </td>
                      <td>{{ task.unitRate ?? '-' }}{{ task.unit ? ' / ' + task.unit : '' }}</td>
                      <td class="actions-col">
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          [disabled]="savingChargeId() === task.chargeId || !readings()[task.chargeId]"
                          (click)="submitReading(task)"
                        >
                          {{ savingChargeId() === task.chargeId ? 'Saving...' : 'Save' }}
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (readingError(); as apiError) {
              <app-error-card title="Unable to save reading" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="button" class="btn btn-primary" [disabled]="savingBulk() || enteredCount() === 0" (click)="submitAll()">
                {{ savingBulk() ? 'Saving...' : 'Save all ' + enteredCount() + ' entered' }}
              </button>
            </div>

            @if (bulkResult(); as result) {
              <section class="alert" [class.alert-success]="!result.failed" [class.alert-error]="!!result.failed" role="status">
                <strong>{{ result.created ?? 0 }} created, {{ result.updated ?? 0 }} updated, {{ result.failed ?? 0 }} failed</strong>
                @if ((result.errors ?? []).length > 0) {
                  <ul>
                    @for (message of result.errors ?? []; track message) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                }
              </section>
            }
          </app-section-card>
        }
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .reading-input {
      max-width: 8rem;
      min-height: 2.4rem;
      padding-block: 0.45rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }

    .alert ul {
      margin: 0.5rem 0 0;
      padding-left: 1.1rem;
      font-size: 0.88rem;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeterReadingPageComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly context = inject(ActiveContextService);

  readonly scope = this.context.active;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tasks = signal<PendingReadingTask[]>([]);

  /** Current readings keyed by chargeId, as typed into the table. */
  readonly readings = signal<Record<number, number | null>>({});
  readonly savingChargeId = signal<number | null>(null);
  readonly readingError = signal<ApiError | null>(null);

  readonly savingBulk = signal(false);
  readonly bulkResult = signal<BulkMeterReadingResult | null>(null);

  readonly applyingUniform = signal(false);
  readonly uniformError = signal<ApiError | null>(null);
  readonly uniformResult = signal<BulkMeterReadingResult | null>(null);

  readonly monthForm = this.formBuilder.group({
    month: this.currentMonth()
  });

  readonly uniformForm = this.formBuilder.group({
    chargeName: ['', [Validators.required]],
    consumption: [null as number | null, [Validators.min(0)]],
    amount: [null as number | null, [Validators.min(0)]],
    billingTiming: 'PRIOR_MONTH_ARREARS',
    tenantIds: ''
  });

  enteredCount(): number {
    return Object.values(this.readings()).filter((value) => value !== null && value !== undefined).length;
  }

  onReadingInput(chargeId: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value === '' ? null : Number(target.value);
    this.readings.update((current) => ({ ...current, [chargeId]: value }));
  }


  async submitReading(task: PendingReadingTask): Promise<void> {
    const scope = this.scope();
    const currentReading = this.readings()[task.chargeId];
    if (scope.agencyId === null || scope.buildingId === null
      || currentReading === null || currentReading === undefined) {
      return;
    }

    this.savingChargeId.set(task.chargeId);
    this.readingError.set(null);

    try {
      await firstValueFrom(this.rentService.submitMeterReading(scope.agencyId, scope.buildingId, task.chargeId, {
        tenantId: task.tenantId,
        coversMonth: task.coversMonth ? toMonthPath(task.coversMonth) : toMonthPath(this.monthForm.getRawValue().month),
        chargeName: task.chargeName,
        billingTiming: task.billingTiming,
        previousReading: task.previousReading === null || task.previousReading === undefined ? null : Number(task.previousReading),
        currentReading,
        unitRate: task.unitRate === null || task.unitRate === undefined ? null : Number(task.unitRate),
        unit: task.unit
      }));

      this.tasks.update((items) => items.filter((item) => item.chargeId !== task.chargeId));
    } catch (error) {
      this.readingError.set(toApiError(error));
    } finally {
      this.savingChargeId.set(null);
    }
  }

  async submitAll(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    this.savingBulk.set(true);
    this.readingError.set(null);
    this.bulkResult.set(null);

    const month = toMonthPath(this.monthForm.getRawValue().month);
    const entered = this.readings();
    const readings = this.tasks()
      .filter((task) => entered[task.chargeId] !== null && entered[task.chargeId] !== undefined)
      .map((task) => ({
        tenantId: task.tenantId,
        coversMonth: task.coversMonth ? toMonthPath(task.coversMonth) : month,
        chargeName: task.chargeName,
        billingTiming: task.billingTiming,
        previousReading: task.previousReading === null || task.previousReading === undefined ? null : Number(task.previousReading),
        currentReading: entered[task.chargeId],
        unitRate: task.unitRate === null || task.unitRate === undefined ? null : Number(task.unitRate),
        unit: task.unit
      }));

    try {
      this.bulkResult.set(await firstValueFrom(this.rentService.submitBulkReadings(scope.agencyId, scope.buildingId, readings)));
      this.readings.set({});
      await this.reload();
    } catch (error) {
      this.readingError.set(toApiError(error));
    } finally {
      this.savingBulk.set(false);
    }
  }

  async applyUniform(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    if (this.uniformForm.invalid) {
      this.uniformForm.markAllAsTouched();
      return;
    }

    this.applyingUniform.set(true);
    this.uniformError.set(null);
    this.uniformResult.set(null);

    const value = this.uniformForm.getRawValue();
    const month = this.monthForm.getRawValue().month;
    const tenantIds = this.parseIds(value.tenantIds);

    const request = {
      chargeName: value.chargeName,
      consumption: value.consumption,
      amount: value.amount,
      billingTiming: value.billingTiming as 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE',
      coversMonth: toMonthPath(month)
    };

    try {
      this.uniformResult.set(tenantIds.length > 0
        ? await firstValueFrom(this.rentService.applyUniformReadingToSubset(scope.agencyId, scope.buildingId, month, {
          ...request,
          tenantIds
        }))
        : await firstValueFrom(this.rentService.applyUniformReading(scope.agencyId, scope.buildingId, month, request)));

      await this.reload();
    } catch (error) {
      this.uniformError.set(toApiError(error));
    } finally {
      this.applyingUniform.set(false);
    }
  }

  async reload(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      this.tasks.set(await firstValueFrom(
        this.rentService.getPendingReadingTasks(scope.agencyId, scope.buildingId, this.monthForm.getRawValue().month)
      ));
      this.readings.set({});
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private parseIds(value: string): number[] {
    return value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
