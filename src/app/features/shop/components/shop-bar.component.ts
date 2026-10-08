import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { CartService } from '../cart.service';

/**
 * The storefront's own header, on every shop page: search, where you are, and the
 * cart with its count. A shopper should never have to find the cart in a sidebar.
 */
@Component({
  selector: 'app-shop-bar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="bar">
      <!-- A standard field, so it looks like every other input in the app; the icon sits inside it. -->
      <form class="search field" role="search" (submit)="$event.preventDefault(); search(query.value)">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input #query type="search" [value]="initialQuery()" placeholder="Search products" aria-label="Search products">
      </form>
      <nav class="links" aria-label="Shop">
        <a [routerLink]="RoutePaths.shop" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Shop</a>
        <a [routerLink]="RoutePaths.myOrders" routerLinkActive="on">My orders</a>
        <a [routerLink]="RoutePaths.myVouchers" routerLinkActive="on">Vouchers</a>
        <a class="cart" [routerLink]="RoutePaths.cart" routerLinkActive="on" [attr.aria-label]="'Cart, ' + cart.itemCount() + ' items'">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" />
          </svg>
          <span>Cart</span>
          @if (cart.itemCount() > 0) { <span class="badge" aria-hidden="true">{{ cart.itemCount() }}</span> }
        </a>
      </nav>
    </header>
  `,
  styles: [`
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; padding: 0.7rem 0.9rem;
           border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
    .search { position: relative; flex: 1 1 18rem; }
    .search svg { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); width: 1.1rem; height: 1.1rem;
                  fill: none; stroke: var(--text-muted); stroke-width: 2; pointer-events: none; }
    .search input { max-width: none; padding-left: 2.6rem; }
    .links { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
    .links a { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.8rem; border-radius: 999px;
               color: var(--text); font-weight: 600; font-size: 0.9rem; text-decoration: none; }
    .links a:hover { background: var(--surface-2); }
    .links a.on { background: var(--primary-tint); color: var(--primary-strong); }
    .cart { position: relative; border: 1px solid var(--border); }
    .cart svg { width: 1.2rem; height: 1.2rem; fill: none; stroke: currentColor; stroke-width: 1.8; }
    .badge { min-width: 1.3rem; height: 1.3rem; padding: 0 0.35rem; display: inline-grid; place-items: center; border-radius: 999px;
             background: var(--primary); color: var(--on-accent); font-size: 0.75rem; font-weight: 700; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShopBarComponent {
  readonly RoutePaths = RoutePaths;
  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  readonly initialQuery = input('');

  search(query: string): void {
    const q = query.trim();
    void this.router.navigate([RoutePaths.shop], { queryParams: { q: q || null }, queryParamsHandling: 'merge' });
  }
}
