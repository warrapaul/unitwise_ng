import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CommerceService } from '../../ecommerce/commerce.service';
import { CartValidationResult, StorePreview } from '../../ecommerce/models/ecommerce.models';
import { DeliveryAddressPreview, normalizeMpesaPhone } from '../../ecommerce/models/commerce.models';
import { CartService } from '../cart.service';

type CheckoutStep = 'delivery' | 'payment' | 'review';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (cart.isEmpty()) {
        <app-empty-state
          title="Your cart is empty"
          description="Add something to your cart before checking out."
          actionLabel="Browse the shop"
          (action)="goShopping()"
        />
      } @else {
        <app-section-card title="Checkout">
          <ng-container actions>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.cart">Back to cart</a>
          </ng-container>

          <ol class="steps">
            <li [class.steps__item--active]="step() === 'delivery'">1. Delivery</li>
            <li [class.steps__item--active]="step() === 'payment'">2. Payment</li>
            <li [class.steps__item--active]="step() === 'review'">3. Review</li>
          </ol>
        </app-section-card>

        @if (step() === 'delivery') {
          <app-section-card title="How would you like to receive your order?">
            <form [formGroup]="deliveryForm" appFormFeedback (ngSubmit)="goToPayment()">
              <label class="field">
                <span>Method</span>
                <select formControlName="deliveryMethod">
                  <option value="HOME_DELIVERY">Home delivery</option>
                  <option value="PICK_AT_STORE">Pick up at a store</option>
                </select>
              </label>

              @if (deliveryForm.controls.deliveryMethod.value === 'HOME_DELIVERY') {
                @if (loadingAddresses()) {
                  <app-loading-state label="Loading your addresses..." />
                } @else if (addresses().length === 0) {
                  <p class="hint">You have no saved delivery addresses yet.</p>
                  <a class="btn btn-secondary" [routerLink]="RoutePaths.deliveryAddressCreate">Add an address</a>
                } @else {
                  <label class="field">
                    <span>Deliver to</span>
                    <select formControlName="deliveryAddressId">
                      <option [ngValue]="null">Select an address</option>
                      @for (address of addresses(); track address.id) {
                        <option [ngValue]="address.id">
                          {{ address.addressNickname || address.fullAddress || ('Address #' + address.id) }}
                        </option>
                      }
                    </select>
                    @if (deliveryForm.controls.deliveryAddressId.invalid && deliveryForm.controls.deliveryAddressId.touched) {
                      <small class="error-text">Choose a delivery address.</small>
                    }
                  </label>
                }

                <label class="field field--wide">
                  <span>Delivery instructions</span>
                  <textarea formControlName="deliveryInstructions" rows="2"></textarea>
                </label>
              } @else {
                @if (loadingStores()) {
                  <app-loading-state label="Loading stores..." />
                } @else {
                  <label class="field">
                    <span>Pick up from</span>
                    <select formControlName="storeId">
                      <option [ngValue]="null">Select a store</option>
                      @for (store of stores(); track store.id) {
                        <option [ngValue]="store.id">{{ store.name }} — {{ store.town || store.city }}</option>
                      }
                    </select>
                    @if (deliveryForm.controls.storeId.invalid && deliveryForm.controls.storeId.touched) {
                      <small class="error-text">Choose a pickup store.</small>
                    }
                  </label>
                }

                <label class="field">
                  <span>Who is collecting?</span>
                  <input formControlName="pickupContactName">
                </label>
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary">Continue to payment</button>
              </div>
            </form>
          </app-section-card>
        }

        @if (step() === 'payment') {
          <app-section-card title="How would you like to pay?">
            <form [formGroup]="paymentForm" appFormFeedback (ngSubmit)="goToReview()">
              <label class="field">
                <span>Method</span>
                <select formControlName="paymentMethod">
                  <option value="MPESA">M-Pesa</option>
                  <option value="PAY_ON_DELIVERY">Pay on delivery</option>
                </select>
              </label>

              @if (paymentForm.controls.paymentMethod.value === 'MPESA') {
                <label class="field">
                  <span>M-Pesa phone number</span>
                  <input formControlName="paymentPhoneNumber" placeholder="0712345678 or 254712345678">
                  <small class="hint">Normalised to 254XXXXXXXXX when the order is placed.</small>
                  @if (paymentForm.controls.paymentPhoneNumber.invalid && paymentForm.controls.paymentPhoneNumber.touched) {
                    <small class="error-text">Enter the phone number to charge.</small>
                  }
                </label>
              }

              <label class="field">
                <span>Voucher codes</span>
                <input formControlName="voucherCodes" placeholder="WELCOME10, FREESHIP">
                <small class="hint">Separate each code with a comma.</small>
              </label>

              <label class="field field--wide">
                <span>Order notes</span>
                <textarea formControlName="notes" rows="2"></textarea>
              </label>

              <div class="button-row">
                <button type="button" class="btn btn-secondary" (click)="step.set('delivery')">Back</button>
                <button type="submit" class="btn btn-primary">Review order</button>
              </div>
            </form>
          </app-section-card>
        }

        @if (step() === 'review') {
          <app-section-card title="Review your order">
            @if (validating()) {
              <app-loading-state label="Confirming prices and stock..." />
            } @else if (validation(); as result) {
              @if (!result.isValid) {
                <section class="alert alert-error" role="alert">
                  <strong>Some items are no longer available</strong>
                  @if ((result.errors ?? []).length > 0) {
                    <ul>
                      @for (message of result.errors ?? []; track message) {
                        <li>{{ message }}</li>
                      }
                    </ul>
                  }
                  <p>Update your cart before placing this order.</p>
                </section>
              }

              <dl class="detail-grid">
                <div><dt>Items</dt><dd>{{ result.totalItems ?? cart.itemCount() }}</dd></div>
                <div><dt>Subtotal</dt><dd>{{ result.cartSubtotal ?? cart.subtotal() }}</dd></div>
                <div><dt>Voucher discount</dt><dd>{{ result.totalVoucherDiscount ?? 0 }}</dd></div>
                <div><dt>Free delivery</dt><dd>{{ result.freeDelivery ? 'Yes' : 'No' }}</dd></div>
                <div><dt>Estimated total</dt><dd><strong>{{ result.estimatedTotal ?? '-' }}</strong></dd></div>
              </dl>
            }

            <div class="table-scroll">
              <table class="table">
                <thead><tr><th>Item</th><th>Qty</th><th>Line total</th></tr></thead>
                <tbody>
                  @for (item of cart.items(); track item.productId + ':' + (item.variantId ?? '')) {
                    <tr>
                      <td>
                        {{ item.name }}
                        @if (item.variantLabel) {
                          <span class="muted">— {{ item.variantLabel }}</span>
                        }
                      </td>
                      <td>{{ item.quantity }}</td>
                      <td>{{ item.unitPrice * item.quantity }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <dl class="detail-grid">
              <div><dt>Delivery</dt><dd>{{ deliverySummary() }}</dd></div>
              <div><dt>Payment</dt><dd>{{ paymentSummary() }}</dd></div>
            </dl>

            @if (placeError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 0 ? 'Cannot reach the server' : 'Unable to place your order'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="button" class="btn btn-secondary" (click)="step.set('payment')">Back</button>
              <button type="button" class="btn btn-primary" [disabled]="placing() || !canPlace()" (click)="placeOrder()">
                {{ placing() ? 'Placing order...' : 'Place order' }}
              </button>
            </div>
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
      justify-items: start;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .steps {
      display: flex;
      gap: 1.15rem;
      list-style: none;
      margin: 0;
      padding: 0;
      flex-wrap: wrap;
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    .steps__item--active {
      color: var(--primary-strong);
      font-weight: 600;
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
export class CheckoutPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly cart = inject(CartService);

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly commerce = inject(CommerceService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly step = signal<CheckoutStep>('delivery');

  readonly loadingAddresses = signal(false);
  readonly addresses = signal<DeliveryAddressPreview[]>([]);
  readonly loadingStores = signal(false);
  readonly stores = signal<StorePreview[]>([]);

  // Each step owns its own state so a retry on one never writes into another (skills §9.4).
  readonly validating = signal(false);
  readonly validation = signal<CartValidationResult | null>(null);
  readonly placing = signal(false);
  readonly placeError = signal<ApiError | null>(null);

  readonly canPlace = computed(() => this.validation()?.isValid !== false);

  readonly deliveryForm = this.formBuilder.group({
    deliveryMethod: 'HOME_DELIVERY',
    deliveryAddressId: [null as number | null],
    storeId: [null as number | null],
    deliveryInstructions: '',
    pickupContactName: ''
  });

  readonly paymentForm = this.formBuilder.group({
    paymentMethod: 'MPESA',
    paymentPhoneNumber: ['', [Validators.required]],
    voucherCodes: '',
    notes: ''
  });

  ngOnInit(): void {
    void this.loadAddresses();
    void this.loadStores();

    this.deliveryForm.controls.deliveryMethod.valueChanges.subscribe((method) => {
      this.deliveryForm.controls.deliveryAddressId.setValidators(method === 'HOME_DELIVERY' ? [Validators.required] : []);
      this.deliveryForm.controls.storeId.setValidators(method === 'PICK_AT_STORE' ? [Validators.required] : []);
      this.deliveryForm.controls.deliveryAddressId.updateValueAndValidity({ emitEvent: false });
      this.deliveryForm.controls.storeId.updateValueAndValidity({ emitEvent: false });
    });
    this.deliveryForm.controls.deliveryAddressId.setValidators([Validators.required]);
    this.deliveryForm.controls.deliveryAddressId.updateValueAndValidity({ emitEvent: false });

    this.paymentForm.controls.paymentMethod.valueChanges.subscribe((method) => {
      this.paymentForm.controls.paymentPhoneNumber.setValidators(method === 'MPESA' ? [Validators.required] : []);
      this.paymentForm.controls.paymentPhoneNumber.updateValueAndValidity({ emitEvent: false });
    });
  }

  async loadAddresses(): Promise<void> {
    this.loadingAddresses.set(true);

    try {
      this.addresses.set(await firstValueFrom(this.commerce.getMyDeliveryAddresses()));
      const preferred = this.addresses().find((address) => address.isDefault) ?? this.addresses()[0];
      if (preferred) {
        this.deliveryForm.patchValue({ deliveryAddressId: preferred.id });
      }
    } catch {
      // The empty-address branch in the template guides the user to add one.
      this.addresses.set([]);
    } finally {
      this.loadingAddresses.set(false);
    }
  }

  async loadStores(): Promise<void> {
    this.loadingStores.set(true);

    try {
      const result = await firstValueFrom(this.ecommerce.getStores({ isActive: true, page: 0, size: 100 }));
      this.stores.set(result.items);
    } catch {
      this.stores.set([]);
    } finally {
      this.loadingStores.set(false);
    }
  }

  goToPayment(): void {
    if (this.deliveryForm.invalid) {
      this.deliveryForm.markAllAsTouched();
      return;
    }

    this.step.set('payment');
  }

  async goToReview(): Promise<void> {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    this.step.set('review');
    await this.validate();
  }

  async validate(): Promise<void> {
    this.validating.set(true);
    this.placeError.set(null);

    try {
      this.validation.set(await firstValueFrom(this.ecommerce.validateCart({
        customerId: this.authSession.currentUserId() ?? null,
        voucherCodes: this.voucherCodes(),
        items: this.cart.items().map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          expectedUnitPrice: item.unitPrice
        }))
      })));
    } catch (error) {
      // Validation is advisory here; the order POST is the authoritative check.
      this.validation.set(null);
      this.placeError.set(toApiError(error));
    } finally {
      this.validating.set(false);
    }
  }

  async placeOrder(): Promise<void> {
    const customerId = this.authSession.currentUserId();
    if (!customerId) {
      this.placeError.set({
        status: 401,
        errorCode: 'UNAUTHENTICATED',
        message: 'Your session has expired. Sign in again to place this order.',
        details: []
      });
      return;
    }

    this.placing.set(true);
    this.placeError.set(null);

    const delivery = this.deliveryForm.getRawValue();
    const payment = this.paymentForm.getRawValue();

    try {
      const order = await firstValueFrom(this.ecommerce.createOrder({
        customerId,
        cartItems: this.cart.items().map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity
        })),
        deliveryMethod: delivery.deliveryMethod as 'HOME_DELIVERY' | 'PICK_AT_STORE',
        deliveryAddressId: delivery.deliveryMethod === 'HOME_DELIVERY' ? delivery.deliveryAddressId : null,
        storeId: delivery.deliveryMethod === 'PICK_AT_STORE' ? delivery.storeId : null,
        deliveryInstructions: delivery.deliveryInstructions || null,
        pickupContactName: delivery.pickupContactName || null,
        paymentMethod: payment.paymentMethod as 'MPESA' | 'PAY_ON_DELIVERY',
        paymentPhoneNumber: payment.paymentMethod === 'MPESA'
          ? normalizeMpesaPhone(payment.paymentPhoneNumber)
          : null,
        voucherCodes: this.voucherCodes(),
        notes: payment.notes || null
      }));

      this.cart.clear();
      await this.router.navigateByUrl(RoutePaths.myOrderDetail(order.id));
    } catch (error) {
      this.placeError.set(toApiError(error));
    } finally {
      this.placing.set(false);
    }
  }

  deliverySummary(): string {
    const value = this.deliveryForm.getRawValue();
    if (value.deliveryMethod === 'PICK_AT_STORE') {
      const store = this.stores().find((item) => item.id === value.storeId);
      return store ? `Pick up at ${store.name}` : 'Pick up at store';
    }

    const address = this.addresses().find((item) => item.id === value.deliveryAddressId);
    return address
      ? `Deliver to ${address.addressNickname || address.fullAddress || ('address #' + address.id)}`
      : 'Home delivery';
  }

  paymentSummary(): string {
    const value = this.paymentForm.getRawValue();
    return value.paymentMethod === 'MPESA'
      ? `M-Pesa — ${normalizeMpesaPhone(value.paymentPhoneNumber)}`
      : 'Pay on delivery';
  }

  goShopping(): void {
    void this.router.navigateByUrl(RoutePaths.shop);
  }

  private voucherCodes(): string[] | null {
    const codes = this.paymentForm.getRawValue().voucherCodes
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);

    return codes.length > 0 ? codes : null;
  }
}
