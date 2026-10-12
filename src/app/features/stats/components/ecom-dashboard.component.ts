import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { StatRankedComponent } from './stat-ranked.component';
import {
  EcomCatalog,
  EcomCustomers,
  EcomFulfilment,
  EcomOverview,
  EcomSales,
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
    StatGroupComponent,
    StatActionsComponent,
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

      <!--
        Every section is a stat group: its headline as a tile, the rest as
        label and value rows. A column of identical boxes made a one-digit
        count look as important as the figure the section is named after.
      -->
      <app-stat-group title="Sales" [metrics]="salesTiles()" [currency]="currency()">
        <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomOrders">All orders</a>
      </app-stat-group>

      @for (group of groups(); track group.title) {
        <app-stat-group [title]="group.title" [metrics]="group.metrics" [currency]="currency()" />
      }

      @if (catalog(); as stock) {
        <app-stat-group title="Catalog" [metrics]="catalogTiles()" [currency]="currency()">
          <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomProducts">All products</a>

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
        </app-stat-group>
      }

      @if (fulfilment(); as delivery) {
        <app-stat-group title="Fulfilment" [metrics]="fulfilmentTiles()">
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
        </app-stat-group>
      }

      @if (customers(); as people) {
        <app-stat-group title="Customers" [metrics]="customerTiles()" [currency]="currency()">
          @if ((people.topCustomers ?? []).length > 0) {
            <div class="split">
              <div>
                <h3 class="panel-title">Top customers</h3>
                <app-stat-ranked [entries]="people.topCustomers ?? []" [currency]="currency()" />
              </div>
            </div>
          }
        </app-stat-group>
      }

      @if (vouchers(); as promos) {
        <app-stat-group title="Vouchers" [metrics]="voucherTiles()" [currency]="currency()">
          <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.vouchers">All vouchers</a>

          @if ((promos.topVouchers ?? []).length > 0) {
            <div class="split">
              <div>
                <h3 class="panel-title">Most redeemed</h3>
                <app-stat-ranked [entries]="promos.topVouchers ?? []" />
              </div>
            </div>
          }
        </app-stat-group>
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
      align-items: stretch;
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


    .panel-title {
      margin: 0.4rem 0 0;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    /* The ranked lists under a group's figures, divided from them by a rule. */
    .split { margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: 1rem; }
    .split > div { display: grid; gap: 0.5rem; align-content: start; }
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

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.overview.set(await firstValueFrom(this.stats.getEcomOverview()));

      const [sales, catalog, fulfilment, customers, vouchers] = await Promise.all([
        settle(this.stats.getEcomSales()),
        settle(this.stats.getEcomCatalog()),
        settle(this.stats.getEcomFulfilment()),
        settle(this.stats.getEcomCustomers()),
        settle(this.stats.getEcomVouchers())
      ]);

      this.sales.set(sales);
      this.catalog.set(catalog);
      this.fulfilment.set(fulfilment);
      this.customers.set(customers);
      this.vouchers.set(vouchers);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
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
