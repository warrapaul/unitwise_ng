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
import { formatMoney, formatPercent, monthKey, monthLabel, monthRange, percentOf } from '../../../shared/utils/format.util';
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
@Component({
  selector: 'app-agency-dashboard',
  standalone: true,
  imports: [
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
          <h1>Portfolio overview</h1>
          <p>{{ monthName() }} · {{ scopeLabel() }}</p>
        </div>
        <div class="page-head__filters">
          @if (allBuildings().length > 1) {
            <label class="sr-only" for="dash-building">Building</label>
            <select id="dash-building" (change)="pickBuilding($any($event.target).value)">
              <option value="" [selected]="!buildingId()">All buildings</option>
              @for (building of allBuildings(); track building.buildingId) {
                <option [value]="building.buildingId" [selected]="building.buildingId === buildingId()">{{ building.buildingName }}</option>
              }
            </select>
          }
          <label class="sr-only" for="dash-month">Month</label>
          <input id="dash-month" type="month" [value]="month()" (change)="month.set($any($event.target).value || thisMonth)">
        </div>
        <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
          <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
        </app-permission-gate>
      </header>

      @if (loading() && !overview()) {
        <app-loading-state label="Loading your dashboard..." />
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
          @for (name of ['Expected rent', 'Collected', 'Outstanding', 'Occupancy']; track name) {
            <div class="kpi"><span class="kpi__label">{{ name }}</span><span class="kpi__note">Shows once you have tenants and bills.</span></div>
          }
        </div>
      } @else {
        <!-- 1. The month in four numbers. -->
        <div class="kpi-grid">
          <a class="kpi" [routerLink]="RoutePaths.rentArrears">
            <span class="kpi__label">Expected rent</span>
            <span class="kpi__value">{{ money(expected()) }}</span>
            <span class="kpi__note">Bills for {{ monthShort() }}</span>
          </a>
          <a class="kpi kpi--good" [routerLink]="RoutePaths.rentPayments">
            <span class="kpi__label">Collected</span>
            <span class="kpi__value">{{ money(collected()) }}</span>
            <span class="kpi__note">{{ pct(collectionRate()) }} of expected rent</span>
          </a>
          <a class="kpi" [class.kpi--bad]="outstanding() > 0" [routerLink]="RoutePaths.rentPortfolioOverdue">
            <span class="kpi__label">Outstanding</span>
            <span class="kpi__value">{{ money(outstanding()) }}</span>
            <span class="kpi__note">{{ roomsWithBalance() }} room{{ roomsWithBalance() === 1 ? '' : 's' }} with a balance</span>
          </a>
          <a class="kpi" [routerLink]="RoutePaths.buildings">
            <span class="kpi__label">Occupancy</span>
            <span class="kpi__value">{{ pct(occupancyRate()) }}</span>
            <span class="kpi__note">{{ occupied() }} of {{ rooms() }} rooms occupied</span>
          </a>
        </div>

        <!-- 2. Received against remaining; reported payments are claims, kept apart from collected money. -->
        <app-section-card title="Collection progress">
          <strong actions class="rate">{{ pct(collectionRate()) }}</strong>
          <div class="progress" role="progressbar" [attr.aria-valuenow]="collectionRate()" aria-valuemin="0" aria-valuemax="100"
               aria-label="Share of expected rent collected">
            <span [style.width.%]="collectionRate() > 100 ? 100 : collectionRate()"></span>
          </div>
          <div class="split-line muted">
            <span>Received: {{ money(collected()) }}</span>
            <span>Remaining: {{ money(outstanding()) }}</span>
          </div>
          @if (paymentsToConfirm() > 0) {
            <a class="claims" [routerLink]="RoutePaths.paymentReports">
              {{ paymentsToConfirm() }} reported payment{{ paymentsToConfirm() === 1 ? '' : 's' }} waiting to be confirmed — not counted above until confirmed
              <span aria-hidden="true">›</span>
            </a>
          }
        </app-section-card>

        <div class="dash">
          <!-- 3. What needs doing, each row a link to where it is done. -->
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
                        @if (row.severity === 'INFO') {
                          <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
                        } @else {
                          <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" />
                        }
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

          <app-section-card title="Rent collection trend">
            <app-rent-trend-chart [series]="trends()?.rentCollection" [currency]="currency()" />
          </app-section-card>
        </div>

        <!-- 4. Each building's month; with a building chosen, its rooms that still owe. -->
        <div class="dash">
          <app-section-card title="Building performance" [class.dash__wide]="!buildingId()">
            <ul class="buildings">
              @for (row of buildingRows(); track row.buildingId) {
                <li class="building">
                  <div class="building__head">
                    <a class="building__name" [routerLink]="RoutePaths.buildingDetail(agencyId(), row.buildingId!)">{{ row.buildingName }}</a>
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

          @if (buildingId()) {
            <app-section-card title="Rent per room">
              <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentArrears">Open</a>
              @if (roomBalances().length > 0) {
                <table class="table table--packed">
                  <thead><tr><th>Room</th><th>Tenant</th><th class="num">Balance</th><th class="num">Overdue</th></tr></thead>
                  <tbody>
                    @for (room of roomBalances(); track room.id) {
                      <tr>
                        <td>{{ room.label }}</td>
                        <td>{{ room.subLabel }}</td>
                        <td class="num owing">{{ amount(room.amount) }}</td>
                        <td class="num muted">{{ room.count ? room.count + ' days' : 'Not due' }}</td>
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
            <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.tenantsOverview">View all</a>
            <dl class="facts">
              <div><dt>Active tenants</dt><dd>{{ metric(overview()?.tenants, 'active') }}</dd></div>
              <div><dt>Awaiting review</dt><dd>{{ metric(overview()?.tenants, 'pendingVerification') }}</dd></div>
              <div><dt>On notice</dt><dd>{{ metric(overview()?.tenants, 'noticeGiven') }}</dd></div>
              <!-- Current = active + awaiting signature, so a lease out for signing is never a zero. -->
              <div><dt>Current leases</dt><dd>{{ metric(overview()?.leases, 'current') }}</dd></div>
              <div><dt>Awaiting signature</dt><dd>{{ metric(overview()?.leases, 'pendingSignature') }}</dd></div>
              <div><dt>Signed and active</dt><dd>{{ metric(overview()?.leases, 'active') }}</dd></div>
            </dl>
          </app-section-card>

          <app-section-card title="Upcoming lease endings">
            <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.leases">Leases</a>
            @if (expiries().length > 0) {
              <ul class="expiries">
                @for (lease of expiries(); track lease.id) {
                  <li>
                    <a [routerLink]="RoutePaths.leaseDetail(lease.id!)">{{ lease.label }}</a>
                    <span class="muted">{{ lease.subLabel }}</span>
                    <span class="expiries__when" [class.soon]="(lease.count ?? 0) <= 30">in {{ lease.count }} day{{ lease.count === 1 ? '' : 's' }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">No lease ends in the next 90 days.</p>
            }
          </app-section-card>
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
              font-size: var(--text-sm); font-weight: 600; color: var(--primary-strong); text-decoration: none; }
    .start { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-4);
             padding: var(--space-4) var(--space-5); border: 1px dashed var(--primary); border-radius: var(--radius-md); background: var(--primary-tint); }
    .start > div { display: grid; gap: 0.15rem; }

    .buildings { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
    .building { display: grid; gap: var(--space-1); }
    .building + .building { padding-top: var(--space-3); border-top: 1px solid var(--border); }
    .building__head, .building__meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1) var(--space-3); }
    .building__name { font-weight: 600; }
    .building__money { font-weight: 600; font-variant-numeric: tabular-nums; }
    .building__meta { font-size: var(--text-sm); }
    .building__step { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }

    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .owing { color: var(--danger); font-weight: 600; }

    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
    @media (max-width: 700px) { .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .facts div { display: grid; gap: 0.1rem; }
    .facts dt { font-size: var(--text-xs); color: var(--text-muted); }
    .facts dd { margin: 0; font-size: var(--text-lg); font-weight: 700; font-variant-numeric: tabular-nums; }

    .expiries { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .expiries li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--space-3); align-items: baseline; font-size: var(--text-sm); }
    .expiries__when { font-variant-numeric: tabular-nums; }
    .expiries__when.soon { color: var(--warning); font-weight: 600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyDashboardComponent {
  readonly RoutePaths = RoutePaths;
  readonly agencyId = input.required<number>();

  private readonly stats = inject(StatsService);
  private readonly context = inject(ActiveContextService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly overview = signal<AgencyOverview | null>(null);
  private readonly buildings = signal<BuildingBreakdown | null>(null);
  readonly trends = signal<AgencyTrends | null>(null);

  readonly thisMonth = monthKey();
  readonly month = signal(this.thisMonth);
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
        detail: top.map((room) => `${room.label} · ${this.money(room.amount)}`).join(', ') + (notLate > top.length ? ` and ${notLate - top.length} more` : '')
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
      this.overview.set(overview);
      this.buildings.set(buildings ?? { buildings: [] });
      this.trends.set(trends);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  pickBuilding(value: string): void {
    const row = this.allBuildings().find((building) => String(building.buildingId) === value);
    if (row?.buildingId) {
      this.context.selectBuilding(row.buildingId, row.buildingName);
    } else {
      this.context.clearBuilding();
    }
  }

  private toRow(item: ActionItem, overdueRooms: RankedEntry[]): AttentionRow {
    const count = item.count ?? 0;
    const plural = (word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
    const details: Record<string, string> = {
      TENANTS_IN_ARREARS: overdueRooms.slice(0, 2).map((room) => `${room.label} · ${this.money(room.amount)}`).join(', ')
        + (overdueRooms.length > 2 ? ` and ${overdueRooms.length - 2} more` : '') || `${plural('tenant')} past the due date`,
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
