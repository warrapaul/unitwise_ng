import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { Pagination } from '../../../core/models/pagination.model';
import { OrderPreview, OrderSearchParams } from '../models/ecommerce.models';

type OrderSortField = 'orderNumber' | 'status' | 'paymentStatus' | 'totalAmount' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-order-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Orders" subtitle="Search orders and open the detail view for updates.">
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <div class="grid-auto filters-grid">
            <label class="field"><span>Order #</span><input formControlName="orderNumber" placeholder="Order number"></label>
            <label class="field"><span>Customer</span><input formControlName="customerName" placeholder="Customer name"></label>
            <label class="field"><span>Email</span><input formControlName="customerEmail" placeholder="Email"></label>
            <label class="field"><span>Status</span><input formControlName="status" placeholder="Status"></label>
            <label class="field"><span>Payment</span><input formControlName="paymentStatus" placeholder="Payment status"></label>
            <label class="field"><span>Delivery</span><input formControlName="deliveryMethod" placeholder="Delivery method"></label>
          </div>
          <div class="button-row">
            <button type="submit" class="btn btn-primary">Search</button>
            <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
          </div>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading orders..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load orders'" (retry)="reload()" />
      } @else if (orders().length === 0) {
        <app-empty-state title="No orders found" description="Try a different search or clear the filters." />
      } @else {
        <section class="panel table-shell">
          <header class="table-shell__header">
            <p class="muted">Showing {{ orders().length }} of {{ pagination()?.totalElements ?? orders().length }} orders</p>
            <p class="muted">Page {{ (pagination()?.page ?? 0) + 1 }} of {{ pagination()?.totalPages || 1 }}</p>
          </header>

          <div class="table-scroll">
            <table class="table orders-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('orderNumber')">
                      Order <span>{{ sortMarker('orderNumber') }}</span>
                    </button>
                  </th>
                  <th>Customer</th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('status')">
                      Status <span>{{ sortMarker('status') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('paymentStatus')">
                      Payment <span>{{ sortMarker('paymentStatus') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('totalAmount')">
                      Total <span>{{ sortMarker('totalAmount') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('createdAt')">
                      Created <span>{{ sortMarker('createdAt') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.id) {
                  <tr>
                    <td>
                      <a class="entity-link" [routerLink]="['/ecommerce/orders', order.id]">
                        <span class="entity-link__text">
                          <strong>{{ order.orderNumber }}</strong>
                          <span class="muted">{{ order.deliveryMethod || '-' }}</span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ order.customerName || '-' }}</span>
                        <span class="muted">{{ order.customerEmail || order.customerPhone || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ order.status || '-' }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ order.paymentStatus || '-' }}</span>
                        <span class="muted">{{ order.paymentMethod || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ formatMoney(order.totalAmount) }}</td>
                    <td>{{ formatDate(order.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [pagination]="pagination()!"
            [size]="pagination()?.size || 20"
            [sizes]="pageSizeOptions"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .filters {
      display: grid;
      gap: 0.75rem;
    }

    .filters-grid {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.6rem;
    }

    .filters .field {
      gap: 0.3rem;
    }

    .filters .field span {
      font-size: 0.82rem;
    }

    .filters .field input {
      min-height: 2.7rem;
      padding-block: 0.65rem;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .table-shell__header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .table-shell__header p {
      margin: 0;
      font-size: 0.9rem;
    }

    .table-scroll {
      overflow: auto;
    }

    .orders-table th,
    .orders-table td {
      white-space: nowrap;
      vertical-align: top;
    }

    .orders-table td:first-child,
    .orders-table th:first-child {
      white-space: normal;
      min-width: 220px;
    }

    .sort-button {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .sort-button span {
      color: var(--text-muted);
      font-size: 0.75rem;
      line-height: 1;
    }

    .entity-link {
      display: flex;
      align-items: center;
      color: inherit;
    }

    .entity-link__text {
      display: grid;
      gap: 0.15rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderListPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orders = signal<OrderPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    orderNumber: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    status: '',
    paymentStatus: '',
    deliveryMethod: '',
    page: 0,
    size: 20,
    sort: 'createdAt',
    direction: 'desc' as SortDirection
  });

  ngOnInit(): void {
    void this.load();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.load(this.form.getRawValue());
  }

  async clear(): Promise<void> {
    this.form.reset({
      orderNumber: '',
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      status: '',
      paymentStatus: '',
      deliveryMethod: '',
      page: 0,
      size: this.form.getRawValue().size ?? 20,
      sort: 'createdAt',
      direction: 'desc' as SortDirection
    });
    await this.load(this.form.getRawValue());
  }

  async reload(): Promise<void> {
    await this.load(this.form.getRawValue());
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.load(this.form.getRawValue());
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.load(this.form.getRawValue());
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.load(this.form.getRawValue());
  }

  async sortBy(field: OrderSortField): Promise<void> {
    const current = this.form.getRawValue();
    const direction = current.sort === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.form.patchValue({ sort: field, direction, page: 0 });
    await this.load(this.form.getRawValue());
  }

  sortMarker(field: OrderSortField): string {
    const current = this.form.getRawValue();
    return current.sort === field ? (current.direction === 'asc' ? '↑' : '↓') : '';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  formatMoney(value?: number | string | null): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const numeric = Number(value);
    return Number.isNaN(numeric) ? String(value) : numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private async load(params: OrderSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.ecommerceService.getOrders(params));
      this.orders.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
