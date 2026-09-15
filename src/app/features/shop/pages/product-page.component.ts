import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { ProductDetail } from '../../ecommerce/models/ecommerce.models';
import { ProductVariantDetail } from '../../ecommerce/models/catalog.models';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-shop-product-page',
  standalone: true,
  imports: [RouterLink, NgOptimizedImage, LoadingStateComponent, ErrorStateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading product..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (product(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.shortDescription || null">
          <ng-container actions>
            <div class="button-row">
              <a class="btn btn-secondary" [routerLink]="RoutePaths.shop">Back to shop</a>
              <a class="btn btn-primary" [routerLink]="RoutePaths.cart">
                Cart{{ cart.itemCount() > 0 ? ' (' + cart.itemCount() + ')' : '' }}
              </a>
            </div>
          </ng-container>

          <div class="product-layout">
            <div class="gallery">
              @if (activeImage(); as image) {
                <img [ngSrc]="image" [alt]="detail.name" width="480" height="480" priority>
              } @else {
                <div class="gallery__placeholder">No image</div>
              }

              @if ((detail.images ?? []).length > 1) {
                <div class="thumbs">
                  @for (image of detail.images ?? []; track image.id) {
                    <button type="button" class="thumb" [class.thumb--active]="activeImage() === image.imageUrl" (click)="selectImage(image.imageUrl)">
                      <img [ngSrc]="image.imageUrl" [alt]="image.altText || detail.name" width="64" height="64">
                    </button>
                  }
                </div>
              }
            </div>

            <div class="buy-panel">
              <p class="price">
                <strong>{{ currentPrice() }}</strong>
                @if (detail.compareAtPrice && detail.compareAtPrice !== detail.sellingPrice) {
                  <s class="muted">{{ detail.compareAtPrice }}</s>
                }
              </p>

              @if (detail.discountBadge) {
                <span class="status-chip status-chip--warning">{{ detail.discountBadge }}</span>
              }

              @if ((detail.variants ?? []).length > 0) {
                <label class="field">
                  <span>Option</span>
                  <select (change)="selectVariant($event)">
                    <option value="">Select an option</option>
                    @for (variant of detail.variants ?? []; track variant.id) {
                      <option [value]="variant.id" [disabled]="!variant.isInStock">
                        {{ variantLabel(variant) }}{{ variant.isInStock ? '' : ' — out of stock' }}
                      </option>
                    }
                  </select>
                  @if (!selectedVariant() && submitted()) {
                    <small class="error-text">Choose an option before adding to the cart.</small>
                  }
                </label>
              }

              <label class="field">
                <span>Quantity</span>
                <input type="number" min="1" [max]="maxQuantity()" [value]="quantity()" (input)="onQuantityInput($event)">
                @if (quantity() > maxQuantity()) {
                  <small class="error-text">Only {{ maxQuantity() }} available.</small>
                }
              </label>

              @if (outOfStock()) {
                <p class="hint">This item is out of stock.</p>
              }

              <div class="button-row">
                <button type="button" class="btn btn-primary" [disabled]="outOfStock()" (click)="addToCart()">
                  Add to cart
                </button>
                @if (added()) {
                  <span class="status-chip status-chip--success" role="status">Added</span>
                }
              </div>

              <dl class="detail-grid">
                <div><dt>SKU</dt><dd class="mono">{{ detail.sku }}</dd></div>
                <div><dt>Availability</dt><dd>{{ detail.stockStatus || '-' }}</dd></div>
                @if (detail.minOrderQuantity) {
                  <div><dt>Minimum order</dt><dd>{{ detail.minOrderQuantity }}</dd></div>
                }
              </dl>
            </div>
          </div>
        </app-section-card>

        @if (detail.description) {
          <app-section-card title="Description">
            <p class="description">{{ detail.description }}</p>
          </app-section-card>
        }

        @if ((detail.attributes ?? []).length > 0) {
          <app-section-card title="Specifications">
            <dl class="detail-grid">
              @for (attribute of detail.attributes ?? []; track attribute.id) {
                <div><dt>{{ attribute.attributeName }}</dt><dd>{{ attribute.attributeValue }}</dd></div>
              }
            </dl>
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
    .product-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 1.6rem;
      align-items: start;
    }

    .gallery {
      display: grid;
      gap: 0.6rem;
    }

    .gallery img {
      width: 100%;
      height: auto;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      object-fit: cover;
    }

    .gallery__placeholder {
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-muted);
    }

    .thumbs {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .thumb {
      padding: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: none;
      cursor: pointer;
      overflow: hidden;
      line-height: 0;
    }

    .thumb--active {
      border-color: var(--primary);
    }

    .buy-panel {
      display: grid;
      gap: 0.75rem;
      justify-items: start;
    }

    .price {
      margin: 0;
      display: flex;
      gap: 0.6rem;
      align-items: baseline;
      font-size: 1.2rem;
    }

    .description {
      margin: 0;
      white-space: pre-wrap;
    }

    @media (max-width: 860px) {
      .product-layout {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShopProductPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly cart = inject(CartService);

  readonly id = input.required<string>();

  private readonly ecommerce = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly product = signal<ProductDetail | null>(null);

  readonly selectedVariant = signal<ProductVariantDetail | null>(null);
  readonly quantity = signal(1);
  readonly submitted = signal(false);
  readonly added = signal(false);
  private readonly chosenImage = signal<string | null>(null);

  readonly activeImage = computed(() =>
    this.chosenImage() ?? this.product()?.primaryImageUrl ?? this.product()?.images?.[0]?.imageUrl ?? null
  );

  readonly maxQuantity = computed(() => {
    const variant = this.selectedVariant();
    if (variant) {
      return variant.availableQuantity ?? 99;
    }

    return this.product()?.availableQuantity ?? 99;
  });

  readonly outOfStock = computed(() => {
    const detail = this.product();
    if (!detail) {
      return true;
    }

    const variant = this.selectedVariant();
    if (variant) {
      return !variant.isInStock;
    }

    return detail.stockStatus === 'OUT_OF_STOCK' || (detail.availableQuantity ?? 0) <= 0;
  });

  readonly currentPrice = computed(() => {
    const variant = this.selectedVariant();
    if (variant?.effectivePrice !== null && variant?.effectivePrice !== undefined) {
      return String(variant.effectivePrice);
    }

    const detail = this.product();
    return String(detail?.sellingPrice ?? detail?.price ?? '-');
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.product.set(await firstValueFrom(this.ecommerce.getProduct(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  selectImage(imageUrl: string): void {
    this.chosenImage.set(imageUrl);
  }

  selectVariant(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const variant = (this.product()?.variants ?? []).find((item) => String(item.id) === value) ?? null;
    this.selectedVariant.set(variant);
    this.added.set(false);
  }

  onQuantityInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.quantity.set(Number.isFinite(value) && value > 0 ? value : 1);
    this.added.set(false);
  }

  variantLabel(variant: ProductVariantDetail): string {
    const parts = [variant.color, variant.size, variant.material].filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(' / ') : (variant.sku || `#${variant.id}`);
  }

  addToCart(): void {
    const detail = this.product();
    if (!detail) {
      return;
    }

    this.submitted.set(true);

    const hasVariants = (detail.variants ?? []).length > 0;
    const variant = this.selectedVariant();
    if (hasVariants && !variant) {
      return;
    }

    if (this.quantity() > this.maxQuantity()) {
      return;
    }

    this.cart.addItem({
      productId: detail.id,
      variantId: variant?.id ?? null,
      name: detail.name,
      variantLabel: variant ? this.variantLabel(variant) : null,
      image: this.activeImage(),
      unitPrice: Number(variant?.effectivePrice ?? detail.sellingPrice ?? detail.price ?? 0),
      quantity: this.quantity(),
      maxQuantity: this.maxQuantity()
    });

    this.added.set(true);
  }
}
