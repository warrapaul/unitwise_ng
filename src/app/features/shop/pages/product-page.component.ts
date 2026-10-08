import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { ProductDetail } from '../../ecommerce/models/ecommerce.models';
import { ProductVariantDetail } from '../../ecommerce/models/catalog.models';
import { CartService } from '../cart.service';
import { ShopBarComponent } from '../components/shop-bar.component';
import { QtyStepperComponent } from '../components/qty-stepper.component';
import { ksh } from '../shop-format';

/**
 * One product, laid out to be bought: pictures on the left, and on the right the
 * price, the options as buttons (not a dropdown), how many, and the two ways to
 * buy — keep shopping, or go straight to checkout.
 */
@Component({
  selector: 'app-shop-product-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, ShopBarComponent, QtyStepperComponent],
  template: `
    <section class="shop">
      <app-shop-bar />

      @if (loading()) {
        <app-loading-state label="Loading product..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (product(); as p) {
        <nav class="crumbs" aria-label="Breadcrumb"><a [routerLink]="RoutePaths.shop">Shop</a> <span aria-hidden="true">›</span> <span>{{ p.name }}</span></nav>

        <div class="layout">
          <div class="gallery">
            <div class="gallery__main">
              @if (activeImage(); as image) {
                <img class="fill" [src]="image" [alt]="p.name">
              } @else {
                <span class="gallery__none" aria-hidden="true">{{ p.name.charAt(0) }}</span>
              }
              @if (p.discountBadge) { <span class="deal">{{ p.discountBadge }}</span> }
            </div>
            @if (gallery().length > 1) {
              <div class="thumbs">
                @for (image of gallery(); track image) {
                  <button type="button" class="thumb" [class.thumb--on]="activeImage() === image" (click)="chosenImage.set(image)" aria-label="Show this picture">
                    <img [src]="image" alt="" width="72" height="72">
                  </button>
                }
              </div>
            }
          </div>

          <div class="buy">
            <h1>{{ p.name }}</h1>
            @if (p.shortDescription) { <p class="lede">{{ p.shortDescription }}</p> }

            <p class="price">
              <strong>{{ price() }}</strong>
              @if (wasPrice(); as was) { <s>{{ was }}</s> }
            </p>
            <p class="stock" [class.stock--out]="outOfStock()" [class.stock--low]="lowStock()">
              {{ outOfStock() ? 'Out of stock' : lowStock() ? 'Only ' + maxQuantity() + ' left' : 'In stock' }}
            </p>

            @if ((p.variants ?? []).length > 0) {
              <fieldset class="options">
                <legend>Choose an option</legend>
                <div class="options__list">
                  @for (variant of p.variants ?? []; track variant.id) {
                    <button type="button" class="option" [class.option--on]="selectedVariant()?.id === variant.id"
                            [disabled]="!variant.isInStock" [attr.aria-pressed]="selectedVariant()?.id === variant.id"
                            (click)="pickVariant(variant)">
                      {{ variantLabel(variant) }}
                      @if (variant.effectivePrice) { <small>{{ ksh(variant.effectivePrice) }}</small> }
                    </button>
                  }
                </div>
                @if (needsVariant()) { <small class="error-text" role="alert">Choose an option first.</small> }
              </fieldset>
            }

            <div class="qty">
              <span class="muted">Quantity</span>
              <app-qty-stepper [value]="quantity()" [max]="maxQuantity()" [label]="p.name" (changed)="quantity.set($event)" />
            </div>

            <div class="actions">
              <button type="button" class="btn btn-primary btn-lg" [disabled]="outOfStock()" (click)="addToCart(false)">Add to cart</button>
              <button type="button" class="btn btn-secondary btn-lg" [disabled]="outOfStock()" (click)="addToCart(true)">Buy now</button>
            </div>

            <ul class="assurances">
              <li>Delivered to your door, or pick it up at a store</li>
              <li>Pay with M-Pesa, or on delivery</li>
            </ul>
          </div>
        </div>

        @if (p.description || (p.attributes ?? []).length > 0) {
          <div class="about">
            @if (p.description) {
              <section>
                <h2>About this product</h2>
                <p class="description">{{ p.description }}</p>
              </section>
            }
            @if ((p.attributes ?? []).length > 0) {
              <section>
                <h2>Details</h2>
                <dl class="specs">
                  @for (attribute of p.attributes ?? []; track attribute.id) {
                    <div><dt>{{ attribute.attributeName }}</dt><dd>{{ attribute.attributeValue }}</dd></div>
                  }
                </dl>
              </section>
            }
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    .crumbs { font-size: 0.85rem; color: var(--text-muted); }
    .crumbs a { color: var(--primary-strong); font-weight: 600; text-decoration: none; }
    /* The picture is capped at a size that shows the product, not a poster: about 28rem square. */
    .layout { display: grid; grid-template-columns: minmax(0, 28rem) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
    .gallery { display: grid; gap: 0.6rem; }
    .gallery__main { position: relative; aspect-ratio: 1; border-radius: 18px; overflow: hidden; background: var(--surface-2); border: 1px solid var(--border); }
    .gallery__main img.fill { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .gallery__none { position: absolute; inset: 0; display: grid; place-items: center; font-size: 4rem; font-weight: 700; color: var(--text-subtle); }
    .deal { position: absolute; top: 0.8rem; left: 0.8rem; padding: 0.25rem 0.7rem; border-radius: 999px; background: var(--danger-fill); color: var(--on-accent); font-weight: 700; font-size: 0.8rem; }
    .thumbs { display: flex; gap: 0.5rem; overflow-x: auto; }
    .thumb { flex: none; padding: 0; border: 2px solid transparent; border-radius: 10px; overflow: hidden; background: none; cursor: pointer; }
    .thumb img { display: block; object-fit: cover; }
    .thumb--on { border-color: var(--primary); }
    .buy { display: grid; gap: 0.85rem; align-content: start; padding: 1.25rem; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
    .buy h1 { margin: 0; font-size: 1.5rem; line-height: 1.25; }
    .lede { margin: 0; color: var(--text-muted); }
    .price { margin: 0; display: flex; align-items: baseline; gap: 0.6rem; }
    .price strong { font-size: 1.75rem; }
    .price s { color: var(--text-muted); }
    .stock { margin: 0; font-weight: 600; font-size: 0.9rem; color: var(--success); }
    .stock--low { color: var(--warning); }
    .stock--out { color: var(--danger); }
    .options { margin: 0; padding: 0; border: 0; display: grid; gap: 0.45rem; }
    .options legend { padding: 0; margin-bottom: 0.45rem; font-weight: 600; font-size: 0.9rem; }
    .options__list { display: flex; flex-wrap: wrap; gap: 0.45rem; }
    .option { display: grid; gap: 0.05rem; padding: 0.45rem 0.85rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
              color: var(--text); font: inherit; font-weight: 600; text-align: start; cursor: pointer; }
    .option small { font-weight: 500; color: var(--text-muted); font-size: 0.75rem; }
    .option--on { border: 2px solid var(--primary); background: var(--primary-tint); padding: calc(0.45rem - 1px) calc(0.85rem - 1px); }
    .option:disabled { opacity: 0.45; text-decoration: line-through; cursor: not-allowed; }
    .qty { display: flex; align-items: center; gap: 0.75rem; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .actions .btn { justify-content: center; }
    .assurances { margin: 0; padding: 0.75rem 0 0; border-top: 1px solid var(--border); list-style: none; display: grid; gap: 0.3rem; font-size: 0.86rem; color: var(--text-muted); }
    .assurances li::before { content: '✓ '; color: var(--success); font-weight: 700; }
    .about { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 1rem; }
    .about section { padding: 1.25rem; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
    .about h2 { margin: 0 0 0.6rem; font-size: 1.1rem; }
    .description { margin: 0; white-space: pre-line; line-height: 1.6; }
    .specs { margin: 0; display: grid; }
    .specs div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
    .specs div:last-child { border-bottom: 0; }
    .specs dt { color: var(--text-muted); }
    .specs dd { margin: 0; font-weight: 600; text-align: right; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .gallery { max-width: 26rem; width: 100%; justify-self: center; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShopProductPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly ksh = ksh;
  readonly cart = inject(CartService);

  readonly id = input.required<string>();

  private readonly ecommerce = inject(EcommerceService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly product = signal<ProductDetail | null>(null);
  readonly selectedVariant = signal<ProductVariantDetail | null>(null);
  readonly quantity = signal(1);
  readonly needsVariant = signal(false);
  readonly chosenImage = signal<string | null>(null);

  /** Every picture once: the primary first, then the gallery, then the chosen option's own. */
  readonly gallery = computed(() => {
    const p = this.product();
    const urls = [
      p?.primaryImageUrl,
      ...(p?.images ?? []).map((image) => image.imageUrl),
      ...(this.selectedVariant()?.images ?? []).map((image) => image.imageUrl)
    ].filter((url): url is string => !!url);
    return [...new Set(urls)];
  });

  readonly activeImage = computed(() => this.chosenImage() ?? this.gallery()[0] ?? null);

  readonly maxQuantity = computed(() => {
    const p = this.product();
    const stock = this.selectedVariant()?.availableQuantity ?? p?.availableQuantity ?? 99;
    return Math.max(1, Math.min(stock, p?.maxOrderQuantity ?? stock));
  });

  readonly outOfStock = computed(() => {
    const p = this.product();
    if (!p) {
      return true;
    }
    const variant = this.selectedVariant();
    if (variant) {
      return !variant.isInStock;
    }
    if ((p.variants ?? []).length > 0) {
      return p.variants!.every((item) => !item.isInStock);
    }
    return p.stockStatus === 'OUT_OF_STOCK' || (p.availableQuantity ?? 0) <= 0;
  });

  readonly lowStock = computed(() => !this.outOfStock() && this.maxQuantity() <= 5
    && (this.selectedVariant()?.availableQuantity ?? this.product()?.availableQuantity ?? 99) <= 5);

  readonly price = computed(() => {
    const variant = this.selectedVariant();
    if (variant?.effectivePrice) {
      return ksh(variant.effectivePrice);
    }
    const p = this.product();
    if (p?.hasVariants && p.minVariantPrice && p.minVariantPrice !== p.maxVariantPrice) {
      return `From ${ksh(p.minVariantPrice)}`;
    }
    return ksh(p?.sellingPrice ?? p?.price);
  });

  readonly wasPrice = computed(() => {
    const p = this.product();
    const was = Number(p?.compareAtPrice ?? 0);
    return !this.selectedVariant() && was > Number(p?.sellingPrice ?? p?.price ?? 0) ? ksh(was) : null;
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const p = await firstValueFrom(this.ecommerce.getProduct(Number(this.id())));
      this.product.set(p);
      this.quantity.set(Math.max(1, p.minOrderQuantity ?? 1));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  pickVariant(variant: ProductVariantDetail): void {
    this.selectedVariant.set(variant);
    this.needsVariant.set(false);
    this.chosenImage.set(variant.images?.[0]?.imageUrl ?? null);
    this.quantity.set(Math.min(this.quantity(), this.maxQuantity()));
  }

  variantLabel(variant: ProductVariantDetail): string {
    const parts = [variant.color, variant.size, variant.material].filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(' · ') : (variant.sku || `Option ${variant.id}`);
  }

  addToCart(thenCheckout: boolean): void {
    const p = this.product();
    if (!p) {
      return;
    }
    const variant = this.selectedVariant();
    if ((p.variants ?? []).length > 0 && !variant) {
      this.needsVariant.set(true);
      return;
    }
    this.cart.addItem({
      productId: p.id,
      variantId: variant?.id ?? null,
      name: p.name,
      variantLabel: variant ? this.variantLabel(variant) : null,
      image: this.activeImage(),
      unitPrice: Number(variant?.effectivePrice ?? p.sellingPrice ?? p.price ?? 0),
      quantity: this.quantity(),
      maxQuantity: this.maxQuantity()
    });
    if (thenCheckout) {
      void this.router.navigateByUrl(RoutePaths.checkout);
    } else {
      this.notifications.push('success', `${p.name} added to your cart.`);
    }
  }
}
