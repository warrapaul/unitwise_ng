import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { Pagination } from '../../../core/models/pagination.model';
import { OrderPreview, OrderSearchParams } from '../models/ecommerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

type OrderSortField = 'orderNumber' | 'status' | 'paymentStatus' | 'totalAmount' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-order-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Orders">
        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
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
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading orders..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load orders'" (retry)="reload()" />
      } @else if (orders().length === 0) {
        <app-empty-state title="No orders found" description="Try a different search or clear the filters." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table orders-table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="orderNumber"
                      label="Order"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Customer</th>
                  <th class="address-col">Address</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="status"
                      label="Status"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="paymentStatus"
                      label="Payment"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Delivery</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="totalAmount"
                      label="Total"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="createdAt"
                      label="Created"
                      (sorted)="search()"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.id) {
                  <tr [appRowLink]="['/ecommerce/orders', order.id]">
                    <td>
                      <a class="record-link" [routerLink]="['/ecommerce/orders', order.id]">
                        <span class="record-link__text">
                          <span class="record-link__primary">{{ order.orderNumber }}</span>
                          <span class="record-link__secondary">{{ formatLabel(order.deliveryMethod) }}</span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span class="record-link__primary">{{ order.customerName || '-' }}</span>
                        <span class="record-link__secondary">{{ order.customerPhone || order.customerEmail || '-' }}</span>
                      </div>
                    </td>
                    <td class="address-col">
                      <div class="address-cell">
                        <div class="address-cell__row">
                          <span class="record-link__primary">{{ formatAddress(order.deliverAddress) }}</span>
                          @if (order.deliverAddress?.isVerified) {
                            <span class="verified-icon" title="Verified" aria-label="Verified">✓</span>
                          }
                        </div>
                        <span class="record-link__secondary">{{ order.deliverAddress?.addressNickname || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="status-chip" [ngClass]="chipToneClass(order.status)">{{ formatLabel(order.status) }}</span>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span class="record-link__primary">{{ formatLabel(order.paymentMethod) }}</span>
                        <span class="status-chip" [ngClass]="chipToneClass(order.paymentStatus)">{{ formatLabel(order.paymentStatus) }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="status-chip" [ngClass]="chipToneClass(order.deliveryMethod)">{{ formatLabel(order.deliveryMethod) }}</span>
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
            [shown]="orders().length"
            [total]="pagination()?.totalElements ?? orders().length"
            noun="orders"
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


    .filters .field {
      gap: 0.4rem;
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

    .address-col {
      white-space: normal;
      min-width: 260px;
    }

    .address-cell {
      display: grid;
      gap: 0.25rem;
    }

    .address-cell__row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .verified-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.3rem;
      height: 1.3rem;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--success);
      background: var(--success-tint);
      border: 1px solid var(--success-border);
      flex: none;
    }

    .orders-table tbody tr td {
      vertical-align: top;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderListPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

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
  });

  ngOnInit(): void {
    void this.load();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
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
    });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async reload(): Promise<void> {
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
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

  formatAddress(address?: OrderPreview['deliverAddress'] | null): string {
    if (!address) {
      return '-';
    }

    const parts = [address.addressLine1, address.unitNumber, address.landmark, address.town, address.city, address.county]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .map((value) => value.trim());

    if (parts.length === 0) {
      return address.addressNickname || '-';
    }

    return parts.join(', ');
  }

  formatLabel(value?: string | null): string {
    if (!value) {
      return '-';
    }

    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  chipToneClass(value?: string | null): string {
    const normalized = this.normalizeValue(value);

    if (!normalized) {
      return 'status-chip--neutral';
    }

    if (
      ['delivered', 'completed', 'fulfilled', 'paid', 'successful', 'active', 'in stock', 'available'].includes(normalized)
    ) {
      return 'status-chip--success';
    }

    if (
      ['processing', 'pending', 'waiting payment confirmation', 'awaiting payment', 'in progress', 'packaging in progress', 'confirmed'].includes(normalized)
    ) {
      return 'status-chip--warning';
    }

    if (['canceled', 'cancelled', 'failed', 'rejected', 'inactive', 'out of stock', 'refunded'].includes(normalized)) {
      return 'status-chip--danger';
    }

    if (['home delivery', 'pickup', 'store pickup', 'courier', 'delivery', 'mpesa', 'card', 'bank transfer', 'cash on delivery'].includes(normalized)) {
      return 'status-chip--info';
    }

    return 'status-chip--neutral';
  }

  private normalizeValue(value?: string | null): string {
    return (value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private async load(params: OrderSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.ecommerceService.getOrders(params));
      this.orders.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
