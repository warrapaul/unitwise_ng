import { displayDate } from '../../../shared/utils/display-date.util';
import { BillingStep, BillingStepComponent } from '../../rent/components/billing-step.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { StatsService } from '../stats.service';
import { StatGroupComponent } from './stat-group.component';
import { StatActionsComponent } from './stat-actions.component';
import {
  AgencyOverview,
  AgencyTrends,
  BuildingBreakdown,
  OccupancyMovement,
  StatBlock,
  StatMetric
} from '../models/stats.models';

/**
 * What an agency admin opens the app to find out: whether this month's rent is
 * coming in, which rooms are empty, and what is about to need a decision.
 *
 * Five endpoints, fetched together but rendered independently — a panel whose
 * request failed says so in its own card rather than taking the dashboard with
 * it, because "rent is late" and "the occupancy query timed out" are different
 * problems and only one of them is the operator's.
 */
@Component({
  selector: 'app-agency-dashboard',
  standalone: true,
  imports: [
    LowerCasePipe,
    RouterLink,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    StatGroupComponent,
    StatActionsComponent,
    BillingStepComponent,
    PermissionGateComponent,
    RowLinkDirective
  ],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading your dashboard..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else {
      <!--
        Two columns, and wide content spans both. One full-width panel per
        group turned six short sections into six near-empty bands that all
        read as equally important; flowing them into columns halves the
        scroll and lets the eye compare groups side by side.
      -->
      <div class="dash">
      <!--
        No separate Billing card: it listed the same buildings as "Your buildings",
        whose Billing column now carries each building's step and its action.
        With no building yet, the first thing to do is add one.
      -->
      @if (fresh()) {
        <app-permission-gate [permissions]="['BUILDING_CREATE']">
          <div class="dash__wide start">
            <div>
              <strong>Start by adding a building</strong>
              <span class="muted">Rooms, tenants and billing all hang off a building.</span>
            </div>
            <a class="btn btn-primary" [routerLink]="RoutePaths.buildingCreate">Create a building</a>
          </div>
        </app-permission-gate>
      }

      @if (needsAttention().length > 0) {
        <div class="dash__wide">
          <app-stat-actions [items]="needsAttention()" />
        </div>
      }

      <!--
        A new agency: the sections it will have, by name, and nothing in them
        yet — no zeros dressed up as figures, and never sample numbers.
      -->
      @if (fresh()) {
        @for (section of freshSections; track section.title) {
          <app-section-card [title]="section.title" [class.dash__wide]="section.wide">
            <p class="muted fresh">{{ section.note }}</p>
          </app-section-card>
        }
      } @else {
      <!-- Rent leads: it is the figure the month is judged by. -->
      <!-- Rent this month is in the overview card above (app-agency-rent-summary). -->

      <!-- Every building at a glance, one tap from its page: right under the month's rent it explains. -->
      @if (buildingRows().length > 0) {
        <app-section-card title="Your buildings" [subtitle]="billingNote" class="dash__wide">
          <ng-container actions>
            <!-- Billing for this month by default; pick next month to see whether it has started. -->
            <label class="billing-month">
              <span class="muted">Billing for</span>
              <input type="month" [value]="billingMonth()" (change)="billingMonth.set($any($event.target).value || thisMonth)">
            </label>
            <app-permission-gate [permissions]="['RENT_ARREAR_READ']">
              <a class="btn btn-secondary btn-sm" routerLink="/admin/rent/adjustments" title="Waive a charge, add one, or change an amount before confirming">Rent adjustments</a>
            </app-permission-gate>
          </ng-container>
          @if (billingSummary(); as summary) {
            <p class="billing-summary" [class.billing-summary--done]="summary.done" role="status">{{ summary.text }}</p>
          }
          <div class="table-scroll">
            <table class="table table--packed buildings">
              <thead>
                <tr>
                  <th>Building</th><th class="num">Rooms</th><th class="num">Occupied</th><th class="num">Vacant</th>
                  <th class="num">Tenants</th><th class="num">Leases ending</th>
                  <th class="num">Expected</th><th class="num">Collected</th><th class="num">Outstanding</th>
                  <th>Billing</th><th class="num">Repairs</th>
                </tr>
              </thead>
              <tbody>
                @for (row of buildingRows(); track row.buildingId) {
                  <tr [appRowLink]="RoutePaths.buildingDetail(agencyId(), row.buildingId!)">
                    <td><a class="record-link__primary" [routerLink]="RoutePaths.buildingDetail(agencyId(), row.buildingId!)">{{ row.buildingName }}</a></td>
                    <td class="num">{{ row.rooms ?? 0 }}</td>
                    <td class="num">{{ row.occupied ?? 0 }} <span class="muted">{{ percent(row.occupancyRate) }}</span></td>
                    <td class="num">{{ row.vacant ?? 0 }}</td>
                    <td class="num">{{ row.activeTenants ?? 0 }}@if (row.pendingTenants) { <span class="muted"> +{{ row.pendingTenants }} pending</span> }</td>
                    <td class="num">{{ row.leasesExpiringIn30Days ?? 0 }}</td>
                    <td class="num">{{ amount(row.rentExpected) }}</td>
                    <td class="num">{{ amount(row.rentCollected) }}@if (row.collectionRate != null) { <span class="muted">{{ percent(row.collectionRate) }}</span> }</td>
                    <td class="num" [class.owing]="+(row.rentOutstanding ?? 0) > 0">{{ amount(row.rentOutstanding) }}</td>
                    <td>
                      <app-billing-step [agencyId]="agencyId()" [buildingId]="row.buildingId!" [buildingName]="row.buildingName ?? null"
                                        [billingDay]="row.billingDay ?? null" [month]="billingMonth()"
                                        (stepChange)="noteStep(row.buildingId!, $event)" />
                    </td>
                    <td class="num">{{ row.openMaintenanceRequests ?? 0 }}</td>
                  </tr>
                }
              </tbody>
              @if (buildingTotals(); as total) {
                @if (buildingRows().length > 1) {
                  <tfoot>
                    <tr>
                      <th>All buildings</th>
                      <td class="num">{{ total.rooms ?? 0 }}</td>
                      <td class="num">{{ total.occupied ?? 0 }} <span class="muted">{{ percent(total.occupancyRate) }}</span></td>
                      <td class="num">{{ total.vacant ?? 0 }}</td>
                      <td class="num">{{ total.activeTenants ?? 0 }}</td>
                      <td class="num">{{ total.leasesExpiringIn30Days ?? 0 }}</td>
                      <td class="num">{{ amount(total.rentExpected) }}</td>
                      <td class="num">{{ amount(total.rentCollected) }}@if (total.collectionRate != null) { <span class="muted">{{ percent(total.collectionRate) }}</span> }</td>
                      <td class="num">{{ amount(total.rentOutstanding) }}</td>
                      <td></td>
                      <td class="num">{{ total.openMaintenanceRequests ?? 0 }}</td>
                    </tr>
                  </tfoot>
                }
              }
            </table>
          </div>
        </app-section-card>
      }

      @for (group of groups(); track group.title) {
        <app-stat-group [title]="group.title" [metrics]="group.metrics" [currency]="currency()" />
      }

      @if (movement(); as flow) {
        <!-- The same shape as the groups beside it: one headline figure, the rest as rows. -->
        <app-stat-group title="Moves in and out" [metrics]="movementTiles()" [currency]="currency()">
          @if ((flow.upcomingMovements ?? []).length > 0) {
            <h3 class="panel-title">Coming up</h3>
            <ul class="movements">
              @for (entry of flow.upcomingMovements ?? []; track entry.tenantId + '-' + entry.occurredOn) {
                <li>
                  <span class="movements__when">{{ formatDate(entry.occurredOn) }}</span>
                  <span>{{ entry.tenantName }}</span>
                  <span class="muted">{{ entry.type | lowercase }} · {{ entry.buildingName }} {{ entry.roomNumber }}</span>
                </li>
              }
            </ul>
          }
        </app-stat-group>
      }

      }

      </div>
    }
  `,
  styles: [`
    /*
     * auto-fit, not auto-fill: a section with three tiles was leaving three
     * empty columns of dead space to its right, which made every short section
     * look unfinished. Capped so three tiles spread rather than becoming
     * billboards.
     */
    /*
     * The dashboard itself. A tile group is comfortable from about 26rem, so
     * that is the break: two columns on a laptop, one on anything narrower,
     * with no media query needed.
     */
    .dash {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr));
      gap: 1rem;
      /* Stretch, not start: cards side by side share one height, however much each holds. */
      align-items: stretch;
    }

    /* Tables, funnels and trend rows are genuinely wide — they keep the row. */
    .dash__wide { grid-column: 1 / -1; }
    .billing-month { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
    .billing-month input { width: auto; padding: 0.3rem 0.5rem; border: 1px solid var(--border); border-radius: 8px; background: var(--field-bg); font: inherit; }
    .billing-summary { margin: 0; padding: 0.55rem 0.8rem; border-radius: 10px; background: var(--surface-2); font-size: 0.9rem; font-weight: 600; }
    .billing-summary--done { background: var(--success-tint); color: var(--success); }
    .start { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem 1rem; padding: 1rem 1.2rem;
             border: 1px dashed var(--primary); border-radius: 16px; background: var(--primary-tint); }
    .start > div { display: grid; gap: 0.15rem; }
    .fresh { margin: 0; font-size: 0.9rem; }

    .buildings .num { text-align: right; font-variant-numeric: tabular-nums; }
    .buildings .owing { color: var(--danger); font-weight: 600; }
    .buildings tfoot th, .buildings tfoot td { border-top: 1px solid var(--border); font-weight: 700; text-transform: none; letter-spacing: 0; font-size: 0.88rem; color: var(--text); }

    /* Section cards are hosts in the grid, so they must stretch to their
       column or a short card leaves a ragged edge beside a tall one. */
    /*
     * min-width: 0 on every grid item, not just the components. A grid item
     * defaults to min-width: auto, so anything with a long unbroken string
     * inside — a table, a building name — pushes its track past the column
     * and the whole page gains a horizontal scrollbar.
     */
    .dash > app-section-card,
    .dash > app-stat-group,
    .dash > div { display: block; min-width: 0; }


    .panel-title {
      margin: 0.4rem 0 0;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .split {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
      gap: 1rem;
    }

    .split > div { display: grid; gap: 0.5rem; align-content: start; }

    .aging, .movements { display: grid; gap: 0.35rem; margin: 0; padding: 0; list-style: none; font-size: 0.87rem; }
    .aging li, .movements li { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
    .movements__when { font-variant-numeric: tabular-nums; font-weight: 600; }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyDashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly agencyId = input.required<number>();

  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly overview = signal<AgencyOverview | null>(null);
  readonly movement = signal<OccupancyMovement | null>(null);
  private readonly buildings = signal<BuildingBreakdown | null>(null);
  private readonly trends = signal<AgencyTrends | null>(null);

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');
  readonly needsAttention = computed(() => this.overview()?.needsAttention ?? []);
  readonly buildingRows = computed(() => this.buildings()?.buildings ?? []);
  readonly buildingTotals = computed(() => this.buildings()?.agencyTotals ?? null);

  readonly movementTiles = computed(() => pick(this.movement() as StatBlock | null,
    ['moveIns', 'moveOuts', 'transfers', 'netOccupancyChange', 'turnoverRate', 'averageTenancyLength']));

  /** No building the operator can read yet: show the sections by name only. */
  readonly fresh = computed(() => this.buildingRows().length === 0);

  readonly thisMonth = monthKey(new Date());
  /** The billing month the table's Billing column shows. */
  readonly billingMonth = signal(this.thisMonth);
  private readonly steps = signal<Record<number, BillingStep>>({});

  noteStep(buildingId: number, step: BillingStep): void {
    this.steps.update((all) => ({ ...all, [buildingId]: step }));
  }

  /** One line on the month as a whole: "October 2026: already billed and confirmed for every building". */
  readonly billingSummary = computed(() => {
    const ids = this.buildingRows().map((row) => row.buildingId!).filter((id) => id != null);
    const steps = ids.map((id) => this.steps()[id]).filter((step): step is BillingStep => !!step);
    if (steps.length < ids.length || steps.length === 0) {
      return null;
    }
    const billable = steps.filter((step) => step !== 'NO_TENANTS');
    const label = new Date(`${this.billingMonth()}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (billable.length === 0) {
      return { done: false, text: `${label}: no building has tenants to bill.` };
    }
    const confirmed = billable.filter((step) => step === 'CONFIRMED').length;
    const notStarted = billable.filter((step) => step === 'NOT_BILLED').length;
    if (confirmed === billable.length) {
      return { done: true, text: `${label}: already billed and confirmed for every building.` };
    }
    if (notStarted === billable.length) {
      return { done: false, text: `${label}: not billed yet — bills are created on each building's billing day.` };
    }
    return { done: false, text: `${label}: ${confirmed} of ${billable.length} building${billable.length === 1 ? '' : 's'} confirmed.` };
  });

  readonly billingNote = 'This month, live. Bills are created automatically on each building\'s billing day; '
    + 'then enter meter readings and confirm. To waive a charge, add one or change an amount before confirming, use Rent adjustments.';

  readonly freshSections = [
    { title: 'Rent this month', wide: true, note: 'Rent and arrears show here once your buildings have tenants and their first bills.' },
    { title: 'Occupancy', wide: false, note: 'Occupied and vacant rooms, once you add rooms.' },
    { title: 'Tenants', wide: false, note: 'Tenants awaiting review, active and on notice.' },
    { title: 'Leases', wide: false, note: 'Active, draft and soon-to-end leases.' },
    { title: 'Moves in and out', wide: false, note: 'Who moved in and out this month.' }
  ];

  readonly groups = computed(() => {
    const overview = this.overview();
    if (!overview) {
      return [];
    }

    return [
      { title: 'Occupancy', metrics: pick(overview.occupancy, ['occupied', 'vacant', 'reserved', 'underMaintenance', 'occupancyRate']) },
      { title: 'Tenants', metrics: pick(overview.tenants, ['active', 'pendingVerification', 'documentsAwaitingReview', 'noticeGiven']) },
      { title: 'Leases', metrics: pick(overview.leases, ['active', 'draft', 'pendingSignature', 'expiringIn30Days']) },
      { title: 'Portfolio', metrics: pick(overview.portfolio, ['buildings', 'rooms', 'activeTenants', 'activeLeases']) }
    ].filter((group) => group.metrics.length > 0);
  });


  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.agencyId();
    this.loading.set(true);
    this.error.set(null);

    try {
      // The overview decides whether there is a dashboard at all; the rest fill
      // it in, and a failure in one of them leaves that panel out rather than
      // replacing the page with an error.
      this.overview.set(await firstValueFrom(this.stats.getAgencyOverview(agencyId)));

      // Rent this month is loaded by the overview card's own summary, not here.
      const [movement, buildings, trends] = await Promise.all([
        settle(this.stats.getAgencyOccupancyMovement(agencyId)),
        settle(this.stats.getAgencyBuildings(agencyId)),
        settle(this.stats.getAgencyTrends(agencyId))
      ]);

      this.movement.set(movement);
      this.buildings.set(buildings);
      this.trends.set(trends);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  amount(value?: number | string | null): string {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
  }

  percent(value?: number | string | null): string {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : '—';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '—';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }
}

/** Named metrics out of a block, in order, skipping what the server omitted. */
function pick(block: StatBlock | null | undefined, keys: string[]): StatMetric[] {
  if (!block) {
    return [];
  }

  return keys
    .map((key) => block[key] as StatMetric | undefined)
    .filter((metric): metric is StatMetric => !!metric && metric.value !== null && metric.value !== undefined);
}

/** A panel that fails is missing, not fatal. */
async function settle<T>(source: Parameters<typeof firstValueFrom<T>>[0]): Promise<T | null> {
  try {
    return await firstValueFrom(source);
  } catch {
    return null;
  }
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
