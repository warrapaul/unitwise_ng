import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CartValidationResult } from '../../ecommerce/models/ecommerce.models';
import { CartService } from '../cart.service';
import { CartItem } from '../models/cart.models';
import { ShopBarComponent } from '../components/shop-bar.component';
import { QtyStepperComponent } from '../components/qty-stepper.component';
import { ksh } from '../shop-format';

/**
 * The cart: each line with its picture, a stepper and its total; beside it the
 * summary and the way to checkout. Checkout first asks the server to re-price and
 * re-check stock, and stays here — pointing at the line — if anything changed.
 */
@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [RouterLink, ErrorCardComponent, ShopBarComponent, QtyStepperComponent],
  template: `
    <section class="shop">
      <app-shop-bar />

      @if (cart.isEmpty()) {
        <div class="empty">
          <strong>Your cart is empty</strong>
          <p class="muted">Find something you like and it will wait for you here.</p>
          <a class="btn btn-primary" [routerLink]="RoutePaths.shop">Start shopping</a>
        </div>
      } @else {
        <div class="layout">
          <div class="lines-card">
            <div class="lines-card__head">
              <h1>Cart <span class="muted">({{ cart.itemCount() }} {{ cart.itemCount() === 1 ? 'item' : 'items' }})</span></h1>
              <button type="button" class="link-button" (click)="clear()">Remove all</button>
            </div>
            <ul class="lines">
              @for (item of cart.items(); track trackLine(item)) {
                <li class="line" [class.line--issue]="issueFor(item)">
                  <a class="line__img" [routerLink]="RoutePaths.shopProduct(item.productId)">
                    @if (item.image) {
                      <img [src]="item.image" [alt]="item.name" width="88" height="88">
                    } @else {
                      <span aria-hidden="true">{{ item.name.charAt(0) }}</span>
                    }
                  </a>
                  <div class="line__info">
                    <a class="line__name" [routerLink]="RoutePaths.shopProduct(item.productId)">{{ item.name }}</a>
                    @if (item.variantLabel) { <span class="muted line__variant">{{ item.variantLabel }}</span> }
                    <span class="muted line__unit">{{ ksh(item.unitPrice) }} each</span>
                    @if (issueFor(item); as issue) { <span class="error-text line__issue" role="alert">{{ issue }}</span> }
                    <div class="line__controls">
                      <app-qty-stepper [value]="item.quantity" [max]="item.maxQuantity || 99" [label]="item.name"
                                       (changed)="setQuantity(item, $event)" />
                      <button type="button" class="link-button" (click)="remove(item)">Remove</button>
                    </div>
                  </div>
                  <strong class="line__total">{{ ksh(item.unitPrice * item.quantity) }}</strong>
                </li>
              }
            </ul>
          </div>

          <aside class="summary" aria-label="Order summary">
            <h2>Order summary</h2>
            <dl>
              <div><dt>Subtotal</dt><dd>{{ ksh(cart.subtotal()) }}</dd></div>
              <div><dt>Delivery</dt><dd class="muted">At checkout</dd></div>
            </dl>
            <div class="summary__total"><span>Total</span><strong>{{ ksh(cart.subtotal()) }}</strong></div>
            @if (problems().length > 0) {
              <p class="error-text" role="alert">Some items changed. Update them above, then try again.</p>
            }
            @if (validationError(); as apiError) {
              <app-error-card title="Couldn't check your cart" [message]="apiError.message" [details]="apiError.details" />
            }
            <button type="button" class="btn btn-primary btn-lg" [disabled]="checking()" (click)="checkout()">
              {{ checking() ? 'Checking prices and stock...' : 'Checkout' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.shop">Continue shopping</a>
            <p class="hint">Have a voucher? Add it at checkout.</p>
          </aside>
        </div>
      }
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    .empty { display: grid; justify-items: center; gap: 0.6rem; padding: 3.5rem 1rem; text-align: center; border: 1px dashed var(--border-strong); border-radius: 18px; }
    .empty p { margin: 0; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: 1.25rem; align-items: start; }
    .lines-card, .summary { padding: 1.15rem 1.25rem; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
    .lines-card__head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    .lines-card__head h1 { margin: 0; font-size: 1.35rem; }
    .lines-card__head .muted { font-size: 1rem; font-weight: 500; }
    .lines { margin: 0.5rem 0 0; padding: 0; list-style: none; }
    .line { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) auto; gap: 0.9rem; padding: 1rem 0; border-bottom: 1px solid var(--border); align-items: start; }
    .line:last-child { border-bottom: 0; padding-bottom: 0.25rem; }
    .line--issue .line__img { outline: 2px solid var(--danger); }
    .line__img { width: 5.5rem; height: 5.5rem; border-radius: 12px; overflow: hidden; background: var(--surface-2); display: grid; place-items: center;
                 font-size: 1.6rem; font-weight: 700; color: var(--text-subtle); text-decoration: none; }
    .line__img img { width: 100%; height: 100%; object-fit: cover; }
    .line__info { display: grid; gap: 0.15rem; min-width: 0; }
    .line__name { font-weight: 600; color: var(--text); text-decoration: none; }
    .line__name:hover { color: var(--primary-strong); }
    .line__variant, .line__unit { font-size: 0.85rem; }
    .line__issue { font-size: 0.85rem; }
    .line__controls { display: flex; align-items: center; gap: 1rem; margin-top: 0.45rem; }
    .line__total { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .link-button { padding: 0; border: 0; background: none; font: inherit; font-size: 0.86rem; font-weight: 600; color: var(--text-muted); cursor: pointer; text-decoration: underline; }
    .link-button:hover { color: var(--danger); }
    .summary { position: sticky; top: 1rem; display: grid; gap: 0.75rem; }
    .summary h2 { margin: 0; font-size: 1.1rem; }
    .summary dl { margin: 0; display: grid; gap: 0.4rem; }
    .summary dl div { display: flex; justify-content: space-between; }
    .summary dt { color: var(--text-muted); }
    .summary dd { margin: 0; font-variant-numeric: tabular-nums; }
    .summary__total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 0.75rem; border-top: 1px solid var(--border); }
    .summary__total strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
    .summary .btn { justify-content: center; }
    .summary .hint { margin: 0; text-align: center; }
    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .summary { position: static; }
    }
    @media (max-width: 520px) {
      .line { grid-template-columns: 4.25rem minmax(0, 1fr); }
      .line__img { width: 4.25rem; height: 4.25rem; }
      .line__total { grid-column: 2; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly ksh = ksh;
  readonly cart = inject(CartService);

  private readonly confirm = inject(ConfirmService);
  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);

  readonly checking = signal(false);
  readonly validation = signal<CartValidationResult | null>(null);
  readonly validationError = signal<ApiError | null>(null);

  readonly problems = computed(() => (this.validation()?.items ?? []).filter((line) => !line.isValid));

  trackLine(item: CartItem): string {
    return `${item.productId}:${item.variantId ?? ''}`;
  }

  setQuantity(item: CartItem, quantity: number): void {
    this.cart.updateQuantity(item.productId, item.variantId, quantity);
    this.validation.set(null);
  }

  remove(item: CartItem): void {
    this.cart.removeItem(item.productId, item.variantId);
    this.validation.set(null);
  }

  async clear(): Promise<void> {
    if (!await this.confirm.ask({ title: 'Remove everything from your cart?', confirmLabel: 'Remove all', destructive: true })) {
      return;
    }
    this.cart.clear();
    this.validation.set(null);
  }

  /** The problem the server found with this line on the last check, if any. */
  issueFor(item: CartItem): string | null {
    const line = (this.validation()?.items ?? []).find((entry) =>
      entry.productId === item.productId && (entry.variantId ?? null) === (item.variantId ?? null));
    return !line || line.isValid ? null : (line.errors ?? []).join(' ') || 'No longer available.';
  }

  /** Re-price and re-check stock, then go to checkout only if nothing changed. */
  async checkout(): Promise<void> {
    this.checking.set(true);
    this.validationError.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.validateCart({
        items: this.cart.items().map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          expectedUnitPrice: item.unitPrice
        }))
      }));
      this.validation.set(result);
      if (result.isValid !== false) {
        await this.router.navigateByUrl(RoutePaths.checkout);
      }
    } catch (error) {
      this.validationError.set(toApiError(error));
    } finally {
      this.checking.set(false);
    }
  }
}
