import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { OrderPreview } from '../../ecommerce/models/ecommerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-my-orders-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    RowLinkDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="My orders">
        <ng-container actions>
          <div class="button-row">
            <a class="btn btn-secondary" [routerLink]="RoutePaths.myVouchers">My vouchers</a>
            <a class="btn btn-primary" [routerLink]="RoutePaths.shop">Shop</a>
          </div>
        </ng-container>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading your orders..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (orders().length === 0) {
        <app-empty-state
          title="No orders yet"
          description="Your order history will appear here."
          actionLabel="Browse the shop"
          (action)="goShopping()"
        />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Order</th><th>Placed</th><th>Items</th><th>Total</th><th>Delivery</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.id) {
                  <tr [appRowLink]="RoutePaths.myOrderDetail(order.id)">
                    <td>
                      <a class="record-link__primary mono" [routerLink]="RoutePaths.myOrderDetail(order.id)">
                        {{ order.orderNumber }}
                      </a>
                    </td>
                    <td>{{ formatDate(order.createdAt) }}</td>
                    <td>{{ order.itemCount ?? '-' }}</td>
                    <td>{{ order.totalAmount ?? '-' }}</td>
                    <td>{{ order.deliveryMethod | humanLabel }}</td>
                    <td>
                      <div class="chip-row">
                        <app-status-chip [status]="order.status" />
                        @if (order.paymentStatus) {
                          <span class="status-chip status-chip--info">{{ order.paymentStatus | humanLabel }}</span>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [pagination]="pagination()!"
            [size]="pagination()!.size"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyOrdersPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orders = signal<OrderPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly page = signal(0);
  readonly size = signal(20);

  ngOnInit(): void {
    void this.reload();
  }

  goShopping(): void {
    void this.router.navigateByUrl(RoutePaths.shop);
  }

  async previousPage(): Promise<void> {
    if (this.page() <= 0) {
      return;
    }

    this.page.update((value) => value - 1);
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.page.set(pagination.page + 1);
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.size.set(size);
    this.page.set(0);
    await this.reload();
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.ecommerce.getMyOrders({ page: this.page(), size: this.size() }));
      this.orders.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
