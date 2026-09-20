import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { StatTrendComponent } from './stat-trend.component';
import { StatRankedComponent } from './stat-ranked.component';
import { lowerIsBetter } from '../models/stat-direction.util';
import {
  EcomCatalog,
  EcomCustomers,
  EcomFulfilment,
  EcomOverview,
  EcomSales,
  EcomTrends,
  EcomVouchers,
  StatBlock,
  StatMetric
} from '../models/stats.models';

/**
 * The storefront: what sold, what has to move, and what is stuck.
 *
 * Ordered by how soon each part needs a decision — today's takings, then the
 * orders waiting on someone, then stock that will run out, then the slower
 * questions about customers and vouchers.
 */
@Component({
  selector: 'app-ecom-dashboard',
  standalone: true,
  imports: [
    RouterLink,
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
      <app-loading-state label="Loading storefront statistics..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else {
      <div class="dash">
      @if (needsAttention().length > 0) {
        <app-section-card title="Needs attention" class="dash__wide">
          <app-stat-actions [items]="needsAttention()" />
        </app-section-card>
      }

      <app-section-card title="Sales">
        <ng-container actions>
          <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomOrders">All orders</a>
        </ng-container>

        <div class="tiles">
          @for (metric of salesTiles(); track metric.key || metric.label) {
            <app-stat-tile
                [metric]="metric"
                [currency]="currencyFor(metric)"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
          }
        </div>
      </app-section-card>

      @for (group of groups(); track group.title) {
        <app-stat-group [title]="group.title" [metrics]="group.metrics" [currency]="currency()" />
      }

      @if (catalog(); as stock) {
        <app-section-card title="Catalog">
          <ng-container actions>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomProducts">All products</a>
          </ng-container>

          <div class="tiles">
            @for (metric of catalogTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [currency]="currencyFor(metric)"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          <div class="split">
            @if ((stock.lowStockProducts ?? []).length > 0) {
              <div>
                <!-- Ahead of top sellers: this is the list with a deadline. -->
                <h3 class="panel-title">Running out</h3>
                <app-stat-ranked [entries]="stock.lowStockProducts ?? []" />
              </div>
            }
            @if ((stock.topSellers ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Top sellers</h3>
                <app-stat-ranked [entries]="stock.topSellers ?? []" [currency]="currency()" />
              </div>
            }
            @if ((stock.zeroMovementProducts ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Not moving</h3>
                <app-stat-ranked [entries]="stock.zeroMovementProducts ?? []" />
              </div>
            }
            @if ((stock.revenueByCategory ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Revenue by category</h3>
                <app-stat-ranked [entries]="stock.revenueByCategory ?? []" [currency]="currency()" />
              </div>
            }
          </div>
        </app-section-card>
      }

      @if (fulfilment(); as delivery) {
        <app-section-card title="Fulfilment">
          <div class="tiles">
            @for (metric of fulfilmentTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          <div class="split">
            @if ((delivery.ordersByStore ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Orders by store</h3>
                <app-stat-ranked [entries]="delivery.ordersByStore ?? []" />
              </div>
            }
            @if ((delivery.deliveriesByBuilding ?? []).length > 0) {
              <div>
                <h3 class="panel-title">Deliveries by building</h3>
                <app-stat-ranked [entries]="delivery.deliveriesByBuilding ?? []" />
              </div>
            }
          </div>
        </app-section-card>
      }

      @if (customers(); as people) {
        <app-section-card title="Customers">
          <div class="tiles">
            @for (metric of customerTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [currency]="currencyFor(metric)"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          @if ((people.topCustomers ?? []).length > 0) {
            <h3 class="panel-title">Top customers</h3>
            <app-stat-ranked [entries]="people.topCustomers ?? []" [currency]="currency()" />
          }
        </app-section-card>
      }

      @if (vouchers(); as promos) {
        <app-section-card title="Vouchers">
          <ng-container actions>
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.vouchers">All vouchers</a>
          </ng-container>

          <div class="tiles">
            @for (metric of voucherTiles(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [currency]="currencyFor(metric)"
                [lead]="$first"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>

          @if ((promos.topVouchers ?? []).length > 0) {
            <h3 class="panel-title">Most redeemed</h3>
            <app-stat-ranked [entries]="promos.topVouchers ?? []" />
          }
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

    .split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: 1rem; }
    .split > div { display: grid; gap: 0.5rem; align-content: start; }
    .trends { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); gap: 1rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EcomDashboardComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly overview = signal<EcomOverview | null>(null);
  private readonly sales = signal<EcomSales | null>(null);
  readonly catalog = signal<EcomCatalog | null>(null);
  readonly fulfilment = signal<EcomFulfilment | null>(null);
  readonly customers = signal<EcomCustomers | null>(null);
  readonly vouchers = signal<EcomVouchers | null>(null);
  private readonly trends = signal<EcomTrends | null>(null);

  readonly currency = computed(() => this.overview()?.meta?.currency ?? 'KES');
  readonly needsAttention = computed(() => this.overview()?.needsAttention ?? []);

  /** The detail endpoint where there is one, the overview's block otherwise. */
  readonly salesTiles = computed(() => pick(
    (this.sales() ?? this.overview()?.sales) as StatBlock | null,
    ['revenueToday', 'ordersToday', 'revenueThisPeriod', 'ordersThisPeriod', 'averageOrderValue', 'netRevenue']));

  readonly catalogTiles = computed(() => pick(this.catalog() as StatBlock | null,
    ['activeProducts', 'outOfStock', 'lowStock', 'inventoryValue', 'activeDiscounts']));

  readonly fulfilmentTiles = computed(() => pick(this.fulfilment() as StatBlock | null,
    ['pickupBacklog', 'failedDeliveries', 'homeDelivery', 'storePickup', 'averageDeliveryTime', 'addressesPendingVerification']));

  readonly customerTiles = computed(() => pick(this.customers() as StatBlock | null,
    ['totalCustomers', 'newCustomers', 'returningCustomers', 'repeatPurchaseRate', 'abandonedCarts', 'averageLifetimeValue']));

  readonly voucherTiles = computed(() => pick(this.vouchers() as StatBlock | null,
    ['activeVouchers', 'redemptions', 'expiringSoon', 'discountGiven', 'redemptionRate']));

  readonly groups = computed(() => {
    const overview = this.overview();
    if (!overview) {
      return [];
    }

    return [
      { title: 'Orders', metrics: pick(overview.orders, ['inProgress', 'awaitingPaymentConfirmation', 'awaitingPaymentCompletion', 'completed', 'cancelled', 'completionRate']) },
      { title: 'Payments', metrics: pick(overview.payments, ['totalCollected', 'mpesaCollected', 'cashOnDeliveryOutstanding', 'partialPaymentsOverdue', 'mpesaSuccessRate', 'unreconciledGatewayRecords']) }
    ].filter((group) => group.metrics.length > 0);
  });

  readonly trendPanels = computed(() => {
    const trends = this.trends();
    if (!trends) {
      return [];
    }

    const currency = this.currency();
    return [
      { title: 'Revenue', series: trends.revenue, currency },
      { title: 'Orders', series: trends.orders, currency: null },
      { title: 'Average order value', series: trends.averageOrderValue, currency },
      { title: 'Customers', series: trends.customers, currency: null }
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
      this.overview.set(await firstValueFrom(this.stats.getEcomOverview()));

      const [sales, catalog, fulfilment, customers, vouchers, trends] = await Promise.all([
        settle(this.stats.getEcomSales()),
        settle(this.stats.getEcomCatalog()),
        settle(this.stats.getEcomFulfilment()),
        settle(this.stats.getEcomCustomers()),
        settle(this.stats.getEcomVouchers()),
        settle(this.stats.getEcomTrends())
      ]);

      this.sales.set(sales);
      this.catalog.set(catalog);
      this.fulfilment.set(fulfilment);
      this.customers.set(customers);
      this.vouchers.set(vouchers);
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
