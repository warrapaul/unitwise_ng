import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ProductPreview } from '../../ecommerce/models/ecommerce.models';
import { CartService } from '../cart.service';
import { ksh } from '../shop-format';
import { QtyStepperComponent } from './qty-stepper.component';

/**
 * One product on a shelf: picture first, then name and price, and the cart action
 * right on the card. Once in the cart the button becomes a stepper, so "how many"
 * is answered where it was asked.
 */
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, QtyStepperComponent],
  template: `
    @let p = product();
    <article class="card">
      <a class="media" [routerLink]="RoutePaths.shopProduct(p.id)" [attr.aria-label]="p.name">
        @if (p.primaryImageUrl) {
          <img class="fill" [src]="p.primaryImageUrl" [alt]="p.name" loading="lazy">
        } @else {
          <span class="media__none" aria-hidden="true">{{ p.name.charAt(0) }}</span>
        }
        @if (p.discountBadge) { <span class="tag tag--deal">{{ p.discountBadge }}</span> }
        @else if (p.isFeatured) { <span class="tag">Featured</span> }
        @if (outOfStock()) { <span class="sold-out">Sold out</span> }
      </a>
      <div class="body">
        <a class="name" [routerLink]="RoutePaths.shopProduct(p.id)">{{ p.name }}</a>
        <p class="price">
          <strong>{{ price() }}</strong>
          @if (wasPrice(); as was) { <s>{{ was }}</s> }
        </p>
        @if (lowStock()) { <span class="low">Only {{ p.availableQuantity }} left</span> }
        <div class="action">
          @if (p.hasVariants) {
            <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.shopProduct(p.id)">Choose options</a>
          } @else if (inCart(); as line) {
            <app-qty-stepper [value]="line.quantity" [min]="0" [max]="line.maxQuantity || 99" [label]="p.name"
                             (changed)="cart.updateQuantity(p.id, null, $event)" />
          } @else {
            <button type="button" class="btn btn-primary btn-sm" [disabled]="outOfStock()" (click)="add()">
              {{ outOfStock() ? 'Sold out' : 'Add to cart' }}
            </button>
          }
        </div>
      </div>
    </article>
  `,
  styles: [`
    .card { display: flex; flex-direction: column; height: 100%; border: 1px solid var(--border); border-radius: 16px;
            background: var(--surface); overflow: hidden; transition: box-shadow 0.15s, transform 0.15s; }
    .card:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); transform: translateY(-2px); }
    .media { position: relative; display: block; aspect-ratio: 1; background: var(--surface-2); }
    .media img.fill { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .media__none { position: absolute; inset: 0; display: grid; place-items: center; font-size: 2.5rem; font-weight: 700; color: var(--text-subtle); }
    .tag { position: absolute; top: 0.55rem; left: 0.55rem; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700;
           background: var(--surface); color: var(--text); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); }
    .tag--deal { background: var(--danger-fill); color: var(--on-accent); }
    .sold-out { position: absolute; inset: auto 0 0 0; padding: 0.3rem; text-align: center; font-size: 0.8rem; font-weight: 700;
                background: rgba(0, 0, 0, 0.55); color: #fff; }
    .body { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.75rem 0.85rem 0.85rem; flex: 1; }
    .name { color: var(--text); font-weight: 600; text-decoration: none; line-height: 1.3;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .name:hover { color: var(--primary-strong); }
    .price { margin: 0; display: flex; align-items: baseline; gap: 0.45rem; flex-wrap: wrap; }
    .price strong { font-size: 1.05rem; }
    .price s { color: var(--text-muted); font-size: 0.85rem; }
    .low { font-size: 0.78rem; color: var(--warning); font-weight: 600; }
    .action { margin-top: auto; padding-top: 0.4rem; }
    .action .btn { width: 100%; justify-content: center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
  readonly RoutePaths = RoutePaths;
  readonly cart = inject(CartService);
  readonly product = input.required<ProductPreview>();

  readonly outOfStock = computed(() => {
    const p = this.product();
    return p.stockStatus === 'OUT_OF_STOCK' || (!p.hasVariants && (p.availableQuantity ?? 0) <= 0);
  });

  readonly lowStock = computed(() => {
    const left = this.product().availableQuantity ?? 0;
    return !this.outOfStock() && !this.product().hasVariants && left > 0 && left <= 5;
  });

  readonly inCart = computed(() => this.cart.items().find((item) => item.productId === this.product().id && !item.variantId) ?? null);

  readonly price = computed(() => {
    const p = this.product();
    if (p.hasVariants && p.minVariantPrice) {
      return p.minVariantPrice === p.maxVariantPrice ? ksh(p.minVariantPrice) : `From ${ksh(p.minVariantPrice)}`;
    }
    return ksh(p.sellingPrice ?? p.price);
  });

  readonly wasPrice = computed(() => {
    const p = this.product();
    const was = Number(p.compareAtPrice ?? 0);
    return was > Number(p.sellingPrice ?? p.price ?? 0) ? ksh(was) : null;
  });

  add(): void {
    const p = this.product();
    this.cart.addItem({
      productId: p.id,
      variantId: null,
      name: p.name,
      image: p.primaryImageUrl ?? null,
      unitPrice: Number(p.sellingPrice ?? p.price ?? 0),
      quantity: 1,
      maxQuantity: p.availableQuantity ?? 99
    });
  }
}
