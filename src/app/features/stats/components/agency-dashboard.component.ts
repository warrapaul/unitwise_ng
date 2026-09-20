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
import { StatTileComponent } from './stat-tile.component';
import { StatGroupComponent } from './stat-group.component';
import { StatActionsComponent } from './stat-actions.component';
import { StatRankedComponent } from './stat-ranked.component';
import { lowerIsBetter } from '../models/stat-direction.util';
import {
  AgencyOverview,
  AgencyTrends,
  BuildingBreakdown,
  OccupancyMovement,
  RentCollectionStats,
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
    StatTileComponent,
    StatGroupComponent,
    StatActionsComponent,
    StatRankedComponent
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
      @if (needsAttention().length > 0) {
        <div class="dash__wide">
          <app-stat-actions [items]="needsAttention()" />
        </div>
      }

      <!-- Rent leads: it is the figure the month is judged by. -->
      @if (rent(); as collection) {
        <app-section-card title="Rent this month" [subtitle]="collection.billingMonth || null" class="dash__wide">
          <ng-container actions>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPayments">All payments</a>
          </ng-container>

          <div class="tiles">
            @for (metric of rentTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [currency]="currencyFor(metric)"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          @if ((collection.arrearsAging ?? []).length > 0) {
            <h3 class="panel-title">Arrears by age</h3>
            <ul class="aging">
              @for (bucket of collection.arrearsAging ?? []; track bucket.key || bucket.label) {
                <li>
                  <span>{{ bucket.label }}</span>
                  <strong>{{ currency() }} {{ amount(bucket.amount) }}</strong>
                  <span class="muted">{{ bucket.tenantCount ?? 0 }} {{ (bucket.tenantCount ?? 0) === 1 ? 'tenant' : 'tenants' }}</span>
                </li>
              }
            </ul>
          }

          <div class="split">
            @if ((collection.topDebtors ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Owing the most</h3>
                <!--
                  The figure an agency acts on, so it gets a way through to the
                  full list rather than an unbounded panel that grows until it
                  pushes the rest of the dashboard off the screen.
                -->
                <app-stat-ranked [entries]="collection.topDebtors ?? []" [currency]="currency()">
                  <a more class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentArrears">
                    All arrears
                  </a>
                </app-stat-ranked>
              </div>
            }
            @if ((collection.collectionByBuilding ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Collected by building</h3>
                <app-stat-ranked [entries]="collection.collectionByBuilding ?? []" [currency]="currency()" />
              </div>
            }
          </div>
        </app-section-card>
      }

      @for (group of groups(); track group.title) {
        <app-stat-group [title]="group.title" [metrics]="group.metrics" [currency]="currency()" />
      }

      @if (movement(); as flow) {
        <app-section-card title="Moves in and out">
          <div class="tiles">
            @for (metric of movementTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

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
        </app-section-card>
      }

      @if (buildingRows().length > 0) {
        <app-section-card title="By building" class="dash__wide">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Building</th><th>Rooms</th><th>Occupied</th><th>Occupancy</th>
                  <th>Expected</th><th>Collected</th><th>Collection</th><th>Maintenance</th>
                </tr>
              </thead>
              <tbody>
                @for (row of buildingRows(); track row.buildingId) {
                  <tr>
                    <td>{{ row.buildingName }}</td>
                    <td>{{ row.rooms ?? 0 }}</td>
                    <td>{{ row.occupied ?? 0 }}</td>
                    <td>{{ percent(row.occupancyRate) }}</td>
                    <td>{{ amount(row.rentExpected) }}</td>
                    <td>{{ amount(row.rentCollected) }}</td>
                    <td>{{ percent(row.collectionRate) }}</td>
                    <td>{{ row.openMaintenanceRequests ?? 0 }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-section-card>
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
      align-items: start;
    }

    /* Tables, funnels and trend rows are genuinely wide — they keep the row. */
    .dash__wide { grid-column: 1 / -1; }

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
  readonly rent = signal<RentCollectionStats | null>(null);
  readonly movement = signal<OccupancyMovement | null>(null);
  private readonly buildings = signal<BuildingBreakdown | null>(null);
  private readonly trends = signal<AgencyTrends | null>(null);

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');
  readonly needsAttention = computed(() => this.overview()?.needsAttention ?? []);
  readonly buildingRows = computed(() => this.buildings()?.buildings ?? []);

  readonly rentTiles = computed(() => pick(this.rent() as StatBlock | null,
    ['collected', 'expected', 'outstanding', 'overdue', 'collectionRate', 'tenantsOverdue']));

  readonly movementTiles = computed(() => pick(this.movement() as StatBlock | null,
    ['moveIns', 'moveOuts', 'transfers', 'netOccupancyChange', 'turnoverRate', 'averageTenancyLength']));

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

      const [rent, movement, buildings, trends] = await Promise.all([
        settle(this.stats.getAgencyRent(agencyId)),
        settle(this.stats.getAgencyOccupancyMovement(agencyId)),
        settle(this.stats.getAgencyBuildings(agencyId)),
        settle(this.stats.getAgencyTrends(agencyId))
      ]);

      this.rent.set(rent);
      this.movement.set(movement);
      this.buildings.set(buildings);
      this.trends.set(trends);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Whether a fall is good news for this figure; see the util for why declared. */
  direction(metric: StatMetric): boolean | null {
    return lowerIsBetter(metric);
  }

  currencyFor(metric: StatMetric): string | null {
    const isAmount = metric.unit == null
      && metric.denominator == null
      && (metric.changePoints === null || metric.changePoints === undefined)
      && typeof metric.value === 'string';

    return isAmount ? this.currency() : null;
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
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
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
