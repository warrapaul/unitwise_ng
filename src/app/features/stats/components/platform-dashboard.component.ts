import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { StatsService } from '../stats.service';
import { StatTileComponent } from './stat-tile.component';
import { StatGroupComponent } from './stat-group.component';
import { StatActionsComponent } from './stat-actions.component';
import { StatTrendComponent } from './stat-trend.component';
import { StatRankedComponent } from './stat-ranked.component';
import { lowerIsBetter } from '../models/stat-direction.util';
import {
  ActionItem,
  GeoCoverage,
  OnboardingFunnel,
  PlatformOperations,
  PlatformOverview,
  PlatformTrends,
  StatBlock,
  StatMetric
} from '../models/stats.models';

/**
 * The platform view: how much of the product is being used, whether the
 * machinery behind it is healthy, and where accounts are getting stuck.
 *
 * The funnel is the part that earns its place — a count of users says the
 * platform is growing, while the stage someone stalls at says what to fix.
 */
@Component({
  selector: 'app-platform-dashboard',
  standalone: true,
  imports: [
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    StatTileComponent,
    StatGroupComponent,
    StatActionsComponent,
    StatTrendComponent,
    StatRankedComponent
  ],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading platform statistics..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else {
      <div class="dash">
      @if (attention().length > 0) {
        <app-section-card title="Needs attention" class="dash__wide">
          <app-stat-actions [items]="attention()" />
        </app-section-card>
      }

      @for (group of groups(); track group.title) {
        <app-stat-group [title]="group.title" [metrics]="group.metrics" [currency]="currency()" />
      }

      @if (funnel(); as onboarding) {
        <app-section-card title="Onboarding" class="dash__wide">
          <div class="tiles">
            @for (metric of funnelTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          <!--
            A funnel is read as a sequence, so the stages stay in the order the
            server gave them and each carries the drop from the one before —
            which is the number that says where to look.
          -->
          @if ((onboarding.stages ?? []).length > 0) {
            <ol class="funnel">
              @for (stage of onboarding.stages ?? []; track stage.key || stage.label) {
                <li class="funnel__stage">
                  <span class="funnel__label">{{ stage.label }}</span>
                  <span class="funnel__track" aria-hidden="true">
                    <span class="funnel__bar" [style.width.%]="stageShare(stage.count)"></span>
                  </span>
                  <span class="funnel__count">{{ stage.count ?? 0 }}</span>
                  <span class="funnel__drop muted">
                    @if (stage.conversionFromPrevious !== null && stage.conversionFromPrevious !== undefined) {
                      {{ rate(stage.conversionFromPrevious) }} from previous
                    }
                  </span>
                </li>
              }
            </ol>
          }

          @if ((onboarding.stalledByStage ?? []).length > 0) {
            <h3 class="panel-title">Stalled</h3>
            <app-stat-ranked [entries]="onboarding.stalledByStage ?? []" emptyLabel="Nobody is stuck." />
          }
        </app-section-card>
      }

      @if (geo(); as coverage) {
        <app-section-card title="Coverage" class="dash__wide">
          <div class="tiles">
            @for (metric of geoTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          <div class="split">
            @if ((coverage.buildingsByCounty ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Buildings by county</h3>
                <app-stat-ranked [entries]="coverage.buildingsByCounty ?? []" />
              </div>
            }
            @if ((coverage.tenantsByCounty ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Tenants by county</h3>
                <app-stat-ranked [entries]="coverage.tenantsByCounty ?? []" />
              </div>
            }
          </div>
        </app-section-card>
      }

      @if (trendPanels().length > 0) {
        <div class="trends dash__wide">
          @for (panel of trendPanels(); track panel.title) {
            <app-section-card [title]="panel.title">
              <app-stat-trend [series]="panel.series" [currency]="panel.currency" />
            </app-section-card>
          }
        </div>
      }
      </div>
    }
  `,
  styles: [`
    /*
     * Two columns on a laptop, one below ~26rem per column. Wide content —
     * tables, funnels, trend rows — keeps the full row.
     */
    .dash {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr));
      gap: 1rem;
      align-items: start;
    }

    .dash__wide { grid-column: 1 / -1; }

    .dash > app-section-card,
    .dash > app-stat-group { display: block; min-width: 0; }

    /*
     * auto-fit, not auto-fill: a section with three tiles was leaving three
     * empty columns of dead space to its right, which made every short section
     * look unfinished. Capped so three tiles spread rather than becoming
     * billboards.
     */
    /*
     * Pack left rather than stretch. Stretching each column under a 16rem
     * cap left a ragged band of dead space after the last tile on a wide
     * card, which is what made short sections look unfinished.
     */
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9.5rem, 16rem));
      justify-content: start;
      gap: 0.5rem;
    }

    .tiles app-stat-tile { max-width: 16rem; }

    .panel-title {
      margin: 0.4rem 0 0;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .funnel { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }

    .funnel__stage {
      display: grid;
      grid-template-columns: minmax(7rem, 1fr) minmax(4rem, 1.4fr) auto minmax(0, auto);
      align-items: center;
      gap: 0.6rem;
      font-size: 0.87rem;
    }

    .funnel__track { height: 0.55rem; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
    .funnel__bar { display: block; height: 100%; background: var(--primary); opacity: 0.75; }
    .funnel__count { font-variant-numeric: tabular-nums; font-weight: 700; }
    .funnel__drop { font-size: 0.74rem; }

    .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
    .split > div { display: grid; gap: 0.5rem; align-content: start; }

    .trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlatformDashboardComponent implements OnInit {
  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly overview = signal<PlatformOverview | null>(null);
  private readonly operations = signal<PlatformOperations | null>(null);
  readonly funnel = signal<OnboardingFunnel | null>(null);
  readonly geo = signal<GeoCoverage | null>(null);
  private readonly trends = signal<PlatformTrends | null>(null);

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');

  /**
   * Both sources contribute: the overview knows what is piling up in the
   * product, operations knows what is failing underneath it, and an operator
   * needs one list rather than two.
   */
  readonly attention = computed<ActionItem[]>(() => [
    ...(this.operations()?.needsAttention ?? []),
    ...(this.overview()?.needsAttention ?? [])
  ]);

  readonly groups = computed(() => {
    const overview = this.overview();
    if (!overview) {
      return [];
    }

    return [
      { title: 'Revenue', metrics: pick(overview.revenue, ['rentCollected', 'rentExpected', 'rentOutstanding', 'rentCollectionRate', 'ecomGmv', 'totalGmv']) },
      { title: 'Users', metrics: pick(overview.users, ['total', 'active', 'pendingClaim', 'newLast7Days', 'newLast30Days']) },
      { title: 'Agencies', metrics: pick(overview.agencies, ['total', 'active', 'newThisPeriod']) },
      { title: 'Property', metrics: pick(overview.property, ['buildings', 'rooms', 'occupied', 'vacant', 'occupancyRate']) }
    ].filter((group) => group.metrics.length > 0);
  });

  readonly funnelTiles = computed(() => pick(this.funnel() as StatBlock | null,
    ['overallConversion', 'claimConversion', 'medianTimeToActive', 'medianTimeToClaim', 'medianTimeToVerify']));

  readonly geoTiles = computed(() => pick(this.geo() as StatBlock | null,
    ['countiesCovered', 'townsCovered', 'addresses', 'buildingsGeocoded', 'geoRegions', 'geoLandmarks']));

  readonly trendPanels = computed(() => {
    const trends = this.trends();
    if (!trends) {
      return [];
    }

    const currency = this.currency();
    return [
      { title: 'Rent collected', series: trends.rentCollection, currency },
      { title: 'Ecommerce GMV', series: trends.ecomGmv, currency },
      { title: 'User signups', series: trends.userSignups, currency: null },
      { title: 'Tenants', series: trends.tenantGrowth, currency: null },
      { title: 'Agencies', series: trends.agencyGrowth, currency: null },
      { title: 'Occupancy rate', series: trends.occupancyRate, currency: null }
    ].filter((panel): panel is { title: string; series: NonNullable<typeof panel.series>; currency: string | null } =>
      !!panel.series && (panel.series.points ?? []).length > 0);
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.overview.set(await firstValueFrom(this.stats.getPlatformOverview()));

      const [operations, funnel, geo, trends] = await Promise.all([
        settle(this.stats.getPlatformOperations()),
        settle(this.stats.getPlatformOnboarding()),
        settle(this.stats.getPlatformGeo()),
        settle(this.stats.getPlatformTrends())
      ]);

      this.operations.set(operations);
      this.funnel.set(funnel);
      this.geo.set(geo);
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

  /** Each stage against the widest one, which is the top of the funnel. */
  stageShare(count?: number | null): number {
    const stages = this.funnel()?.stages ?? [];
    const max = Math.max(...stages.map((stage) => stage.count ?? 0), 0);
    return max > 0 ? Math.round(((count ?? 0) / max) * 100) : 0;
  }

  rate(value?: number | string | null): string {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : '—';
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
