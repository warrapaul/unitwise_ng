import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { shortDate } from '../../../shared/utils/format.util';
import { UnitLabelPipe } from '../../../shared/pipes/unit-label.pipe';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { RoutePaths } from '../../../core/routes/route-paths';
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
import { formatPercent, MONEY_LOCALE, formatCurrency } from '../../../shared/utils/format.util';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import {
  ArrearsMonthRecord,
  BuildingMonthlyReport,
  PendingReadingTask,
  RecordedReading,
  ReminderResult,
  ReminderTarget,
  RoomPaymentStatus
} from '../models/rent.models';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoomMonthDialogComponent } from '../components/room-month-dialog.component';
import { RecordPaymentDialogComponent } from '../components/record-payment-dialog.component';
import { MeterReadingDialogComponent } from '../components/meter-reading-dialog.component';
import { ReminderDialogComponent } from '../components/reminder-dialog.component';
import { asText, downloadCsv } from '../../../shared/utils/csv-export.util';
import { FollowUpDialogComponent } from '../follow-ups/follow-up-dialog.component';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { CHANNEL_VERBS, OUTCOME_LABELS, TenantFollowUpState } from '../follow-ups/follow-ups.models';
import { displayDate } from '../../../shared/utils/display-date.util';


type RoomFilter = 'paid' | 'partial' | 'notDue' | 'overdue' | 'unbilled' | 'vacant';

@Component({
  selector: 'app-arrears-page',
  standalone: true,
  imports: [FollowUpDialogComponent, RoomTitlePipe, PhoneMenuComponent, UnitLabelPipe, MonthNavComponent, CardTableDirective, PluralPipe,
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
    MeterReadingDialogComponent,
    ReminderDialogComponent
  ],
  template: `
    <section class="stack">
      <!-- The month's money first: the three figures a landlord looks for before anything else. -->
      @if (report()?.buildingSummary; as totals) {
        <div class="kpi-grid month-kpis" aria-label="This month's money">
          <div class="kpi">
            <span class="kpi__label">Expected</span>
            <span class="kpi__value">{{ kes(totals.totalExpected) }}</span>
            <span class="kpi__note">Billed for {{ monthName() }}</span>
          </div>
          <div class="kpi" [class.kpi--good]="+(totals.totalPaid ?? 0) > 0">
            <span class="kpi__label">Collected</span>
            <span class="kpi__value">{{ kes(totals.totalPaid) }}</span>
            @if (totals.collectionRate != null) { <span class="kpi__note">{{ pct(totals.collectionRate) }} of expected</span> }
          </div>
          <div class="kpi" [class.kpi--bad]="+(totals.totalOutstanding ?? 0) > 0">
            <span class="kpi__label">Balance</span>
            <span class="kpi__value">{{ kes(totals.totalOutstanding) }}</span>
            <span class="kpi__note">{{ cycleRow()?.roomsWithBalance ?? 0 }} room{{ cycleRow()?.roomsWithBalance === 1 ? '' : 's' }} still owe</span>
          </div>
        </div>
      }

      <!--
        The month is the unit of work: pick it, and everything below is that
        month for the building in context. On a phone the building switcher is
        in the top bar already.
      -->
      <app-section-card [title]="'Bills for ' + monthName()">
        <!-- Picking a month loads it; there is no separate Load step. -->
        <form actions class="month-bar filters" [formGroup]="form" (ngSubmit)="reload()">
          <app-month-nav [allowFuture]="true" [month]="form.controls.month.value" (monthChange)="form.controls.month.setValue($event)" />
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
                  {{ generating() || isGenerating(month) ? 'Creating…' : 'Create bills now' }}
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
                      {{ pendingTasks().length }} meter reading{{ pendingTasks().length === 1 ? ' is' : 's are' }} not entered.
                      If you confirm now, {{ pendingTasks().length === 1 ? 'that charge is' : 'those charges are' }} left off this month's bills and added to next month's.
                    } @else {
                      Every bill is complete. Confirming makes this month's amounts final and tells tenants their bills are ready to pay.
                    }
                  </span>
                  <span class="muted small">Need to waive or add a charge first? Use <a routerLink="/admin/rent/adjustments">Rent adjustments</a>.</span>
                </div>
                <!-- Both answers side by side: fill the gaps first (the usual one), or confirm and carry them. -->
                <div class="button-row">
                  @if (pendingTasks().length > 0) {
                    <button type="button" class="btn btn-primary" (click)="enterReadings()">Record readings</button>
                  }
                  @if (canConfirm()) {
                    <!-- With readings missing it carries a consequence, so it looks like one. -->
                    <button type="button" class="btn" [class.btn-primary]="pendingTasks().length === 0" [class.btn-danger]="pendingTasks().length > 0"
                            [disabled]="confirming()" (click)="confirm()">
                      {{ confirming() ? 'Confirming…' : 'Confirm month' }}
                    </button>
                  }
                </div>
              </div>
            } @else if (month.isConfirmed) {
              <p class="confirmed" role="status">✓ This month is confirmed.</p>
            }
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
          <app-loading-state label="Loading the month…" />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else {
          <!--
            Readings: what is still to enter (the last thing before confirming), and what was entered.
            Nothing to enter is one line, not a card-sized "none".
          -->
          <app-section-card id="pending-readings" title="Meter readings"
                            [subtitle]="pendingTasks().length > 0 ? readingsHint : null">
            <!-- The list itself lives on the Meter readings page; here is how many, and the way through them. -->
            @if (pendingTasks().length === 0) {
              <p class="muted">Nothing waiting for a reading in {{ monthName() }}.</p>
            } @else {
              <div class="readings-line">
                <span><strong>{{ pendingTasks().length }}</strong> {{ pendingTasks().length === 1 ? 'reading' : 'readings' }} to record for {{ monthName() }}.</span>
                <div class="readings-line__actions">
                  <a class="btn btn-secondary btn-sm" routerLink="/admin/rent/meter-readings">See all</a>
                  <button type="button" class="btn btn-primary btn-sm" (click)="enterReadings()">Record readings</button>
                </div>
              </div>
            }
            <!-- What was read this month: the figures behind each meter charge on the bills. -->
            @if (recorded().length > 0) {
              <details class="recorded" [open]="pendingTasks().length === 0">
                <summary>Readings entered for {{ monthName() }} ({{ recorded().length }})</summary>
                <div class="table-scroll">
                  <!--
                    A table on a wide screen; on a phone a card per meter, its reading in
                    one line as you would check it — previous → current = used × rate.
                  -->
                  <table appCardTable class="table table--packed">
                    <thead><tr><th>Room</th><th>Charge</th><th>Tenant</th><th class="num">Previous</th><th class="num">Current</th>
                      <th class="num">Used</th><th class="num">Rate</th><th class="num">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      @for (r of recorded(); track r.chargeId) {
                        <tr>
                          <td class="card-title">
                            <div class="cell-stack">
                              <strong>{{ r.roomName || '-' }}</strong>
                              <span class="muted card-sub">{{ r.tenantName || '-' }}</span>
                            </div>
                          </td>
                          <td class="card-skip">{{ r.chargeName }}@if (r.coversMonth) { <span class="muted"> · for {{ shortMonth(r.coversMonth) }}</span> }</td>
                          <td class="card-skip">{{ r.tenantName || '-' }}</td>
                          <td class="num card-skip">{{ r.previousReading ?? '-' }}</td>
                          <td class="num card-skip">{{ r.currentReading ?? '-' }}</td>
                          <td class="num card-skip">{{ r.consumption != null ? r.consumption + (r.unit ? ' ' + (r.unit | unitLabel) : '') : '-' }}</td>
                          <td class="num card-skip">{{ r.unitRate != null ? kes(r.unitRate) : '-' }}</td>
                          <td class="num card-skip"><strong>{{ kes(r.amount) }}</strong></td>
                          <td class="card-status"><app-status-chip [status]="r.status" /></td>
                          <td class="card-only card-meta reading-line">
                            <span>{{ r.chargeName }}@if (r.coversMonth) { · for {{ shortMonth(r.coversMonth) }} }</span>
                            <span>
                              {{ r.previousReading ?? '?' }} → {{ r.currentReading ?? '?' }}
                              @if (r.consumption != null) { = {{ r.consumption }}{{ r.unit ? ' ' + (r.unit | unitLabel) : '' }} }
                              @if (r.unitRate != null) { × {{ kes(r.unitRate) }} }
                              = <strong>{{ kes(r.amount) }}</strong>
                            </span>
                          </td>
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
              <button type="button" class="btn btn-secondary btn-sm" (click)="exportCsv()">Export CSV</button>
            </ng-container>

            <!-- The counts are the table's filters, so they sit on it. Counted from the rows, so they always agree. -->
            @if (rooms().length > 0) {
              <ul class="room-counts" aria-label="Filter rooms by payment">
                @for (chip of roomChips(); track chip.key) {
                  <li>
                    <button type="button" class="room-chip" [class.room-chip--on]="roomFilter() === chip.key"
                            [attr.aria-pressed]="roomFilter() === chip.key" (click)="pickRoomFilter(chip.key)">
                      <span [class]="'dot dot--' + chip.tone"></span>{{ chip.label }}: <strong>{{ chip.count }}</strong>
                    </button>
                  </li>
                }
              </ul>
            }

            <!-- Find on the left; the one Send reminder on the right, for whichever rows are ticked. -->
            <div class="room-tools">
              <label class="field room-search">
                <span class="sr-only">Find a room or tenant</span>
                <input type="search" placeholder="Find a room or tenant" [value]="search()" (input)="search.set($any($event.target).value)">
              </label>
              @if (canRemind()) {
                <div class="remind" role="region" aria-label="Reminders">
                  @if (selectedIds().length > 0) {
                    <span class="remind__count">{{ selectedIds().length }} selected</span>
                    <button type="button" class="text-button" (click)="selectedIds.set([])">Clear</button>
                  } @else if (anyRemindable()) {
                    <span class="muted small" id="remind-hint">Tick the rooms to remind</span>
                  }
                  <button type="button" class="btn btn-primary" [disabled]="selectedIds().length === 0"
                          [attr.aria-describedby]="selectedIds().length === 0 ? 'remind-hint' : null"
                          (click)="reminding.set(selectedTargets())">
                    Send reminder{{ selectedIds().length > 1 ? 's' : '' }}
                  </button>
                </div>
              }
            </div>

            <!-- Said here, acted on above: Create bills lives in the steps bar at the top of the page and on the dashboard. -->
            @if (notGenerated() > 0) {
              <p class="alert alert-warning" role="status">
                @if (status()?.isConfirmed) {
                  {{ notGenerated() | plural: 'occupied room' }} left out of this month's bills. Use Bill now on the room.
                } @else {
                  {{ notGenerated() | plural: 'occupied room' }} not billed for this month yet — use Create bills at the top.
                }
                @if (unbilledAmount() > 0) { Expected and Outstanding include {{ kes(unbilledAmount()) }} for it. }
              </p>
            }

            @if (visibleRooms().length === 0) {
              <p class="muted">{{ rooms().length === 0 ? 'No rooms.' : roomFilter() ? 'No rooms with that status.' : 'No occupied rooms.' }}</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table month-table">
                  <thead>
                    <tr>
                      @if (canRemind()) {
                        <th class="check-col" data-card-label="Select"><input type="checkbox" aria-label="Select all who owe" [checked]="allSelected()" (change)="toggleAll($event)"></th>
                      }
                      <th [attr.aria-sort]="roomOrder() === 'asc' ? 'ascending' : 'descending'">
                        <button type="button" class="sort-toggle" (click)="flipRoomOrder()"
                                [attr.aria-label]="'Room, by floor then room, ' + (roomOrder() === 'asc' ? 'ascending' : 'descending') + '. Reverse order'">
                          Room <span aria-hidden="true">{{ roomOrder() === 'asc' ? '▲' : '▼' }}</span>
                        </button>
                      </th>
                      <th>Tenant</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th>
                      <th><span class="visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <!-- One tbody per floor, headed by its name: the building as it is walked. -->
                  @for (floor of floors(); track $index) {
                  <tbody>
                    <tr class="floor-row">
                      <th [attr.colspan]="canRemind() ? 8 : 7" scope="rowgroup">{{ floor.name }} <span class="muted">· {{ floor.rooms.length | plural: 'room' }}</span></th>
                    </tr>
                    @for (room of floor.rooms; track room.roomId) {
                      <tr [class.row-clickable]="canOpen(room)" [attr.tabindex]="canOpen(room) ? 0 : null"
                          (click)="openRoom(room)" (keydown.enter)="openRoom(room)">
                        @if (canRemind()) {
                          <td class="check-col" (click)="$event.stopPropagation()">
                            @if (remindable(room)) {
                              <input type="checkbox" [attr.aria-label]="'Select ' + (room.tenantName || 'tenant')" [checked]="isSelected(room)" (change)="toggle(room)">
                            }
                          </td>
                        }
                        <td>
                          <div class="cell-stack">
                            <strong>{{ (room.roomName || room.roomNumber) | roomTitle }}</strong>
                            @if (room.paymentReference) { <span class="muted mono" title="PayBill account number for this room">{{ room.paymentReference }}</span> }
                          </div>
                        </td>
                        <td class="card-skip">
                          <div class="cell-stack">
                            @if (tenantLink(room); as to) {
                              <a class="record-link__primary" [routerLink]="to" (click)="$event.stopPropagation()">{{ room.tenantName }}</a>
                            } @else {
                              <span>{{ room.tenantName || (room.isOccupied ? '-' : 'Vacant') }}</span>
                            }
                            @if (!room.isOccupied && room.monthlyRent) { <span class="muted">Asking {{ kes(room.monthlyRent) }}</span> }
                            @if (room.tenantPhone) { <app-phone-menu [phone]="room.tenantPhone" /> }
                          </div>
                        </td>
                        @if (isUnbilled(room)) {
                          <td class="muted card-skip">-</td>
                          <td class="muted card-skip">-</td>
                          <td class="muted card-skip">-</td>
                          <td class="card-status"><span class="status-chip status-chip--warning">Not billed yet</span></td>
                        } @else {
                          <td class="num card-skip">
                            <div class="cell-stack cell-stack--end">
                              <span>{{ kes(room.totalDue) }}</span>
                              @if (chargesOf(room) > 0) { <span class="muted small">Rent + {{ kes(chargesOf(room)) }} charges</span> }
                            </div>
                          </td>
                          <td class="num card-skip">{{ kes(room.totalPaid) }}</td>
                          <td class="num card-skip">{{ kes(room.outstanding) }}</td>
                          <td class="card-status" [class.card-skip]="!room.isOccupied">
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
                                @if (followState(room); as f) {
                                  @if (f.promiseStatus === 'OPEN') {
                                    <span class="status-chip status-chip--info" title="Promise to pay">Promised {{ kes(f.promisedAmount) }} by {{ shortDay(f.promisedDate) }}</span>
                                  }
                                }
                              </div>
                              @if (followState(room); as f) {
                                @if (f.lastContactedAt && f.promiseStatus !== 'OPEN') {
                                  <span class="muted small follow-last">{{ lastContact(f) }}</span>
                                }
                              }
                              @if (+(room.outstanding ?? 0) > 0 && room.tenantId) {
                                <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                                  <button type="button" class="link-button follow-btn" (click)="$event.stopPropagation(); followingUp.set(room)">Follow up</button>
                                </app-permission-gate>
                              }
                            } @else {
                              <span class="muted">-</span>
                            }
                          </td>
                        }
                        <!-- The next thing to do for the room, on its row; the row itself opens the month's detail. -->
                        <td class="row-action">
                          @if (canOpen(room)) {
                            @if (+(room.outstanding ?? 0) > 0) {
                              <!-- The main action, at the end of the row. Reminders go from the one button above the table. -->
                              <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
                                <button type="button" class="btn btn-primary btn-sm" (click)="$event.stopPropagation(); payRoom(room)">Record payment</button>
                              </app-permission-gate>
                            }
                            <span class="row-go" aria-hidden="true">›</span>
                          } @else if (!room.isOccupied) {
                            <app-permission-gate [permissions]="['TENANT_CREATE']">
                              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.tenantAddExisting" (click)="$event.stopPropagation()">Add tenant</a>
                            </app-permission-gate>
                          } @else if (isUnbilled(room)) {
                            <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                              <button type="button" class="btn btn-secondary btn-sm" [disabled]="billingRoomId() === room.tenantId" (click)="$event.stopPropagation(); billRoom(room)">
                                {{ billingRoomId() === room.tenantId ? 'Billing…' : 'Bill now' }}
                              </button>
                            </app-permission-gate>
                          }
                        </td>
                        <!-- The phone card: who lives here (and a number to call), then where the month's money stands. -->
                        <td class="card-only room-line">
                          @if (room.tenantName || room.isOccupied) {
                            <dl class="card-facts">
                              <div><dt>Tenant</dt><dd>{{ room.tenantName || '-' }}</dd></div>
                              <div><dt>Phone</dt><dd>
                                @if (room.tenantPhone) {
                                  <app-phone-menu [phone]="room.tenantPhone" />
                                } @else { - }
                              </dd></div>
                            </dl>
                            @if (!isUnbilled(room)) {
                              <dl class="card-facts">
                                <div><dt>Billed</dt><dd>{{ kes(room.totalDue) }}</dd></div>
                                <div><dt>Paid</dt><dd>{{ kes(room.totalPaid) }}</dd></div>
                                @if (+(room.outstanding ?? 0) !== 0) {
                                  <div><dt>Balance</dt><dd class="room-owing">{{ kes(room.outstanding) }}</dd></div>
                                }
                              </dl>
                            }
                          } @else {
                            <span class="muted">Vacant@if (room.monthlyRent) { · asking {{ kes(room.monthlyRent) }} }</span>
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
      @if (followingUp(); as room) {
        <app-follow-up-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [tenantId]="room.tenantId!"
                              [tenantName]="room.tenantName ?? null" [roomName]="room.roomName ?? null" [owed]="+(room.outstanding ?? 0)"
                              (saved)="followedUp()" (closed)="followingUp.set(null)" />
      }
      @if (reminding(); as targets) {
        <app-reminder-dialog [payments]="targets" (sent)="reminded($event)" (closed)="reminding.set(null)" />
      }
      @if (reading(); as task) {
        <app-meter-reading-dialog [agencyId]="scoped.agencyId!" [buildingId]="scoped.buildingId!" [task]="task"
                                  (saved)="readingSaved()" (closed)="reading.set(null); walking.set(false)" />
      }
    }
  `,
  styles: [`
    .room-owing { color: var(--danger); font-weight: var(--weight-semibold); }
    .room-phone { color: var(--primary-strong); text-decoration: none; }
    .confirm-panel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-4); padding: var(--space-4) var(--space-4);
                     border-radius: var(--radius-md); border-left: 4px solid var(--success); background: var(--success-tint); }
    .confirm-panel--warn { border-left-color: var(--warning); background: var(--warning-tint); }
    .confirm-panel__text { display: grid; gap: var(--space-1); min-width: 0; flex: 1 1 20rem; }
    .confirm-panel .small { font-size: var(--text-sm); }
    .confirmed { margin: 0; font-weight: var(--weight-semibold); color: var(--success); }
    .month-bar { display: flex; align-items: end; gap: var(--space-2); flex-wrap: wrap; }
    .month-bar .field { min-width: 11rem; }
    .row-action { text-align: right; white-space: nowrap; }
    @media (min-width: 641px) {
      .month-table th, .month-table td { padding-inline: var(--space-2-5); }
      .row-action { width: 1%; }
      .row-action > a.btn, .row-action > app-permission-gate { display: block; }
      .row-action > * + * { margin-top: var(--space-1-5); }
      .row-action .btn { width: 100%; margin-left: 0 !important; justify-content: center; text-align: center; }
      .row-go { display: none; }
    }
    .month-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    @media (max-width: 520px) { .month-kpis { grid-template-columns: minmax(0, 1fr); } }
    /* Search and Send reminder stay in reach while scrolling a long building. */
    .room-tools { position: sticky; top: 0; z-index: 6; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
                  gap: var(--space-2) var(--space-3); padding: var(--space-2) 0; background: var(--surface); }
    .room-search { flex: 1 1 16rem; max-width: 24rem; margin: 0; }
    .remind { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-2) var(--space-3); margin-left: auto; }
    .remind__count { font-weight: var(--weight-semibold); }
    .check-col { width: 1%; }
    .check-col input { width: 1.35rem; height: 1.35rem; cursor: pointer; }
    @media (max-width: 640px) {
      /* On a phone the button stays in reach while ticking down the cards. */
      .room-tools { top: var(--topbar-height); }
      .remind { width: 100%; justify-content: space-between; }
      .check-col input { width: 1.6rem; height: 1.6rem; }
    }
    .reading-line { font-variant-numeric: tabular-nums; }
    .small { font-size: var(--text-sm); }
    .steps__count { font-variant-numeric: tabular-nums; font-weight: var(--weight-semibold); }
    .sort-toggle { display: inline-flex; align-items: center; gap: var(--space-1); padding: 0; border: 0; background: none; font: inherit; font-weight: inherit; color: inherit; cursor: pointer; }
    .sort-toggle span { font-size: var(--text-2xs); color: var(--text-muted); }

    .create-bar { display: flex; justify-content: flex-end; }
    .recorded summary { cursor: pointer; font-weight: var(--weight-semibold); }
    .recorded[open] summary { margin-bottom: var(--space-2); }
    .cell-stack--end { justify-items: end; }
    .row-go { margin-left: var(--space-2); color: var(--text-subtle); }
    .readings-line { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); }
    .readings-line__actions { display: flex; gap: var(--space-2); margin-left: auto; }

    /* The whole card opens the room, so on a phone the row ends with its main action, not an arrow. */
    @media (max-width: 640px) {
      .row-go { display: none; }
    }

    /* A real table cell on a wide screen: as a flex box it left the column and slid over the one beside it. */
    .row-action .btn { margin-left: var(--space-1-5); }
    @media (max-width: 640px) {
      .row-action { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-1-5); }
      .row-action .btn { margin-left: 0; }
    }
    .text-button { padding: 0; border: 0; background: none; font: inherit; font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: underline; cursor: pointer; }

    .steps-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
    .steps { display: flex; flex-wrap: wrap; gap: var(--space-1-5) var(--space-4); margin: 0; padding: 0; list-style: none; font-size: var(--text-md); color: var(--text-muted); }
    .steps li { display: flex; align-items: center; gap: var(--space-1-5); }
    .steps__n {
      display: inline-grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: var(--radius-pill);
      border: 1px solid var(--border); background: var(--surface-2); font-size: var(--text-2xs); font-weight: var(--weight-bold);
    }
    .steps__done { color: var(--text); }
    .steps__done .steps__n { background: var(--primary); border-color: var(--primary); color: var(--surface); }

    .totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2) var(--space-3); margin: 0; }
    .totals div { display: grid; gap: var(--space-0-5); }
    .totals dt { font-size: var(--text-xs); color: var(--text-muted); }
    .totals dd { margin: 0; font-weight: var(--weight-semibold); }

    .blocker { font-size: var(--text-sm); }

    .room-counts { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin: 0; padding: 0; list-style: none; font-size: var(--font-description); color: var(--text-muted); }
    .room-counts li { display: inline-flex; align-items: center; gap: var(--space-1); }
    .room-counts strong { color: var(--text); font-variant-numeric: tabular-nums; }
    .room-chip { display: inline-flex; align-items: center; gap: var(--space-1-5); min-height: var(--control-sm); padding: 0 var(--space-2-5);
                 border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); color: inherit; font: inherit; cursor: pointer; }
    .room-chip--on { border-color: var(--primary); background: var(--surface-2); font-weight: var(--weight-semibold); }
    .dot { width: 0.55rem; height: 0.55rem; border-radius: var(--radius-pill); flex: none; }
    .dot--success { background: var(--success); }
    .dot--warning { background: var(--warning); }
    .dot--danger { background: var(--danger); }
    .dot--neutral { background: var(--text-subtle); }
    .floor-row th { padding-top: var(--space-4); font-size: var(--text-sm); text-align: left; color: var(--text); background: var(--surface-2); }
    .chip-row { display: flex; gap: var(--space-1-5); flex-wrap: wrap; }
    .follow-last { display: block; margin-top: var(--space-1); }
    .follow-btn { display: inline-block; margin-top: var(--space-1); background: none; border: 0; padding: 0; font: inherit;
      font-size: var(--text-xs); color: var(--primary); text-decoration: underline; cursor: pointer; }
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
  private readonly followUps = inject(FollowUpsService);
  /** Each tenant's latest contact and open promise; empty if it could not be loaded. */
  private readonly followStates = signal<ReadonlyMap<number, TenantFollowUpState>>(new Map());
  readonly followingUp = signal<RoomPaymentStatus | null>(null);

  followState(room: RoomPaymentStatus): TenantFollowUpState | null {
    return room.tenantId ? this.followStates().get(room.tenantId) ?? null : null;
  }

  lastContact(f: TenantFollowUpState): string {
    const verb = f.lastChannel ? CHANNEL_VERBS[f.lastChannel] : 'Contacted';
    const outcome = f.lastOutcome ? OUTCOME_LABELS[f.lastOutcome].toLowerCase() : '';
    return `${verb} ${this.shortDay(f.lastContactedAt)}${outcome ? ' · ' + outcome : ''}`;
  }

  shortDay(value: string | null | undefined): string {
    return value ? displayDate(value.slice(0, 10)) : '';
  }

  /** Best effort: the rooms are the page, the follow-up hints only decorate them. */
  private async loadFollowStates(rooms: RoomPaymentStatus[]): Promise<void> {
    const agencyId = this.scope().agencyId;
    const ids = rooms.filter((room) => room.tenantId && +(room.outstanding ?? 0) > 0).map((room) => room.tenantId!);
    if (agencyId === null || ids.length === 0) {
      this.followStates.set(new Map());
      return;
    }
    try {
      const states = await firstValueFrom(this.followUps.states(agencyId, ids));
      this.followStates.set(new Map(states.map((state) => [state.tenantId, state])));
    } catch {
      this.followStates.set(new Map());
    }
  }

  followedUp(): void {
    this.followingUp.set(null);
    this.toasts.push('success', 'Follow-up logged.');
    void this.loadFollowStates(this.rooms());
  }
  readonly pendingTasks = signal<PendingReadingTask[]>([]);

  /** Occupied, but this month's record does not exist yet. Vacant rooms are never billed. */
  isUnbilled(room: RoomPaymentStatus): boolean {
    return !!room.isOccupied && room.rentRecordGenerated === false;
  }

  readonly notGenerated = computed(() => this.rooms().filter((room) => this.isUnbilled(room)).length);
  /** What the unbilled rooms add to the month's totals: the server estimates them before any bill exists. */
  readonly unbilledAmount = computed(() => this.rooms().filter((room) => this.isUnbilled(room))
    .reduce((sum, room) => sum + Number(room.totalDue ?? 0), 0));

  /** Vacant rooms have nothing to collect: hidden by default, one tap away. */
  readonly occupiedOnly = signal(true);
  readonly recorded = signal<RecordedReading[]>([]);
  readonly readingsHint = "Record each reading; anything left when you confirm moves to next month's bill.";
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
      const oldest = Math.max(days, room.oldestOverdueDays ?? 0);
      return { key: 'overdue', label: oldest > 0 ? `Overdue ${oldest} day${oldest === 1 ? '' : 's'}` : 'Overdue', tone: oldest > 30 ? 'danger' : 'warning' };
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
    return Number.isNaN(date.getTime()) ? value : shortDate(date, { month: 'short', year: 'numeric' });
  }
  /** The chip pressed; it narrows the rows below until it is pressed again. */
  readonly roomFilter = signal<RoomFilter | null>(null);

  /** The counts are the filter. Not billed only appears when there is such a room, or the rest cannot add up. */
  readonly roomChips = computed(() => {
    const counts = this.counts();
    const chips: { key: RoomFilter; label: string; tone: string; count: number }[] = [
      { key: 'paid', label: 'Paid', tone: 'success', count: counts.paid },
      { key: 'partial', label: 'Part paid', tone: 'warning', count: counts.partial },
      { key: 'notDue', label: 'Not yet due', tone: 'neutral', count: counts.notDue },
      { key: 'overdue', label: 'Overdue', tone: 'danger', count: counts.overdue }
    ];
    const withUnbilled = this.notGenerated() > 0
      ? [...chips, { key: 'unbilled' as const, label: 'Not billed', tone: 'warning', count: this.notGenerated() }]
      : chips;
    const vacant = this.rooms().filter((room) => !room.isOccupied).length;
    return vacant > 0 ? [...withUnbilled, { key: 'vacant' as const, label: 'Vacant', tone: 'neutral', count: vacant }] : withUnbilled;
  });

  pickRoomFilter(key: RoomFilter): void {
    this.roomFilter.update((current) => current === key ? null : key);
  }

  private inFilter(room: RoomPaymentStatus, filter: RoomFilter): boolean {
    if (filter === 'vacant') {
      return !room.isOccupied;
    }
    if (!room.isOccupied) {
      return false;
    }
    if (this.isUnbilled(room)) {
      return filter === 'unbilled';
    }
    const key = this.rowStatus(room).key;
    return (key === 'credit' ? 'paid' : key) === filter;
  }

  /** Typed room or tenant: narrows whatever the chips and switch already show. */
  readonly search = signal('');

  readonly visibleRooms = computed(() => {
    const filter = this.roomFilter();
    const base = filter
      ? this.rooms().filter((room) => this.inFilter(room, filter))
      : this.occupiedOnly() ? this.rooms().filter((room) => room.isOccupied) : this.rooms();
    const q = this.search().trim().toLowerCase();
    return q ? base.filter((room) => `${room.roomName ?? room.roomNumber ?? ''} ${room.tenantName ?? ''} ${room.paymentReference ?? ''}`.toLowerCase().includes(q)) : base;
  });

  // ── Reminders to several tenants at once ──

  readonly canRemind = computed(() => this.context.canAny(['RENT_PAYMENT_WRITE']));
  readonly selectedIds = signal<number[]>([]);
  readonly reminding = signal<ReminderTarget[] | null>(null);
  readonly anyRemindable = computed(() => this.visibleRooms().some((room) => this.remindable(room)));
  readonly allSelected = computed(() => {
    const open = this.visibleRooms().filter((room) => this.remindable(room));
    return open.length > 0 && open.every((room) => this.isSelected(room));
  });

  remindable(room: RoomPaymentStatus): boolean {
    return !!room.rentPaymentId && !!room.isOccupied && Number(room.outstanding ?? 0) > 0;
  }

  isSelected(room: RoomPaymentStatus): boolean {
    return this.selectedIds().includes(room.rentPaymentId!);
  }

  toggle(room: RoomPaymentStatus): void {
    const id = room.rentPaymentId!;
    this.selectedIds.update((ids) => ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]);
  }

  toggleAll(event: Event): void {
    this.selectedIds.set((event.target as HTMLInputElement).checked
      ? this.visibleRooms().filter((room) => this.remindable(room)).map((room) => room.rentPaymentId!)
      : []);
  }

  selectedTargets(): ReminderTarget[] {
    const scope = this.scope();
    return this.rooms().filter((room) => this.remindable(room) && this.isSelected(room)).map((room) => ({
      paymentId: room.rentPaymentId!,
      agencyId: scope.agencyId!,
      buildingId: room.buildingId ?? scope.buildingId!,
      tenantName: room.tenantName ?? 'Tenant'
    }));
  }

  reminded(results: ReminderResult[]): void {
    const sent = results.filter((result) => result.sent).length;
    if (sent > 0) {
      this.toasts.push('success', `${sent} reminder${sent === 1 ? '' : 's'} sent.`);
    }
    this.selectedIds.set([]);
  }

  /** The tenant's own page, from their name. */
  tenantLink(room: RoomPaymentStatus): string | null {
    const scope = this.scope();
    return scope.agencyId !== null && scope.buildingId !== null && room.tenantId && room.tenantName
      ? RoutePaths.tenantDetail(scope.agencyId, scope.buildingId, room.tenantId)
      : null;
  }

  /** The rooms as shown — floor order, filters and search — as a spreadsheet. */
  exportCsv(): void {
    downloadCsv(`${this.scope().buildingName || 'building'}-rooms-${this.form.getRawValue().month}`, this.visibleRooms(), [
      { header: 'Floor', value: (r) => r.floorName },
      { header: 'Room', value: (r) => asText(r.roomName ?? r.roomNumber) },
      { header: 'PayBill account', value: (r) => asText(r.paymentReference) },
      { header: 'Tenant', value: (r) => r.tenantName ?? (r.isOccupied ? '' : 'Vacant') },
      { header: 'Phone', value: (r) => asText(r.tenantPhone) },
      { header: 'Monthly rent (KES)', value: (r) => r.monthlyRent },
      { header: 'Billed (KES)', value: (r) => this.isUnbilled(r) ? '' : r.totalDue },
      { header: 'Charges (KES)', value: (r) => this.isUnbilled(r) ? '' : this.chargesOf(r) },
      { header: 'Paid (KES)', value: (r) => this.isUnbilled(r) ? '' : r.totalPaid },
      { header: 'Balance (KES)', value: (r) => this.isUnbilled(r) ? '' : r.outstanding },
      { header: 'Status', value: (r) => !r.isOccupied ? 'Vacant' : this.isUnbilled(r) ? 'Not billed yet' : this.rowStatus(r).label },
      { header: 'Reported, waiting (KES)', value: (r) => r.pendingReports ? r.pendingReportAmount : '' }
    ]);
  }

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
    if (this.roomFilter()) {
      return `Showing ${this.visibleRooms().length} of ${this.rooms().length} rooms`;
    }
    return this.occupiedOnly()
      ? `Showing the ${occupied} occupied room${occupied === 1 ? '' : 's'} of ${this.rooms().length}`
      : `${this.rooms().length} rooms · ${occupied} occupied`;
  });

  readonly monthName = computed(() => {
    this.status();
    const date = new Date(`${this.form.getRawValue().month}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'this month' : shortDate(date, { month: 'long', year: 'numeric' });
  });

  /** Bills are being created in the background; the page polls until they are in. */
  isGenerating(month: ArrearsMonthRecord): boolean {
    return month.status === 'GENERATING' || month.status === 'REGENERATING';
  }



  /** "KES 6,000": the same formatting in every figure on the page. */
  kes(value: number | string | null | undefined): string {
    return formatCurrency(value);
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
  /** Tenant being billed by Bill now, so its button shows the work. */
  readonly billingRoomId = signal<number | null>(null);

  /** Bills this room alone; everyone else's bill, and a confirmed month, stay as they are. */
  async billRoom(room: RoomPaymentStatus): Promise<void> {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null || !room.tenantId) {
      return;
    }
    if (!await this.confirmDialog.ask({
      title: `Bill ${room.roomName || 'this room'}?`,
      message: `Creates ${room.tenantName || 'the tenant'}'s bill for ${this.monthName()}. In a confirmed month the tenant is told it is ready, and any meter charge moves to next month's bill.`,
      confirmLabel: 'Bill now'
    })) {
      return;
    }
    this.billingRoomId.set(room.tenantId);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.rentService.billRoom(scope.agencyId, scope.buildingId, room.tenantId, this.form.getRawValue().month));
      this.toasts.push('success', 'Bill created.');
      await this.reload();
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.billingRoomId.set(null);
    }
  }

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

  /** "Record readings": one dialog after another, from the first missing reading to the last. */
  readonly walking = signal(false);

  enterReadings(): void {
    const first = this.pendingTasks()[0];
    if (first) {
      this.walking.set(true);
      this.reading.set(first);
    }
  }

  async readingSaved(): Promise<void> {
    const saved = this.reading();
    this.reading.set(null);
    await this.reload();
    const next = this.walking() ? this.pendingTasks().find((task) => task.chargeId !== saved?.chargeId) : undefined;
    if (next) {
      this.toasts.push('success', `Reading saved. ${this.pendingTasks().length} left.`);
      this.reading.set(next);
    } else {
      this.toasts.push('success', this.walking() ? 'All readings entered.' : 'Reading saved.');
      this.walking.set(false);
    }
  }

  readonly generating = signal(false);
  readonly confirming = signal(false);
  readonly actionError = signal<ApiError | null>(null);
  readonly actionNotice = signal<string | null>(null);

  /** Shared with the other rent pages: the month picked anywhere opens here too. */
  private readonly workingMonth = inject(WorkingMonthService);

  readonly form = this.formBuilder.group({
    month: [this.workingMonth.month(), [Validators.required]]
  });

  constructor() {

    // A new month is the whole question changing, so it loads straight away.
    this.form.controls.month.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((month) => {
        if (month) {
          this.workingMonth.month.set(month);
        }
        this.roomFilter.set(null);
        void this.reload();
      });

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
        reason: 'Created from the Rent this month page'
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
      void this.loadFollowStates(rooms.items);
      this.selectedIds.set([]);
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

}
