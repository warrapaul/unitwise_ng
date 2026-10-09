import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
type Payment = 'MPESA' | 'PAY_ON_DELIVERY';
/** A saved address by id, or "somewhere else" described in words. */
type Destination = number | 'DESCRIBE';

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

      @if (cart.isEmpty()) {
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

        <div class="layout">
          <div class="steps">
            <!-- ─── 1. Delivery ─── -->
            <section class="step" aria-labelledby="step-delivery">
              <h2 id="step-delivery"><span class="step__n">1</span> Delivery</h2>
              <div class="choices choices--two" role="radiogroup" aria-label="How to get your order">
                <button type="button" role="radio" class="choice" [class.choice--on]="delivery() === 'HOME_DELIVERY'"
                        [attr.aria-checked]="delivery() === 'HOME_DELIVERY'" (click)="delivery.set('HOME_DELIVERY')">
                  <strong>Deliver to me</strong><span class="muted">A rider brings it to your address</span>
                </button>
                <button type="button" role="radio" class="choice" [class.choice--on]="delivery() === 'PICK_AT_STORE'"
                        [attr.aria-checked]="delivery() === 'PICK_AT_STORE'" (click)="delivery.set('PICK_AT_STORE')">
                  <strong>Pick up at a store</strong><span class="muted">Collect it when it's ready</span>
                </button>
              </div>

              @if (delivery() === 'HOME_DELIVERY') {
                <div class="sub-head">
                  <h3>Deliver to</h3>
                  <a [routerLink]="RoutePaths.deliveryAddresses">Manage my addresses</a>
                </div>
                @if (loadingAddresses()) {
                  <app-loading-state [compact]="true" label="Loading your addresses..." />
                } @else {
                  <div class="choices" role="radiogroup" aria-label="Delivery address">
                    @for (address of addresses(); track address.id) {
                      <button type="button" role="radio" class="choice choice--address" [class.choice--on]="destination() === address.id"
                              [attr.aria-checked]="destination() === address.id" (click)="destination.set(address.id)">
                        <span class="choice__dot" aria-hidden="true"></span>
                        <span class="choice__body">
                          <strong>{{ address.addressNickname || 'Address' }}
                            @if (address.isDefault) { <span class="tag">Default</span> }
                            @if (address.customerConfirmed === false) { <span class="tag tag--warn">Added by the shop</span> }
                          </strong>
                          <span class="muted">{{ address.fullAddress || 'No details' }}</span>
                          @if (address.contactPhone) { <span class="muted mono">{{ address.contactPhone }}</span> }
                        </span>
                      </button>
                    }
                    <button type="button" role="radio" class="choice choice--address" [class.choice--on]="destination() === 'DESCRIBE'"
                            [attr.aria-checked]="destination() === 'DESCRIBE'" (click)="destination.set('DESCRIBE')">
                      <span class="choice__dot" aria-hidden="true"></span>
                      <span class="choice__body">
                        <strong>Somewhere else</strong>
                        <span class="muted">Describe the place; the rider will call you for directions</span>
                      </span>
                    </button>
                    <a class="choice choice--add" [routerLink]="RoutePaths.deliveryAddressCreate" [queryParams]="{ returnTo: RoutePaths.checkout }">
                      <span aria-hidden="true">＋</span> Add a new address
                    </a>
                  </div>
                  @if (destination() === 'DESCRIBE') {
                    <label class="field field--wide">
                      <span>Where should we deliver?</span>
                      <textarea [formControl]="describe" rows="2" placeholder="e.g. Mwihoko, Discovery estate, blue gate opposite the church"></textarea>
                    </label>
                  }
                  @if (problem() === 'destination') {
                    <p class="error-text" role="alert">Choose an address, or describe where to deliver.</p>
                  }
                }
                <label class="field field--wide">
                  <span>Note for the rider <span class="muted">(optional)</span></span>
                  <input [formControl]="instructions" placeholder="e.g. Call when you reach the gate">
                </label>
              } @else {
                @if (loadingStores()) {
                  <app-loading-state [compact]="true" label="Loading stores..." />
                } @else if (stores().length === 0) {
                  <p class="muted">No store is taking pickups right now — choose delivery instead.</p>
                } @else {
                  <div class="choices" role="radiogroup" aria-label="Pickup store">
                    @for (store of stores(); track store.id) {
                      <button type="button" role="radio" class="choice choice--address" [class.choice--on]="storeId() === store.id"
                              [attr.aria-checked]="storeId() === store.id" (click)="storeId.set(store.id)">
                        <span class="choice__dot" aria-hidden="true"></span>
                        <span class="choice__body">
                          <strong>{{ store.name }}</strong>
                          <span class="muted">{{ store.town || store.county || '' }}</span>
                        </span>
                      </button>
                    }
                  </div>
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
              <div class="choices choices--two" role="radiogroup" aria-label="How to pay">
                <button type="button" role="radio" class="choice" [class.choice--on]="payment() === 'MPESA'"
                        [attr.aria-checked]="payment() === 'MPESA'" (click)="payment.set('MPESA')">
                  <strong>M-Pesa</strong><span class="muted">Pay now — we send a prompt to your phone</span>
                </button>
                <button type="button" role="radio" class="choice" [class.choice--on]="payment() === 'PAY_ON_DELIVERY'"
                        [attr.aria-checked]="payment() === 'PAY_ON_DELIVERY'" (click)="payment.set('PAY_ON_DELIVERY')">
                  <strong>Pay on {{ delivery() === 'PICK_AT_STORE' ? 'pickup' : 'delivery' }}</strong><span class="muted">Cash or M-Pesa when it arrives</span>
                </button>
              </div>
              @if (payment() === 'MPESA') {
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
            </section>

            <!-- ─── 3. Voucher ─── -->
            <section class="step" aria-labelledby="step-voucher">
              <h2 id="step-voucher"><span class="step__n">3</span> Voucher <span class="muted step__opt">optional</span></h2>
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
            </section>
          </div>

          <!-- ─── Summary ─── -->
          <aside class="summary" aria-label="Order summary">
            <h2>Your order</h2>
            <ul class="items">
              @for (item of cart.items(); track item.productId + ':' + (item.variantId ?? '')) {
                <li>
                  <span class="items__img">
                    @if (item.image) { <img [src]="item.image" alt="" width="48" height="48"> }
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
            <p class="hint">{{ payment() === 'MPESA' ? 'Your phone will ask for your M-Pesa PIN once the order is placed.' : 'Pay when your order reaches you.' }}</p>
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
    .choice { display: grid; gap: 0.15rem; padding: 0.8rem 0.95rem; border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
              color: var(--text); font: inherit; text-align: start; cursor: pointer; text-decoration: none; }
    .choice:hover { border-color: var(--border-strong); }
    .choice .muted { font-size: 0.84rem; }
    .choice--on { border: 2px solid var(--primary); background: var(--primary-tint); padding: calc(0.8rem - 1px) calc(0.95rem - 1px); }
    .choice--address { display: flex; align-items: flex-start; gap: 0.65rem; }
    .choice__dot { flex: none; margin-top: 0.2rem; width: 1rem; height: 1rem; border-radius: 50%; border: 2px solid var(--border-strong); }
    .choice--on .choice__dot { border-color: var(--primary); background: radial-gradient(var(--primary) 0 42%, transparent 48%); }
    .choice__body { display: grid; gap: 0.12rem; min-width: 0; }
    .choice--add { display: flex; align-items: center; justify-content: center; gap: 0.4rem; border-style: dashed; color: var(--primary-strong); font-weight: 600; }
    .tag { margin-left: 0.35rem; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--surface-2); font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
    .tag--warn { background: var(--warning-tint); color: var(--warning); }
    .voucher { display: flex; align-items: center; gap: 0.5rem; max-width: 28rem; }
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
  readonly payment = signal<Payment>('MPESA');
  readonly destination = signal<Destination | null>(null);
  readonly storeId = signal<number | null>(null);

  readonly describe = this.fb.control('', [Validators.maxLength(1000)]);
  readonly instructions = this.fb.control('', [Validators.maxLength(500)]);
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
  readonly problem = signal<'destination' | 'store' | 'phone' | null>(null);

  readonly subtotal = computed(() => Number(this.pricing()?.cartSubtotal ?? this.cart.subtotal()));
  readonly discount = computed(() => Number(this.pricing()?.totalVoucherDiscount
    ?? this.vouchers().reduce((sum, voucher) => sum + Number(voucher.discountAmount ?? 0), 0)));
  readonly total = computed(() => Number(this.pricing()?.estimatedTotal ?? Math.max(0, this.subtotal() - this.discount())));
  readonly deliveryLabel = computed(() => this.delivery() === 'PICK_AT_STORE' ? 'Free pickup'
    : this.pricing()?.freeDelivery || this.vouchers().some((voucher) => voucher.freeDelivery) ? 'Free' : 'Confirmed by the shop');

  ngOnInit(): void {
    void this.loadAddresses();
    void this.loadStores();
    void this.price();
  }

  private async loadAddresses(): Promise<void> {
    try {
      const list = await firstValueFrom(this.commerce.getMyDeliveryAddresses());
      this.addresses.set(list);
      const asked = Number(this.address());
      const chosen = list.find((item) => item.id === asked) ?? list.find((item) => item.isDefault) ?? list[0];
      this.destination.set(chosen ? chosen.id : 'DESCRIBE');
      if (chosen?.contactPhone && !this.mpesaPhone.value) {
        this.mpesaPhone.setValue(chosen.contactPhone);
      }
    } catch {
      this.addresses.set([]);
      this.destination.set('DESCRIBE');
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
    try {
      this.pricing.set(await firstValueFrom(this.ecommerce.validateCart({
        customerId: this.session.currentUserId() ?? null,
        voucherCodes: this.codes(),
        items: this.cart.items().map((item) => ({
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
      const [result] = await firstValueFrom(this.commerce.validateVouchersForCart([...this.codes() ?? [], code], this.cart.subtotal()))
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
    if (home && (destination === null || (destination === 'DESCRIBE' && !this.describe.value.trim()))) {
      this.problem.set('destination');
      return;
    }
    if (!home && !this.storeId()) {
      this.problem.set('store');
      return;
    }
    if (this.payment() === 'MPESA' && !this.mpesaPhone.value.trim()) {
      this.problem.set('phone');
      return;
    }
    this.problem.set(null);
    this.placing.set(true);
    this.placeError.set(null);

    try {
      const order = await firstValueFrom(this.ecommerce.createOrder({
        customerId,
        cartItems: this.cart.items().map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })),
        deliveryMethod: this.delivery(),
        deliveryAddressId: home && typeof destination === 'number' ? destination : null,
        deliveryLocationDescription: home && destination === 'DESCRIBE' ? this.describe.value.trim() : null,
        storeId: home ? null : this.storeId(),
        deliveryInstructions: home ? this.instructions.value.trim() || null : null,
        pickupContactName: home ? null : this.collector.value.trim() || null,
        paymentMethod: this.payment(),
        paymentPhoneNumber: this.payment() === 'MPESA' ? normalizeMpesaPhone(this.mpesaPhone.value) : null,
        voucherCodes: this.codes(),
        notes: null
      }));
      this.cart.clear();

      // The order stands even if the prompt fails; the order page offers it again, and pay-by-hand.
      let prompt = 'none';
      if (this.payment() === 'MPESA') {
        try {
          prompt = (await firstValueFrom(this.commerce.initiateOrderMpesa(order.id))).outcome === 'STK_PUSH_SENT' ? 'sent' : 'manual';
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
