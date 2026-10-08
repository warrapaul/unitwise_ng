import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom, switchMap, catchError, of } from 'rxjs';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RoutePaths } from '../../../core/routes/route-paths';
import { normalizeMpesaPhone } from '../models/commerce.models';
import { EcomCustomerDetail, OrderDeliveryMethod, OrderPaymentMethod, ProductPreview, StorePreview } from '../models/ecommerce.models';
import { EcommerceService } from '../ecommerce.service';

interface Line {
  product: ProductPreview;
  quantity: number;
}

/**
 * An order taken over the phone, for a customer staff already have on file.
 *
 * Built for the call: search a product, tap it in, set the quantity, say where
 * it goes in the customer's own words. No saved address is needed — the rider
 * calls on the way and can record the real address at the door. The order is
 * the customer's, recorded as a phone order.
 */
@Component({
  selector: 'app-phone-order-page',
  standalone: true,
  imports: [ReactiveFormsModule, BackLinkComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent,
    ErrorCardComponent, FormFeedbackDirective],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.ecomCustomerDetail(id())" label="Back to customer" />

      @if (loading()) {
        <app-loading-state label="Loading customer..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load()" />
      } @else if (customer(); as c) {
        @if (c.status === 'BLOCKED') {
          <section class="alert alert-error" role="alert">
            <strong>This customer is blocked</strong>
            @if (c.blockedReason) { <p>{{ c.blockedReason }}</p> }
            <p>Unblock them on their page before taking an order.</p>
          </section>
        }

        <app-section-card [title]="'Phone order for ' + name()" [subtitle]="c.phoneNumber || null">
          <h3 class="panel-title">Items</h3>
          <label class="field">
            <span class="visually-hidden">Find a product</span>
            <input type="search" placeholder="Search products by name" (input)="search($event)">
          </label>
          @if (results().length > 0) {
            <ul class="results">
              @for (product of results(); track product.id) {
                <li>
                  <button type="button" class="result" (click)="add(product)" [disabled]="isOut(product)">
                    <span>{{ product.name }}</span>
                    <span class="muted">KES {{ money(product.price) }}@if (isOut(product)) { · out of stock }</span>
                  </button>
                </li>
              }
            </ul>
          }

          @if (lines().length === 0) {
            <p class="muted">Nothing added yet.</p>
          } @else {
            <div class="table-scroll">
              <table class="table table--packed">
                <thead><tr><th>Product</th><th>Qty</th><th class="num">Price</th><th class="num">Total</th><th><span class="visually-hidden">Remove</span></th></tr></thead>
                <tbody>
                  @for (line of lines(); track line.product.id) {
                    <tr>
                      <td>{{ line.product.name }}</td>
                      <td>
                        <input class="qty" type="number" min="1" [value]="line.quantity" (change)="setQuantity(line, $event)"
                               [attr.aria-label]="'Quantity of ' + line.product.name">
                      </td>
                      <td class="num">{{ money(line.product.price) }}</td>
                      <td class="num">{{ money(num(line.product.price) * line.quantity) }}</td>
                      <td>
                        <button type="button" class="icon-action icon-action--danger" (click)="remove(line)"
                                [attr.aria-label]="'Remove ' + line.product.name" title="Remove">
                          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot><tr><th colspan="3">Items total</th><td class="num"><strong>{{ money(itemsTotal()) }}</strong></td><td></td></tr></tfoot>
              </table>
            </div>
            <p class="hint">Delivery fee, discounts and tax are worked out when the order is placed.</p>
          }
        </app-section-card>

        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="place(c)">
          <app-section-card title="Delivery and payment">
            <div class="form-grid">
              <label class="field">
                <span>Delivery</span>
                <select formControlName="deliveryMethod">
                  <option value="HOME_DELIVERY">Home delivery</option>
                  <option value="PICK_AT_STORE">Pick up at a store</option>
                </select>
              </label>
              @if (form.controls.deliveryMethod.value === 'PICK_AT_STORE') {
                <label class="field">
                  <span>Store</span>
                  <select formControlName="storeId">
                    <option [value]="''">Choose a store</option>
                    @for (store of stores(); track store.id) { <option [value]="store.id">{{ store.name }}</option> }
                  </select>
                </label>
              }
              <label class="field">
                <span>Payment</span>
                <select formControlName="paymentMethod">
                  @if (c.payOnDeliveryAllowed) { <option value="PAY_ON_DELIVERY">Pay on delivery</option> }
                  <option value="MPESA">M-Pesa prompt</option>
                </select>
              </label>
              @if (form.controls.paymentMethod.value === 'MPESA') {
                <label class="field">
                  <span>M-Pesa number</span>
                  <input formControlName="paymentPhoneNumber" inputmode="tel">
                </label>
              }
            </div>

            @if (form.controls.deliveryMethod.value === 'HOME_DELIVERY') {
              <label class="field field--wide">
                <span>Where to deliver</span>
                <textarea formControlName="deliveryLocationDescription" rows="2"
                          placeholder="As the customer described it, e.g. Mwihoko, Discovery estate, blue gate opposite the church"></textarea>
                @if (c.standingDeliveryInstructions) {
                  <small class="hint">Their standing instructions: {{ c.standingDeliveryInstructions }}</small>
                }
              </label>
            }
            <label class="field field--wide">
              <span>Notes <span class="muted">(optional)</span></span>
              <input formControlName="notes">
            </label>

            @if (problem(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
            @if (placeError(); as apiError) {
              <app-error-card title="Order not placed" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="placing() || c.status === 'BLOCKED'">
                {{ placing() ? 'Placing...' : 'Place order' }}
              </button>
            </div>
          </app-section-card>
        </form>
      }
    </section>
  `,
  styles: [`
    .panel-title { margin: 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .results { display: grid; gap: 0.3rem; margin: 0; padding: 0; list-style: none; max-height: 16rem; overflow-y: auto; }
    .result { display: flex; width: 100%; justify-content: space-between; gap: 1rem; padding: 0.55rem 0.75rem; border: 1px solid var(--border);
              border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer; }
    .result:hover:not(:disabled) { border-color: var(--primary); background: var(--primary-tint); }
    .result:disabled { opacity: 0.55; cursor: not-allowed; }
    .qty { width: 4.5rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tfoot th { text-align: left; text-transform: none; letter-spacing: 0; font-size: 0.9rem; color: var(--text); }
    .alert p { margin: 0.3rem 0 0; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneOrderPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input.required<string>();

  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly customer = signal<EcomCustomerDetail | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly results = signal<ProductPreview[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly stores = signal<StorePreview[]>([]);
  readonly placing = signal(false);
  readonly placeError = signal<ApiError | null>(null);
  readonly problem = signal<string | null>(null);

  private readonly queries = new Subject<string>();

  readonly form = this.fb.group({
    deliveryMethod: 'HOME_DELIVERY' as OrderDeliveryMethod,
    storeId: '',
    deliveryLocationDescription: ['', [Validators.maxLength(1000)]],
    paymentMethod: 'PAY_ON_DELIVERY' as OrderPaymentMethod,
    paymentPhoneNumber: '',
    notes: ''
  });

  readonly name = computed(() => {
    const c = this.customer();
    return c ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.phoneNumber || `Customer #${c.id}` : '';
  });

  readonly itemsTotal = computed(() => this.lines().reduce((sum, line) => sum + this.num(line.product.price) * line.quantity, 0));

  constructor() {
    this.queries.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((name) => name.length < 2
        ? of({ items: [] as ProductPreview[] })
        : this.ecommerce.getProducts({ name, status: 'ACTIVE', page: 0, size: 8 }).pipe(catchError(() => of({ items: [] as ProductPreview[] })))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((result) => this.results.set(result.items));
  }

  ngOnInit(): void {
    void this.load();
    void this.loadStores();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const customer = await firstValueFrom(this.ecommerce.getEcomCustomer(Number(this.id())));
      this.customer.set(customer);
      this.form.patchValue({
        paymentMethod: customer.payOnDeliveryAllowed ? 'PAY_ON_DELIVERY' : 'MPESA',
        paymentPhoneNumber: customer.phoneNumber ?? ''
      });
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadStores(): Promise<void> {
    try {
      const result = await firstValueFrom(this.ecommerce.getStores({ isActive: true, page: 0, size: 100 }));
      this.stores.set(result.items);
    } catch {
      this.stores.set([]);
    }
  }

  search(event: Event): void {
    this.queries.next((event.target as HTMLInputElement).value.trim());
  }

  add(product: ProductPreview): void {
    this.problem.set(null);
    this.lines.update((lines) => lines.some((line) => line.product.id === product.id)
      ? lines.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...lines, { product, quantity: 1 }]);
  }

  setQuantity(line: Line, event: Event): void {
    const quantity = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1));
    this.lines.update((lines) => lines.map((item) => item.product.id === line.product.id ? { ...item, quantity } : item));
  }

  remove(line: Line): void {
    this.lines.update((lines) => lines.filter((item) => item.product.id !== line.product.id));
  }

  isOut(product: ProductPreview): boolean {
    return product.availableQuantity !== null && product.availableQuantity !== undefined && product.availableQuantity <= 0;
  }

  async place(customer: EcomCustomerDetail): Promise<void> {
    const value = this.form.getRawValue();
    const problem = this.lines().length === 0 ? 'Add at least one item.'
      : value.deliveryMethod === 'PICK_AT_STORE' && !value.storeId ? 'Choose the store they will pick up from.'
      : value.deliveryMethod === 'HOME_DELIVERY' && !value.deliveryLocationDescription.trim() ? 'Say where to deliver, as the customer described it.'
      : value.paymentMethod === 'MPESA' && !value.paymentPhoneNumber.trim() ? 'Enter the M-Pesa number to prompt.'
      : null;
    this.problem.set(problem);
    if (problem) {
      return;
    }

    this.placing.set(true);
    this.placeError.set(null);
    try {
      const order = await firstValueFrom(this.ecommerce.createOrder({
        customerId: customer.id,
        cartItems: this.lines().map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        deliveryMethod: value.deliveryMethod,
        deliveryLocationDescription: value.deliveryMethod === 'HOME_DELIVERY' ? value.deliveryLocationDescription.trim() : null,
        storeId: value.deliveryMethod === 'PICK_AT_STORE' ? Number(value.storeId) : null,
        paymentMethod: value.paymentMethod,
        paymentPhoneNumber: value.paymentMethod === 'MPESA' ? normalizeMpesaPhone(value.paymentPhoneNumber) : null,
        notes: value.notes.trim() || null
      }));
      await this.router.navigateByUrl(RoutePaths.ecomOrderDetail(order.id));
    } catch (error) {
      this.placeError.set(toApiError(error));
    } finally {
      this.placing.set(false);
    }
  }

  num(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  money(value: number | string | null | undefined): string {
    return this.num(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
