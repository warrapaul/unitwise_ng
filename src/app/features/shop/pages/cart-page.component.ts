import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CartValidationResult } from '../../ecommerce/models/ecommerce.models';
import { CartService } from '../cart.service';
import { CartItem } from '../models/cart.models';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, SectionCardComponent, ErrorCardComponent],
  template: `
    <section class="stack">
      @if (cart.isEmpty()) {
        <app-empty-state
          title="Your cart is empty"
          description="Browse the catalog to find something you'll love."
          actionLabel="Browse the shop"
          (action)="goShopping()"
        />
      } @else {
        <app-section-card title="Your cart">
          <ng-container actions>
            <div class="button-row">
              <a class="btn btn-secondary" [routerLink]="RoutePaths.shop">Keep shopping</a>
              <button type="button" class="btn btn-secondary" (click)="clear()">Empty cart</button>
            </div>
          </ng-container>

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Item</th><th>Unit price</th><th>Quantity</th><th>Line total</th><th class="actions-col"></th></tr>
              </thead>
              <tbody>
                @for (item of cart.items(); track trackLine(item)) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ item.name }}</strong>
                        @if (item.variantLabel) {
                          <span class="muted">{{ item.variantLabel }}</span>
                        }
                        @if (issueFor(item); as issue) {
                          <span class="error-text">{{ issue }}</span>
                        }
                      </div>
                    </td>
                    <td>{{ item.unitPrice }}</td>
                    <td>
                      <input
                        class="qty"
                        type="number"
                        min="1"
                        [max]="item.maxQuantity"
                        [value]="item.quantity"
                        (input)="onQuantity(item, $event)"
                      >
                    </td>
                    <td>{{ lineTotal(item) }}</td>
                    <td class="actions-col">
                      <button type="button" class="btn btn-danger btn-sm" (click)="remove(item)">Remove</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-section-card>

        <app-section-card title="Summary">
          <dl class="detail-grid">
            <div><dt>Items</dt><dd>{{ cart.itemCount() }}</dd></div>
            <div><dt>Subtotal</dt><dd><strong>{{ cart.subtotal() }}</strong></dd></div>
            @if (validation(); as result) {
              <div><dt>Server subtotal</dt><dd>{{ result.cartSubtotal ?? '-' }}</dd></div>
              <div><dt>Estimated total</dt><dd>{{ result.estimatedTotal ?? '-' }}</dd></div>
            }
          </dl>

          <p class="hint">Prices and stock are confirmed against the server before your order is placed.</p>

          @if (validation(); as result) {
            @if (!result.isValid) {
              <section class="alert alert-error" role="alert">
                <strong>Some items need attention</strong>
                @if ((result.errors ?? []).length > 0) {
                  <ul>
                    @for (message of result.errors ?? []; track message) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                }
              </section>
            } @else {
              <section class="alert alert-success" role="status">
                <strong>Cart is valid</strong>
                <p>{{ result.validItems ?? 0 }} of {{ result.totalItems ?? 0 }} items are ready to check out.</p>
              </section>
            }
          }

          @if (validationError(); as apiError) {
            <app-error-card title="Unable to check the cart" [message]="apiError.message" [details]="apiError.details" />
          }

          <div class="button-row">
            <button type="button" class="btn btn-secondary" [disabled]="validating()" (click)="validate()">
              {{ validating() ? 'Checking...' : 'Re-check prices and stock' }}
            </button>
            <a class="btn btn-primary" [routerLink]="RoutePaths.checkout">Checkout</a>
          </div>
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    .qty {
      max-width: 6rem;
      min-height: 2.4rem;
      padding-block: 0.45rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .alert ul {
      margin: 0.5rem 0 0;
      padding-left: 1.1rem;
      font-size: 0.88rem;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent {
  readonly RoutePaths = RoutePaths;
  private readonly confirm = inject(ConfirmService);
  readonly cart = inject(CartService);

  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);

  readonly validating = signal(false);
  readonly validation = signal<CartValidationResult | null>(null);
  readonly validationError = signal<ApiError | null>(null);

  trackLine(item: CartItem): string {
    return `${item.productId}:${item.variantId ?? ''}`;
  }

  lineTotal(item: CartItem): number {
    return item.unitPrice * item.quantity;
  }

  onQuantity(item: CartItem, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.cart.updateQuantity(item.productId, item.variantId, Number.isFinite(value) ? value : 1);
    this.validation.set(null);
  }

  remove(item: CartItem): void {
    this.cart.removeItem(item.productId, item.variantId);
    this.validation.set(null);
  }

  async clear(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Remove everything from your cart?',
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }

    this.cart.clear();
    this.validation.set(null);
  }

  goShopping(): void {
    void this.router.navigateByUrl(RoutePaths.shop);
  }

  /** Per-line problem reported by the last server validation, if any. */
  issueFor(item: CartItem): string | null {
    const result = this.validation();
    if (!result) {
      return null;
    }

    const line = (result.items ?? []).find((entry) =>
      entry.productId === item.productId && (entry.variantId ?? null) === (item.variantId ?? null)
    );

    if (!line || line.isValid) {
      return null;
    }

    return (line.errors ?? []).join(' ') || 'This item is no longer available.';
  }

  async validate(): Promise<void> {
    this.validating.set(true);
    this.validationError.set(null);

    try {
      this.validation.set(await firstValueFrom(this.ecommerce.validateCart({
        items: this.cart.items().map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          expectedUnitPrice: item.unitPrice
        }))
      })));
    } catch (error) {
      this.validationError.set(toApiError(error));
    } finally {
      this.validating.set(false);
    }
  }
}
