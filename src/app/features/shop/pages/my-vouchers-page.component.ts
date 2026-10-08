import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../../ecommerce/commerce.service';
import { Voucher } from '../../ecommerce/models/commerce.models';
import { CartService } from '../cart.service';
import { ShopBarComponent } from '../components/shop-bar.component';
import { ksh } from '../shop-format';

const PAGE_SIZE = 20;

/** The shopper's vouchers as coupons: what each is worth, its code to copy, and when it runs out. */
@Component({
  selector: 'app-my-vouchers-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, ShopBarComponent],
  template: `
    <section class="shop">
      <app-shop-bar />
      <div class="head">
        <h1>My vouchers</h1>
        <span class="muted">Add a code at checkout to use it.</span>
      </div>

      @if (loading() && vouchers().length === 0) {
        <app-loading-state label="Loading your vouchers..." />
      } @else if (error() && vouchers().length === 0) {
        <app-error-state [message]="error()!" (retry)="load(true)" />
      } @else if (vouchers().length === 0) {
        <div class="empty">
          <strong>No vouchers right now</strong>
          <p class="muted">When the shop gives you one, it shows up here.</p>
          <a class="btn btn-primary" [routerLink]="RoutePaths.shop">Go to the shop</a>
        </div>
      } @else {
        <ul class="coupons">
          @for (voucher of vouchers(); track voucher.id) {
            <li class="coupon" [class.coupon--off]="!usable(voucher)">
              <div class="coupon__value">
                <strong>{{ value(voucher) }}</strong>
                <span>off</span>
              </div>
              <div class="coupon__body">
                <strong>{{ voucher.name }}</strong>
                @if (voucher.description) { <span class="muted">{{ voucher.description }}</span> }
                <span class="muted small">
                  @if (+(voucher.minOrderAmount ?? 0) > 0) { On orders over {{ ksh(voucher.minOrderAmount) }} · }
                  {{ voucher.validUntil ? 'Until ' + date(voucher.validUntil) : 'No expiry' }}
                </span>
                <div class="coupon__code">
                  <span class="mono">{{ voucher.code }}</span>
                  @if (usable(voucher)) {
                    <button type="button" class="link-button" (click)="copy(voucher.code)">Copy code</button>
                  } @else {
                    <span class="muted small">{{ unusableReason(voucher) }}</span>
                  }
                </div>
              </div>
            </li>
          }
        </ul>
        @if (hasMore()) {
          <div class="more"><button type="button" class="btn btn-secondary" [disabled]="loading()" (click)="load(false)">Show more</button></div>
        }
        @if (!cart.isEmpty()) {
          <div class="more"><a class="btn btn-primary" [routerLink]="RoutePaths.checkout">Go to checkout</a></div>
        }
      }
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 1rem; }
    .head h1 { margin: 0; font-size: 1.45rem; }
    .empty { display: grid; justify-items: center; gap: 0.6rem; padding: 3.5rem 1rem; text-align: center; border: 1px dashed var(--border-strong); border-radius: 18px; }
    .empty p { margin: 0; }
    .coupons { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 23rem), 1fr)); gap: 0.85rem; }
    .coupon { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); border: 1px solid var(--border); border-radius: 16px; background: var(--surface); overflow: hidden; }
    .coupon--off { opacity: 0.55; }
    .coupon__value { display: grid; place-content: center; justify-items: center; padding: 0.75rem; background: var(--primary); color: var(--on-accent);
                     border-right: 2px dashed var(--surface); text-align: center; }
    .coupon__value strong { font-size: 1.35rem; line-height: 1.1; }
    .coupon__value span { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .coupon__body { display: grid; gap: 0.2rem; padding: 0.85rem 1rem; min-width: 0; }
    .small { font-size: 0.82rem; }
    .coupon__code { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 0.4rem; padding: 0.35rem 0.6rem;
                    border: 1px dashed var(--border-strong); border-radius: 8px; background: var(--surface-2); }
    .coupon__code .mono { font-weight: 700; letter-spacing: 0.05em; }
    .link-button { padding: 0; border: 0; background: none; font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--primary-strong); cursor: pointer; }
    .more { display: flex; justify-content: center; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyVouchersPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly ksh = ksh;
  readonly cart = inject(CartService);

  private readonly commerce = inject(CommerceService);
  private readonly notifications = inject(NotificationService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly vouchers = signal<Voucher[]>([]);
  readonly hasMore = signal(false);
  private page = 0;

  ngOnInit(): void {
    void this.load(true);
  }

  value(voucher: Voucher): string {
    return voucher.discountType === 'PERCENTAGE' ? `${Number(voucher.discountValue)}%` : ksh(voucher.discountValue);
  }

  /** Expiry is the end date passing — the backend has no EXPIRED status to read. */
  usable(voucher: Voucher): boolean {
    return (!voucher.status || voucher.status === 'ACTIVE') && !this.expired(voucher);
  }

  unusableReason(voucher: Voucher): string {
    return this.expired(voucher) ? 'Expired' : voucher.status === 'EXHAUSTED' ? 'Used up' : 'Not active';
  }

  private expired(voucher: Voucher): boolean {
    return !!voucher.validUntil && new Date(voucher.validUntil).getTime() < Date.now();
  }

  date(value: string): string {
    return displayDate(value);
  }

  async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.notifications.push('success', `${code} copied — paste it at checkout.`);
    } catch {
      this.notifications.push('error', 'Could not copy — select the code instead.');
    }
  }

  async load(reset: boolean): Promise<void> {
    if (reset) {
      this.page = 0;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.commerce.getMyVouchers({ page: this.page, size: PAGE_SIZE }));
      this.vouchers.set(reset ? result.items : [...this.vouchers(), ...result.items]);
      this.hasMore.set(!!result.pagination && !result.pagination.isLast);
      this.page += 1;
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
