import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CategoryTreeNode, ProductPreview, ProductSearchParams } from '../../ecommerce/models/ecommerce.models';
import { ProductTag } from '../../ecommerce/models/catalog.models';
import { ShopBarComponent } from '../components/shop-bar.component';
import { ProductCardComponent } from '../components/product-card.component';

const SORTS = [
  { value: 'displayOrder,asc', label: 'Recommended' },
  { value: 'createdAt,desc', label: 'Newest' },
  { value: 'price,asc', label: 'Price: low to high' },
  { value: 'price,desc', label: 'Price: high to low' },
  { value: 'name,asc', label: 'Name, A–Z' }
] as const;

/** The price dropdown's choices; each sets `?min=&max=` in the URL. */
const PRICE_BANDS: { key: string; label: string; min: number | null; max: number | null }[] = [
  { key: '0-500', label: 'Under KES 500', min: null, max: 500 },
  { key: '500-2000', label: 'KES 500 – 2,000', min: 500, max: 2000 },
  { key: '2000-5000', label: 'KES 2,000 – 5,000', min: 2000, max: 5000 },
  { key: '5000-20000', label: 'KES 5,000 – 20,000', min: 5000, max: 20000 },
  { key: '20000-', label: 'Over KES 20,000', min: 20000, max: null }
];

const PAGE_SIZE = 24;

/** Everything that narrows the shelf, as it sits in the URL. */
interface Query {
  q?: string | null;
  category?: number | null;
  sub?: number | null;
  min?: number | null;
  max?: number | null;
  featured?: boolean | null;
  tags?: string[] | null;
  sort?: string | null;
}

/**
 * The storefront: top-level categories down the side; above the shelf one row of
 * filters (price band, tag, sort, featured), then the chosen category's
 * subcategories as tabs — "All" is the category itself, and a subcategory filter is
 * added only when another tab is chosen.
 *
 * Every choice lives in the URL — `?category=&sub=&min=&max=&featured=&tags=&sort=&q=` —
 * so a filtered shelf can be shared, bookmarked and returned to with Back. More
 * products load below the ones already seen, the way a shop scrolls.
 */
@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [FormsModule, LoadingStateComponent, ErrorStateComponent, ShopBarComponent, ProductCardComponent],
  template: `
    <section class="shop">
      <app-shop-bar [initialQuery]="q() ?? ''" />

      <div class="layout">
        <!-- ─── Categories: the top level only; subcategories are tabs over the shelf ─── -->
        <nav class="categories" aria-label="Categories">
          <h2 class="categories__title">Categories</h2>
          <button type="button" class="cat" [class.cat--on]="!categoryId()" [attr.aria-current]="!categoryId() ? 'true' : null"
                  (click)="go({ category: null, sub: null })">
            <span class="cat__icon" aria-hidden="true">▦</span> All products
          </button>
          @for (category of categories(); track category.id) {
            <button type="button" class="cat" [class.cat--on]="categoryId() === category.id"
                    [attr.aria-current]="categoryId() === category.id ? 'true' : null" (click)="go({ category: category.id, sub: null })">
              @if (category.imageUrl) {
                <img class="cat__icon" [src]="category.imageUrl" alt="" width="28" height="28">
              } @else {
                <span class="cat__icon" aria-hidden="true">{{ category.name.charAt(0) }}</span>
              }
              {{ category.name }}
            </button>
          }
        </nav>

        <div class="main">
          <!-- ─── Filters, one row of the app's own dropdowns ─── -->
          <div class="filters" role="search" aria-label="Filter products">
            <label class="field">
              <span>Price</span>
              <select [ngModel]="priceBand()" (ngModelChange)="setPrice($event)">
                <option [ngValue]="null">Any price</option>
                @for (band of bands; track band.key) { <option [ngValue]="band.key">{{ band.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Tag</span>
              <select [ngModel]="firstTag()" (ngModelChange)="go({ tags: $event ? [$event] : null })" [disabled]="tags().length === 0">
                <option [ngValue]="null">Any tag</option>
                @for (tag of tags(); track tag.id) { <option [ngValue]="tag.slug">{{ tag.name }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Sort by</span>
              <select [ngModel]="sort()" (ngModelChange)="go({ sort: $event })">
                @for (option of sorts; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
            <label class="featured">
              <input type="checkbox" [checked]="featuredOnly()" (change)="go({ featured: $any($event.target).checked || null })">
              <span>Featured only</span>
            </label>
          </div>

          <!--
            The chosen category's subcategories. "All" is the category itself; a
            subcategory filter is added only when another tab is chosen.
          -->
          @if (currentCategory(); as category) {
            @if (subcategories().length > 0) {
              <div class="subs" role="tablist" [attr.aria-label]="category.name">
                <button type="button" role="tab" class="sub" [class.sub--on]="!subId()" [attr.aria-selected]="!subId()" (click)="go({ sub: null })">All</button>
                @for (sub of subcategories(); track sub.id) {
                  <button type="button" role="tab" class="sub" [class.sub--on]="subId() === sub.id" [attr.aria-selected]="subId() === sub.id"
                          (click)="go({ sub: sub.id })">{{ sub.name }}</button>
                }
              </div>
            }
          }

          <div class="toolbar">
            <h1>{{ heading() }}</h1>
            @if (total() !== null) { <span class="muted">{{ total() }} {{ total() === 1 ? 'item' : 'items' }}</span> }
            @if (anyFilter()) { <button type="button" class="link-button" (click)="showAll()">Clear filters</button> }
          </div>

          @if (loading() && products().length === 0) {
            <app-loading-state label="Loading products..." />
          } @else if (error() && products().length === 0) {
            <app-error-state [message]="error()!" (retry)="load(true)" />
          } @else if (products().length === 0) {
            <div class="nothing">
              <strong>Nothing matches{{ q() ? ' “' + q() + '”' : '' }}</strong>
              <p class="muted">Try another word, fewer filters, or another category.</p>
              <button type="button" class="btn btn-secondary" (click)="showAll()">Show all products</button>
            </div>
          } @else {
            <div class="grid">
              @for (product of products(); track product.id) {
                <app-product-card [product]="product" />
              }
            </div>
            @if (hasMore()) {
              <div class="more">
                <button type="button" class="btn btn-secondary" [disabled]="loading()" (click)="load(false)">
                  {{ loading() ? 'Loading...' : 'Show more' }}
                </button>
              </div>
            }
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    .layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr); gap: 1.25rem; align-items: start; }
    .categories { position: sticky; top: 1rem; display: grid; gap: 0.15rem; padding: 0.75rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
    .categories__title { margin: 0 0 0.35rem 0.4rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
    .cat { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.55rem; border: 0; border-radius: 10px; background: none; color: var(--text);
           font: inherit; font-size: 0.92rem; text-align: start; cursor: pointer; }
    .cat:hover { background: var(--surface-2); }
    .cat--on { background: var(--primary-tint); color: var(--primary-strong); font-weight: 700; }
    .cat__icon { flex: none; width: 1.75rem; height: 1.75rem; border-radius: 8px; object-fit: cover; display: grid; place-items: center;
                 background: var(--surface-2); font-size: 0.85rem; font-weight: 700; color: var(--text-muted); }
    .cat--on span.cat__icon { background: var(--surface); color: var(--primary-strong); }
    .main { display: grid; gap: 0.85rem; min-width: 0; }
    .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 0.75rem; align-items: end;
               padding: 0.9rem 1rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
    .filters .field select { max-width: none; }
    .featured { display: inline-flex; align-items: center; gap: 0.5rem; height: 3.1rem; padding: 0 0.25rem; font-weight: 600; font-size: 0.92rem; cursor: pointer; white-space: nowrap; }
    .featured input { width: 1.1rem; height: 1.1rem; }
    .subs { display: flex; gap: 0.25rem; overflow-x: auto; border-bottom: 1px solid var(--border); }
    .sub { flex: none; padding: 0.55rem 0.9rem; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none;
           color: var(--text-muted); font: inherit; font-weight: 600; font-size: 0.9rem; cursor: pointer; white-space: nowrap; }
    .sub:hover { color: var(--text); }
    .sub--on { color: var(--primary-strong); border-bottom-color: var(--primary); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.85rem; }
    .toolbar h1 { margin: 0; font-size: 1.35rem; }
    .link-button { padding: 0; border: 0; background: none; font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); cursor: pointer; text-decoration: underline; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(46%, 12.5rem), 1fr)); gap: 1rem; }
    .more { display: flex; justify-content: center; padding: 0.5rem 0 1rem; }
    .nothing { display: grid; justify-items: center; gap: 0.5rem; padding: 3rem 1rem; text-align: center; border: 1px dashed var(--border-strong); border-radius: 16px; }
    .nothing p { margin: 0; }
    /* On a narrow screen the categories become a scrolling row of chips above the filters. */
    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .categories { position: static; display: flex; gap: 0.4rem; overflow-x: auto; padding: 0; border: 0; background: none; }
      .categories__title { display: none; }
      .cat { flex: none; padding: 0.35rem 0.8rem 0.35rem 0.35rem; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); white-space: nowrap; }
      .cat__icon { width: 1.5rem; height: 1.5rem; border-radius: 999px; }
    }
    @media (max-width: 600px) {
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid { gap: 0.6rem; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogPageComponent {
  readonly sorts = SORTS;
  readonly bands = PRICE_BANDS;

  // From the URL, bound by the router.
  readonly q = input<string | undefined>();
  readonly category = input<string | undefined>();
  readonly sub = input<string | undefined>();
  readonly min = input<string | undefined>();
  readonly max = input<string | undefined>();
  readonly featured = input<string | undefined>();
  readonly tags_ = input<string | undefined>(undefined, { alias: 'tags' });
  readonly sortParam = input<string | undefined>(undefined, { alias: 'sort' });

  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly products = signal<ProductPreview[]>([]);
  readonly categories = signal<CategoryTreeNode[]>([]);
  readonly tags = signal<ProductTag[]>([]);
  readonly total = signal<number | null>(null);
  readonly hasMore = signal(false);
  private page = 0;

  readonly categoryId = computed(() => positive(this.category()));
  readonly subId = computed(() => positive(this.sub()));
  readonly minPrice = computed(() => nonNegative(this.min()));
  readonly maxPrice = computed(() => nonNegative(this.max()));
  readonly featuredOnly = computed(() => this.featured() === 'true' || this.featured() === '1');
  readonly firstTag = computed(() => this.selectedTags().at(0) ?? null);
  readonly selectedTags = computed(() => (this.tags_() ?? '').split(',').map((tag) => tag.trim()).filter(Boolean));
  readonly sort = computed(() => SORTS.some((option) => option.value === this.sortParam()) ? this.sortParam()! : SORTS[0].value);

  readonly currentCategory = computed(() => this.categories().find((item) => item.id === this.categoryId()) ?? null);
  readonly subcategories = computed(() => this.currentCategory()?.subCategories ?? []);

  /** The dropdown's choice matching the URL's price range, or null for "Any price" (or a range typed by hand). */
  readonly priceBand = computed(() => this.bands.find((band) => band.min === this.minPrice() && band.max === this.maxPrice())?.key ?? null);

  readonly anyFilter = computed(() => !!(this.q() || this.categoryId() || this.minPrice() !== null || this.maxPrice() !== null
    || this.featuredOnly() || this.selectedTags().length));

  readonly heading = computed(() => {
    if (this.q()) {
      return `Results for “${this.q()}”`;
    }
    const sub = this.subcategories().find((item) => item.id === this.subId());
    return sub?.name ?? this.currentCategory()?.name ?? (this.featuredOnly() ? 'Featured' : 'All products');
  });

  constructor() {
    void this.loadLookups();
    effect(() => {
      // Any change to what narrows the shelf starts it again from the top.
      this.q(); this.categoryId(); this.subId(); this.minPrice(); this.maxPrice();
      this.featuredOnly(); this.selectedTags(); this.sort();
      untracked(() => void this.load(true));
    });
  }

  private async loadLookups(): Promise<void> {
    const [categories, tags] = await Promise.allSettled([
      firstValueFrom(this.ecommerce.getCategoryHierarchy()),
      firstValueFrom(this.ecommerce.getShopTags())
    ]);
    // The hierarchy's top level is the parents (no parent id); their children are the tabs.
    this.categories.set(categories.status === 'fulfilled' ? categories.value : []);
    this.tags.set(tags.status === 'fulfilled' ? tags.value : []);
  }

  /** Change part of the query; everything else in the URL stays as it is. */
  go(change: Query): void {
    const params: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(change)) {
      params[key] = Array.isArray(value) ? (value.length ? value.join(',') : null)
        : value === false || value === undefined || value === '' ? null
        : value === true ? 'true' : value;
    }
    if (params['sort'] === SORTS[0].value) {
      params['sort'] = null;
    }
    void this.router.navigate([RoutePaths.shop], { queryParams: params, queryParamsHandling: 'merge' });
  }

  setPrice(key: string | null): void {
    const band = this.bands.find((item) => item.key === key);
    this.go({ min: band?.min ?? null, max: band?.max ?? null });
  }

  showAll(): void {
    void this.router.navigate([RoutePaths.shop]);
  }

  async load(reset: boolean): Promise<void> {
    if (reset) {
      this.page = 0;
    }
    this.loading.set(true);
    this.error.set(null);
    const [sort, direction] = this.sort().split(',');
    const params: ProductSearchParams = {
      name: this.q()?.trim() || undefined,
      categoryId: this.categoryId() ?? undefined,
      subCategoryId: this.subId() ?? undefined,
      minPrice: this.minPrice() ?? undefined,
      maxPrice: this.maxPrice() ?? undefined,
      isFeatured: this.featuredOnly() || undefined,
      tagSlugs: this.selectedTags().length ? this.selectedTags() : undefined,
      page: this.page,
      size: PAGE_SIZE,
      sort,
      direction: direction as 'asc' | 'desc'
    };
    try {
      // `/v1/products/active` is the customer-facing listing; the admin search needs PRODUCT_READ_ALL.
      const result = await firstValueFrom(this.ecommerce.getActiveProducts(params));
      this.products.set(reset ? result.items : [...this.products(), ...result.items]);
      this.total.set(result.pagination?.totalElements ?? null);
      this.hasMore.set(!!result.pagination && !result.pagination.isLast);
      this.page += 1;
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

function positive(value: string | undefined): number | null {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegative(value: string | undefined): number | null {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
