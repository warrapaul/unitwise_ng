import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { ProductDetail } from '../models/ecommerce.models';

interface ProductImageView {
  id?: number;
  url?: string | null;
  altText?: string | null;
  isPrimary?: boolean;
}

@Component({
  selector: 'app-product-detail-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading product..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load product'" (retry)="reload()" />
      } @else if (product()) {
        <app-section-card [title]="product()?.name || 'Product detail'" [subtitle]="product()?.sku || null">
          <ng-container actions>
            <div class="detail-actions">
              <a class="btn btn-secondary" routerLink="/ecommerce/products">Back to products</a>
              <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          <div class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Overview</p>
              <p class="muted">{{ product()?.shortDescription || 'No short description provided.' }}</p>
              <div class="meta-grid">
                <div><span class="muted">Price</span><strong>{{ formatMoney(product()?.price) }}</strong></div>
                <div><span class="muted">Selling price</span><strong>{{ formatMoney(product()?.sellingPrice) }}</strong></div>
                <div><span class="muted">Status</span><strong>{{ product()?.status || '-' }}</strong></div>
                <div><span class="muted">Featured</span><strong>{{ product()?.isFeatured ? 'Yes' : 'No' }}</strong></div>
                <div><span class="muted">Variants</span><strong>{{ product()?.hasVariants ? 'Yes' : 'No' }}</strong></div>
              </div>
            </article>

            <article class="panel subcard">
              <p class="eyebrow">Identifiers</p>
              <div class="stack compact">
                <div><span class="muted">SKU</span><strong>{{ product()?.sku }}</strong></div>
                <div><span class="muted">UPC</span><strong>{{ product()?.upc || '-' }}</strong></div>
                <div><span class="muted">Slug</span><strong>{{ product()?.slug || '-' }}</strong></div>
                <div><span class="muted">Category ID</span><strong>{{ product()?.categoryId || '-' }}</strong></div>
                <div><span class="muted">Subcategory ID</span><strong>{{ product()?.subCategoryId || '-' }}</strong></div>
              </div>
            </article>
          </div>

          @if (product()?.description) {
            <article class="panel subcard">
              <p class="eyebrow">Description</p>
              <p class="muted description">{{ product()?.description }}</p>
            </article>
          }

          <section class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Inventory</p>
              @if (product()?.inventory) {
                <div class="meta-grid">
                  <div><span class="muted">Quantity</span><strong>{{ product()?.inventory?.quantity ?? product()?.availableQuantity ?? 0 }}</strong></div>
                  <div><span class="muted">Reserved</span><strong>{{ product()?.inventory?.reservedQuantity ?? '-' }}</strong></div>
                  <div>
                    <span class="muted">Availability</span>
                    <span class="status-chip" [class.status-chip--danger]="isOutOfStock()" [class.status-chip--success]="!isOutOfStock()">
                      {{ isOutOfStock() ? 'Out of stock' : 'In stock' }}
                    </span>
                  </div>
                  <div><span class="muted">Allow backorder</span><strong>{{ product()?.inventory?.allowBackorder ? 'Yes' : 'No' }}</strong></div>
                </div>
              } @else {
                <div class="meta-grid">
                  <div><span class="muted">Quantity</span><strong>{{ product()?.availableQuantity ?? 0 }}</strong></div>
                  <div>
                    <span class="muted">Availability</span>
                    <span class="status-chip" [class.status-chip--danger]="isOutOfStock()" [class.status-chip--success]="!isOutOfStock()">
                      {{ isOutOfStock() ? 'Out of stock' : 'In stock' }}
                    </span>
                  </div>
                </div>
              }
            </article>

            <article class="panel subcard">
              <p class="eyebrow">Pricing</p>
              <div class="stack compact">
                <div><span class="muted">Compare at</span><strong>{{ formatMoney(product()?.compareAtPrice) }}</strong></div>
                <div><span class="muted">Min variant price</span><strong>{{ formatMoney(product()?.minVariantPrice) }}</strong></div>
                <div><span class="muted">Max variant price</span><strong>{{ formatMoney(product()?.maxVariantPrice) }}</strong></div>
                <div><span class="muted">Available quantity</span><strong>{{ product()?.availableQuantity ?? '-' }}</strong></div>
                <div><span class="muted">Display order</span><strong>{{ product()?.displayOrder ?? '-' }}</strong></div>
              </div>
            </article>
          </section>

          @if (product()?.tags?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Tags</p>
              <div class="tag-row">
                @for (tag of product()?.tags || []; track tag.id ?? tag.slug) {
                  <span class="pill">{{ tag.name || tag.slug }}</span>
                }
              </div>
            </article>
          }

          @if (product()?.images?.length || product()?.primaryImageUrl) {
            <article class="panel subcard">
              <p class="eyebrow">Images</p>
              <div class="image-row">
                @for (image of visibleImages(); track image.id ?? image.url) {
                  <div class="image-card">
                    <img [src]="image.url || ''" [alt]="image.altText || product()?.name || 'Product image'" />
                    <div class="image-card__meta">
                      <span class="status-chip" [class.status-chip--info]="image.isPrimary" [class.status-chip--neutral]="!image.isPrimary">
                        {{ image.isPrimary ? 'Primary' : 'Additional' }}
                      </span>
                      <div class="image-actions">
                        <button type="button" class="btn btn-secondary btn-sm" (click)="editImage(image)">Edit</button>
                        <button type="button" class="btn btn-secondary btn-sm" (click)="removeImage(image)">Remove</button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </article>
          }

          @if (product()?.variants?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Variants</p>
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Display</th>
                      <th>SKU</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (variant of product()?.variants || []; track variant.id ?? variant.sku) {
                      <tr>
                        <td>{{ variant.displayName || '-' }}</td>
                        <td>{{ variant.sku || '-' }}</td>
                        <td>{{ formatMoney(variant.price) }}</td>
                        <td>{{ variant.stockStatus || '-' }}</td>
                        <td>{{ variant.availableQuantity ?? '-' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </article>
          }
        </app-section-card>
      } @else {
        <app-empty-state title="No product selected" description="Choose a product from the list to view its details." />
      }
    </section>
  `,
  styles: [`
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .subcard {
      padding: 1rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .meta-grid div,
    .stack.compact div {
      display: grid;
      gap: 0.15rem;
    }

    .description {
      white-space: pre-wrap;
    }

    .tag-row,
    .image-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .image-card {
      width: 160px;
      display: grid;
      gap: 0.4rem;
    }

    .image-card img {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      border-radius: 16px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: rgba(15, 23, 42, 0.03);
    }

    .image-card__meta {
      display: grid;
      gap: 0.45rem;
    }

    .image-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .btn-sm {
      padding: 0.55rem 0.8rem;
      font-size: 0.85rem;
    }

    .table-scroll {
      overflow: auto;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly product = signal<ProductDetail | null>(null);
  readonly visibleImages = signal<ProductImageView[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    const productId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(productId)) {
      this.error.set('Invalid product id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const product = await firstValueFrom(this.ecommerceService.getProduct(productId));
      this.product.set(product);
      this.visibleImages.set(this.buildImageGallery(product));
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  formatMoney(value?: number | string | null): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const numeric = Number(value);
    return Number.isNaN(numeric) ? String(value) : numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  isOutOfStock(): boolean {
    const inventoryQuantity = this.product()?.inventory?.quantity;
    const availableQuantity = this.product()?.availableQuantity;
    const quantity = typeof inventoryQuantity === 'number' ? inventoryQuantity : Number(availableQuantity ?? 0);
    return quantity <= 0;
  }

  editImage(image: ProductImageView): void {
    const currentValue = image.altText || '';
    const updatedValue = window.prompt('Update image alt text', currentValue);
    if (updatedValue === null) {
      return;
    }

    this.visibleImages.update((images) =>
      images.map((item) => (item.id === image.id && item.url === image.url ? { ...item, altText: updatedValue.trim() || item.altText } : item))
    );
  }

  removeImage(image: ProductImageView): void {
    if (!window.confirm('Remove this image from the gallery view?')) {
      return;
    }

    this.visibleImages.update((images) => images.filter((item) => !(item.id === image.id && item.url === image.url)));
  }

  private buildImageGallery(product: ProductDetail): ProductImageView[] {
    const images = (product.images ?? []).map((image) => ({
      id: image.id,
      url: image.url ?? null,
      altText: image.altText ?? null,
      isPrimary: image.isPrimary
    }));

    if (product.primaryImageUrl && !images.some((image) => image.url === product.primaryImageUrl)) {
      images.unshift({
        id: undefined,
        url: product.primaryImageUrl,
        altText: product.name || 'Product image',
        isPrimary: true
      });
    }

    return images;
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
