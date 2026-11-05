import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { SummaryStripComponent, SummaryTile } from '../../../shared/components/summary-strip/summary-strip.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { monthKey, monthLabel } from '../../../shared/utils/format.util';
import { AgencyRoomStatusList, RoomPaymentStatus } from '../models/rent.models';
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
  imports: [RouterLink, PermissionGateComponent, ContextGuardComponent, ContextScopeNoticeComponent, EmptyStateComponent, ErrorStateComponent,
    LoadingStateComponent, PaginationComponent, SectionCardComponent, SummaryStripComponent, CardTableDirective,
    RowLinkDirective, MoneyPipe],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="RENT_ARREAR_READ">
        <app-context-scope-notice noun="rooms" />
        <app-summary-strip label="Rooms by payment" [tiles]="tiles()" [active]="state()" (picked)="pick($event)" />

        <app-section-card title="All rooms" [subtitle]="monthName()">
          <div class="compact-controls room-bar">
            <input type="month" aria-label="Month" [value]="month()" (change)="month.set($any($event.target).value || thisMonth)">
            <input type="search" aria-label="Search rooms" placeholder="Room, tenant, phone or building"
                   [value]="search()" (input)="onSearch($any($event.target).value)">
          </div>

          @if (loading() && rooms().length === 0) {
            <app-loading-state label="Loading rooms..." />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="load()" />
          } @else if (rooms().length === 0) {
            <app-empty-state title="No rooms" description="Nothing matches that filter for this month." />
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead>
                  <tr><th>Room</th><th>Building</th><th>Tenant</th><th class="num">Due</th><th class="num">Paid</th><th class="num">Owing</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  @for (room of rooms(); track room.roomId) {
                    <tr [appRowLink]="link(room)">
                      <td class="card-title">
                        <div class="cell-stack">
                          @if (link(room); as to) {
                            <a class="record-link__primary" [routerLink]="to">{{ room.roomName || room.roomNumber || '-' }}</a>
                          } @else {
                            <strong>{{ room.roomName || room.roomNumber || '-' }}</strong>
                          }
                          <span class="muted card-sub">{{ room.buildingName }}</span>
                        </div>
                      </td>
                      <td class="card-skip">{{ room.buildingName }}</td>
                      <td class="card-skip">
                        <div class="cell-stack">
                          <span>{{ room.tenantName || '-' }}</span>
                          @if (room.tenantPhone) { <span class="muted">{{ room.tenantPhone }}</span> }
                        </div>
                      </td>
                      @if (billed(room)) {
                        <td class="num card-skip">{{ room.totalDue | money }}</td>
                        <td class="num card-skip">{{ room.totalPaid | money }}</td>
                        <td class="num card-skip" [class.owing]="owes(room)">{{ owes(room) ? (room.outstanding | money) : '-' }}</td>
                      } @else {
                        <td class="muted card-skip">-</td><td class="muted card-skip">-</td><td class="muted card-skip">-</td>
                      }
                      <td class="card-status"><span [class]="'status-chip status-chip--' + stateOf(room).tone">{{ stateOf(room).label }}</span></td>
                      <td class="actions-col">
                        @if (room.roomState === 'NOT_BILLED') {
                          <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                            <button type="button" class="btn btn-secondary btn-sm" [disabled]="billing() === room.tenantId" (click)="$event.stopPropagation(); billRoom(room)">
                              {{ billing() === room.tenantId ? 'Billing...' : 'Bill now' }}
                            </button>
                          </app-permission-gate>
                        }
                      </td>
                      <td class="card-only">
                        @if (room.isOccupied) {
                          <dl class="card-facts">
                            <div><dt>Tenant</dt><dd>{{ room.tenantName || '-' }}</dd></div>
                            <div><dt>Phone</dt><dd>
                              @if (room.tenantPhone) {
                                <a class="room-phone" [href]="'tel:' + room.tenantPhone" [attr.aria-label]="'Call ' + (room.tenantName || 'tenant')">{{ room.tenantPhone }}</a>
                              } @else { - }
                            </dd></div>
                          </dl>
                          @if (billed(room)) {
                            <dl class="card-facts">
                              <div><dt>Due</dt><dd>{{ room.totalDue | money }}</dd></div>
                              <div><dt>Paid</dt><dd>{{ room.totalPaid | money }}</dd></div>
                              @if (owes(room)) { <div><dt>Owing</dt><dd class="owing">{{ room.outstanding | money }}</dd></div> }
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
  `,
  styles: [`
    .room-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .room-bar input[type="search"] { flex: 1 1 12rem; min-width: 0; }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }
    .room-phone { color: var(--primary-strong); font-weight: var(--weight-semibold); text-decoration: none; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyRoomsPageComponent {
  private readonly rent = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);

  readonly thisMonth = monthKey();
  /** Shared with the other rent pages. */
  readonly month = inject(WorkingMonthService).month;
  readonly monthName = computed(() => monthLabel(this.month()));

  readonly list = signal<AgencyRoomStatusList | null>(null);
  readonly rooms = computed(() => this.list()?.rooms ?? []);
  readonly loading = signal(false);
  /** Tenant being billed by Bill now. */
  readonly billing = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly state = signal<string | null>(null);
  readonly search = signal('');
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

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;

  constructor() {
    effect(() => {
      // Everything the list depends on; a change to any of them reloads it.
      this.context.agencyId();
      this.context.buildingId();
      this.month();
      this.state();
      this.page();
      this.size();
      untracked(() => void this.load());
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
        search: this.search().trim() || null,
        page: this.page(),
        size: this.size()
      }));
      if (request === this.requestId) {
        this.list.set(list);
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

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      if (this.page() === 0) {
        void this.load();
      } else {
        this.page.set(0);
      }
    }, 300);
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
}
