import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { NotificationService } from '../../../core/services/notification.service';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { MeterReadingDialogComponent } from '../components/meter-reading-dialog.component';
import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { formatCurrency, monthLabel, unitLabel } from '../../../shared/utils/format.util';
import { ConfirmRequest, ConfirmService } from '../../../shared/services/confirm.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { computed, ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, map, catchError, of } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { BulkMeterReadingResult, PendingReadingTask, RecordedReading, toMonthPath } from '../models/rent.models';

@Component({
  selector: 'app-meter-reading-page',
  standalone: true,
  imports: [MoneyInputDirective, PermissionGateComponent, MeterReadingDialogComponent, RoomTitlePipe, UnitLabelPipe, MonthNavComponent, CardTableDirective, MoneyPipe, EntityPickerComponent,
    PluralPipe,
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    ContextGuardComponent,
    
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <h1 class="sr-only">Meter readings</h1>
      <app-section-card title="Meter readings">

        <!-- Picking a month loads it; there is no separate Load step. -->
        <app-month-nav actions [month]="monthForm.controls.month.value" (monthChange)="monthForm.controls.month.setValue($event)" />
      </app-section-card>

      <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">

      @if (!scope()) {
        <app-empty-state title="Select a building" description="Readings are entered per building." />
      } @else {
        <!-- One card from the start: the states fill it, so nothing jumps when the rows arrive. -->
        <app-section-card title="Pending readings">
          <span actions class="muted">{{ loading() || tasks().length === 0 ? '' : tasks().length + ' to read' }}</span>
          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading pending readings…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (tasks().length === 0) {
            <app-empty-state title="All meters read" description="No readings are waiting for this month." />
          } @else {
            <!-- Read one meter at a time: each row opens its own reading. -->
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Tenant</th>
                    <th>Room</th>
                    <th>Previous</th>
                    <th>Rate</th>
                    <th><span class="visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  <!-- One row per meter: its earliest unread month. A later month follows from that reading, so it shows once this one is in. -->
                  @for (task of visibleTasks(); track task.chargeId) {
                    <tr>
                      <td class="card-skip">{{ task.chargeName || '-' }}@if (task.coversMonth) { · {{ coverLabel(task.coversMonth) }} }@if (task.meterNumber) { <span class="muted"> · Meter {{ task.meterNumber }}</span> }
                        @if (laterMonths(task); as more) { <span class="muted"> · {{ more }} more {{ more === 1 ? 'month' : 'months' }} after this</span> }</td>
                      <td class="card-skip">{{ task.tenantName || '-' }}</td>
                      <td class="card-title">
                        <div class="cell-stack">
                          <strong>{{ task.roomName | roomTitle }}</strong>
                          <span class="muted card-sub">{{ task.tenantName || '-' }}</span>
                        </div>
                      </td>
                      <td class="card-skip">
                        @if (task.previousReading !== null && task.previousReading !== undefined) { {{ task.previousReading }} }
                        @else { <span class="muted">First reading</span> }
                      </td>
                      <td class="card-skip">{{ task.unitRate | money }}{{ task.unit ? ' / ' + (task.unit | unitLabel) : '' }}</td>
                      <td class="row-action">
                        <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                          <button type="button" class="btn btn-primary btn-sm" (click)="recording.set(task)">Record</button>
                        </app-permission-gate>
                      </td>
                      <td class="card-only card-meta">
                        {{ task.chargeName || 'Meter' }}@if (task.coversMonth) { · {{ coverLabel(task.coversMonth) }} }@if (task.previousReading !== null && task.previousReading !== undefined) { · previous {{ task.previousReading }} } @else { · first reading } · {{ task.unitRate | money }}{{ task.unit ? ' / ' + (task.unit | unitLabel) : '' }}@if (laterMonths(task); as more) { · {{ more }} more {{ more === 1 ? 'month' : 'months' }} after this }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

        </app-section-card>

        @if (recording(); as task) {
          <app-meter-reading-dialog [agencyId]="scope().agencyId!" [buildingId]="scope().buildingId!" [task]="task"
                                    (saved)="readingSaved()" (closed)="recording.set(null)" />
        }

        <!-- What was read this month, to check or look back on; a month earlier is one tap on the month above. -->
        @if (recorded().length > 0) {
          <app-section-card [title]="'Recorded for ' + monthName()">
            <details class="recorded">
              <summary>{{ recorded().length }} {{ recorded().length === 1 ? 'reading' : 'readings' }}</summary>
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Room</th><th>Tenant</th><th>Charge</th><th class="num">Previous</th><th class="num">Current</th><th class="num">Used</th><th class="num">Amount</th></tr></thead>
                  <tbody>
                    @for (r of recorded(); track r.chargeId) {
                      <tr>
                        <td class="card-title"><div class="cell-stack"><strong>{{ r.roomName | roomTitle }}</strong><span class="muted card-sub">{{ r.tenantName || '-' }}</span></div></td>
                        <td class="card-skip">{{ r.tenantName || '-' }}</td>
                        <td class="card-skip">{{ r.chargeName }}@if (r.coversMonth) { <span class="muted"> · {{ coverLabel(r.coversMonth) }}</span> }</td>
                        <td class="num card-skip">{{ r.previousReading ?? '-' }}</td>
                        <td class="num card-skip">{{ r.currentReading ?? '-' }}</td>
                        <td class="num card-skip">{{ r.consumption ?? '-' }}{{ r.unit ? ' ' + (r.unit | unitLabel) : '' }}</td>
                        <td class="num">{{ r.amount | money }}</td>
                        <td class="card-only card-meta">{{ r.chargeName }} · {{ r.previousReading ?? '?' }} → {{ r.currentReading ?? '?' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </details>
          </app-section-card>
        }

        <!--
          The exception, not the routine: per-unit readings above are the normal
          case, so this sits under them and stays shut until it is wanted.
        -->
        <app-section-card title="Apply one reading to everyone">
          <ng-container actions>
            <!-- An icon, not "Show"/"Hide": the chevron points the way the card will go. -->
            <button type="button" class="icon-action collapse-toggle" [class.collapse-toggle--open]="uniformOpen()"
                    [attr.aria-expanded]="uniformOpen()" [attr.aria-label]="uniformOpen() ? 'Minimize' : 'Expand'"
                    [title]="uniformOpen() ? 'Minimize' : 'Expand'" (click)="uniformOpen.set(!uniformOpen())">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
            </button>
          </ng-container>
          @if (uniformOpen()) {
          <p class="hint">Use this when every room shares a meter or the same flat consumption.</p>
          <p class="hint">Enter consumption to charge it at the meter's rate. If you also enter an amount, the amount is charged instead.</p>

          <form [formGroup]="uniformForm" appFormFeedback (ngSubmit)="applyUniform()">
            <div class="grid-auto">
              <label class="field">
                <span>Charge name</span>
                <!-- Suggested from the platform list: a reading lands on the charge spelled the same way. -->
                <input formControlName="chargeName" list="metered-charges">
                <datalist id="metered-charges">
                  @for (name of meteredCharges(); track name) { <option [value]="name"></option> }
                </datalist>
                @if (uniformForm.controls.chargeName.invalid && uniformForm.controls.chargeName.touched) {
                  <small class="error-text">A charge name is required.</small>
                }
              </label>
              <label class="field"><span>Consumption</span><input type="number" step="0.01" min="0" formControlName="consumption" inputmode="decimal"></label>
              <label class="field"><span>Amount</span><span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="amount"></span></label>
              <label class="field">
                <span>This reading is for</span>
                <select formControlName="billingTiming">
                  <option value="PRIOR_MONTH_ARREARS">Last month's usage</option>
                  <option value="CURRENT_MONTH">This month's usage</option>
                  <option value="ADVANCE">Next month, in advance</option>
                </select>
              </label>
              <div class="field">
                <span>Tenants</span>
                <!-- Readings are per building, so the search stays in it: no "Show all in …". -->
                <app-entity-picker [config]="pickers.tenant" [multiple]="true" [allowWiden]="false"
                                   formControlName="tenantIds" placeholder="Every tenant in the building" />
              </div>
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
                {{ applyingUniform() ? 'Applying…' : 'Apply reading' }}
              </button>
            </div>
          </form>
          } @else {
            <p class="hint">For a shared meter or the same flat consumption in every room.</p>
          }
        </app-section-card>
      }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .recorded > summary { cursor: pointer; min-height: 2.75rem; display: flex; align-items: center; font-weight: var(--weight-semibold); }
    form {
      display: grid;
      gap: var(--space-5);
    }

    .reading-input {
      min-height: var(--control-sm);
      padding: var(--space-1) var(--space-2-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--field-bg);
      color: var(--text);
      max-width: 8rem;
      min-height: 2.4rem;
      padding-block: var(--space-2);
    }

    /* The note under a reading: what it bills, or why it cannot be saved yet. */
    td .hint, td .error-text { display: block; margin-top: var(--space-1); font-size: var(--font-caption); max-width: 14rem; }

    .actions-col {
      white-space: nowrap;
    }

    .alert p {
      margin: var(--space-1-5) 0 0;
    }

    .alert ul {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-4);
      font-size: var(--text-md);
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeterReadingPageComponent {

  /** Shut by default: entering readings per unit is the usual job. */
  readonly uniformOpen = signal(false);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly confirmDialog = inject(ConfirmService);

  /** Catalog charges that take a reading — what "Charge name" is suggested from. */
  readonly meteredCharges = toSignal(this.rentService.getChargeCatalog().pipe(
    map((items) => items.filter((item) => item.billingType === 'METERED' || item.billingType === 'PER_UNIT').map((item) => item.name)),
    catchError(() => of([] as string[]))
  ), { initialValue: [] as string[] });
  private readonly context = inject(ActiveContextService);

  readonly scope = this.context.active;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tasks = signal<PendingReadingTask[]>([]);

  /** Current readings keyed by chargeId, as typed into the table. */


  readonly applyingUniform = signal(false);
  readonly uniformError = signal<ApiError | null>(null);
  readonly uniformResult = signal<BulkMeterReadingResult | null>(null);

  /** Shared with the other rent pages. */
  private readonly workingMonth = inject(WorkingMonthService);

  readonly monthForm = this.formBuilder.group({
    month: this.workingMonth.month()
  });

  readonly uniformForm = this.formBuilder.group({
    chargeName: ['', [Validators.required]],
    consumption: [null as number | null, [Validators.min(0)]],
    amount: [null as number | null, [Validators.min(0)]],
    billingTiming: 'PRIOR_MONTH_ARREARS',
    tenantIds: [[] as number[]]
  });

  constructor() {
    this.monthForm.controls.month.valueChanges.pipe(takeUntilDestroyed()).subscribe((month) => {
      if (month) {
        this.workingMonth.month.set(month);
        void this.reload();
      }
    });

    effect(() => {
      const scope = this.scope();
      if (scope.agencyId !== null && scope.buildingId !== null) {
        void this.reload();
      }
    });
  }

  /** The earliest unread month of each meter; later months appear as the earlier ones are recorded. */
  readonly visibleTasks = computed(() => this.tasks().filter((task) => !this.earlierTask(task)));

  laterMonths(task: PendingReadingTask): number {
    return this.tasks().filter((other) => other !== task && other.tenantId === task.tenantId && other.chargeName === task.chargeName
      && !!other.coversMonth && !!task.coversMonth && other.coversMonth > task.coversMonth).length;
  }

  /** Readings already entered for the month on screen. */
  readonly recorded = signal<RecordedReading[]>([]);

  monthName(): string {
    return monthLabel(this.monthForm.getRawValue().month);
  }

  /** The pending reading open in the dialog. */
  readonly recording = signal<PendingReadingTask | null>(null);
  private readonly notifications = inject(NotificationService);

  async readingSaved(): Promise<void> {
    this.recording.set(null);
    this.notifications.push('success', 'Reading recorded.');
    await this.reload();
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

    if (!await this.confirmDialog.ask(this.uniformPreview())) {
      return;
    }

    this.applyingUniform.set(true);
    this.uniformError.set(null);
    this.uniformResult.set(null);

    const value = this.uniformForm.getRawValue();
    const month = this.monthForm.getRawValue().month;
    const tenantIds = value.tenantIds;

    const request = {
      chargeName: value.chargeName,
      consumption: value.consumption,
      amount: value.amount,
      billingTiming: value.billingTiming as 'CURRENT_MONTH' | 'PRIOR_MONTH_ARREARS' | 'ADVANCE',
      coversMonth: toMonthPath(month),
      tenantIds: tenantIds.length > 0 ? tenantIds : null
    };

    try {
      this.uniformResult.set(await firstValueFrom(this.rentService.submitMeterReadings(scope.agencyId, scope.buildingId, {
        uniformReading: request
      })));

      await this.reload();
    } catch (error) {
      this.uniformError.set(toApiError(error));
    } finally {
      this.applyingUniform.set(false);
    }
  }

  /** The month before this one on the same meter, when it is also waiting for a reading. */
  earlierTask(task: PendingReadingTask): PendingReadingTask | null {
    const covers = task.coversMonth;
    if (!covers) {
      return null;
    }
    return this.tasks()
      .filter((other) => other.tenantId === task.tenantId && other.chargeName === task.chargeName
        && !!other.coversMonth && other.coversMonth < covers)
      .sort((a, b) => b.coversMonth!.localeCompare(a.coversMonth!))[0] ?? null;
  }

  /** Enter moves down the list, so a run of readings needs no reaching for the next box. */
  nextReading(event: Event): void {
    event.preventDefault();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input.reading-input')];
    inputs[inputs.indexOf(event.target as HTMLInputElement) + 1]?.focus();
  }

  /** Two months of one meter otherwise look like the same row twice. */
  coverLabel(month: string): string {
    return monthLabel(month);
  }

  /** It charges many bills at once, so what and who are stated before anything is saved. */
  private uniformPreview(): ConfirmRequest {
    const { chargeName, consumption, amount, tenantIds } = this.uniformForm.getRawValue();
    const figures = [
      consumption !== null && consumption !== undefined ? `consumption ${consumption}` : null,
      amount !== null && amount !== undefined ? formatCurrency(amount) : null
    ].filter(Boolean).join(', ');
    const who = tenantIds.length > 0
      ? `${tenantIds.length} selected tenant${tenantIds.length === 1 ? '' : 's'}`
      : 'every tenant in this building';
    return {
      title: `Apply ${chargeName} to ${who}?`,
      message: `${monthLabel(this.monthForm.getRawValue().month)}: ${figures || 'no figures entered'}. `
        + 'This goes on their bills as soon as you apply it.',
      confirmLabel: 'Apply to bills'
    };
  }

  async reload(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const month = this.monthForm.getRawValue().month;
      const [tasks, recorded] = await Promise.all([
        firstValueFrom(this.rentService.getPendingReadingTasks(scope.agencyId, scope.buildingId, month)),
        firstValueFrom(this.rentService.getRecordedReadings(scope.agencyId, scope.buildingId, month)).catch(() => [] as RecordedReading[])
      ]);
      this.tasks.set(tasks);
      this.recorded.set(recorded);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }


}
