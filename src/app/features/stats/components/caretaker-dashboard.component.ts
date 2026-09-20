import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatActionsComponent } from './stat-actions.component';
import { StatRankedComponent } from './stat-ranked.component';
import { lowerIsBetter } from '../models/stat-direction.util';
import {
  CaretakerOverview,
  CaretakerRentStatus,
  MovementSchedule,
  StatBlock,
  StatMetric
} from '../models/stats.models';

/**
 * A caretaker's day, not a portfolio summary.
 *
 * The two lists are the point: who to chase for rent, and who is moving in or
 * out this week. Both carry a phone number, because the next step after reading
 * either is a call — a dashboard that shows a name and makes you go looking for
 * the number has stopped one step short.
 */
@Component({
  selector: 'app-caretaker-dashboard',
  standalone: true,
  imports: [
    RowLinkDirective,
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
      <app-loading-state label="Loading your buildings..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else {
      <div class="dash">
      @if (needsAttention().length > 0) {
        <app-section-card title="Needs attention" class="dash__wide">
          <app-stat-actions [items]="needsAttention()" />
        </app-section-card>
      }

      <app-section-card title="Today">
        <div class="tiles">
          @for (metric of todayTiles(); track metric.key || metric.label) {
            <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
          }
        </div>
      </app-section-card>

      <!-- The diary. Sorted by date, because that is how it will be worked. -->
      @if (schedule(); as diary) {
        <app-section-card
          title="Coming up"
          [subtitle]="diary.horizonDays ? 'Next ' + diary.horizonDays + ' days' : null"
        >
          <div class="tiles">
            @for (metric of scheduleTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          @if ((diary.schedule ?? []).length > 0) {
            <ul class="rows">
              @for (move of diary.schedule ?? []; track move.tenantId + '-' + move.scheduledDate) {
                <li class="row">
                  <span class="row__when">
                    {{ formatDate(move.scheduledDate) }}
                    @if (move.daysFromToday !== null && move.daysFromToday !== undefined) {
                      <span class="muted">{{ dayLabel(move.daysFromToday) }}</span>
                    }
                  </span>
                  <span class="row__who">
                    <strong>{{ move.tenantName }}</strong>
                    <span class="muted">{{ move.type | lowercase }} · {{ move.buildingName }} {{ move.roomNumber }}</span>
                  </span>
                  @if (move.contactPhone) {
                    <a class="btn btn-secondary btn-sm" [href]="'tel:' + move.contactPhone">Call</a>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="muted">Nothing scheduled.</p>
          }
        </app-section-card>
      }

      @if (rent(); as status) {
        <app-section-card title="Rent" [subtitle]="status.billingMonth || null">
          <ng-container actions>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPayments">All payments</a>
          </ng-container>

          <div class="tiles">
            @for (metric of rentTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          @if ((status.watchlist ?? []).length > 0) {
            <h3 class="panel-title">Behind on rent</h3>
            <ul class="rows">
              @for (entry of status.watchlist ?? []; track entry.tenantId) {
                <li class="row">
                  <span class="row__when">
                    {{ currency() }} {{ amount(entry.outstanding) }}
                    <span class="muted">{{ entry.daysOverdue ?? 0 }}d overdue</span>
                  </span>
                  <span class="row__who">
                    <strong>{{ entry.tenantName }}</strong>
                    <span class="muted">{{ entry.buildingName }} {{ entry.roomNumber }}</span>
                  </span>
                  @if (entry.contactPhone) {
                    <a class="btn btn-secondary btn-sm" [href]="'tel:' + entry.contactPhone">Call</a>
                  }
                </li>
              }
            </ul>
          }

          @if ((status.arrearsByBuilding ?? []).length > 0) {
            <h3 class="panel-title">Arrears by building</h3>
            <app-stat-ranked [entries]="status.arrearsByBuilding ?? []" [currency]="currency()" />
          }
        </app-section-card>
      }

      @for (group of groups(); track group.title) {
        <app-stat-group [title]="group.title" [metrics]="group.metrics" />
      }

      @if (assigned().length > 0) {
        <app-section-card title="Your buildings">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Building</th><th>Rooms</th><th>Occupied</th><th>Vacant</th><th>Occupancy</th><th>Maintenance</th><th>In arrears</th></tr>
              </thead>
              <tbody>
                @for (building of assigned(); track building.buildingId) {
                  <tr
                    [appRowLink]="building.agencyId && building.buildingId
                      ? RoutePaths.caretakerBuilding(building.agencyId, building.buildingId)
                      : null"
                  >
                    <td>
                      @if (building.agencyId && building.buildingId) {
                        <a
                          class="record-link__primary"
                          [routerLink]="RoutePaths.caretakerBuilding(building.agencyId, building.buildingId)"
                        >{{ building.buildingName }}</a>
                      } @else {
                        {{ building.buildingName }}
                      }
                    </td>
                    <td>{{ building.rooms ?? 0 }}</td>
                    <td>{{ building.occupied ?? 0 }}</td>
                    <td>{{ building.vacant ?? 0 }}</td>
                    <td>{{ percent(building.occupancyRate) }}</td>
                    <td>{{ building.openMaintenanceRequests ?? 0 }}</td>
                    <td>{{ building.tenantsInArrears ?? 0 }}</td>
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
    .dash {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr));
      gap: 1rem;
      align-items: start;
    }

    .dash__wide { grid-column: 1 / -1; }

    /*
     * min-width: 0 on every grid item, not just the components. A grid item
     * defaults to min-width: auto, so anything with a long unbroken string
     * inside — a table, a building name — pushes its track past the column
     * and the whole page gains a horizontal scrollbar.
     */
    .dash > app-section-card,
    .dash > app-stat-group,
    .dash > div { display: block; min-width: 0; }

    /*
     * auto-fit, not auto-fill: a section with three tiles was leaving three
     * empty columns of dead space to its right, which made every short section
     * look unfinished. Capped so three tiles spread rather than becoming
     * billboards.
     */

    .panel-title {
      margin: 0.4rem 0 0;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .rows { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }

    .row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 0.87rem;
    }

    .row__when { display: grid; min-width: 6.5rem; font-variant-numeric: tabular-nums; font-weight: 600; }
    .row__when .muted { font-weight: 400; font-size: 0.72rem; }
    .row__who { display: grid; flex: 1; min-width: 0; }
    .row__who .muted { font-size: 0.74rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CaretakerDashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly overview = signal<CaretakerOverview | null>(null);
  readonly rent = signal<CaretakerRentStatus | null>(null);
  readonly schedule = signal<MovementSchedule | null>(null);

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');
  readonly needsAttention = computed(() => this.overview()?.needsAttention ?? []);
  readonly assigned = computed(() => this.overview()?.assignedBuildings ?? []);

  readonly todayTiles = computed(() => pick(this.overview()?.today,
    ['expectedMoveIns', 'expectedMoveOuts', 'maintenanceRaisedToday', 'maintenanceClosedToday', 'inspectionsDue', 'messagesReceivedToday']));

  readonly scheduleTiles = computed(() => pick(this.schedule() as StatBlock | null,
    ['upcomingMoveIns', 'upcomingMoveOuts', 'upcomingTransfers', 'leasesExpiring']));

  readonly rentTiles = computed(() => pick(this.rent() as StatBlock | null,
    ['tenantsOverdue', 'tenantsPending', 'tenantsPartiallyPaid', 'tenantsPaid']));

  readonly groups = computed(() => {
    const overview = this.overview();
    if (!overview) {
      return [];
    }

    return [
      { title: 'Rooms', metrics: pick(overview.rooms, ['total', 'occupied', 'vacant', 'needsRepair', 'underMaintenance', 'occupancyRate']) },
      { title: 'Tenants', metrics: pick(overview.tenants, ['active', 'inArrears', 'noticeGiven', 'movedInThisPeriod', 'unreadMessages']) },
      { title: 'Maintenance', metrics: pick(overview.maintenance, ['open', 'urgent', 'unacknowledged', 'overdue', 'averageResolutionTime']) }
    ].filter((group) => group.metrics.length > 0);
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.overview.set(await firstValueFrom(this.stats.getCaretakerOverview()));

      const [rent, schedule] = await Promise.all([
        settle(this.stats.getCaretakerRentStatus()),
        settle(this.stats.getCaretakerSchedule())
      ]);

      this.rent.set(rent);
      this.schedule.set(schedule);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** "Today" and "tomorrow" beat a date the reader has to subtract from. */
  dayLabel(days: number): string {
    if (days <= 0) {
      return 'today';
    }

    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }

  /** Whether a fall is good news for this figure; see the util for why declared. */
  direction(metric: StatMetric): boolean | null {
    return lowerIsBetter(metric);
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

function pick(block: StatBlock | null | undefined, keys: string[]): StatMetric[] {
  if (!block) {
    return [];
  }

  return keys
    .map((key) => block[key] as StatMetric | undefined)
    .filter((metric): metric is StatMetric => !!metric && metric.value !== null && metric.value !== undefined);
}

async function settle<T>(source: Parameters<typeof firstValueFrom<T>>[0]): Promise<T | null> {
  try {
    return await firstValueFrom(source);
  } catch {
    return null;
  }
}
