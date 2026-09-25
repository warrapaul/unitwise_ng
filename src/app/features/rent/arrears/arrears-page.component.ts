import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
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
import { NotificationService } from '../../../core/services/notification.service';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { RoomMonthDialogComponent } from '../components/room-month-dialog.component';
import { RecordPaymentDialogComponent } from '../components/record-payment-dialog.component';
import { MeterReadingDialogComponent } from '../components/meter-reading-dialog.component';

@Component({
  selector: 'app-arrears-page',
  standalone: true,
  imports: [
    PluralPipe,
    ReactiveFormsModule,
    NgClass,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    ContextSwitcherComponent,
    ContextGuardComponent,
    HumanLabelPipe,
    SortHeaderComponent,
    RoomMonthDialogComponent,
    RecordPaymentDialogComponent,
    MeterReadingDialogComponent
  ],
  template: `
    <section class="stack">
      <!--
        The month is the unit of work: pick it, and everything below is that
        month for the building in context. On a phone the building switcher is
        in the top bar already.
      -->
      <app-section-card title="Monthly rent">
        @if (wide()) {
          <div class="desktop-context" title-addon><app-context-switcher [compact]="true" /></div>
        }
        <form actions class="month-bar" [formGroup]="form" (ngSubmit)="reload()">
          <label class="visually-hidden" for="rent-month">Month</label>
          <input id="rent-month" type="month" formControlName="month">
          <button type="submit" class="btn btn-secondary" [disabled]="!scope() || loading()">Load</button>
          <!-- One room is handled from its row; charges or waivers across the building, and the history, are here. -->
          <a class="btn btn-secondary" routerLink="/admin/rent/adjustments">Bulk changes</a>
        </form>

        <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">
          @if (status(); as month) {
            <!-- Three steps, one line: bills created, readings in, month confirmed. -->
            <div class="steps-bar">
              <ol class="steps">
                <li [class.steps__done]="billsDone(month)">
                  <span class="steps__n">1</span> Bills {{ month.recordsGenerated ?? 0 }}/{{ month.totalActiveTenants ?? 0 }}
                </li>
                <li [class.steps__done]="billsDone(month) && (month.pendingInputCount ?? 0) === 0">
                  <span class="steps__n">2</span>
                  {{ (month.pendingInputCount ?? 0) > 0 ? (month.pendingInputCount + ' reading' + (month.pendingInputCount === 1 ? '' : 's') + ' needed') : 'Readings in' }}
                </li>
                <li [class.steps__done]="month.isConfirmed">
                  <span class="steps__n">3</span> {{ month.isConfirmed ? 'Confirmed' : 'Not confirmed' }}
                </li>
              </ol>
              @if (!month.isConfirmed && !billsDone(month)) {
                <button type="button" class="btn btn-primary btn-sm" [disabled]="generating()" (click)="generate()">
                  {{ generating() ? 'Creating...' : 'Create bills' }}
                </button>
              }
            </div>
          }

          @if (report()?.buildingSummary; as totals) {
            <dl class="totals">
              <div><dt>Expected</dt><dd>{{ totals.totalExpected ?? '-' }}</dd></div>
              <div><dt>Collected</dt><dd>{{ totals.totalPaid ?? '-' }}</dd></div>
              <div><dt>Outstanding</dt><dd>{{ totals.totalOutstanding ?? '-' }}</dd></div>
              <div><dt>Collected %</dt><dd>{{ totals.collectionRate ?? '-' }}%</dd></div>
              <div><dt>Paid · part · overdue</dt><dd>{{ totals.paidTenants ?? 0 }} · {{ totals.partiallyPaidTenants ?? 0 }} · {{ totals.overdueTenants ?? 0 }}</dd></div>
            </dl>
          }

          @if (actionNotice()) {
            <p class="alert alert-success" role="status">{{ actionNotice() }}</p>
          }
          @if (actionError(); as apiError) {
            <app-error-card title="Unable to run that action" [message]="apiError.message" [details]="apiError.details" />
          }
        </app-context-guard>
      </app-section-card>

      @if (scope()) {
        @if (loading()) {
          <app-loading-state label="Loading the month..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else {
          <!-- The last thing standing between the month and confirming it, so Confirm lives here. -->
          <app-section-card title="Pending meter readings">
            <ng-container actions>
              @if (status() && !status()!.isConfirmed) {
                <button type="button" class="btn btn-primary btn-sm"
                        [disabled]="confirming() || pendingTasks().length > 0 || !billsDone(status()!)"
                        [title]="pendingTasks().length > 0 ? 'Enter every reading first' : ''"
                        (click)="confirm()">
                  {{ confirming() ? 'Confirming...' : 'Confirm month' }}
                </button>
              }
            </ng-container>

            @if (pendingTasks().length === 0) {
              <p class="muted">None.</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead><tr><th>Room</th><th>Charge</th><th>Tenant</th><th>Previous</th><th>Rate</th></tr></thead>
                  <tbody>
                    @for (task of pendingTasks(); track task.chargeId) {
                      <tr class="row-clickable" tabindex="0" (click)="reading.set(task)" (keydown.enter)="reading.set(task)">
                        <td><strong>{{ task.roomName || '-' }}</strong></td>
                        <td>{{ task.chargeName || '-' }}</td>
                        <td>{{ task.tenantName || '-' }}</td>
                        <td>{{ task.previousReading ?? '-' }}</td>
                        <td>{{ task.unitRate ?? '-' }}{{ task.unit ? ' / ' + task.unit : '' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <app-section-card title="Rooms">
            @if (notGenerated() > 0) {
              <div class="alert alert-warning not-generated" role="status">
                <span>{{ notGenerated() | plural: 'occupied room' }} not billed for this month yet.</span>
                @if (!status()?.isConfirmed) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="generating()" (click)="generate()">
                    {{ generating() ? 'Creating...' : 'Create bills' }}
                  </button>
                }
              </div>
            }

            @if (rooms().length === 0) {
              <p class="muted">No rooms.</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th><app-sort-header [state]="sorting" field="roomName" label="Room" (sorted)="reload()" /></th>
                      <th>Tenant</th><th>Due</th><th>Paid</th><th>Outstanding</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (room of rooms(); track room.roomId) {
                      <tr [class.row-clickable]="canOpen(room)" [attr.tabindex]="canOpen(room) ? 0 : null"
                          (click)="openRoom(room)" (keydown.enter)="openRoom(room)">
                        <td>
                          <div class="cell-stack">
                            <strong>{{ room.roomName || room.roomNumber || '-' }}</strong>
                            @if (room.floorName) { <span class="muted">{{ room.floorName }}</span> }
                          </div>
                        </td>
                        <td>
                          <div class="cell-stack">
                            <span>{{ room.tenantName || (room.isOccupied ? '-' : 'Vacant') }}</span>
                            @if (room.tenantPhone) { <span class="muted">{{ room.tenantPhone }}</span> }
                          </div>
                        </td>
                        @if (isUnbilled(room)) {
                          <td class="muted">-</td>
                          <td class="muted">-</td>
                          <td class="muted">-</td>
                          <td><span class="status-chip status-chip--warning">Not billed yet</span></td>
                        } @else {
                          <td>{{ room.totalDue ?? '-' }}</td>
                          <td>{{ room.totalPaid ?? '-' }}</td>
                          <td>{{ room.outstanding ?? '-' }}</td>
                          <td>
                            @if (room.isOccupied) {
                              <div class="chip-row">
                                <span class="status-chip" [ngClass]="paymentStatusClass(room.paymentStatus)">{{ room.paymentStatus | humanLabel }}</span>
                                @if (room.isOverdue) {
                                  <span class="status-chip status-chip--danger">Overdue</span>
                                }
                              </div>
                            } @else {
                              <span class="muted">-</span>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>
        }
      }
    </section>

    @if (scope(); as scoped) {
      @if (openRoomRow(); as room) {
        <app-room-month-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [month]="form.getRawValue().month"
                               [room]="room" (changed)="reload()" (pay)="payRoom(room)" (closed)="openedRoomId.set(null)" />
      }
      @if (paying(); as room) {
        <app-record-payment-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [tenantId]="room.tenantId!"
                                   [tenantName]="room.tenantName || 'Tenant'" [month]="form.getRawValue().month" [amount]="room.outstanding ?? null"
                                   (recorded)="paid()" (closed)="paying.set(null)" />
      }
      @if (reading(); as task) {
        <app-meter-reading-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [task]="task"
                                  (saved)="readingSaved()" (closed)="reading.set(null)" />
      }
    }
  `,
  styles: [`
    .month-bar { display: flex; align-items: center; gap: 0.5rem; }
    .month-bar input { min-height: var(--control-sm); }

    .desktop-context { margin-top: 0.3rem; }

    .steps-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .steps { display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; margin: 0; padding: 0; list-style: none; font-size: 0.88rem; color: var(--text-muted); }
    .steps li { display: flex; align-items: center; gap: 0.4rem; }
    .steps__n {
      display: inline-grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: 999px;
      border: 1px solid var(--border); background: var(--surface-2); font-size: 0.72rem; font-weight: 700;
    }
    .steps__done { color: var(--text); }
    .steps__done .steps__n { background: var(--primary); border-color: var(--primary); color: var(--surface); }

    .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .totals div { display: grid; gap: 0.1rem; }
    .totals dt { font-size: 0.75rem; color: var(--text-muted); }
    .totals dd { margin: 0; font-weight: 600; }

    .not-generated { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .chip-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    p { margin: 0; }
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

  readonly sorting = sortState('roomName', 'asc');

  /**
   * On a phone the building switcher is already in the top bar. Not mounting a
   * second one (rather than hiding it) saves it loading the buildings twice.
   */
  private readonly wideQuery = matchMedia('(min-width: 701px)');
  readonly wide = signal(this.wideQuery.matches);

  /** The room whose month is open; re-read from the list so it shows fresh figures after a change. */
  readonly openedRoomId = signal<number | null>(null);
  readonly openRoomRow = computed(() => this.rooms().find((room) => room.roomId === this.openedRoomId()) ?? null);
  readonly paying = signal<RoomPaymentStatus | null>(null);
  readonly reading = signal<PendingReadingTask | null>(null);
  private readonly toasts = inject(NotificationService);

  /** Every active tenant has this month's bill. */
  billsDone(month: ArrearsMonthRecord): boolean {
    return (month.recordsGenerated ?? 0) >= (month.totalActiveTenants ?? 0) && (month.totalActiveTenants ?? 0) > 0;
  }

  /** Only an occupied, billed room has a month to act on. */
  canOpen(room: RoomPaymentStatus): boolean {
    return !!room.isOccupied && !!room.tenantId && !this.isUnbilled(room);
  }

  openRoom(room: RoomPaymentStatus): void {
    if (this.canOpen(room)) {
      this.openedRoomId.set(room.roomId ?? null);
    }
  }

  payRoom(room: RoomPaymentStatus): void {
    this.openedRoomId.set(null);
    this.paying.set(room);
  }

  paid(): void {
    this.toasts.push('success', `Payment recorded for ${this.paying()?.tenantName ?? 'the tenant'}.`);
    this.paying.set(null);
    void this.reload();
  }

  readingSaved(): void {
    this.toasts.push('success', 'Reading saved.');
    this.reading.set(null);
    void this.reload();
  }

  readonly generating = signal(false);
  readonly confirming = signal(false);
  readonly actionError = signal<ApiError | null>(null);
  readonly actionNotice = signal<string | null>(null);

  readonly form = this.formBuilder.group({
    month: [this.currentMonth(), [Validators.required]]
  });

  constructor() {
    const onChange = (event: MediaQueryListEvent) => this.wide.set(event.matches);
    this.wideQuery.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.wideQuery.removeEventListener('change', onChange));

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
        reason: 'Created from the Monthly rent page'
      }));
      this.actionNotice.set(acknowledgement.message || 'Creating bills. They will appear shortly.');
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

    if (!await this.confirmDialog.ask({
      title: 'Confirm this month?',
      message: 'The amounts become final. Later changes need a reason and are logged.',
      confirmLabel: 'Confirm month'
    })) {
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
      // A month nobody has been billed for answers 404 on the report and the
      // status; that is "nothing yet", not a failure, and must not hide the rooms.
      const [status, report, rooms, pendingTasks] = await Promise.all([
        this.nullIfMissing(firstValueFrom(this.rentService.getArrearsStatus(scope.agencyId, scope.buildingId, month))),
        this.nullIfMissing(firstValueFrom(this.rentService.getBuildingMonthlyReport(scope.agencyId, scope.buildingId, month))),
        firstValueFrom(this.rentService.getRoomPaymentStatuses(scope.agencyId, scope.buildingId, month, { page: 0, size: 200, sort: this.sorting.toParams() })),
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

  private async nullIfMissing<T>(request: Promise<T>): Promise<T | null> {
    try {
      return await request;
    } catch (error) {
      if (toApiError(error).status === 404) {
        return null;
      }
      throw error;
    }
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
