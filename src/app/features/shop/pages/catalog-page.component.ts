import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CategoryTreeNode, ProductPreview, ProductSearchParams } from '../../ecommerce/models/ecommerce.models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgOptimizedImage,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    SearchableSelectComponent,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Shop">
        <ng-container actions>
          <div class="action-bar">
            <a class="btn btn-secondary" [routerLink]="RoutePaths.myOrders">My orders</a>
            <a class="btn btn-primary" [routerLink]="RoutePaths.cart">
              Cart{{ cart.itemCount() > 0 ? ' (' + cart.itemCount() + ')' : '' }}
            </a>
          </div>
        </ng-container>

        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Search</span><input formControlName="name" placeholder="Product name"></label>
              <label class="field">
                <span>Category</span>
                <app-searchable-select
                  formControlName="categoryId"
                  [options]="categoryOptions()"
                  placeholder="All categories"
                  emptyOptionLabel="All categories"
                  searchPlaceholder="Search categories…"
                />
              </label>
              <label class="field"><span>Min price</span><input type="number" step="0.01" min="0" formControlName="minPrice"></label>
              <label class="field"><span>Max price</span><input type="number" step="0.01" min="0" formControlName="maxPrice"></label>
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
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (products().length === 0) {
        <app-empty-state title="No products found" description="Try different keywords or clear filters." />
      } @else {
        <div class="product-grid">
          @for (product of products(); track product.id) {
            <article class="product-card">
              <a [routerLink]="RoutePaths.shopProduct(product.id)" class="product-card__media">
                @if (product.primaryImageUrl) {
                  <img [ngSrc]="product.primaryImageUrl" [alt]="product.name" width="320" height="320">
                } @else {
                  <span class="product-card__placeholder" aria-hidden="true">No image</span>
                }
              </a>

              <div class="product-card__body">
                <a class="product-card__name" [routerLink]="RoutePaths.shopProduct(product.id)">{{ product.name }}</a>

                <p class="product-card__price">
                  <strong>{{ displayPrice(product) }}</strong>
                  @if (product.compareAtPrice && product.compareAtPrice !== product.sellingPrice) {
                    <s class="muted">{{ product.compareAtPrice }}</s>
                  }
                </p>

                <div class="chip-row">
                  @if (product.discountBadge) {
                    <span class="status-chip status-chip--warning">{{ product.discountBadge }}</span>
                  }
                  @if (isOutOfStock(product)) {
                    <span class="status-chip status-chip--danger">Out of stock</span>
                  }
                </div>

                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  [disabled]="isOutOfStock(product) || product.hasVariants"
                  (click)="addToCart(product)"
                >
                  {{ product.hasVariants ? 'Choose options' : 'Add to cart' }}
                </button>
              </div>
            </article>
          }
        </div>

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
    .filters {
      display: grid;
      gap: 0.75rem;
    }

    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }

    .product-card {
      display: grid;
      gap: 0.6rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
      overflow: hidden;
    }

    .product-card__media {
      display: block;
      aspect-ratio: 1;
      background: var(--surface-2);
      display: grid;
      place-items: center;
    }

    .product-card__media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .product-card__placeholder {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .product-card__body {
      display: grid;
      gap: 0.4rem;
      padding: 0 0.75rem 0.85rem;
      justify-items: start;
    }

    .product-card__name {
      font-weight: 600;
      font-size: 0.94rem;
      line-height: 1.3;
    }

    .product-card__price {
      margin: 0;
      display: flex;
      gap: 0.5rem;
      align-items: baseline;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      min-height: 1.2rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly cart = inject(CartService);

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly products = signal<ProductPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly categories = signal<CategoryTreeNode[]>([]);

  /** Flattened so a nested child is reachable by name, not only under its parent. */
  readonly categoryOptions = computed<SelectOption<number>[]>(() => {
    const options: SelectOption<number>[] = [];
    const walk = (nodes: CategoryTreeNode[], parent: string | null): void => {
      for (const node of nodes) {
        options.push({ value: node.id, label: node.name });
        walk(node.subCategories ?? [], node.name);
      }
    };

    walk(this.categories(), null);
    return options;
  });

  readonly form = this.formBuilder.group({
    name: '',
    categoryId: [null as number | null],
    minPrice: [null as number | null],
    maxPrice: [null as number | null],
    page: 0,
    size: 20,
    sort: 'name',
    direction: 'asc' as 'asc' | 'desc'
  });

  ngOnInit(): void {
    void this.loadCategories();
    void this.reload();
  }

  async loadCategories(): Promise<void> {
    try {
      this.categories.set(await firstValueFrom(this.ecommerce.getCategoryHierarchy()));
    } catch {
      // Without categories the filter simply offers "All categories".
      this.categories.set([]);
    }
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      name: '',
      categoryId: null,
      minPrice: null,
      maxPrice: null,
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'name',
      direction: 'asc'
    });
    await this.reload();
  }

  addToCart(product: ProductPreview): void {
    this.cart.addItem({
      productId: product.id,
      variantId: null,
      name: product.name,
      image: product.primaryImageUrl ?? null,
      unitPrice: Number(product.sellingPrice ?? product.price ?? 0),
      quantity: 1,
      maxQuantity: product.availableQuantity ?? 99
    });
  }

  isOutOfStock(product: ProductPreview): boolean {
    return product.stockStatus === 'OUT_OF_STOCK' || (product.availableQuantity ?? 0) <= 0;
  }

  displayPrice(product: ProductPreview): string {
    if (product.hasVariants && product.minVariantPrice) {
      return product.minVariantPrice === product.maxVariantPrice
        ? String(product.minVariantPrice)
        : `${product.minVariantPrice} – ${product.maxVariantPrice}`;
    }

    return String(product.sellingPrice ?? product.price ?? '-');
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = this.form.getRawValue() as ProductSearchParams;

    try {
      // `/v1/products/active` is the customer-facing listing; the admin `/v1/products`
      // search needs PRODUCT_READ_ALL, which a shopper does not have.
      const result = await firstValueFrom(this.ecommerce.getActiveProducts(params));
      this.products.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
