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
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EcommerceService } from '../ecommerce.service';
import { Pagination } from '../../../core/models/pagination.model';
import { ProductPreview, ProductSearchParams } from '../models/ecommerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';

type ProductSortField = 'name' | 'sku' | 'price' | 'availableQuantity' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-product-list-page',
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
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Products">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.PRODUCT_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.ecomProductCreate">New product</a>
          </app-permission-gate>
        </ng-container>
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name" placeholder="Product name"></label>
              <label class="field"><span>SKU</span><input formControlName="sku" placeholder="SKU"></label>
              <label class="field"><span>Slug</span><input formControlName="slug" placeholder="Slug"></label>
              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="">Any</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </label>
              <label class="field">
                <span>Stock</span>
                <select formControlName="stockStatus">
                  <option value="">Any</option>
                  <option value="IN_STOCK">In stock</option>
                  <option value="LOW_STOCK">Low stock</option>
                  <option value="OUT_OF_STOCK">Out of stock</option>
                  <option value="BACKORDER">Backorder</option>
                </select>
              </label>
              <label class="field">
                <span>Featured</span>
                <select formControlName="isFeatured">
                  <option value="">Any</option>
                  <option value="true">Featured</option>
                  <option value="false">Not featured</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading products..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load products'" (retry)="reload()" />
      } @else if (products().length === 0) {
        <app-empty-state title="No products found" description="Try widening the search filters or clearing them." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table products-table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Product"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="price"
                      label="Pricing"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="availableQuantity"
                      label="Qty"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Status</th>
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
                @for (product of products(); track product.id) {
                  <tr [appRowLink]="['/ecommerce/products', product.id]">
                    <td>
                      <a class="record-link" [routerLink]="['/ecommerce/products', product.id]">
                        @if (product.primaryImageUrl) {
                          <img class="product-thumb" [src]="product.primaryImageUrl" [alt]="product.name || 'Product image'">
                        } @else {
                          <span class="product-thumb product-thumb--fallback" aria-hidden="true">
                            {{ product.name.slice(0, 2).toUpperCase() }}
                          </span>
                        }
                        <span class="record-link__text">
                          <span class="record-link__primary">{{ product.name }}</span>
                          <span class="record-link__secondary">
                            {{ product.sku }}
                            @if (product.isFeatured) {
                              <span class="featured-star" aria-label="Featured product">★</span>
                            }
                          </span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ formatMoney(product.sellingPrice ?? product.price) }}</span>
                        <span class="muted">{{ formatMoney(product.compareAtPrice) }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="status-chip" [ngClass]="quantityToneClass(product.availableQuantity)">
                        {{ product.availableQuantity ?? '-' }}
                      </span>
                    </td>
                    <td>
                      <span class="status-chip" [ngClass]="chipToneClass(product.status)">
                        {{ formatLabel(product.status) }}
                      </span>
                    </td>
                    <td>{{ formatDate(product.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="products().length"
            [total]="pagination()?.totalElements ?? products().length"
            noun="products"
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

    .filters .field input,
    .filters .field select {
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

    .products-table th,
    .products-table td {
      white-space: nowrap;
      vertical-align: top;
    }

    .products-table td:first-child,
    .products-table th:first-child {
      white-space: normal;
      min-width: 280px;
    }

    .product-thumb {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--primary-ring);
      color: var(--primary-strong);
      font-size: 0.78rem;
      font-weight: 700;
      flex: none;
      object-fit: cover;
    }

    .product-thumb--fallback {
      display: inline-flex;
    }

    .featured-star {
      color: var(--warning);
      margin-left: 0.3rem;
      font-size: 0.78rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly products = signal<ProductPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    name: '',
    sku: '',
    slug: '',
    status: '',
    stockStatus: '',
    isFeatured: '',
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
      name: '',
      sku: '',
      slug: '',
      status: '',
      stockStatus: '',
      isFeatured: '',
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

    if (['active', 'in stock', 'available', 'published', 'enabled'].includes(normalized)) {
      return 'status-chip--success';
    }

    if (['draft', 'low stock', 'backorder', 'pending', 'processing'].includes(normalized)) {
      return 'status-chip--warning';
    }

    if (['inactive', 'out of stock', 'discontinued', 'archived'].includes(normalized)) {
      return 'status-chip--danger';
    }

    return 'status-chip--info';
  }

  quantityToneClass(value?: number | null): string {
    if (value === null || value === undefined) {
      return 'status-chip--neutral';
    }

    if (value <= 0) {
      return 'status-chip--danger';
    }

    if (value <= 10) {
      return 'status-chip--warning';
    }

    return 'status-chip--success';
  }

  private normalizeValue(value?: string | null): string {
    return (value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private async load(params: ProductSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.ecommerceService.getProducts(params));
      this.products.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
