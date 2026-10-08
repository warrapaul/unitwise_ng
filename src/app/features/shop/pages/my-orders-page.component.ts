import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { OrderPreview } from '../../ecommerce/models/ecommerce.models';
import { ShopBarComponent } from '../components/shop-bar.component';
import { ksh, orderStatus } from '../shop-format';

const PAGE_SIZE = 10;

/** The shopper's orders, newest first, each one a card that opens the order. */
@Component({
  selector: 'app-my-orders-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, ShopBarComponent],
  template: `
    <section class="shop">
      <app-shop-bar />
      <h1>My orders</h1>

      @if (loading() && orders().length === 0) {
        <app-loading-state label="Loading your orders..." />
      } @else if (error() && orders().length === 0) {
        <app-error-state [message]="error()!" (retry)="load(true)" />
      } @else if (orders().length === 0) {
        <div class="empty">
          <strong>No orders yet</strong>
          <p class="muted">When you buy something, you can follow it here.</p>
          <a class="btn btn-primary" [routerLink]="RoutePaths.shop">Start shopping</a>
        </div>
      } @else {
        <ul class="orders">
          @for (order of orders(); track order.id) {
            <li>
              <a class="order" [routerLink]="RoutePaths.myOrderDetail(order.id)">
                <div class="order__top">
                  <strong class="mono">{{ order.orderNumber }}</strong>
                  <span [class]="'status-chip status-chip--' + status(order.status).tone">{{ status(order.status).label }}</span>
                </div>
                <div class="order__meta muted">
                  <span>{{ date(order.createdAt) }}</span>
                  <span>{{ order.itemCount ?? 0 }} {{ order.itemCount === 1 ? 'item' : 'items' }}</span>
                  <span>{{ order.deliveryMethod === 'PICK_AT_STORE' ? 'Store pickup' : 'Delivery' }}</span>
                  <span>{{ order.paymentMethod === 'PAY_ON_DELIVERY' ? 'Pay on delivery' : 'M-Pesa' }}</span>
                </div>
                <div class="order__bottom">
                  <strong>{{ ksh(order.totalAmount) }}</strong>
                  <span class="order__go">View order ›</span>
                </div>
              </a>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <div class="more">
            <button type="button" class="btn btn-secondary" [disabled]="loading()" (click)="load(false)">
              {{ loading() ? 'Loading...' : 'Show older orders' }}
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    h1 { margin: 0; font-size: 1.45rem; }
    .empty { display: grid; justify-items: center; gap: 0.6rem; padding: 3.5rem 1rem; text-align: center; border: 1px dashed var(--border-strong); border-radius: 18px; }
    .empty p { margin: 0; }
    .orders { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: 0.85rem; }
    .order { display: grid; gap: 0.55rem; height: 100%; padding: 1rem 1.1rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface);
             color: var(--text); text-decoration: none; transition: box-shadow 0.15s, border-color 0.15s; box-sizing: border-box; }
    .order:hover { border-color: var(--border-strong); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07); }
    .order__top, .order__bottom { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .order__meta { display: flex; flex-wrap: wrap; gap: 0.2rem 0.9rem; font-size: 0.85rem; }
    .order__bottom strong { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
    .order__go { font-size: 0.85rem; font-weight: 600; color: var(--primary-strong); }
    .more { display: flex; justify-content: center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyOrdersPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly ksh = ksh;
  readonly status = orderStatus;

  private readonly ecommerce = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orders = signal<OrderPreview[]>([]);
  readonly hasMore = signal(false);
  private page = 0;

  ngOnInit(): void {
    void this.load(true);
  }

  date(value?: string | null): string {
    return value ? displayDate(value) : '';
  }

  async load(reset: boolean): Promise<void> {
    if (reset) {
      this.page = 0;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.getMyOrders({ page: this.page, size: PAGE_SIZE }));
      this.orders.set(reset ? result.items : [...this.orders(), ...result.items]);
      this.hasMore.set(!!result.pagination && !result.pagination.isLast);
      this.page += 1;
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
