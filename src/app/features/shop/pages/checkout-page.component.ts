import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CommerceService } from '../../ecommerce/commerce.service';
import { CartValidationResult, StorePreview } from '../../ecommerce/models/ecommerce.models';
import { CartVoucherValidation, DeliveryAddressPreview, normalizeMpesaPhone } from '../../ecommerce/models/commerce.models';
import { CartService } from '../cart.service';
import { ShopBarComponent } from '../components/shop-bar.component';
import { ksh } from '../shop-format';

type Delivery = 'HOME_DELIVERY' | 'PICK_AT_STORE';
type Payment = 'MPESA' | 'PAY_ON_DELIVERY' | 'PARTIAL_PAYMENT';
/** A saved address by id; directions and the rider's note live on the address itself. */
type Destination = number;

/**
 * Checkout on one page: where it goes, how it is paid, any voucher — with the order
 * summary beside it the whole time and one button to place it.
 *
 * Addresses are the shopper's own "My addresses" from their account; a new one is
 * added on that same page and brings them straight back here with it chosen. The
 * server re-prices the cart (vouchers included) for the summary and again when the
 * order is placed, so the total shown is the total charged.
 */
@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadingStateComponent, ErrorCardComponent, ShopBarComponent],
  template: `
    <section class="shop">
      <app-shop-bar />

      @if (loadingBuy()) {
        <app-loading-state label="Getting the item..." />
      } @else if (isEmpty()) {
        <div class="empty">
          <strong>Nothing to check out</strong>
          <p class="muted">Your cart is empty.</p>
          <a class="btn btn-primary" [routerLink]="RoutePaths.shop">Start shopping</a>
        </div>
      } @else {
        <div class="head">
          <h1>Checkout</h1>
          <a [routerLink]="RoutePaths.cart" class="muted">← Back to cart</a>
        </div>
        @if (buyItems()) {
          <p class="buy-now">Buying just this item. <a [routerLink]="RoutePaths.checkout">Check out your cart instead</a>; it is kept as it was.</p>
        }

        <div class="layout">
          <div class="steps">
            <!-- ─── 1. Delivery ─── -->
            <section class="step" aria-labelledby="step-delivery">
              <h2 id="step-delivery"><span class="step__n">1</span> Delivery</h2>
              <!-- How: a two-way switch. Where (below) is a list, so the two never look alike. -->
              <div class="segmented" role="radiogroup" aria-label="How to get your order">
                <button type="button" role="radio" [class.on]="delivery() === 'HOME_DELIVERY'"
                        [attr.aria-checked]="delivery() === 'HOME_DELIVERY'" (click)="delivery.set('HOME_DELIVERY')">Deliver to me</button>
                <button type="button" role="radio" [class.on]="delivery() === 'PICK_AT_STORE'"
                        [attr.aria-checked]="delivery() === 'PICK_AT_STORE'" (click)="delivery.set('PICK_AT_STORE')">Pick up at a store</button>
              </div>

              @if (delivery() === 'HOME_DELIVERY') {
                <div class="where">
                  <div class="sub-head">
                    <h3>Deliver to</h3>
                    @if (addresses().length > 0) { <a [routerLink]="RoutePaths.deliveryAddresses">Manage</a> }
                  </div>
                  @if (loadingAddresses()) {
                    <app-loading-state [compact]="true" label="Loading your addresses..." />
                  } @else if (addresses().length === 0) {
                    <!-- Nothing saved: one clear way forward, and back here afterwards. -->
                    <div class="no-address">
                      <p>Add the address we should deliver to. It is saved for your next order too.</p>
                      <a class="btn btn-primary" [routerLink]="RoutePaths.deliveryAddressCreate" [queryParams]="{ returnTo: RoutePaths.checkout }">Add a delivery address</a>
                    </div>
                  } @else {
                    <ul class="address-list" role="radiogroup" aria-label="Delivery address">
                      @for (address of addresses(); track address.id) {
                        <li>
                          <button type="button" role="radio" class="address" [class.address--on]="destination() === address.id"
                                  [attr.aria-checked]="destination() === address.id" (click)="destination.set(address.id)">
                            <span class="choice__dot" aria-hidden="true"></span>
                            <span class="choice__body">
                              <strong>{{ address.addressNickname || 'Address' }}
                                @if (address.isDefault) { <span class="tag">Default</span> }
                                @if (address.customerConfirmed === false) { <span class="tag tag--warn">Added by the shop</span> }
                              </strong>
                              <span class="muted">{{ address.fullAddress || 'No details' }}</span>
                            </span>
                          </button>
                        </li>
                      }
                    </ul>
                    <a class="add-link" [routerLink]="RoutePaths.deliveryAddressCreate" [queryParams]="{ returnTo: RoutePaths.checkout }">＋ Add a new address</a>
                  }
                  @if (problem() === 'destination') {
                    <p class="error-text" role="alert">{{ addresses().length ? 'Choose the address to deliver to.' : 'Add an address to deliver to.' }}</p>
                  }
                </div>
              } @else {
                @if (loadingStores()) {
                  <app-loading-state [compact]="true" label="Loading stores..." />
                } @else if (stores().length === 0) {
                  <p class="muted">No store is taking pickups right now — choose delivery instead.</p>
                } @else {
                  <ul class="address-list where" role="radiogroup" aria-label="Pickup store">
                    @for (store of stores(); track store.id) {
                      <li>
                        <button type="button" role="radio" class="address" [class.address--on]="storeId() === store.id"
                                [attr.aria-checked]="storeId() === store.id" (click)="storeId.set(store.id)">
                          <span class="choice__dot" aria-hidden="true"></span>
                          <span class="choice__body">
                            <strong>{{ store.name }}</strong>
                            <span class="muted">{{ store.town || store.county || '' }}</span>
                          </span>
                        </button>
                      </li>
                    }
                  </ul>
                  @if (problem() === 'store') { <p class="error-text" role="alert">Choose the store you'll collect from.</p> }
                }
                <label class="field">
                  <span>Who is collecting? <span class="muted">(if not you)</span></span>
                  <input [formControl]="collector">
                </label>
              }
            </section>

            <!-- ─── 2. Payment ─── -->
            <section class="step" aria-labelledby="step-payment">
              <h2 id="step-payment"><span class="step__n">2</span> Payment</h2>
              <div class="choices" [class.choices--two]="!canPayInParts()" [class.choices--three]="canPayInParts()" role="radiogroup" aria-label="How to pay">
                <button type="button" role="radio" class="choice" [class.choice--on]="payment() === 'PAY_ON_DELIVERY'"
                        [attr.aria-checked]="payment() === 'PAY_ON_DELIVERY'" (click)="payment.set('PAY_ON_DELIVERY')">
                  <strong>Pay on {{ delivery() === 'PICK_AT_STORE' ? 'pickup' : 'delivery' }}</strong><span class="muted">Cash or M-Pesa when it arrives</span>
                </button>
                <button type="button" role="radio" class="choice" [class.choice--on]="payment() === 'MPESA'"
                        [attr.aria-checked]="payment() === 'MPESA'" (click)="payment.set('MPESA')">
                  <strong>M-Pesa</strong><span class="muted">Pay now — we send a prompt to your phone</span>
                </button>
                <!-- Offered only when a policy covers this customer and everything in the cart. -->
                @if (canPayInParts()) {
                  <button type="button" role="radio" class="choice" [class.choice--on]="payment() === 'PARTIAL_PAYMENT'"
                          [attr.aria-checked]="payment() === 'PARTIAL_PAYMENT'" (click)="choosePartial()">
                    <strong>Pay in parts</strong>
                    <span class="muted">{{ ksh(minDown()) }} now, the rest within {{ partialDays() }} days</span>
                  </button>
                }
              </div>
              @if (payment() === 'PARTIAL_PAYMENT') {
                <label class="field">
                  <span>Pay now (at least {{ ksh(minDown()) }})</span>
                  <input type="number" [formControl]="downPayment" [min]="minDown()" [max]="total()">
                  @if (problem() === 'down') {
                    <small class="error-text" role="alert">Pay between {{ ksh(minDown()) }} and {{ ksh(total()) }} now.</small>
                  } @else {
                    <small class="hint">Your order is prepared once this is paid. Pay the rest from your order page.</small>
                  }
                </label>
              }
              @if (payment() === 'MPESA' || payment() === 'PARTIAL_PAYMENT') {
                <label class="field">
                  <span>M-Pesa number</span>
                  <input [formControl]="mpesaPhone" inputmode="tel" placeholder="0712 345 678">
                  @if (problem() === 'phone') {
                    <small class="error-text" role="alert">Enter the M-Pesa number to send the prompt to.</small>
                  } @else {
                    <small class="hint">You'll be asked for your M-Pesa PIN on this phone.</small>
                  }
                </label>
              }
              <!-- Optional, so out of the way until wanted; open when one is already applied. -->
              <details class="voucher-box" [open]="vouchers().length > 0">
                <summary>Have a voucher?</summary>
              <form class="voucher field" (submit)="$event.preventDefault(); applyVoucher()">
                <input [formControl]="voucherInput" placeholder="Enter a code" aria-label="Voucher code" class="mono">
                <button type="submit" class="btn btn-secondary" [disabled]="applying() || !voucherInput.value.trim()">
                  {{ applying() ? 'Applying...' : 'Apply' }}
                </button>
              </form>
              @if (voucherError()) { <p class="error-text" role="alert">{{ voucherError() }}</p> }
              @if (vouchers().length > 0) {
                <ul class="applied">
                  @for (voucher of vouchers(); track voucher.code) {
                    <li>
                      <span class="mono">{{ voucher.code }}</span>
                      <span class="muted">{{ voucher.freeDelivery ? 'Free delivery' : '−' + ksh(voucher.discountAmount) }}</span>
                      <button type="button" class="link-button" (click)="removeVoucher(voucher.code)" [attr.aria-label]="'Remove ' + voucher.code">Remove</button>
                    </li>
                  }
                </ul>
              }
              <a class="muted small" [routerLink]="RoutePaths.myVouchers">See my vouchers</a>
              </details>
            </section>

          </div>

          <!-- ─── Summary ─── -->
          <aside class="summary" aria-label="Order summary">
            <h2>Your order</h2>
            <ul class="items">
              @for (item of items(); track item.productId + ':' + (item.variantId ?? '')) {
                <li>
                  <span class="items__img">
                    @if (imageOf(item); as src) {
                      <img [src]="src" alt="" width="48" height="48" (error)="brokenImages.add(item.productId); imagesTick.set(imagesTick() + 1)">
                    } @else {
                      <span class="items__ph" aria-hidden="true">{{ item.name.charAt(0) }}</span>
                    }
                    <span class="items__qty">{{ item.quantity }}</span>
                  </span>
                  <span class="items__name">{{ item.name }}@if (item.variantLabel) { <small class="muted">{{ item.variantLabel }}</small> }</span>
                  <span class="items__price">{{ ksh(item.unitPrice * item.quantity) }}</span>
                </li>
              }
            </ul>
            <dl>
              <div><dt>Subtotal</dt><dd>{{ ksh(subtotal()) }}</dd></div>
              @if (discount() > 0) { <div class="saving"><dt>Voucher</dt><dd>−{{ ksh(discount()) }}</dd></div> }
              <div><dt>Delivery</dt><dd>{{ deliveryLabel() }}</dd></div>
            </dl>
            <div class="total"><span>Total</span><strong>{{ ksh(total()) }}</strong></div>

            @if (pricing()?.isValid === false) {
              <div class="alert alert-error" role="alert">
                <strong>Some items changed</strong>
                <ul>@for (message of pricing()?.errors ?? []; track message) { <li>{{ message }}</li> }</ul>
                <a [routerLink]="RoutePaths.cart">Update your cart</a>
              </div>
            }
            @if (placeError(); as apiError) {
              <app-error-card [title]="apiError.errorCode === 'OFFLINE' ? 'You are offline' : apiError.errorCode.startsWith('SERVER_') ? 'Unitwise is unavailable' : 'Your order was not placed'"
                              [message]="apiError.message" [details]="apiError.details" />
            }
            <button type="button" class="btn btn-primary btn-lg" [disabled]="placing() || pricing()?.isValid === false" (click)="placeOrder()">
              {{ placing() ? 'Placing your order...' : 'Place order · ' + ksh(total()) }}
            </button>
            <p class="hint">{{ payment() === 'PAY_ON_DELIVERY' ? 'Pay when your order reaches you.' : 'Your phone will ask for your M-Pesa PIN once the order is placed.' }}</p>
          </aside>
        </div>
      }
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    .empty { display: grid; justify-items: center; gap: 0.6rem; padding: 3.5rem 1rem; text-align: center; border: 1px dashed var(--border-strong); border-radius: 18px; }
    .empty p { margin: 0; }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    .head h1 { margin: 0; font-size: 1.45rem; }
    .head a { font-size: 0.9rem; text-decoration: none; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 1.25rem; align-items: start; }
    .steps { display: grid; gap: 1rem; }
    .step, .summary { display: grid; gap: 0.85rem; padding: 1.15rem 1.25rem; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
    .step h2 { margin: 0; display: flex; align-items: center; gap: 0.6rem; font-size: 1.1rem; }
    .step__n { display: inline-grid; place-items: center; width: 1.7rem; height: 1.7rem; border-radius: 50%; background: var(--primary); color: var(--on-accent); font-size: 0.85rem; }
    .step__opt { font-size: 0.8rem; font-weight: 500; }
    .sub-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    .sub-head h3 { margin: 0; font-size: 0.95rem; }
    .sub-head a { font-size: 0.85rem; color: var(--primary-strong); font-weight: 600; }
    .choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 0.6rem; }
    .choices--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .choices--three { grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); }
    .choice { display: grid; gap: 0.15rem; padding: 0.8rem 0.95rem; border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
              color: var(--text); font: inherit; text-align: start; cursor: pointer; text-decoration: none; }
    .choice:hover { border-color: var(--border-strong); }
    .choice .muted { font-size: 0.84rem; }
    .choice--on { border: 2px solid var(--primary); background: var(--primary-tint); padding: calc(0.8rem - 1px) calc(0.95rem - 1px); }
    .choice--address { display: flex; align-items: flex-start; gap: 0.65rem; }
    .choice__dot { flex: none; margin-top: 0.2rem; width: 1rem; height: 1rem; border-radius: 50%; border: 2px solid var(--border-strong); }
    .choice--on .choice__dot, .address--on .choice__dot { border-color: var(--primary); background: radial-gradient(var(--primary) 0 42%, transparent 48%); }
    /* How: a compact switch. */
    .segmented { display: inline-flex; padding: 0.2rem; border-radius: 999px; background: var(--surface-2); gap: 0.2rem; }
    .segmented button { padding: 0.45rem 1rem; border: 0; border-radius: 999px; background: none; color: var(--text-muted);
                        font: inherit; font-weight: 600; cursor: pointer; }
    .segmented button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgb(0 0 0 / 12%); }
    /* Where: a bordered list, plainly not another switch. */
    .where { display: grid; gap: 0.5rem; }
    .address-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-radius: 10px; overflow: hidden;
                    background: var(--surface); border: 1px solid var(--border); }
    .address-list li + li { border-top: 1px solid var(--border); }
    .address { display: flex; align-items: flex-start; gap: 0.65rem; width: 100%; padding: 0.65rem 0.8rem; border: 0;
               background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
    .address:hover { background: var(--surface-2); }
    .address--on { background: var(--surface-2); }
    .add-link { justify-self: start; font-weight: 600; color: var(--primary-strong); }
    .no-address { display: grid; gap: 0.6rem; justify-items: start; }
    .no-address p { margin: 0; }
    .buy-now { margin: 0; padding: 0.6rem 0.85rem; border-radius: 10px; background: var(--primary-tint); }
    .choice__body { display: grid; gap: 0.12rem; min-width: 0; }
    .choice--add { display: flex; align-items: center; justify-content: center; gap: 0.4rem; border-style: dashed; color: var(--primary-strong); font-weight: 600; }
    .tag { margin-left: 0.35rem; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--surface-2); font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
    .tag--warn { background: var(--warning-tint); color: var(--warning); }
    .voucher { display: flex; align-items: center; gap: 0.5rem; max-width: 28rem; }
    .items__ph { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 8px; background: var(--surface-2);
                 color: var(--text-muted); font-weight: 700; }
    .voucher-box { padding-top: 0.5rem; border-top: 1px solid var(--border); }
    .voucher-box summary { cursor: pointer; font-weight: 600; color: var(--primary-strong); margin-bottom: 0.5rem; }
    .voucher input { flex: 1; min-width: 0; text-transform: uppercase; }
    .applied { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.35rem; }
    .applied li { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0.7rem; border-radius: 10px; background: var(--success-tint); }
    .applied .link-button { margin-left: auto; }
    .small { font-size: 0.85rem; }
    .link-button { padding: 0; border: 0; background: none; font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); cursor: pointer; text-decoration: underline; }
    .summary { position: sticky; top: 1rem; }
    .summary h2 { margin: 0; font-size: 1.1rem; }
    .items { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.6rem; max-height: 16rem; overflow-y: auto; }
    .items li { display: grid; grid-template-columns: 3rem minmax(0, 1fr) auto; gap: 0.6rem; align-items: center; font-size: 0.9rem; }
    .items__img { position: relative; width: 3rem; height: 3rem; border-radius: 10px; background: var(--surface-2); }
    .items__img img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; }
    .items__qty { position: absolute; top: -0.4rem; right: -0.4rem; min-width: 1.25rem; height: 1.25rem; padding: 0 0.3rem; display: grid; place-items: center;
                  border-radius: 999px; background: var(--text); color: var(--surface); font-size: 0.7rem; font-weight: 700; }
    .items__name { display: grid; min-width: 0; }
    .items__name small { font-size: 0.78rem; }
    .items__price { font-variant-numeric: tabular-nums; }
    .summary dl { margin: 0; display: grid; gap: 0.35rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
    .summary dl div { display: flex; justify-content: space-between; }
    .summary dt { color: var(--text-muted); }
    .summary dd { margin: 0; font-variant-numeric: tabular-nums; }
    .saving dd { color: var(--success); font-weight: 600; }
    .total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 0.75rem; border-top: 1px solid var(--border); }
    .total strong { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
    .summary .btn { justify-content: center; }
    .summary .hint { margin: 0; text-align: center; }
    .alert ul { margin: 0.35rem 0; padding-left: 1.1rem; font-size: 0.88rem; }
    @media (max-width: 960px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .summary { position: static; }
    }
    @media (max-width: 520px) { .choices--two { grid-template-columns: minmax(0, 1fr); } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CheckoutPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly ksh = ksh;
  readonly cart = inject(CartService);

  /** `?address=` — set when the shopper comes back from adding an address. */
  readonly address = input<string | undefined>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly commerce = inject(CommerceService);
  private readonly session = inject(AuthSessionService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly delivery = signal<Delivery>('HOME_DELIVERY');
  /** Paying when it arrives is what most customers choose, so it starts selected. */
  readonly payment = signal<Payment>('PAY_ON_DELIVERY');
  readonly destination = signal<Destination | null>(null);
  readonly storeId = signal<number | null>(null);

  readonly collector = this.fb.control('', [Validators.maxLength(120)]);
  readonly mpesaPhone = this.fb.control('');
  readonly voucherInput = this.fb.control('');

  readonly loadingAddresses = signal(true);
  readonly addresses = signal<DeliveryAddressPreview[]>([]);
  readonly loadingStores = signal(true);
  readonly stores = signal<StorePreview[]>([]);

  readonly vouchers = signal<CartVoucherValidation[]>([]);
  readonly applying = signal(false);
  readonly voucherError = signal<string | null>(null);

  readonly pricing = signal<CartValidationResult | null>(null);
  readonly placing = signal(false);
  readonly placeError = signal<ApiError | null>(null);
  readonly problem = signal<'destination' | 'store' | 'phone' | 'down' | null>(null);

  /** `?buy=<productId>`: check out that one item, leaving the cart as it is. */
  readonly buy = input<string | undefined>();
  readonly buyItems = signal<import('../models/cart.models').CartItem[] | null>(null);
  readonly loadingBuy = signal(false);
  /** What is being bought: the one "Buy now" item, or the cart. */
  readonly items = computed(() => this.buyItems() ?? this.cart.items());
  readonly isEmpty = computed(() => this.items().length === 0);
  readonly itemsSubtotal = computed(() => this.items().reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  readonly subtotal = computed(() => Number(this.pricing()?.cartSubtotal ?? this.itemsSubtotal()));
  readonly discount = computed(() => Number(this.pricing()?.totalVoucherDiscount
    ?? this.vouchers().reduce((sum, voucher) => sum + Number(voucher.discountAmount ?? 0), 0)));
  readonly total = computed(() => Number(this.pricing()?.estimatedTotal ?? Math.max(0, this.subtotal() - this.discount())));
  readonly deliveryLabel = computed(() => this.delivery() === 'PICK_AT_STORE' ? 'Free pickup'
    : this.pricing()?.freeDelivery || this.vouchers().some((voucher) => voucher.freeDelivery) ? 'Free' : 'Confirmed by the shop');

  ngOnInit(): void {
    void this.loadAddresses();
    void this.loadStores();
    void this.startCheckout();
  }

  /** Prices and partial-payment eligibility depend on what is bought, so the "Buy now" item comes first. */
  private async startCheckout(): Promise<void> {
    const productId = Number(this.buy());
    if (productId) {
      this.loadingBuy.set(true);
      try {
        const product = await firstValueFrom(this.ecommerce.getProduct(productId));
        if (product.hasVariants) {
          // An option has to be chosen first; that happens on the product page.
          await this.router.navigateByUrl(RoutePaths.shopProduct(productId));
          return;
        }
        this.buyItems.set([{
          productId: product.id,
          variantId: null,
          name: product.name,
          image: product.primaryImageUrl ?? null,
          unitPrice: Number(product.sellingPrice ?? product.price ?? 0),
          quantity: 1,
          maxQuantity: product.availableQuantity ?? 99
        }]);
      } catch {
        this.notifications.push('error', 'That product is not available.');
      } finally {
        this.loadingBuy.set(false);
      }
    }
    void this.price();
    void this.checkPartial();
    void this.refreshImages();
  }

  /** Image links saved with cart items can expire; fresh ones are fetched for what is on screen. */
  private readonly freshImages = signal<Map<number, string>>(new Map());
  readonly brokenImages = new Set<number>();
  readonly imagesTick = signal(0);

  imageOf(item: { productId: number; image?: string | null }): string | null {
    this.imagesTick();
    if (this.brokenImages.has(item.productId)) return null;
    return this.freshImages().get(item.productId) ?? item.image ?? null;
  }

  private async refreshImages(): Promise<void> {
    const ids = [...new Set(this.items().map((item) => item.productId))].slice(0, 20);
    const pairs = await Promise.all(ids.map(async (id) => {
      try {
        const product = await firstValueFrom(this.ecommerce.getProduct(id));
        return [id, product.primaryImageUrl ?? null] as const;
      } catch {
        return [id, null] as const;
      }
    }));
    this.brokenImages.clear();
    this.freshImages.set(new Map(pairs.filter((pair): pair is readonly [number, string] => !!pair[1])));
  }

  // ── Paying in parts ─────────────────────────────────────────────────

  readonly partial = signal<import('../../ecommerce/models/ecommerce.models').PartialEligibility | null>(null);
  readonly downPayment = new FormControl<number | null>(null);
  /** Every item must be covered: an order is paid in parts as a whole or not at all. */
  readonly canPayInParts = computed(() => {
    const p = this.partial();
    return !!p?.eligible && !!p.bestPolicy && (p.ineligibleProductIds?.length ?? 0) === 0;
  });
  readonly minDown = computed(() => Math.ceil(this.total() * Number(this.partial()?.bestPolicy?.minDownPaymentPercent ?? 0) / 100));
  readonly partialDays = computed(() => this.partial()?.bestPolicy?.balanceDueDays ?? 30);

  private async checkPartial(): Promise<void> {
    const customerId = this.session.currentUserId();
    const productIds = [...new Set(this.items().map((item) => item.productId))];
    if (!customerId || productIds.length === 0) {
      return;
    }
    try {
      this.partial.set(await firstValueFrom(this.ecommerce.checkPartialEligibility(customerId, productIds)));
    } catch {
      this.partial.set(null); // Not offered; the other two ways still work.
    }
  }

  choosePartial(): void {
    this.payment.set('PARTIAL_PAYMENT');
    if (!this.downPayment.value) {
      this.downPayment.setValue(this.minDown());
    }
  }

  private async loadAddresses(): Promise<void> {
    try {
      const list = await firstValueFrom(this.commerce.getMyDeliveryAddresses());
      this.addresses.set(list);
      const asked = Number(this.address());
      const chosen = list.find((item) => item.id === asked) ?? list.find((item) => item.isDefault) ?? list[0];
      this.destination.set(chosen ? chosen.id : null);
      if (chosen?.contactPhone && !this.mpesaPhone.value) {
        this.mpesaPhone.setValue(chosen.contactPhone);
      }
    } catch {
      this.addresses.set([]);
      this.destination.set(null);
    } finally {
      this.loadingAddresses.set(false);
    }
  }

  private async loadStores(): Promise<void> {
    try {
      const result = await firstValueFrom(this.ecommerce.getStores({ isActive: true, page: 0, size: 100 }));
      this.stores.set(result.items);
      if (result.items.length === 1) {
        this.storeId.set(result.items[0].id);
      }
    } catch {
      this.stores.set([]);
    } finally {
      this.loadingStores.set(false);
    }
  }

  /** The server's price for this cart and these vouchers — what the summary shows. */
  private async price(): Promise<void> {
    // Nothing to price: the server refuses an empty cart, and there is nothing to show.
    if (this.items().length === 0) {
      this.pricing.set(null);
      return;
    }
    try {
      this.pricing.set(await firstValueFrom(this.ecommerce.validateCart({
        customerId: this.session.currentUserId() ?? null,
        voucherCodes: this.codes(),
        items: this.items().map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          expectedUnitPrice: item.unitPrice
        }))
      })));
    } catch {
      // Advisory only: placing the order re-prices on the server either way.
      this.pricing.set(null);
    }
  }

  async applyVoucher(): Promise<void> {
    const code = this.voucherInput.value.trim().toUpperCase();
    if (!code || this.vouchers().some((voucher) => voucher.code === code)) {
      this.voucherInput.setValue('');
      return;
    }
    this.applying.set(true);
    this.voucherError.set(null);
    try {
      const [result] = await firstValueFrom(this.commerce.validateVouchersForCart([...this.codes() ?? [], code], this.itemsSubtotal()))
        .then((results) => results.filter((item) => item.code?.toUpperCase() === code));
      if (!result?.isValid) {
        this.voucherError.set(result?.error || `${code} can't be used on this order.`);
        return;
      }
      this.vouchers.update((list) => [...list, { ...result, code }]);
      this.voucherInput.setValue('');
      await this.price();
    } catch (error) {
      this.voucherError.set(extractErrorMessage(error));
    } finally {
      this.applying.set(false);
    }
  }

  async removeVoucher(code: string): Promise<void> {
    this.vouchers.update((list) => list.filter((voucher) => voucher.code !== code));
    await this.price();
  }

  async placeOrder(): Promise<void> {
    const customerId = this.session.currentUserId();
    if (!customerId) {
      this.placeError.set({ status: 401, errorCode: 'UNAUTHENTICATED', message: 'Your session has expired. Sign in again to place this order.', details: [] });
      return;
    }
    const home = this.delivery() === 'HOME_DELIVERY';
    const destination = this.destination();
    if (home && destination === null) {
      this.problem.set('destination');
      return;
    }
    if (!home && !this.storeId()) {
      this.problem.set('store');
      return;
    }
    if (this.payment() !== 'PAY_ON_DELIVERY' && !this.mpesaPhone.value.trim()) {
      this.problem.set('phone');
      return;
    }
    const down = Number(this.downPayment.value);
    if (this.payment() === 'PARTIAL_PAYMENT' && (!down || down < this.minDown() || down > this.total())) {
      this.problem.set('down');
      return;
    }
    this.problem.set(null);
    this.placing.set(true);
    this.placeError.set(null);

    try {
      const order = await firstValueFrom(this.ecommerce.createOrder({
        customerId,
        cartItems: this.items().map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })),
        deliveryMethod: this.delivery(),
        deliveryAddressId: home ? destination : null,
        deliveryLocationDescription: null,
        storeId: home ? null : this.storeId(),
        // The address's own delivery note is what the rider reads.
        deliveryInstructions: null,
        pickupContactName: home ? null : this.collector.value.trim() || null,
        paymentMethod: this.payment(),
        paymentPhoneNumber: this.payment() !== 'PAY_ON_DELIVERY' ? normalizeMpesaPhone(this.mpesaPhone.value) : null,
        voucherCodes: this.codes(),
        notes: null
      }));
      // "Buy now" bought one item; the cart is still the customer's for later.
      if (!this.buyItems()) {
        this.cart.clear();
      }

      // The order stands even if the prompt fails; the order page offers it again, and pay-by-hand.
      let prompt = 'none';
      if (this.payment() !== 'PAY_ON_DELIVERY') {
        try {
          // Paying in parts prompts for the chosen down payment; otherwise for the whole order.
          const amount = this.payment() === 'PARTIAL_PAYMENT' ? down : null;
          prompt = (await firstValueFrom(this.commerce.initiateOrderMpesa(order.id, amount))).outcome === 'STK_PUSH_SENT' ? 'sent' : 'manual';
        } catch {
          prompt = 'manual';
        }
      }
      this.notifications.push('success', `Order ${order.orderNumber} placed.`);
      await this.router.navigate([RoutePaths.myOrderDetail(order.id)], { queryParams: { placed: prompt } });
    } catch (error) {
      this.placeError.set(toApiError(error));
    } finally {
      this.placing.set(false);
    }
  }

  private codes(): string[] | null {
    const codes = this.vouchers().map((voucher) => voucher.code);
    return codes.length > 0 ? codes : null;
  }
}
