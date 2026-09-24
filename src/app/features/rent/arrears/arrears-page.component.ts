import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
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
import {
  ArrearsMonthRecord,
  BuildingMonthlyReport,
  PendingReadingTask,
  RoomPaymentStatus
} from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-arrears-page',
  standalone: true,
  imports: [
    PluralPipe,
    ReactiveFormsModule,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    ContextSwitcherComponent,
    ContextGuardComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-section-card title="Monthly arrears">
        <app-context-switcher />

        <app-filter-panel actions [form]="form" [scopeControls]=\"['month']\">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="reload()">
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Month</span>
                <input type="month" formControlName="month">
                @if (form.controls.month.invalid && form.controls.month.touched) {
                  <small class="error-text">Choose a month.</small>
                }
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="!scope()">Load month</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">

      @if (!scope()) {
        <app-empty-state title="Select a building" description="Arrears are generated and confirmed per building." />
      } @else {
        @if (status(); as generation) {
          <app-section-card [title]="generation.monthDisplay || 'Billing cycle'">
            <dl class="detail-grid">
              <div><dt>Status</dt><dd><span class="status-chip" [ngClass]="generation.isConfirmed ? 'status-chip--success' : 'status-chip--warning'">{{ generation.statusLabel || (generation.status | humanLabel) }}</span></dd></div>
              <div><dt>Active tenants</dt><dd>{{ generation.totalActiveTenants ?? 0 }}</dd></div>
              <div><dt>Records generated</dt><dd>{{ generation.recordsGenerated ?? 0 }}</dd></div>
              <div><dt>Pending input</dt><dd>{{ generation.pendingInputCount ?? 0 }}</dd></div>
              <div>
                <dt>Month state</dt>
                <dd>
                  <span class="status-chip" [ngClass]="generation.isConfirmed ? 'status-chip--success' : 'status-chip--warning'">
                    {{ generation.isConfirmed ? 'Confirmed' : (generation.isProvisional ? 'Provisional' : 'In progress') }}
                  </span>
                </dd>
              </div>
            </dl>

            @if (generation.progressMessage) {
              <p class="hint">{{ generation.progressMessage }}</p>
            }

            <div class="button-row">
              <button type="button" class="btn btn-primary" [disabled]="generating() || generation.isConfirmed" (click)="generate()">
                {{ generating() ? 'Triggering...' : 'Generate arrears' }}
              </button>
              <button type="button" class="btn btn-secondary" [disabled]="confirming() || generation.isConfirmed || (generation.pendingInputCount ?? 0) > 0" (click)="confirm()">
                {{ confirming() ? 'Confirming...' : 'Confirm month' }}
              </button>
            </div>

            @if (actionNotice()) {
              <section class="alert alert-success" role="status">{{ actionNotice() }}</section>
            }

            @if (actionError(); as apiError) {
              <app-error-card title="Unable to run that action" [message]="apiError.message" [details]="apiError.details" />
            }
          </app-section-card>
        }

        @if (loading()) {
          <app-loading-state label="Loading arrears..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else {
          @if (report(); as monthly) {
            <app-section-card [title]="'Building summary — ' + (monthly.monthDisplay || '')">
              @if (monthly.buildingSummary; as totals) {
                <dl class="detail-grid">
                  <div><dt>Tenants</dt><dd>{{ totals.totalTenants ?? 0 }}</dd></div>
                  <div><dt>Paid</dt><dd>{{ totals.paidTenants ?? 0 }}</dd></div>
                  <div><dt>Partially paid</dt><dd>{{ totals.partiallyPaidTenants ?? 0 }}</dd></div>
                  <div><dt>Overdue</dt><dd>{{ totals.overdueTenants ?? 0 }}</dd></div>
                  <div><dt>Expected</dt><dd>{{ totals.totalExpected ?? '-' }}</dd></div>
                  <div><dt>Collected</dt><dd>{{ totals.totalPaid ?? '-' }}</dd></div>
                  <div><dt>Outstanding</dt><dd>{{ totals.totalOutstanding ?? '-' }}</dd></div>
                  <div><dt>Collection rate</dt><dd>{{ totals.collectionRate ?? '-' }}%</dd></div>
                </dl>
              } @else {
                <p class="muted">No summary for this month yet.</p>
              }
            </app-section-card>
          }

          <app-section-card title="Rooms">
            <!--
              An occupied room with no record reads as zero owed, which looks
              settled. Say which rooms are simply not billed yet, and offer the
              run that bills them, rather than waiting for the nightly job.
            -->
            @if (notGenerated() > 0) {
              <div class="alert alert-warning not-generated" role="status">
                <span>{{ notGenerated() | plural: 'occupied room' }} not billed for this month yet.</span>
                @if (!status()?.isConfirmed) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="generating()" (click)="generate()">
                    {{ generating() ? 'Generating...' : 'Generate now' }}
                  </button>
                }
              </div>
            }

            @if (rooms().length === 0) {
              <app-empty-state title="No room records" description="Generate arrears for this month to populate rooms." />
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr><th>Room</th><th>Tenant</th><th>Rent</th><th>Due</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    @for (room of rooms(); track room.roomId) {
                      <tr>
                        <td>
                          <div class="cell-stack">
                            <strong>{{ room.roomName || room.roomNumber || '-' }}</strong>
                            <span class="muted">{{ room.floorName || '-' }}</span>
                          </div>
                        </td>
                        <td>
                          <div class="cell-stack">
                            <span>{{ room.tenantName || (room.isOccupied ? '-' : 'Vacant') }}</span>
                            <span class="muted">{{ room.tenantPhone || '-' }}</span>
                          </div>
                        </td>
                        <td>{{ room.monthlyRent ?? '-' }}</td>
                        @if (isUnbilled(room)) {
                          <td class="muted">-</td>
                          <td class="muted">-</td>
                          <td class="muted">-</td>
                          <td><span class="status-chip status-chip--warning">Not generated yet</span></td>
                        } @else {
                          <td>{{ room.totalDue ?? '-' }}</td>
                          <td>{{ room.totalPaid ?? '-' }}</td>
                          <td>{{ room.outstanding ?? '-' }}</td>
                          <td>
                            <div class="chip-row">
                              <span class="status-chip" [ngClass]="paymentStatusClass(room.paymentStatus)">
                                {{ room.paymentStatus | humanLabel }}
                              </span>
                              @if (room.isOverdue) {
                                <span class="status-chip status-chip--danger">Overdue</span>
                              }
                            </div>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <app-section-card title="Pending meter readings">
            @if (pendingTasks().length === 0) {
              <p class="muted">No readings are waiting on input for this month.</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr><th>Charge</th><th>Tenant</th><th>Room</th><th>Previous reading</th><th>Unit rate</th><th>Timing</th></tr>
                  </thead>
                  <tbody>
                    @for (task of pendingTasks(); track task.chargeId) {
                      <tr>
                        <td>{{ task.chargeName || '-' }}</td>
                        <td>{{ task.tenantName || '-' }}</td>
                        <td>{{ task.roomName || '-' }}</td>
                        <td>{{ task.previousReading ?? '-' }}</td>
                        <td>{{ task.unitRate ?? '-' }}{{ task.unit ? ' / ' + task.unit : '' }}</td>
                        <td>{{ task.billingTiming | humanLabel }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
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

    .not-generated {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    p {
      margin: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArrearsPageComponent {
  private readonly confirmDialog = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly context = inject(ActiveContextService);

  readonly scope = this.context.active;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<ArrearsMonthRecord | null>(null);
  readonly report = signal<BuildingMonthlyReport | null>(null);
  readonly rooms = signal<RoomPaymentStatus[]>([]);
  readonly pendingTasks = signal<PendingReadingTask[]>([]);

  /** Occupied, but this month's record does not exist yet. Vacant rooms are never billed. */
  isUnbilled(room: RoomPaymentStatus): boolean {
    return !!room.isOccupied && room.rentRecordGenerated === false;
  }

  readonly notGenerated = computed(() => this.rooms().filter((room) => this.isUnbilled(room)).length);

  readonly generating = signal(false);
  readonly confirming = signal(false);
  readonly actionError = signal<ApiError | null>(null);
  readonly actionNotice = signal<string | null>(null);

  readonly form = this.formBuilder.group({
    month: [this.currentMonth(), [Validators.required]]
  });

  constructor() {
    effect(() => {
      const scope = this.scope();
      if (scope.agencyId !== null && scope.buildingId !== null) {
        void this.reload();
      }
    });
  }


  async generate(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.generating.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);

    try {
      const acknowledgement = await firstValueFrom(this.rentService.generateArrears(scope.agencyId, scope.buildingId, {
        month: this.form.getRawValue().month,
        reason: 'Manual trigger from the operations console'
      }));
      this.actionNotice.set(acknowledgement.message || 'Generation triggered.');
      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.generating.set(false);
    }
  }

  async confirm(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!await this.confirmDialog.ask({ title: 'Confirm this month? Amounts become official and further edits need a regeneration.' })) {
      return;
    }

    this.confirming.set(true);
    this.actionError.set(null);
    this.actionNotice.set(null);

    try {
      await firstValueFrom(this.rentService.confirmArrearsMonth(
        scope.agencyId,
        scope.buildingId,
        this.form.getRawValue().month,
        { notes: null }
      ));
      this.actionNotice.set('Month confirmed.');
      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.confirming.set(false);
    }
  }

  paymentStatusClass(status?: string | null): string {
    switch (status) {
      case 'PAID':
      case 'COMPLETED':
        return 'status-chip--success';
      case 'OVERDUE':
        return 'status-chip--danger';
      case 'PARTIAL':
      case 'PENDING':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
  }

  async reload(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null || this.form.invalid) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const month = this.form.getRawValue().month;

    try {
      const [status, report, rooms, pendingTasks] = await Promise.all([
        firstValueFrom(this.rentService.getArrearsStatus(scope.agencyId, scope.buildingId, month)),
        firstValueFrom(this.rentService.getBuildingMonthlyReport(scope.agencyId, scope.buildingId, month)),
        firstValueFrom(this.rentService.getRoomPaymentStatuses(scope.agencyId, scope.buildingId, month, { page: 0, size: 200 })),
        firstValueFrom(this.rentService.getPendingReadingTasks(scope.agencyId, scope.buildingId, month))
      ]);

      this.status.set(status);
      this.report.set(report);
      this.rooms.set(rooms.items);
      this.pendingTasks.set(pendingTasks);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
