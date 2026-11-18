import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { asText, downloadCsv, fetchAllPages } from '../../../shared/utils/csv-export.util';
import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { ReminderDialogComponent } from '../components/reminder-dialog.component';
import { RoomMonthDialogComponent } from '../components/room-month-dialog.component';
import { RecordPaymentDialogComponent } from '../components/record-payment-dialog.component';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SummaryStripComponent, SummaryTile } from '../../../shared/components/summary-strip/summary-strip.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatCurrency, monthKey, monthLabel } from '../../../shared/utils/format.util';
import { FollowUpDialogComponent } from '../follow-ups/follow-up-dialog.component';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { CHANNEL_VERBS, OUTCOME_LABELS, TenantFollowUpState } from '../follow-ups/follow-ups.models';
import { displayDate } from '../../../shared/utils/display-date.util';
import { AgencyRoomStatusList, ReminderResult, ReminderTarget, RoomPaymentStatus } from '../models/rent.models';
import { NotificationService } from '../../../core/services/notification.service';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { RentService } from '../rent.service';

/** Each state as it reads on the page: the same words and tones as Rent per room. */
const STATES: Record<string, { label: string; tone: string }> = {
  PAID: { label: 'Paid', tone: 'success' },
  PENDING: { label: 'Not yet due', tone: 'neutral' },
  PARTIAL: { label: 'Part paid', tone: 'warning' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  NOT_BILLED: { label: 'Not billed', tone: 'warning' },
  VACANT: { label: 'Vacant', tone: 'neutral' }
};

/**
 * Every room across the agency for one month, whichever building it is in. Rent per room works
 * one building at a time, for doing the month's work; this answers "where do we stand everywhere",
 * so the tiles filter it to the rooms that need someone. Staff limited to some buildings see those.
 */
@Component({
  selector: 'app-agency-rooms-page',
  standalone: true,
  imports: [FollowUpDialogComponent, RoomMonthDialogComponent, RecordPaymentDialogComponent, RoomTitlePipe, PhoneMenuComponent, ReactiveFormsModule, EntityPickerComponent, RoomPickerComponent, ReminderDialogComponent, MonthNavComponent, RouterLink, PermissionGateComponent, ContextGuardComponent, EmptyStateComponent, ErrorStateComponent,
    LoadingStateComponent, PaginationComponent, SectionCardComponent, SummaryStripComponent, CardTableDirective,
    MoneyPipe],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="RENT_ARREAR_READ">
        <app-summary-strip label="Rooms by payment" [chips]="true" [hideZero]="true" [tiles]="tiles()" [active]="state()" (picked)="pick($event)" />

        <app-section-card title="Every room" [subtitle]="monthName()">
          <button type="button" actions class="btn btn-secondary" [disabled]="exporting()" (click)="exportCsv()">{{ exporting() ? 'Exporting…' : 'Export CSV' }}</button>
          <div class="compact-controls room-bar">
            <app-month-nav [(month)]="month" />
            <!-- Picked, not typed: a name typed slightly differently found nothing. -->
            <label class="field">
              <span class="sr-only">Tenant</span>
              <app-entity-picker [config]="pickers.tenant" [formControl]="tenantFilter" placeholder="Any tenant" />
            </label>
            <!-- Rooms belong to a building: offered once one is chosen. -->
            @if (context.agencyId() !== null && context.buildingId() !== null) {
              <label class="field">
                <span class="sr-only">Room</span>
                <app-room-picker [formControl]="roomFilter" [agencyId]="context.agencyId()" [buildingId]="context.buildingId()" />
              </label>
            }
            <!-- The one Send reminder, at the end of the find row, for whichever rows are ticked. -->
            @if (canRemind()) {
              <div class="remind" role="region" aria-label="Reminders">
                @if (selected().length > 0) {
                  <span class="remind__count">{{ selected().length }} selected</span>
                  <button type="button" class="text-button" (click)="selected.set([])">Clear</button>
                } @else if (anyRemindable()) {
                  <span class="muted small" id="remind-hint-all">Tick the rooms to remind</span>
                }
                <button type="button" class="btn btn-primary" [disabled]="selected().length === 0"
                        [attr.aria-describedby]="selected().length === 0 ? 'remind-hint-all' : null"
                        (click)="reminding.set(selectedTargets())">
                  Send reminder{{ selected().length > 1 ? 's' : '' }}
                </button>
              </div>
            }
          </div>

          @if (loading() && rooms().length === 0) {
            <app-loading-state label="Loading rooms…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="load()" />
          } @else if (rooms().length === 0) {
            <app-empty-state title="No rooms" description="Nothing matches that filter for this month." />
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table rooms-table">
                <thead>
                  <tr>@if (canRemind()) { <th class="check-col" data-card-label="Select"><input type="checkbox" aria-label="Select all who owe" [checked]="allSelected()" (change)="toggleAll($event)"></th> }<th>Room</th><th>Building</th><th>Tenant</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  @for (room of rooms(); track room.roomId) {
                    <tr [class.room--vacant]="!room.isOccupied" [class.row-clickable]="canOpen(room)" [attr.tabindex]="canOpen(room) ? 0 : null"
                        (click)="openRoom(room)" (keydown.enter)="openRoom(room)">
                      @if (canRemind()) {
                        <td class="check-col" (click)="$event.stopPropagation()">
                          @if (remindable(room)) {
                            <input type="checkbox" [attr.aria-label]="'Select ' + (room.tenantName || 'tenant')"
                                   [checked]="isSelected(room)" (change)="toggle(room)">
                          }
                        </td>
                      }
                      <td class="card-title">
                        <div class="cell-stack">
                          <strong>{{ (room.roomName || room.roomNumber) | roomTitle }}</strong>
                          <span class="muted card-sub">{{ room.buildingName }}</span>
                        </div>
                      </td>
                      <td class="card-skip">{{ room.buildingName }}</td>
                      <td class="card-skip">
                        <div class="cell-stack">
                          @if (link(room); as to) {
                            <a class="record-link__primary" [routerLink]="to" (click)="$event.stopPropagation()">{{ room.tenantName }}</a>
                          } @else {
                            <span>{{ room.tenantName || (room.isOccupied ? '-' : 'Vacant') }}</span>
                          }
                          @if (!room.isOccupied && room.monthlyRent) { <span class="muted">Asking {{ room.monthlyRent | money }}</span> }
                          @if (room.tenantPhone) { <app-phone-menu [phone]="room.tenantPhone" /> }
                        </div>
                      </td>
                      @if (billed(room)) {
                        <td class="num card-skip">
                          <div class="cell-stack cell-stack--end">
                            <span>{{ room.totalDue | money }}</span>
                            @if (chargesOf(room) > 0) { <span class="muted small">Rent + {{ chargesOf(room) | money }} charges</span> }
                          </div>
                        </td>
                        <td class="num card-skip">{{ room.totalPaid | money }}</td>
                        <td class="num card-skip" [class.owing]="owes(room)">{{ owes(room) ? (room.outstanding | money) : '-' }}</td>
                      } @else {
                        <td class="muted card-skip">-</td><td class="muted card-skip">-</td><td class="muted card-skip">-</td>
                      }
                      <td class="card-status">
                        <div class="chip-row">
                          <span [class]="'status-chip status-chip--' + stateOf(room).tone">{{ stateOf(room).label }}</span>
                          @if (room.pendingReports) {
                            <a class="status-chip chip-link" [class.status-chip--success]="room.pendingMatched" [class.status-chip--info]="!room.pendingMatched"
                               [routerLink]="RoutePaths.paymentReports" (click)="$event.stopPropagation()"
                               [title]="room.pendingMatched ? 'Matches a payment you entered — confirm it' : 'Reported by the tenant — confirm it'">
                              {{ room.pendingMatched ? '✓ Matched' : 'Reported' }} {{ room.pendingReportAmount | money }}
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
                            <span class="muted follow-last">{{ lastContact(f) }}</span>
                          }
                        }
                        @if (billed(room) && owes(room) && room.tenantId && room.buildingId) {
                          <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                            <button type="button" class="follow-btn" (click)="$event.stopPropagation(); followingUp.set(room)">Follow up</button>
                          </app-permission-gate>
                        }
                      </td>
                      <td class="actions-col">
                        @if (!room.isOccupied) {
                          <app-permission-gate [permissions]="['TENANT_CREATE']">
                            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.tenantAddExisting" (click)="$event.stopPropagation()">Add tenant</a>
                          </app-permission-gate>
                        }
                        @if (canOpen(room) && owes(room)) {
                          <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
                            <button type="button" class="btn btn-primary btn-sm" (click)="$event.stopPropagation(); payRoom(room)">Record payment</button>
                          </app-permission-gate>
                        }
                        @if (room.roomState === 'NOT_BILLED') {
                          <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                            <button type="button" class="btn btn-secondary btn-sm" [disabled]="billing() === room.tenantId" (click)="$event.stopPropagation(); billRoom(room)">
                              {{ billing() === room.tenantId ? 'Billing…' : 'Bill now' }}
                            </button>
                          </app-permission-gate>
                        }
                      </td>
                      <td class="card-only">
                        @if (!room.isOccupied && room.monthlyRent) {
                          <span class="muted">Asking {{ room.monthlyRent | money }}</span>
                        }
                        @if (room.isOccupied) {
                          <dl class="card-facts">
                            <div><dt>Tenant</dt><dd>{{ room.tenantName || '-' }}</dd></div>
                            <div><dt>Phone</dt><dd>
                              @if (room.tenantPhone) {
                                <app-phone-menu [phone]="room.tenantPhone" />
                              } @else { - }
                            </dd></div>
                          </dl>
                          @if (billed(room)) {
                            <dl class="card-facts">
                              <div><dt>Billed</dt><dd>{{ room.totalDue | money }}</dd></div>
                              <div><dt>Paid</dt><dd>{{ room.totalPaid | money }}</dd></div>
                              @if (owes(room)) { <div><dt>Balance</dt><dd class="owing">{{ room.outstanding | money }}</dd></div> }
                            </dl>
                          }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (pagination(); as pages) {
              <app-pagination [pagination]="pages" [size]="size()" [shown]="rooms().length" [total]="list()?.totalElements ?? null" noun="rooms"
                              (previous)="go(page() - 1)" (next)="go(page() + 1)" (sizeChange)="resize($event)" />
            }
          }
        </app-section-card>
      </app-context-guard>
    </section>

    @if (reminding(); as targets) {
      <app-reminder-dialog [payments]="targets" (sent)="reminded($event)" (closed)="reminding.set(null)" />
    }
    @if (openRoomRow(); as room) {
      <app-room-month-dialog [agencyId]="context.agencyId()!" [buildingId]="room.buildingId!" [month]="month()"
                             [room]="room" [buildingName]="room.buildingName ?? null" (changed)="load()" (pay)="payRoom(room)" (closed)="openedRoomId.set(null)" />
    }
    @if (followingUp(); as room) {
      <app-follow-up-dialog [agencyId]="context.agencyId()!" [buildingId]="room.buildingId!" [tenantId]="room.tenantId!"
                            [tenantName]="room.tenantName ?? null" [roomName]="room.roomName ?? null" [owed]="+(room.outstanding ?? 0)"
                            (saved)="followedUp()" (closed)="followingUp.set(null)" />
    }
    @if (paying(); as room) {
      <app-record-payment-dialog [agencyId]="context.agencyId()!" [buildingId]="room.buildingId!" [tenantId]="room.tenantId!"
                                 [tenantName]="room.tenantName || 'Tenant'" [month]="month()" [amount]="room.outstanding ?? null"
                                 [roomName]="room.roomName ?? null" [buildingName]="room.buildingName ?? null"
                                 (recorded)="paid()" (closed)="paying.set(null)" />
    }
  `,
  styles: [`
    .check-col { width: 1%; }
    /* A vacant room has little to say: one short line with its way forward beside it. */
    @media (max-width: 640px) {
      /* The tick sits in the card's corner, and only where there is something to remind about. */
      .rooms-table.table--cards tbody tr { position: relative; }
      .rooms-table.table--cards tbody tr > td.check-col { position: absolute; left: var(--space-3); bottom: var(--space-3); width: auto; padding: 0; }
      .rooms-table.table--cards tbody tr > td.check-col input { width: 1.6rem; height: 1.6rem; }
      .rooms-table.table--cards tbody tr > td.check-col::before { content: none; }
      .rooms-table.table--cards tbody tr > td.check-col:not(:has(input)) { display: none; }
      .rooms-table.table--cards tbody tr.room--vacant { grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--space-3); padding: var(--space-2) var(--space-3); }
      .rooms-table.table--cards tbody tr.room--vacant > td.card-title { grid-column: 1; grid-row: 1; }
      .rooms-table.table--cards tbody tr.room--vacant > td.card-only { grid-column: 1; grid-row: 2; }
      .rooms-table.table--cards tbody tr.room--vacant > td.card-status { display: none; }
      .rooms-table.table--cards tbody tr.room--vacant > td.actions-col { grid-column: 2; grid-row: 1 / span 2; order: 0; align-self: center; width: auto; }
    }
    .row-clickable { cursor: pointer; }
    /* Actions stack in their own column on a wide screen, so the table fits without scrolling sideways. */
    @media (min-width: 641px) {
      .rooms-table th, .rooms-table td { padding-inline: var(--space-2-5); }
      .actions-col { width: 1%; }
      .actions-col app-permission-gate { display: block; }
      .actions-col app-permission-gate + app-permission-gate { margin-top: var(--space-1-5); }
      .actions-col .btn { width: 100%; white-space: nowrap; }
    }
    .chip-row { display: flex; gap: var(--space-1-5); flex-wrap: wrap; }
    .follow-last { display: block; margin-top: var(--space-1); font-size: var(--text-xs); }
    .follow-btn { display: inline-block; margin-top: var(--space-1); background: none; border: 0; padding: 0; font: inherit;
      font-size: var(--text-xs); color: var(--primary); text-decoration: underline; cursor: pointer; }
    .chip-link { text-decoration: none; }
    .cell-stack--end { justify-items: end; }
    .small { font-size: var(--text-sm); }
    .remind { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-2) var(--space-3); margin-left: auto; }
    .remind__count { font-weight: var(--weight-semibold); }
    .text-button { padding: 0; border: 0; background: none; font: inherit; font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: underline; cursor: pointer; }
    @media (max-width: 640px) {
      .remind { width: 100%; justify-content: space-between; }
    }
    .room-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .room-bar .field { flex: 1 1 14rem; min-width: 0; margin: 0; }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }
    .room-phone { color: var(--primary-strong); font-weight: var(--weight-semibold); text-decoration: none; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyRoomsPageComponent {
  private readonly rent = inject(RentService);
  readonly context = inject(ActiveContextService);
  readonly RoutePaths = RoutePaths;
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);

  readonly thisMonth = monthKey();
  /** Shared with the other rent pages. */
  readonly month = inject(WorkingMonthService).month;
  readonly monthName = computed(() => monthLabel(this.month()));

  readonly list = signal<AgencyRoomStatusList | null>(null);
  readonly rooms = computed(() => this.list()?.rooms ?? []);
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

  kes(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  /** Best effort: the rooms are the page, the follow-up hints only decorate them. */
  private async loadFollowStates(rooms: readonly RoomPaymentStatus[]): Promise<void> {
    const agencyId = this.context.agencyId();
    const ids = rooms.filter((room) => room.tenantId && this.owes(room)).map((room) => room.tenantId!);
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
  readonly loading = signal(false);
  /** Tenant being billed by Bill now. */
  readonly billing = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly state = signal<string | null>(null);

  /** The server checks this per building; here it only decides whether to offer the ticks. */
  readonly canRemind = computed(() => this.context.canAny(['RENT_PAYMENT_WRITE']));
  /** Bills ticked for a reminder, by rent record. */
  readonly selected = signal<number[]>([]);
  readonly reminding = signal<ReminderTarget[] | null>(null);
  readonly anyRemindable = computed(() => this.rooms().some((room) => this.remindable(room)));
  readonly allSelected = computed(() => {
    const open = this.rooms().filter((room) => this.remindable(room));
    return open.length > 0 && open.every((room) => this.isSelected(room));
  });

  /** A reminder is about a bill with money on it: a vacant, unbilled or settled room has nothing to say. */
  remindable(room: RoomPaymentStatus): boolean {
    return !!room.rentPaymentId && !!room.isOccupied && this.owes(room);
  }

  isSelected(room: RoomPaymentStatus): boolean {
    return this.selected().includes(room.rentPaymentId!);
  }

  toggle(room: RoomPaymentStatus): void {
    const id = room.rentPaymentId!;
    this.selected.update((ids) => ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]);
  }

  toggleAll(event: Event): void {
    this.selected.set((event.target as HTMLInputElement).checked
      ? this.rooms().filter((room) => this.remindable(room)).map((room) => room.rentPaymentId!)
      : []);
  }

  selectedTargets(): ReminderTarget[] {
    const agencyId = this.context.agencyId()!;
    return this.rooms().filter((room) => this.remindable(room) && this.isSelected(room)).map((room) => ({
      paymentId: room.rentPaymentId!,
      agencyId,
      buildingId: room.buildingId!,
      tenantName: room.tenantName ?? 'Tenant'
    }));
  }

  /** Skipped ones are explained in the dialog, which stays open for them. */
  reminded(results: ReminderResult[]): void {
    const sent = results.filter((result) => result.sent).length;
    if (sent > 0) {
      this.toasts.push('success', `${sent} reminder${sent === 1 ? '' : 's'} sent.`);
    }
    this.selected.set([]);
  }
  readonly pickers = inject(EntityPickerRegistry);
  readonly tenantFilter = new FormControl<number | null>(null);
  readonly roomFilter = new FormControl<number | null>(null);
  private readonly tenantId = toSignal(this.tenantFilter.valueChanges, { initialValue: null });
  private readonly roomId = toSignal(this.roomFilter.valueChanges, { initialValue: null });
  readonly page = signal(0);
  readonly size = signal(20);

  readonly tiles = computed<SummaryTile[]>(() => {
    const counts = this.list()?.counts;
    if (!counts) {
      return [];
    }
    const tile = (key: string, label: string, act = false): SummaryTile => ({ key, label, value: counts[key] ?? 0, filter: true, act });
    return [
      tile('OCCUPIED', 'Occupied'),
      tile('PAID', 'Paid'),
      tile('PENDING', 'Not yet due'),
      tile('PARTIAL', 'Part paid', true),
      tile('OVERDUE', 'Overdue', true),
      tile('NOT_BILLED', 'Not billed', true),
      tile('VACANT', 'Vacant')
    ];
  });

  readonly pagination = computed(() => {
    const list = this.list();
    if (!list || list.totalPages <= 1) {
      return null;
    }
    return { page: list.page, totalPages: list.totalPages, isFirst: list.page === 0, isLast: list.page >= list.totalPages - 1 };
  });

  private requestId = 0;

  constructor() {
    // A narrower list starts from its first page.
    merge(this.tenantFilter.valueChanges, this.roomFilter.valueChanges).pipe(takeUntilDestroyed())
      .subscribe(() => this.page.set(0));

    // A room belongs to one building, so a new building lets go of it.
    effect(() => {
      this.context.buildingId();
      untracked(() => {
        if (this.roomFilter.value !== null) {
          this.roomFilter.setValue(null);
        }
      });
    });

    effect(() => {
      // Everything the list depends on; a change to any of them reloads it.
      this.context.agencyId();
      this.context.buildingId();
      this.month();
      this.state();
      this.tenantId();
      this.roomId();
      this.page();
      this.size();
      // What was ticked belongs to the list that was showing.
      untracked(() => {
        this.selected.set([]);
        void this.load();
      });
    });
  }

  async load(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      this.list.set(null);
      return;
    }
    const request = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(this.rent.getAgencyRoomStatuses(agencyId, this.month(), {
        state: this.state(),
        buildingId: this.context.buildingId(),
        tenantId: this.tenantId(),
        roomId: this.roomId(),
        page: this.page(),
        size: this.size()
      }));
      if (request === this.requestId) {
        this.list.set(list);
        void this.loadFollowStates(list.rooms ?? []);
      }
    } catch (error) {
      if (request === this.requestId) {
        this.error.set(extractErrorMessage(error));
      }
    } finally {
      if (request === this.requestId) {
        this.loading.set(false);
      }
    }
  }

  pick(state: string | null): void {
    this.page.set(0);
    this.state.set(state);
  }


  go(page: number): void {
    this.page.set(Math.max(0, page));
  }

  resize(size: number): void {
    this.page.set(0);
    this.size.set(size);
  }

  /** Bills this room alone; everyone else's bill, and a confirmed month, stay as they are. */
  async billRoom(room: RoomPaymentStatus): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null || !room.tenantId || !room.buildingId) {
      return;
    }
    if (!await this.confirm.ask({
      title: `Bill ${room.roomName || 'this room'}?`,
      message: `Creates ${room.tenantName || 'the tenant'}'s bill for ${this.monthName()}. In a confirmed month the tenant is told it is ready, and any meter charge moves to next month's bill.`,
      confirmLabel: 'Bill now'
    })) {
      return;
    }
    this.billing.set(room.tenantId);
    try {
      await firstValueFrom(this.rent.billRoom(agencyId, room.buildingId, room.tenantId, this.month()));
      this.toasts.push('success', 'Bill created.');
      await this.load();
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.billing.set(null);
    }
  }

  stateOf(room: RoomPaymentStatus): { label: string; tone: string } {
    return STATES[room.roomState ?? ''] ?? { label: room.roomState ?? '-', tone: 'neutral' };
  }

  /** With no bill the figures are estimates, so they are not shown as a balance. */
  billed(room: RoomPaymentStatus): boolean {
    return !!room.isOccupied && room.rentRecordGenerated !== false;
  }

  owes(room: RoomPaymentStatus): boolean {
    return Number(room.outstanding ?? 0) > 0;
  }

  /** The tenant's page; a vacant room has nowhere to go from here. */
  link(room: RoomPaymentStatus): string | null {
    const agencyId = this.context.agencyId();
    return agencyId !== null && room.tenantId && room.buildingId
      ? RoutePaths.tenantDetail(agencyId, room.buildingId, room.tenantId)
      : null;
  }

  // ── A room's month, and paying it, without leaving the list ──

  readonly openedRoomId = signal<number | null>(null);
  readonly openRoomRow = computed(() => this.rooms().find((room) => room.roomId === this.openedRoomId()) ?? null);
  readonly paying = signal<RoomPaymentStatus | null>(null);

  /** Only an occupied, billed room has a month to open. */
  canOpen(room: RoomPaymentStatus): boolean {
    return !!room.isOccupied && !!room.tenantId && !!room.buildingId && this.billed(room);
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
    void this.load();
  }

  /** What the bill holds beyond the rent: the month's charges (water, garbage…). */
  chargesOf(room: RoomPaymentStatus): number {
    const extra = Number(room.totalDue ?? 0) - Number(room.monthlyRent ?? 0);
    return Number.isFinite(extra) && room.monthlyRent != null ? Math.max(0, extra) : 0;
  }

  readonly exporting = signal(false);

  /** Every room for the month with the filters on screen: who lives there, what was billed and paid. */
  async exportCsv(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.exporting.set(true);
    try {
      const { rows, truncated } = await fetchAllPages(async (page, size) => {
        const list = await firstValueFrom(this.rent.getAgencyRoomStatuses(agencyId, this.month(), {
          state: this.state(), buildingId: this.context.buildingId(), tenantId: this.tenantId(), roomId: this.roomId(), page, size
        }));
        return { items: list.rooms, pagination: { isLast: page + 1 >= (list.totalPages || 1) } };
      });
      downloadCsv(`rooms-${this.month()}`, rows, [
        { header: 'Building', value: (r) => r.buildingName },
        { header: 'Floor', value: (r) => r.floorName },
        { header: 'Room', value: (r) => asText(r.roomName ?? r.roomNumber) },
        { header: 'PayBill account', value: (r) => asText(r.paymentReference) },
        { header: 'Tenant', value: (r) => r.tenantName ?? 'Vacant' },
        { header: 'Phone', value: (r) => asText(r.tenantPhone) },
        { header: 'Moved in', value: (r) => r.moveInDate },
        { header: 'Monthly rent (KES)', value: (r) => r.monthlyRent },
        { header: 'Due (KES)', value: (r) => r.totalDue },
        { header: 'Paid (KES)', value: (r) => r.totalPaid },
        { header: 'Balance (KES)', value: (r) => r.outstanding },
        { header: 'Due date', value: (r) => r.dueDate },
        { header: 'State', value: (r) => humanizeLabel(r.roomState ?? r.paymentStatus, '') },
        { header: 'Days overdue', value: (r) => r.oldestOverdueDays }
      ]);
      this.toasts.push(truncated ? 'warning' : 'success', truncated
        ? `Exported the first ${rows.length.toLocaleString('en-KE')} rooms. Narrow the filters to export the rest.`
        : `Exported ${rows.length.toLocaleString('en-KE')} room${rows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.exporting.set(false);
    }
  }

}
