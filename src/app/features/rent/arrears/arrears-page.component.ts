import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { distinctUntilChanged, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { BillingCycleComponent } from '../components/billing-cycle.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { formatPercent } from '../../../shared/utils/format.util';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import {
  ArrearsMonthRecord,
  BuildingMonthlyReport,
  PendingReadingTask,
  RecordedReading,
  RoomPaymentStatus
} from '../models/rent.models';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoomMonthDialogComponent } from '../components/room-month-dialog.component';
import { RecordPaymentDialogComponent } from '../components/record-payment-dialog.component';
import { MeterReadingDialogComponent } from '../components/meter-reading-dialog.component';

@Component({
  selector: 'app-arrears-page',
  standalone: true,
  imports: [ContextScopeNoticeComponent, 
    PluralPipe,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    ContextGuardComponent,
    BillingCycleComponent,
    PermissionGateComponent,
    StatusChipComponent,
    RoomMonthDialogComponent,
    RecordPaymentDialogComponent,
    MeterReadingDialogComponent
  ],
  template: `
    <section class="stack">
      <app-context-scope-notice noun="rooms" [clearable]="false" />
      <!--
        The month is the unit of work: pick it, and everything below is that
        month for the building in context. On a phone the building switcher is
        in the top bar already.
      -->
      <app-section-card title="Rent payment per room">
        <!-- Picking a month loads it; there is no separate Load step. -->
        <form actions class="month-bar filters" [formGroup]="form" (ngSubmit)="reload()">
          <label class="field"><span>Month</span><input type="month" formControlName="month"></label>
          <!-- One room is handled from its row; charges or waivers across the building, and the history, are here. -->
          <a class="btn btn-secondary" routerLink="/admin/rent/adjustments">Rent adjustments</a>
        </form>

        <app-context-guard [requireBuilding]="true" requirePermission="RENT_ARREAR_READ">
          @if (status(); as month) {
            <!-- The month as the same five steps as everywhere else; this page creates and confirms in place below. -->
            @if (scope().agencyId !== null && scope().buildingId !== null) {
              <app-billing-cycle [agencyId]="scope().agencyId!" [buildingId]="scope().buildingId!" [buildingName]="scope().buildingName"
                                 [month]="form.getRawValue().month" [row]="cycleRow()" [showNext]="false" [refreshKey]="cycleKey()" />
            }
            @if (!month.isConfirmed && !billsDone(month)) {
              <div class="create-bar">
                <button type="button" class="btn btn-primary btn-sm" [disabled]="generating() || isGenerating(month)" (click)="generate()">
                  {{ generating() || isGenerating(month) ? 'Creating...' : 'Create bills now' }}
                </button>
              </div>
            }
            @if (isGenerating(month)) {
              <p class="alert alert-info" role="status">{{ month.progressMessage || 'Creating bills…' }} This page updates when they are ready.</p>
            } @else if (!month.isConfirmed && !billsDone(month)) {
              <p class="muted small">Bills are created automatically on the building's billing day. Create them now to start early.</p>
            }

            <!--
              The month's one decision, in the main card where it cannot be
              missed — not tucked into the readings list. Missing readings do
              not block it; the confirmation says what happens to them.
            -->
            @if (!month.isConfirmed && billsDone(month)) {
              <div class="confirm-panel" [class.confirm-panel--warn]="pendingTasks().length > 0">
                <div class="confirm-panel__text">
                  <strong>{{ pendingTasks().length > 0 ? 'Readings still missing' : 'Ready to confirm' }}</strong>
                  <span>
                    @if (pendingTasks().length > 0) {
                      {{ pendingTasks().length }} meter reading{{ pendingTasks().length === 1 ? ' is' : 's are' }} not entered —
                      <a href="#pending-readings" (click)="scrollToReadings($event)">enter {{ pendingTasks().length === 1 ? 'it' : 'them' }}</a>.
                      Confirm now and {{ pendingTasks().length === 1 ? 'it moves' : 'they move' }} to next month's bill.
                    } @else {
                      Every bill is complete. Confirming makes this month's amounts final and tells tenants their bills are ready to pay.
                    }
                  </span>
                  <span class="muted small">Need to waive or add a charge first? Use <a routerLink="/admin/rent/adjustments">Rent adjustments</a>.</span>
                </div>
                @if (canConfirm()) {
                  <button type="button" class="btn btn-primary" [disabled]="confirming()" (click)="confirm()">
                    {{ confirming() ? 'Confirming...' : 'Confirm month' }}
                  </button>
                }
              </div>
            } @else if (month.isConfirmed) {
              <p class="confirmed" role="status">✓ This month is confirmed.</p>
            }
          }

          @if (report()?.buildingSummary; as totals) {
            <!--
              Money and tenants are two rows of the same width, so every figure
              lines up with the one above it. The tenant counts used to share one
              cell ("Paid · part · overdue  0 · 0 · 0"), which read as a code.
            -->
            <dl class="totals">
              <div><dt>Expected</dt><dd>{{ kes(totals.totalExpected) }}</dd></div>
              <div><dt>Collected</dt><dd>{{ kes(totals.totalPaid) }}</dd></div>
              <div><dt>Outstanding</dt><dd>{{ kes(totals.totalOutstanding) }}</dd></div>
              <div><dt>Collection rate</dt><dd>{{ pct(totals.collectionRate) }}</dd></div>
            </dl>
            <!-- Counted from the rows below, so a count and the chips in the table can never disagree. -->
            <dl class="totals totals--counts" aria-label="Rooms by payment">
              <div><dt><span class="dot dot--success"></span>Paid</dt><dd>{{ counts().paid }}</dd></div>
              <div><dt><span class="dot dot--warning"></span>Part paid</dt><dd>{{ counts().partial }}</dd></div>
              <div><dt><span class="dot dot--neutral"></span>Not yet due</dt><dd>{{ counts().notDue }}</dd></div>
              <div><dt><span class="dot dot--danger"></span>Overdue</dt><dd>{{ counts().overdue }}</dd></div>
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
          <!--
            Readings: what is still to enter (the last thing before confirming), and what was entered.
            Nothing to enter is one line, not a card-sized "none".
          -->
          <app-section-card id="pending-readings" title="Meter readings"
                            [subtitle]="pendingTasks().length > 0 ? readingsHint : null">
            @if (pendingTasks().length === 0) {
              <p class="muted">Nothing waiting for a reading in {{ monthName() }}.</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead><tr><th>Room</th><th>Charge</th><th>Tenant</th><th class="num">Previous reading</th><th class="num">Rate</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    @for (task of pendingTasks(); track task.chargeId) {
                      <tr class="row-clickable" tabindex="0" (click)="reading.set(task)" (keydown.enter)="reading.set(task)">
                        <td><strong>{{ task.roomName || '-' }}</strong></td>
                        <td>{{ task.chargeName || '-' }}</td>
                        <td>{{ task.tenantName || '-' }}</td>
                        <td class="num">{{ task.previousReading ?? 'First reading' }}</td>
                        <td class="num">{{ task.unitRate != null ? kes(task.unitRate) : '-' }}{{ task.unit ? ' / ' + task.unit : '' }}</td>
                        <td class="row-action">
                          <button type="button" class="btn btn-secondary btn-sm" (click)="$event.stopPropagation(); reading.set(task)">Record</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <!-- What was read this month: the figures behind each meter charge on the bills. -->
            @if (recorded().length > 0) {
              <details class="recorded" [open]="pendingTasks().length === 0">
                <summary>Readings entered for {{ monthName() }} ({{ recorded().length }})</summary>
                <div class="table-scroll">
                  <table class="table table--packed">
                    <thead><tr><th>Room</th><th>Charge</th><th>Tenant</th><th class="num">Previous</th><th class="num">Current</th>
                      <th class="num">Used</th><th class="num">Rate</th><th class="num">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      @for (r of recorded(); track r.chargeId) {
                        <tr>
                          <td><strong>{{ r.roomName || '-' }}</strong></td>
                          <td>{{ r.chargeName }}@if (r.coversMonth) { <span class="muted"> · for {{ shortMonth(r.coversMonth) }}</span> }</td>
                          <td>{{ r.tenantName || '-' }}</td>
                          <td class="num">{{ r.previousReading ?? '-' }}</td>
                          <td class="num">{{ r.currentReading ?? '-' }}</td>
                          <td class="num">{{ r.consumption != null ? r.consumption + (r.unit ? ' ' + r.unit : '') : '-' }}</td>
                          <td class="num">{{ r.unitRate != null ? kes(r.unitRate) : '-' }}</td>
                          <td class="num">{{ kes(r.amount) }}</td>
                          <td><app-status-chip [status]="r.status" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </details>
            }
          </app-section-card>

          <app-section-card title="Rooms" [subtitle]="roomsSubtitle()">
            <ng-container actions>
              <label class="checkbox-field">
                <input type="checkbox" [checked]="occupiedOnly()" (change)="occupiedOnly.set($any($event.target).checked)">
                <span>Occupied only</span>
              </label>
            </ng-container>

            <!-- Said here, acted on above: Create bills lives in the steps bar at the top of the page and on the dashboard. -->
            @if (notGenerated() > 0) {
              <p class="alert alert-warning" role="status">
                {{ notGenerated() | plural: 'occupied room' }} not billed for this month yet — use Create bills at the top.
              </p>
            }

            @if (occupiedOnly() && vacantCount() > 0) {
              <p class="muted small">{{ vacantCount() | plural: 'vacant room' }} hidden ·
                <button type="button" class="text-button" (click)="occupiedOnly.set(false)">Show</button></p>
            }
            @if (visibleRooms().length === 0) {
              <p class="muted">{{ rooms().length === 0 ? 'No rooms.' : 'No occupied rooms.' }}</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th [attr.aria-sort]="roomOrder() === 'asc' ? 'ascending' : 'descending'">
                        <button type="button" class="sort-toggle" (click)="flipRoomOrder()"
                                [attr.aria-label]="'Room, by floor then room, ' + (roomOrder() === 'asc' ? 'ascending' : 'descending') + '. Reverse order'">
                          Room <span aria-hidden="true">{{ roomOrder() === 'asc' ? '▲' : '▼' }}</span>
                        </button>
                      </th>
                      <th>Tenant</th><th class="num">Due</th><th class="num">Paid</th><th class="num">Outstanding</th><th>Status</th>
                      <th><span class="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <!-- One tbody per floor, headed by its name: the building as it is walked. -->
                  @for (floor of floors(); track $index) {
                  <tbody>
                    <tr class="floor-row">
                      <th colspan="7" scope="rowgroup">{{ floor.name }} <span class="muted">· {{ floor.rooms.length | plural: 'room' }}</span></th>
                    </tr>
                    @for (room of floor.rooms; track room.roomId) {
                      <tr [class.row-clickable]="canOpen(room)" [attr.tabindex]="canOpen(room) ? 0 : null"
                          (click)="openRoom(room)" (keydown.enter)="openRoom(room)">
                        <td>
                          <div class="cell-stack">
                            <strong>{{ room.roomName || room.roomNumber || '-' }}</strong>
                            @if (room.paymentReference) { <span class="muted mono" title="PayBill account number for this room">{{ room.paymentReference }}</span> }
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
                          <td class="num">
                            <div class="cell-stack cell-stack--end">
                              <span>{{ kes(room.totalDue) }}</span>
                              @if (chargesOf(room) > 0) { <span class="muted small">Rent + {{ kes(chargesOf(room)) }} charges</span> }
                            </div>
                          </td>
                          <td class="num">{{ kes(room.totalPaid) }}</td>
                          <td class="num">{{ kes(room.outstanding) }}</td>
                          <td>
                            @if (room.isOccupied) {
                              <div class="chip-row">
                                <!-- One status per row: a bill past its due date is overdue, not "pending" as well. -->
                                <span class="status-chip" [class]="'status-chip status-chip--' + rowStatus(room).tone">{{ rowStatus(room).label }}</span>
                                <!-- Claimed, not counted: the row's paid figure moves only once it is confirmed. -->
                                @if (room.pendingReports) {
                                  <a class="status-chip chip-link" [class.status-chip--success]="room.pendingMatched" [class.status-chip--info]="!room.pendingMatched"
                                     [routerLink]="RoutePaths.paymentReports" (click)="$event.stopPropagation()"
                                     [title]="room.pendingMatched ? 'Matches a payment you entered — confirm it' : 'Reported by the tenant — confirm it'">
                                    {{ room.pendingMatched ? '✓ Matched' : 'Reported' }} {{ kes(room.pendingReportAmount) }}
                                  </a>
                                }
                              </div>
                            } @else {
                              <span class="muted">-</span>
                            }
                          </td>
                        }
                        <!-- The next thing to do for the room, on its row; the row itself opens the month's detail. -->
                        <td class="row-action">
                          @if (canOpen(room)) {
                            @if (+(room.outstanding ?? 0) > 0) {
                              <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
                                <button type="button" class="btn btn-secondary btn-sm" (click)="$event.stopPropagation(); payRoom(room)">Record payment</button>
                              </app-permission-gate>
                              @if (room.isOverdue) {
                                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPortfolioOverdue" (click)="$event.stopPropagation()"
                                   title="Send a reminder from the overdue list">Remind</a>
                              }
                            }
                            <span class="row-go" aria-hidden="true">›</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                  }
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
                               [room]="room" [buildingName]="scoped.buildingName" (changed)="reload()" (pay)="payRoom(room)" (closed)="openedRoomId.set(null)" />
      }
      @if (paying(); as room) {
        <app-record-payment-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [tenantId]="room.tenantId!"
                                   [tenantName]="room.tenantName || 'Tenant'" [month]="form.getRawValue().month" [amount]="room.outstanding ?? null"
                                   [roomName]="room.roomName ?? null" [buildingName]="scoped.buildingName"
                                   (recorded)="paid()" (closed)="paying.set(null)" />
      }
      @if (reading(); as task) {
        <app-meter-reading-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [task]="task"
                                  (saved)="readingSaved()" (closed)="reading.set(null)" />
      }
    }
  `,
  styles: [`
    .confirm-panel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-4); padding: var(--space-4) var(--space-4);
                     border-radius: 14px; border-left: 4px solid var(--success); background: var(--success-tint); }
    .confirm-panel--warn { border-left-color: var(--warning); background: var(--warning-tint); }
    .confirm-panel__text { display: grid; gap: var(--space-1); min-width: 0; flex: 1 1 20rem; }
    .confirm-panel .small { font-size: var(--text-sm); }
    .confirmed { margin: 0; font-weight: var(--weight-semibold); color: var(--success); }
    .month-bar { display: flex; align-items: end; gap: var(--space-2); flex-wrap: wrap; }
    .month-bar .field { min-width: 11rem; }
    .row-action { text-align: right; white-space: nowrap; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .small { font-size: var(--text-sm); }
    .steps__count { font-variant-numeric: tabular-nums; font-weight: var(--weight-semibold); }
    .sort-toggle { display: inline-flex; align-items: center; gap: var(--space-1); padding: 0; border: 0; background: none; font: inherit; font-weight: inherit; color: inherit; cursor: pointer; }
    .sort-toggle span { font-size: var(--text-2xs); color: var(--text-muted); }

    .create-bar { display: flex; justify-content: flex-end; }
    .recorded summary { cursor: pointer; font-weight: var(--weight-semibold); }
    .recorded[open] summary { margin-bottom: var(--space-2); }
    .cell-stack--end { justify-items: end; }
    .row-go { margin-left: var(--space-2); color: var(--text-subtle); }
    .row-action { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-1-5); }
    .text-button { padding: 0; border: 0; background: none; font: inherit; font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: underline; cursor: pointer; }

    .steps-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
    .steps { display: flex; flex-wrap: wrap; gap: var(--space-1-5) var(--space-4); margin: 0; padding: 0; list-style: none; font-size: var(--text-md); color: var(--text-muted); }
    .steps li { display: flex; align-items: center; gap: var(--space-1-5); }
    .steps__n {
      display: inline-grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: 999px;
      border: 1px solid var(--border); background: var(--surface-2); font-size: var(--text-2xs); font-weight: var(--weight-bold);
    }
    .steps__done { color: var(--text); }
    .steps__done .steps__n { background: var(--primary); border-color: var(--primary); color: var(--surface); }

    .totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2) var(--space-4); margin: 0; }
    @media (max-width: 700px) { .totals { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .totals div { display: grid; gap: var(--space-0-5); }
    .totals dt { font-size: var(--text-xs); color: var(--text-muted); }
    .totals dd { margin: 0; font-weight: var(--weight-semibold); }

    .blocker { font-size: var(--text-sm); }

    .totals--counts dt { display: flex; align-items: center; gap: var(--space-1-5); }
    .dot { width: 0.55rem; height: 0.55rem; border-radius: 999px; flex: none; }
    .dot--success { background: var(--success); }
    .dot--warning { background: var(--warning); }
    .dot--danger { background: var(--danger); }
    .dot--neutral { background: var(--text-subtle); }
    .floor-row th { padding-top: var(--space-4); font-size: var(--text-sm); text-align: left; color: var(--text); background: var(--surface-2); }
    .chip-row { display: flex; gap: var(--space-1-5); flex-wrap: wrap; }
    .chip-link { text-decoration: none; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArrearsPageComponent {
  readonly RoutePaths = RoutePaths;
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

  /** Vacant rooms have nothing to collect: hidden by default, one tap away. */
  readonly occupiedOnly = signal(true);
  readonly vacantCount = computed(() => this.rooms().filter((room) => !room.isOccupied).length);
  readonly recorded = signal<RecordedReading[]>([]);
  readonly readingsHint = "Enter each reading; anything left when you confirm moves to next month's bill.";
  /** Bumped after create or confirm, so the step strip re-reads the month. */
  readonly cycleKey = signal(0);

  /** Billed, occupied rooms by where their bill stands — the same rule the row chips use. */
  readonly counts = computed(() => {
    const result = { paid: 0, partial: 0, notDue: 0, overdue: 0 };
    for (const room of this.rooms()) {
      if (!room.isOccupied || this.isUnbilled(room)) {
        continue;
      }
      const key = this.rowStatus(room).key;
      result[key === 'paid' || key === 'credit' ? 'paid' : key]++;
    }
    return result;
  });

  /** The step strip's money steps, from this page's own figures (one source on the page). */
  readonly cycleRow = computed(() => {
    const totals = this.report()?.buildingSummary;
    return totals ? {
      rentExpected: totals.totalExpected ?? null,
      rentCollected: totals.totalPaid ?? null,
      rentOutstanding: totals.totalOutstanding ?? null,
      collectionRate: totals.collectionRate ?? null,
      roomsWithBalance: this.rooms().filter((room) => room.isOccupied && Number(room.outstanding ?? 0) > 0).length
    } : null;
  });

  /** One status per row: paid (or in credit), overdue with its days, part paid, or not yet due. */
  rowStatus(room: RoomPaymentStatus): { key: 'paid' | 'credit' | 'overdue' | 'partial' | 'notDue'; label: string; tone: string } {
    const outstanding = Number(room.outstanding ?? 0);
    if (outstanding < 0) {
      return { key: 'credit', label: 'In credit', tone: 'success' };
    }
    if (outstanding === 0) {
      return { key: 'paid', label: 'Paid', tone: 'success' };
    }
    if (room.isOverdue) {
      const days = room.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(`${room.dueDate.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000)) : 0;
      return { key: 'overdue', label: days > 0 ? `Overdue ${days} day${days === 1 ? '' : 's'}` : 'Overdue', tone: 'danger' };
    }
    return Number(room.totalPaid ?? 0) > 0
      ? { key: 'partial', label: 'Part paid', tone: 'warning' }
      : { key: 'notDue', label: 'Not yet due', tone: 'neutral' };
  }

  /** What the bill holds beyond the rent: the month's charges (water, garbage…). */
  chargesOf(room: RoomPaymentStatus): number {
    const extra = Number(room.totalDue ?? 0) - Number(room.monthlyRent ?? 0);
    return Number.isFinite(extra) && room.monthlyRent != null ? Math.max(0, extra) : 0;
  }

  pct(value: number | string | null | undefined): string {
    return formatPercent(value);
  }

  shortMonth(value: string): string {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  readonly visibleRooms = computed(() => this.occupiedOnly() ? this.rooms().filter((room) => room.isOccupied) : this.rooms());

  /** Rooms in the server's floor-then-room order, cut at each change of floor. */
  readonly floors = computed(() => {
    const groups: { name: string; rooms: RoomPaymentStatus[] }[] = [];
    for (const room of this.visibleRooms()) {
      const name = room.floorName || 'No floor';
      const last = groups[groups.length - 1];
      if (last && last.name === name) {
        last.rooms.push(room);
      } else {
        groups.push({ name, rooms: [room] });
      }
    }
    return groups;
  });

  /** What the table holds right now: the count follows the "Occupied only" filter. */
  readonly roomsSubtitle = computed(() => {
    const occupied = this.rooms().filter((room) => room.isOccupied).length;
    if (this.rooms().length === 0) {
      return null;
    }
    return this.occupiedOnly()
      ? `Showing the ${occupied} occupied room${occupied === 1 ? '' : 's'} of ${this.rooms().length}`
      : `${this.rooms().length} rooms · ${occupied} occupied`;
  });

  readonly monthName = computed(() => {
    this.status();
    const date = new Date(`${this.form.getRawValue().month}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'this month' : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  /** Bills are being created in the background; the page polls until they are in. */
  isGenerating(month: ArrearsMonthRecord): boolean {
    return month.status === 'GENERATING' || month.status === 'REGENERATING';
  }

  scrollToReadings(event: Event): void {
    event.preventDefault();
    document.getElementById('pending-readings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "KES 6,000": the same formatting in every figure on the page. */
  kes(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `KES ${parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-';
  }

  /**
   * Floor, then room, the way the building is walked. Only the direction is the
   * operator's; both keys always go, in that order, so reversing it reverses the
   * walk instead of re-sorting by one of them alone.
   */
  readonly roomOrder = signal<'asc' | 'desc'>('asc');

  flipRoomOrder(): void {
    this.roomOrder.update((order) => (order === 'asc' ? 'desc' : 'asc'));
    void this.reload();
  }


  /** The room whose month is open; re-read from the list so it shows fresh figures after a change. */
  readonly openedRoomId = signal<number | null>(null);
  readonly openRoomRow = computed(() => this.rooms().find((room) => room.roomId === this.openedRoomId()) ?? null);
  readonly paying = signal<RoomPaymentStatus | null>(null);
  readonly reading = signal<PendingReadingTask | null>(null);
  private readonly toasts = inject(NotificationService);

  /** What stops the month being confirmed; null when it can be. */
  /** Whether the active role may confirm (the backend needs RENT_ARREAR_WRITE). */
  readonly canConfirm = computed(() => this.context.can('RENT_ARREAR_WRITE'));

  readonly confirmBlocker = computed(() => {
    const month = this.status();
    if (!month) {
      return null;
    }
    if (!this.billsDone(month)) {
      return (month.totalActiveTenants ?? 0) === 0 ? 'No active tenants to bill' : 'Create all bills first';
    }
    const pending = this.pendingTasks().length;
    return pending > 0 ? `${pending} reading${pending === 1 ? '' : 's'} to enter` : null;
  });

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

    // A new month is the whole question changing, so it loads straight away.
    this.form.controls.month.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => void this.reload());

    effect(() => {
      const scope = this.scope();
      if (scope.agencyId !== null && scope.buildingId !== null) {
        void this.reload();
      }
    });

    // Arriving from "Create bills now" elsewhere: open on that month and follow the job until the
    // bills are in, so "Review and confirm" appears without a refresh.
    effect(() => {
      const [month, created] = [this.monthParam(), this.createdParam()];
      untracked(() => {
        if (this.arrivalHandled) {
          return;
        }
        this.arrivalHandled = true;
        if (month && /^\d{4}-\d{2}$/.test(month) && month !== this.form.controls.month.value) {
          this.form.controls.month.setValue(month);
        }
        if (created) {
          void this.followCreation();
        }
      });
    });
  }

  /** From the query string: `?month=2026-10&created=1`. */
  readonly monthParam = input<string | undefined>(undefined, { alias: 'month' });
  readonly createdParam = input<string | undefined>(undefined, { alias: 'created' });
  private arrivalHandled = false;

  private async followCreation(): Promise<void> {
    this.generating.set(true);
    this.actionNotice.set('Creating bills… this page updates when they are ready.');
    try {
      await this.reload();
      await this.waitForBills();
    } finally {
      this.generating.set(false);
    }
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
        reason: 'Created from the Rent payment per room page'
      }));
      this.actionNotice.set(acknowledgement.message || 'Creating bills. They will appear shortly.');
      await this.reload();
      await this.waitForBills();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.generating.set(false);
    }
  }

  /**
   * Bills are created by a background job: poll the month until it is no longer generating, then
   * say how it ended. A queued message alone left the operator guessing whether it had worked.
   */
  private async waitForBills(): Promise<void> {
    // Also while the month has no record yet: the job is queued and has not opened it.
    for (let attempt = 0; attempt < 20 && (!this.status() || this.isGenerating(this.status()!)); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await this.reload();
    }
    const month = this.status();
    if (!month) {
      return;
    }
    if (this.isGenerating(month)) {
      this.actionNotice.set('Still creating bills — check back in a minute.');
    } else if (this.billsDone(month)) {
      this.actionNotice.set(`Bills created for ${month.recordsGenerated} tenant${month.recordsGenerated === 1 ? '' : 's'}.`);
    } else {
      this.actionNotice.set(null);
      this.actionError.set({ status: 0, errorCode: 'GENERATION_INCOMPLETE',
        message: `Only ${month.recordsGenerated ?? 0} of ${month.totalActiveTenants ?? 0} bills were created. Try Create bills again.`, details: [] });
    }
  }

  async confirm(): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const pending = this.pendingTasks().length;
    // What is being finalised, in figures, before it is: bills, the total, and what is left out.
    const bills = this.status()?.recordsGenerated ?? 0;
    const summary = `${bills} bill${bills === 1 ? '' : 's'} · ${this.kes(this.report()?.buildingSummary?.totalExpected)} expected. `;
    const after = 'Tenants are told their bills are ready to pay. Later changes need a reason and are logged.';
    if (!await this.confirmDialog.ask(pending > 0 ? {
      title: `Confirm with ${pending} reading${pending === 1 ? '' : 's'} missing?`,
      message: summary
        + `The missing reading${pending === 1 ? ' is' : 's are'} not included in this month's bills — `
        + `${pending === 1 ? 'it is' : 'they are'} carried forward and charged on next month's bill from the previous reading. `
        + after,
      confirmLabel: 'Confirm without them',
      destructive: true
    } : {
      title: 'Confirm this month?',
      message: summary + 'The amounts become final. ' + after,
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
        { notes: null, deferPendingReadings: pending > 0 }
      ));
      this.actionNotice.set('Month confirmed.');
      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.confirming.set(false);
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
      const [status, report, rooms, pendingTasks, recorded] = await Promise.all([
        this.nullIfMissing(firstValueFrom(this.rentService.getArrearsStatus(scope.agencyId, scope.buildingId, month))),
        this.nullIfMissing(firstValueFrom(this.rentService.getBuildingMonthlyReport(scope.agencyId, scope.buildingId, month))),
        firstValueFrom(this.rentService.getRoomPaymentStatuses(scope.agencyId, scope.buildingId, month, { page: 0, size: 200, sort: [`floorNumber,${this.roomOrder()}`, `roomName,${this.roomOrder()}`] })),
        firstValueFrom(this.rentService.getPendingReadingTasks(scope.agencyId, scope.buildingId, month)),
        firstValueFrom(this.rentService.getRecordedReadings(scope.agencyId, scope.buildingId, month)).catch(() => [] as RecordedReading[])
      ]);
      this.recorded.set(recorded);
      this.cycleKey.update((key) => key + 1);

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
