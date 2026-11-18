import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { Router } from '@angular/router';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { PermissionSets } from '../../../core/rbac/permission.constants';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BillingStepComponent } from '../../rent/components/billing-step.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatMoney, formatPercent, monthKey, monthLabel, monthRange, percentOf, roomTitle } from '../../../shared/utils/format.util';
import { StatsService } from '../stats.service';
import { RentTrendChartComponent } from './rent-trend-chart.component';
import {
  ActionItem,
  AgencyOverview,
  AgencyTrends,
  BuildingBreakdown,
  RankedEntry,
  RentCollectionStats,
  StatMetric,
  StatsQuery
} from '../models/stats.models';

/** An action-centre row: what, the detail that makes it actionable, and where it is done. */
interface AttentionRow {
  key: string;
  title: string;
  detail: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  route: string | null;
}

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

/**
 * The landlord's first screen, built to answer five questions in order: how much rent is due,
 * how much has come in, who owes, what needs doing, and how the buildings are doing.
 *
 * Financial figures first (the KPI row and collection progress), outstanding work second (the
 * action centre, open rather than folded behind a count), portfolio third (building performance,
 * the trend, lease events). Every figure is the backend's: rent from the same balance calculation
 * the rent pages use, so no total here can disagree with the page it links to.
 *
 * The month filter and the active building drive every request. A panel whose request fails is
 * left out rather than taking the page with it.
 */

const ATTENTION_ICONS: Record<string, string> = {
  TENANTS_IN_ARREARS: 'cash',
  OUTSTANDING_NOT_DUE: 'cash',
  PAYMENTS_TO_CONFIRM: 'swap',
  BILLING_AWAITING_INPUT: 'gauge',
  READINGS_DEFERRED: 'gauge',
  TENANTS_AWAITING_VERIFICATION: 'tenants',
  LEASES_PENDING_SIGNATURE: 'send',
  LEASES_EXPIRING_30D: 'key',
  APPLICATIONS_PENDING: 'user',
  UNCLAIMED_INVITATIONS: 'send',
  MAINTENANCE_OPEN: 'wrench'
};

@Component({
  selector: 'app-agency-dashboard',
  standalone: true,
  imports: [RoomTitlePipe, MonthNavComponent, CardTableDirective, 
    RouterLink,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    BillingStepComponent,
    PermissionGateComponent,
    RentTrendChartComponent
  ],
  template: `
    <section class="stack">
      <header class="page-head">
        <div class="page-head__title">
          <!-- The title says what the figures cover: the portfolio, or the one building chosen. -->
          <h1>{{ buildingId() ? scopeLabel() : 'Portfolio overview' }}</h1>
          <p>{{ buildingId() ? 'Building overview' : 'All buildings' }} · {{ monthName() }}</p>
        </div>
        <!-- The month and the day's main action on one row; the building is chosen in the app bar. -->
        <div class="page-head__filters">
          <app-month-nav [(month)]="month" />
          <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
            <a class="btn btn-primary btn-sm record-action" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
          </app-permission-gate>
        </div>
      </header>

      @if (loading() && !overview()) {
        <app-loading-state label="Loading your dashboard…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (fresh()) {
        <!-- A new agency: what to do first, and the sections by name only — never zeros dressed up as figures. -->
        <app-permission-gate [permissions]="['BUILDING_CREATE']">
          <div class="start">
            <div>
              <strong>Start by adding a building</strong>
              <span class="muted">Rooms, tenants and billing all hang off a building.</span>
            </div>
            <a class="btn btn-primary" [routerLink]="RoutePaths.buildingCreate">Create a building</a>
          </div>
        </app-permission-gate>
        <div class="kpi-grid">
          @for (name of ['Expected rent', 'Collected', 'Balance', 'Occupancy']; track name) {
            <div class="kpi"><span class="kpi__label">{{ name }}</span><span class="kpi__note">Shows once you have tenants and bills.</span></div>
          }
        </div>
      } @else {
        <!-- 1. What needs doing comes first: each row a link to where it is done. -->
        <app-section-card title="Needs your attention">
          @if (attention().length > 0) {
            <span actions [class]="hasCritical() ? 'status-chip status-chip--danger' : 'status-chip status-chip--warning'">Action required</span>
          }
          @if (attention().length > 0) {
            <ul class="attention-list">
              @for (row of attention(); track row.key) {
                <li>
                  <a class="attention-item" [class.attention-item--critical]="row.severity === 'CRITICAL'"
                     [class.attention-item--warning]="row.severity === 'WARNING'" [routerLink]="row.route">
                    <svg class="attention-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <use [attr.href]="'#nav-' + attentionIcon(row.key)" />
                    </svg>
                    <span class="attention-item__body">
                      <span class="attention-item__title">{{ row.title }}</span>
                      <span class="attention-item__detail">{{ row.detail }}</span>
                    </span>
                    <span class="attention-item__go" aria-hidden="true">›</span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <p class="muted">Nothing needs your attention for {{ monthShort() }}.</p>
          }
        </app-section-card>

        <!-- 2. The month in four numbers. -->
        <div class="kpi-grid">
          <a class="kpi" [class.kpi--zero]="!expected()" [routerLink]="buildingId() ? RoutePaths.rentArrears : RoutePaths.rentRooms">
            <span class="kpi__label">Expected rent</span>
            <span class="kpi__value">{{ money(expected()) }}</span>
            <span class="kpi__note">Bills for {{ monthShort() }}</span>
          </a>
          <a class="kpi" [class.kpi--zero]="!collected()" [routerLink]="RoutePaths.rentPayments">
            <span class="kpi__label">Collected</span>
            <span class="kpi__value">{{ money(collected()) }}</span>
            <span class="kpi__note">{{ pct(collectionRate()) }} of expected rent</span>
          </a>
          <a class="kpi" [class.kpi--bad]="outstanding() > 0" [class.kpi--zero]="!outstanding()" [routerLink]="RoutePaths.rentPortfolioOverdue">
            <span class="kpi__label">Balance</span>
            <span class="kpi__value">{{ money(outstanding()) }}</span>
            <span class="kpi__note">{{ roomsWithBalance() }} room{{ roomsWithBalance() === 1 ? '' : 's' }} with a balance for {{ monthShort() }}</span>
          </a>
          <a class="kpi" [routerLink]="RoutePaths.buildings">
            <span class="kpi__label">Occupancy</span>
            <span class="kpi__value">{{ pct(occupancyRate()) }}</span>
            <span class="kpi__note">{{ occupied() }} of {{ rooms() }} rooms occupied</span>
          </a>
        </div>

        <!-- Reported payments are claims, kept apart from collected money. -->
        @if (paymentsToConfirm() > 0) {
          <a class="claims" [routerLink]="RoutePaths.paymentReports">
            {{ paymentsToConfirm() }} reported payment{{ paymentsToConfirm() === 1 ? '' : 's' }} waiting to be confirmed — not counted above until confirmed
            <span aria-hidden="true">›</span>
          </a>
        }

        <div class="dash">
          <app-section-card title="Rent collection trend" class="dash__wide">
            <app-rent-trend-chart [series]="$safeNavigationMigration(trends()?.rentCollection)" [currency]="currency()" />
          </app-section-card>
        </div>

        <!-- 4. Each building's month; with a building chosen, its rooms that still owe. -->
        <div class="dash">
          @if (!buildingId()) {
            <app-section-card title="Building performance" class="dash__wide">
              <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentMonth">Every room</a>
              <ul class="buildings">
                @for (row of buildingRows(); track row.buildingId) {
                  <li class="building">
                    <div class="building__head">
                      <a class="building__name" title="Open this building" [routerLink]="RoutePaths.buildingDetail(agencyId(), row.buildingId!)">{{ row.buildingName }} <span aria-hidden="true">›</span></a>
                      <span class="building__money">{{ money(row.rentCollected) }} / {{ amount(row.rentExpected) }}</span>
                    </div>
                    <div class="building__meta muted">
                      <span>{{ row.rooms ?? 0 }} rooms · {{ row.occupied ?? 0 }} occupied · {{ pct(row.occupancyRate) }}</span>
                      <span>{{ row.collectionRate != null ? pct(row.collectionRate) + ' collected' : 'Nothing billed' }}</span>
                    </div>
                    <div class="progress progress--thin" aria-hidden="true">
                      <span [style.width.%]="barWidth(row.collectionRate)"></span>
                    </div>
                    <div class="building__step">
                      <span class="muted">Billing:</span>
                      <app-billing-step [agencyId]="agencyId()" [buildingId]="row.buildingId!" [buildingName]="row.buildingName ?? null"
                                        [billingDay]="row.billingDay ?? null" [month]="month()" [carried]="row.deferredMeterReadings ?? 0" />
                    </div>
                  </li>
                }
              </ul>
            </app-section-card>
          }

          @if (buildingId()) {
            <app-section-card title="Rent this month" class="dash__wide">
              <div actions class="card-actions">
                <!-- Which view this is, not two more actions. -->
                <div class="segmented" role="group" aria-label="Show">
                  <span class="segmented__item" aria-current="true">This building</span>
                  <button type="button" class="segmented__item" (click)="openAllBuildings()">All buildings</button>
                </div>
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentArrears">View all</a>
              </div>
              @if (roomBalances().length > 0) {
                <table appCardTable class="table table--packed">
                  <thead><tr><th>Room</th><th>Tenant</th><th class="num">Balance</th><th>Status</th></tr></thead>
                  <tbody>
                    @for (room of roomBalances(); track room.id) {
                      <tr>
                        <td class="card-title">
                          <div class="cell-stack">
                            <strong>{{ room.label | roomTitle }}</strong>
                            <span class="muted card-sub">{{ room.subLabel }}@if (room.formerTenant) { · Former tenant }</span>
                          </div>
                        </td>
                        <td class="card-skip">{{ room.subLabel }}@if (room.formerTenant) { · Former tenant }</td>
                        <td class="num owing" data-card-label="Balance">{{ money(room.amount) }}</td>
                        <td class="card-status">
                          @if (room.count) { <span [class]="'status-chip status-chip--' + (room.count > 30 ? 'danger' : 'warning')">Overdue {{ room.count }} {{ room.count === 1 ? 'day' : 'days' }}</span> }
                          @else { <span class="status-chip status-chip--warning">Not yet due</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted">Every room is paid up for {{ monthShort() }}.</p>
              }
            </app-section-card>
          }
        </div>

        <!-- 5. Tenancies: who is in, what is pending, and the leases about to end. -->
        <div class="dash">
          <app-section-card title="Tenants & leases">
            <div actions class="card-actions">
              <!-- With no tenants the card body carries the one Add button; the header would repeat it. -->
              @if (!noTenants()) {
                <app-permission-gate [permissions]="PermissionSets.TENANT_CREATE">
                  <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.tenantAddExisting">Add tenant</a>
                </app-permission-gate>
              }
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.tenants">View all</a>
            </div>
            @if (noTenants()) {
              <!-- Nobody yet: six zeros say nothing; the next step does. -->
              <div class="empty-tenants">
                <strong>No tenants yet</strong>
                <span class="muted">Add your first tenant: enter their details yourself, use a share code they give you, or invite them by their Unitwise ID.</span>
                <app-permission-gate [permissions]="PermissionSets.TENANT_CREATE">
                  <a class="btn btn-primary" [routerLink]="RoutePaths.tenantAddExisting">Add your first tenant</a>
                </app-permission-gate>
              </div>
            } @else {
            <dl class="facts">
              @for (fact of tenantFacts(); track fact.label) {
                <div><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
              }
            </dl>
            }
          </app-section-card>

          @if (expiries().length > 0) {
            <app-section-card title="Upcoming lease endings">
              <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.leases">Leases</a>
                <ul class="expiries">
                  @for (lease of expiries(); track lease.id) {
                    <li>
                      <a [routerLink]="RoutePaths.leaseDetail(lease.id!)">{{ lease.label }}</a>
                      <span class="muted">{{ lease.subLabel }}</span>
                      <span class="expiries__when" [class.soon]="(lease.count ?? 0) <= 30">in {{ lease.count }} day{{ lease.count === 1 ? '' : 's' }}</span>
                    </li>
                  }
                </ul>
            </app-section-card>
          } @else {
            <!-- Nothing ending is one line, not a card. -->
            <p class="muted">No lease ends in the next 90 days.</p>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: var(--space-4); align-items: stretch; }
    .dash > * { display: block; min-width: 0; }
    .dash__wide { grid-column: 1 / -1; }
    .rate { font-size: var(--text-lg); font-variant-numeric: tabular-nums; }
    .split-line { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); font-size: var(--text-sm); }
    .claims { display: flex; justify-content: space-between; gap: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--border);
              font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: none; }
    .start { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-4);
             padding: var(--space-4) var(--space-5); border: 1px dashed var(--primary); border-radius: var(--radius-md); background: var(--primary-tint); }
    .start > div { display: grid; gap: var(--space-0-5); }
    .card-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .empty-tenants { display: grid; gap: var(--space-2); justify-items: start; }

    .buildings { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
    .building { display: grid; gap: var(--space-1); }
    /* Each building its own card, with room between them: one long list with faint rules was hard to follow. */
    .building { padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
    .building__head, .building__meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1) var(--space-3); }
    /* The building's page is one tap away: styled as the link it is, not as a label. */
    .building__name { justify-self: start; font-weight: var(--weight-semibold); color: var(--primary-strong);
                      text-decoration: underline; text-decoration-color: var(--primary-ring); text-underline-offset: 0.2em; }
    .building__name:hover, .building__name:focus-visible { text-decoration-color: currentColor; }
    .building__money { font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    .building__meta { font-size: var(--text-sm); }
    .building__step { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }

    .owing { color: var(--danger); font-weight: var(--weight-semibold); }

    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
    @media (max-width: 700px) { .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .facts div { display: grid; gap: var(--space-0-5); }
    .facts dt { font-size: var(--text-xs); color: var(--text-muted); }
    .facts dd { margin: 0; font-size: var(--text-lg); font-weight: var(--weight-bold); font-variant-numeric: tabular-nums; }

    .expiries { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .expiries li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--space-3); align-items: baseline; font-size: var(--text-sm); }
    .expiries__when { font-variant-numeric: tabular-nums; }
    .expiries__when.soon { color: var(--warning); font-weight: var(--weight-semibold); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyDashboardComponent {
  readonly RoutePaths = RoutePaths;
  readonly PermissionSets = PermissionSets;

  /** No tenant in any state and no lease: the card shows the way in instead of zeros. */
  readonly noTenants = computed(() => {
    const o = this.overview();
    if (!o) {
      return false;
    }
    const t = o.tenants as Record<string, StatMetric | undefined> | null | undefined;
    const l = o.leases as Record<string, StatMetric | undefined> | null | undefined;
    return ['active', 'pendingVerification', 'noticeGiven', 'verifiedAwaitingRoom'].every((k) => this.num(t?.[k]) === 0)
      && ['current', 'pendingSignature'].every((k) => this.num(l?.[k]) === 0);
  });
  /** Who is in and what is signed always; anything else only when it needs a look. */
  readonly tenantFacts = computed(() => {
    const o = this.overview();
    const facts = [
      { label: 'Active tenants', value: this.metric(o?.tenants, 'active'), always: true },
      { label: 'Active leases', value: this.metric(o?.leases, 'active'), always: true },
      { label: 'Awaiting review', value: this.metric(o?.tenants, 'pendingVerification'), always: false },
      { label: 'On notice', value: this.metric(o?.tenants, 'noticeGiven'), always: false },
      { label: 'Awaiting signature', value: this.metric(o?.leases, 'pendingSignature'), always: false }
    ];
    return facts.filter((fact) => fact.always || (fact.value !== '—' && fact.value !== '0'));
  });
  readonly agencyId = input.required<number>();

  private readonly stats = inject(StatsService);
  private readonly context = inject(ActiveContextService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly overview = signal<AgencyOverview | null>(null);
  private readonly buildings = signal<BuildingBreakdown | null>(null);
  readonly trends = signal<AgencyTrends | null>(null);
  private loadRun = 0;

  readonly thisMonth = monthKey();
  /** Shared with the other rent pages: pick a month here and they open on it. */
  readonly month = inject(WorkingMonthService).month;
  readonly buildingId = computed(() => this.context.buildingId());

  readonly monthName = computed(() => monthLabel(this.month()));
  readonly monthShort = computed(() => this.month() === this.thisMonth ? 'this month' : this.monthName());
  readonly scopeLabel = computed(() => this.buildingId()
    ? (this.allBuildings().find((row) => row.buildingId === this.buildingId())?.buildingName ?? this.context.active().buildingName ?? 'One building')
    : 'All buildings');

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');
  private readonly rent = computed(() => (this.overview()?.rent ?? null) as RentCollectionStats | null);

  readonly expected = computed(() => this.num(this.rent()?.expected));
  readonly collected = computed(() => this.num(this.rent()?.collected));
  readonly outstanding = computed(() => this.num(this.rent()?.outstanding));
  /** The server's rate (2 decimals), shown to one; derived only when the server sent none. */
  readonly collectionRate = computed(() => this.rent()?.collectionRate?.value != null
    ? this.num(this.rent()!.collectionRate) : percentOf(this.collected(), this.expected()));
  readonly roomsWithBalance = computed(() => this.num(this.rent()?.roomsWithBalance));
  readonly paymentsToConfirm = computed(() => this.num(this.rent()?.paymentsToConfirm));
  readonly roomBalances = computed<RankedEntry[]>(() => this.rent()?.roomBalances ?? []);

  readonly occupied = computed(() => this.num(this.overview()?.occupancy?.['occupied'] as StatMetric));
  readonly rooms = computed(() => this.num(this.overview()?.portfolio?.['rooms'] as StatMetric));
  readonly occupancyRate = computed(() => {
    const rate = this.overview()?.occupancy?.['occupancyRate'] as StatMetric | undefined;
    return rate?.value != null ? this.num(rate) : percentOf(this.occupied(), this.rooms());
  });

  /** Every building, for the selector, whatever the scope. */
  readonly allBuildings = computed(() => this.buildings()?.buildings ?? []);
  readonly buildingRows = computed(() => {
    const id = this.buildingId();
    return id ? this.allBuildings().filter((row) => row.buildingId === id) : this.allBuildings();
  });
  readonly fresh = computed(() => this.buildings() !== null && this.allBuildings().length === 0);

  readonly expiries = computed<RankedEntry[]>(() => (this.overview()?.leases?.['upcomingExpiries'] as RankedEntry[] | undefined) ?? []);

  /** The server's worklist, given the detail that makes each row actionable, most urgent first. */
  readonly attention = computed<AttentionRow[]>(() => {
    const items = this.overview()?.needsAttention ?? [];
    const overdueRooms = this.roomBalances().filter((room) => (room.count ?? 0) > 0);
    const rows = items
      .filter((item) => (item.count ?? 0) > 0)
      .map((item) => this.toRow(item, overdueRooms));
    // Owing but not yet late is still money to chase: the room-level view of the month.
    const notLate = this.roomsWithBalance() - overdueRooms.length;
    if (notLate > 0) {
      const top = this.roomBalances().filter((room) => !room.count).slice(0, 2);
      rows.push({
        key: 'OUTSTANDING_NOT_DUE', severity: 'INFO', route: RoutePaths.rentArrears,
        title: 'Outstanding rent, not yet due',
        detail: this.roomsLine(top, notLate)
      });
    }
    return rows.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  });
  readonly hasCritical = computed(() => this.attention().some((row) => row.severity === 'CRITICAL'));

  constructor() {
    // Month, building and agency each redraw the page from the server.
    effect(() => {
      const [agencyId, month, buildingId] = [this.agencyId(), this.month(), this.buildingId()];
      untracked(() => void this.load(agencyId, month, buildingId));
    });
  }

  reload(): void {
    void this.load(this.agencyId(), this.month(), this.buildingId());
  }

  private async load(agencyId: number, month: string, buildingId: number | null): Promise<void> {
    // The scope can change mid-flight; only the latest request may draw the page.
    const run = ++this.loadRun;
    this.loading.set(true);
    this.error.set(null);
    const query: StatsQuery = { period: 'CUSTOM', ...monthRange(month), buildingId };
    try {
      const [overview, buildings, trends] = await Promise.all([
        firstValueFrom(this.stats.getAgencyOverview(agencyId, query)),
        // Unscoped by building: the selector and the performance list need every building.
        settle(this.stats.getAgencyBuildings(agencyId, { period: 'CUSTOM', ...monthRange(month) })),
        settle(this.stats.getAgencyTrends(agencyId, { buildingId }))
      ]);
      if (run !== this.loadRun) {
        return;
      }

      this.overview.set(overview);
      // Null when the panel failed, which says nothing about whether the agency has buildings.
      this.buildings.set(buildings);
      this.trends.set(trends);
    } catch (error) {
      if (run === this.loadRun) {
        this.error.set(extractErrorMessage(error));
      }
    } finally {
      if (run === this.loadRun) {
        this.loading.set(false);
      }
    }
  }

  /** Widen to the whole agency and open every room in it. */
  openAllBuildings(): void {
    this.context.clearBuilding();
    void this.router.navigateByUrl(RoutePaths.rentRooms);
  }


  private toRow(item: ActionItem, overdueRooms: RankedEntry[]): AttentionRow {
    const count = item.count ?? 0;
    const plural = (word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    const details: Record<string, string> = {
      TENANTS_IN_ARREARS: this.roomsLine(overdueRooms) || `${plural('tenant')} past the due date`,
      PAYMENTS_TO_CONFIRM: `${plural('payment')} reported by tenants`,
      BILLING_AWAITING_INPUT: `${count} reading${count === 1 ? ' needs' : 's need'} to be entered`,
      READINGS_DEFERRED: 'Skipped when the month was confirmed; they are read with next month\'s bill',
      TENANTS_AWAITING_VERIFICATION: `${plural('tenant')} to verify`,
      LEASES_PENDING_SIGNATURE: `${count} lease${count === 1 ? ' needs' : 's need'} follow-up`,
      LEASES_EXPIRING_30D: `${plural('lease')} ending soon`,
      APPLICATIONS_PENDING: `${plural('application')} waiting for a decision`,
      UNCLAIMED_INVITATIONS: `${plural('invitation')} not accepted yet`,
      MAINTENANCE_OPEN: `${plural('request')} open`
    };
    const titles: Record<string, string> = {
      TENANTS_IN_ARREARS: 'Overdue rent',
      PAYMENTS_TO_CONFIRM: 'Payments to confirm',
      BILLING_AWAITING_INPUT: 'Meter readings',
      READINGS_DEFERRED: 'Readings carried to next month',
      TENANTS_AWAITING_VERIFICATION: 'Tenants to review',
      LEASES_PENDING_SIGNATURE: 'Leases awaiting signature',
      LEASES_EXPIRING_30D: 'Leases ending in 30 days',
      APPLICATIONS_PENDING: 'Room applications',
      UNCLAIMED_INVITATIONS: 'Invitations',
      MAINTENANCE_OPEN: 'Maintenance requests'
    };
    const key = item.key ?? item.label ?? '';
    return {
      key,
      title: titles[key] ?? item.label ?? key,
      detail: details[key] ?? String(count),
      severity: (item.severity ?? 'INFO') as AttentionRow['severity'],
      route: item.targetPath ?? null
    };
  }

  /** The two biggest by name, and the real total when there are more: "5 rooms, led by Room 1-3 · KES 9,000". */
  private roomsLine(rooms: RankedEntry[], total = rooms.length): string {
    const named = rooms.slice(0, 2).map((room) => `${roomTitle(room.label)} · ${this.money(room.amount)}`).join(', ');
    return total > 2 ? `${total} rooms, led by ${named}` : named;
  }

  /** What each row is about, so a list of three is not three of the same mark. */
  attentionIcon(key: string): string {
    return ATTENTION_ICONS[key] ?? 'bell';
  }

  metric(block: Record<string, unknown> | null | undefined, key: string): string {
    const value = (block?.[key] as StatMetric | undefined)?.value;
    return value === null || value === undefined ? '—' : String(value);
  }

  num(metric: StatMetric | null | undefined): number {
    const parsed = Number(metric?.value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  money(value: number | string | null | undefined): string {
    return formatMoney(value, this.currency());
  }

  amount(value: number | string | null | undefined): string {
    return formatMoney(value);
  }

  pct(value: number | string | null | undefined): string {
    return formatPercent(value);
  }

  barWidth(rate: number | string | null | undefined): number {
    const value = Number(rate ?? 0);
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
  }
}

/** A panel that fails is missing, not fatal. */
async function settle<T>(source: Parameters<typeof firstValueFrom<T>>[0]): Promise<T | null> {
  try {
    return await firstValueFrom(source);
  } catch {
    return null;
  }
}
