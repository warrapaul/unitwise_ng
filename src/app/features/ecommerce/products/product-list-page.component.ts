import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { Pagination } from '../../../core/models/pagination.model';
import { ProductPreview, ProductSearchParams } from '../models/ecommerce.models';

type ProductSortField = 'name' | 'sku' | 'price' | 'availableQuantity' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Products" subtitle="Search the catalog with compact filters and sortable columns.">
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
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
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading products..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load products'" (retry)="reload()" />
      } @else if (products().length === 0) {
        <app-empty-state title="No products found" description="Try widening the search filters or clearing them." />
      } @else {
        <section class="panel table-shell">
          <header class="table-shell__header">
            <p class="muted">Showing {{ products().length }} of {{ pagination()?.totalElements ?? products().length }} products</p>
            <p class="muted">Page {{ (pagination()?.page ?? 0) + 1 }} of {{ pagination()?.totalPages || 1 }}</p>
          </header>

          <div class="table-scroll">
            <table class="table products-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('name')">
                      Product <span>{{ sortMarker('name') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('price')">
                      Pricing <span>{{ sortMarker('price') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('availableQuantity')">
                      Qty <span>{{ sortMarker('availableQuantity') }}</span>
                    </button>
                  </th>
                  <th>Status</th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('createdAt')">
                      Created <span>{{ sortMarker('createdAt') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (product of products(); track product.id) {
                  <tr>
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
      background: rgba(79, 132, 217, 0.12);
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
      color: #d88a22;
      margin-left: 0.3rem;
      font-size: 0.78rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductListPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

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
      name: '',
      sku: '',
      slug: '',
      status: '',
      stockStatus: '',
      isFeatured: '',
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

  async sortBy(field: ProductSortField): Promise<void> {
    const current = this.form.getRawValue();
    const direction = current.sort === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.form.patchValue({ sort: field, direction, page: 0 });
    await this.load(this.form.getRawValue());
  }

  sortMarker(field: ProductSortField): string {
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
