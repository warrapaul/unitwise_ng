import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
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
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { EntityPickerConfig } from '../../../shared/components/entity-picker/entity-picker.models';
import { DeliveryAddressDetail } from '../models/commerce.models';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';
import { CustomerAddressDialogComponent } from './customer-address-dialog.component';

interface Line {
  product: ProductPreview;
  quantity: number;
  /** Set for a product with variants (reorders carry it); the name then says which one. */
  variantId?: number | null;
  /** The product's variants, to choose from on the line. */
  variants?: { id: number; label: string; price: number; available: number }[];
  /** A reordered line's variant, when its options were not loaded. */
  variantLabel?: string | null;
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
  imports: [AddressPreviewComponent, EntityPickerComponent, CustomerAddressDialogComponent, ReactiveFormsModule, BackLinkComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent,
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
          @if (reorderNote(); as note) { <p class="hint reorder-note">{{ note }}</p> }
          <h3 class="panel-title">Items</h3>
          <!-- The same picker as everywhere else: search by name or SKU, choose, and the line is added. -->
          <label class="field product-search">
            <span>Add a product</span>
            <app-entity-picker [config]="productPicker" [formControl]="productPick" placeholder="Search by name or SKU" />
          </label>
          @if (addError(); as message) { <small class="error-text" role="alert">{{ message }}</small> }

          @if (lines().length === 0) {
            <p class="muted">Nothing added yet.</p>
          } @else {
            <div class="table-scroll">
              <table class="table table--packed">
                <thead><tr><th>Product</th><th>Qty</th><th class="num">Price</th><th class="num">Total</th><th><span class="visually-hidden">Remove</span></th></tr></thead>
                <tbody>
                  @for (line of lines(); track $index) {
                    <tr>
                      <td>
                        <div class="line-name">
                          <strong>{{ line.product.name }}</strong>
                          @if (line.variants?.length) {
                            <!-- Which one: colour, size — only the id is sent. -->
                            <select class="variant" [value]="line.variantId ?? ''" (change)="setVariant(line, $any($event.target).value)"
                                    [attr.aria-label]="'Variant of ' + line.product.name">
                              <option value="" disabled>Choose a variant</option>
                              @for (v of line.variants; track v.id) {
                                <option [value]="v.id" [disabled]="v.available <= 0">{{ v.label }}{{ v.available <= 0 ? ' (out of stock)' : '' }}</option>
                              }
                            </select>
                          } @else if (line.variantLabel) {
                            <span class="muted">{{ line.variantLabel }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <input class="qty" type="number" min="1" [value]="line.quantity" (change)="setQuantity(line, $event)"
                               [attr.aria-label]="'Quantity of ' + line.product.name">
                      </td>
                      <td class="num">{{ money(unitPrice(line)) }}</td>
                      <td class="num">{{ money(unitPrice(line) * line.quantity) }}</td>
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
              <!-- One of their saved addresses, a new one, or (as a last resort) directions as they gave them. -->
              <div class="field field--wide where">
                <span>Where to deliver</span>
                <ul class="address-list" role="radiogroup" aria-label="Delivery address">
                  @for (address of addresses(); track address.id) {
                    <li>
                      <button type="button" role="radio" class="address" [class.address--on]="destination() === address.id"
                              [attr.aria-checked]="destination() === address.id" (click)="destination.set(address.id)">
                        <span class="dot" aria-hidden="true"></span>
                        <span class="address__body">
                          <strong>{{ address.addressNickname || ('Address #' + address.id) }}
                            @if (address.isDefault) { <span class="tag">Default</span> }
                            @if (address.customerConfirmed === false) { <span class="tag tag--warn">Not confirmed by them</span> }
                          </strong>
                          <span class="muted"><app-address-preview [address]="previewOf(address)" /></span>
                        </span>
                      </button>
                    </li>
                  }
                  <li>
                    <button type="button" role="radio" class="address" [class.address--on]="destination() === 'DESCRIBE'"
                            [attr.aria-checked]="destination() === 'DESCRIBE'" (click)="destination.set('DESCRIBE')">
                      <span class="dot" aria-hidden="true"></span>
                      <span class="address__body">
                        <strong>Directions only</strong>
                        <span class="muted">They described the place; the rider calls on the way and records the address.</span>
                      </span>
                    </button>
                  </li>
                </ul>
                @if (addressesError(); as message) { <small class="error-text">{{ message }}</small> }
                <button type="button" class="link-button add-link" (click)="addingAddress.set(true)">+ Add a new address for them</button>
                @if (destination() === 'DESCRIBE') {
                  <textarea formControlName="deliveryLocationDescription" rows="2"
                            placeholder="As the customer described it, e.g. Mwihoko, Discovery estate, blue gate opposite the church"></textarea>
                }
                @if (c.standingDeliveryInstructions) {
                  <small class="hint">Their standing instructions: {{ c.standingDeliveryInstructions }}</small>
                }
              </div>
            }
            <label class="field notes">
              <span>Notes <span class="muted">(optional, for the shop)</span></span>
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

    @if (addingAddress() && customer(); as c) {
      <app-customer-address-dialog [customerId]="c.id" [customerPhone]="c.phoneNumber || null"
                                   (saved)="onAddressSaved($event)" (closed)="addingAddress.set(false)" />
    }
  `,
  styles: [`
    .panel-title { margin: 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .product-search { max-width: 30rem; }
    .line-name { display: grid; gap: 0.3rem; }
    .variant { max-width: 16rem; min-height: 2.2rem; padding-block: 0.3rem; }
    .notes { max-width: 32rem; }
    .qty { width: 4.5rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tfoot th { text-align: left; text-transform: none; letter-spacing: 0; font-size: 0.9rem; color: var(--text); }
    .alert p { margin: 0.3rem 0 0; }
    .reorder-note { margin: 0 0 0.5rem; }
    .where { display: grid; gap: 0.5rem; }
    .where > span { font-size: 0.82rem; font-weight: 600; }
    .address-list { display: grid; margin: 0; padding: 0; list-style: none; border-radius: 10px; overflow: hidden;
                    background: var(--surface); border: 1px solid var(--border); max-width: 44rem; }
    .address-list li + li { border-top: 1px solid var(--border); }
    .address { display: flex; align-items: flex-start; gap: 0.65rem; width: 100%; padding: 0.65rem 0.8rem; border: 0;
               background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
    .address:hover, .address--on { background: var(--surface-2); }
    .address__body { display: grid; gap: 0.12rem; min-width: 0; }
    .address__body .muted { font-size: 0.84rem; }
    .dot { flex: none; margin-top: 0.2rem; width: 1rem; height: 1rem; border-radius: 50%; border: 2px solid var(--border-strong); }
    .address--on .dot { border-color: var(--primary); background: radial-gradient(var(--primary) 0 42%, transparent 48%); }
    .tag { margin-left: 0.35rem; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--surface-2); font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
    .tag--warn { background: var(--warning-tint); color: var(--warning); }
    .add-link { justify-self: start; font-weight: 600; color: var(--primary-strong); }
    .where textarea { max-width: 44rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneOrderPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input.required<string>();
  /** `?reorder=<orderId>`: start from that order's items, priced as today. */
  readonly reorder = input<string>();
  readonly reorderNote = signal<string | null>(null);

  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly customer = signal<EcomCustomerDetail | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly pickers = inject(EntityPickerRegistry);
  /** Active products only: nothing else can be ordered. */
  readonly productPicker: EntityPickerConfig<number> = {
    ...this.pickers.product,
    search: (params) => this.ecommerce.getProducts({ ...params, status: 'ACTIVE' })
  };
  /** Holds a choice only long enough to add it as a line, then clears for the next. */
  readonly productPick = new FormControl<number | null>(null);
  readonly addError = signal<string | null>(null);
  readonly lines = signal<Line[]>([]);
  readonly stores = signal<StorePreview[]>([]);
  readonly placing = signal(false);
  readonly placeError = signal<ApiError | null>(null);
  readonly problem = signal<string | null>(null);

  /** The customer's saved addresses; the chosen one, or DESCRIBE for directions only. */
  readonly addresses = signal<DeliveryAddressDetail[]>([]);
  readonly addressesError = signal<string | null>(null);
  readonly destination = signal<number | 'DESCRIBE'>('DESCRIBE');
  readonly addingAddress = signal(false);

  private async loadAddresses(): Promise<void> {
    try {
      const list = await firstValueFrom(this.ecommerce.getEcomCustomerAddresses(Number(this.id())));
      this.addresses.set(list);
      const preferred = list.find((item) => item.isDefault) ?? list[0];
      this.destination.set(preferred ? preferred.id : 'DESCRIBE');
    } catch (error) {
      this.addressesError.set('Could not load their addresses: ' + extractErrorMessage(error));
    }
  }

  /** The place as the address registry names it, plus the landmark — the same text the customer page shows. */
  previewOf(address: DeliveryAddressDetail) {
    return {
      ...(address.address ?? {}),
      description: [address.addressLine1, address.landmark].filter(Boolean).join(' — ') || null,
      latitude: address.latitude,
      longitude: address.longitude
    };
  }

  /** A new address goes straight into the list, chosen. */
  onAddressSaved(address: DeliveryAddressDetail): void {
    this.addingAddress.set(false);
    this.addresses.update((list) => [...list.filter((item) => item.id !== address.id), address]);
    this.destination.set(address.id);
  }


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

  readonly itemsTotal = computed(() => this.lines().reduce((sum, line) => sum + this.unitPrice(line) * line.quantity, 0));

  /** A chosen variant's own price, else the product's. */
  unitPrice(line: Line): number {
    const variant = line.variants?.find((v) => v.id === line.variantId);
    return variant ? variant.price : this.num(line.product.price);
  }

  setVariant(line: Line, value: string): void {
    const variantId = value ? Number(value) : null;
    this.problem.set(null);
    this.lines.update((lines) => lines.map((item) => item === line ? { ...item, variantId } : item));
  }

  /** A product with variants: its options, fetched once when it is added. */
  private async loadVariants(product: ProductPreview): Promise<void> {
    try {
      const detail = await firstValueFrom(this.ecommerce.getProduct(product.id));
      const variants = (detail.variants ?? [])
        .filter((v) => v.id != null && v.isActive !== false)
        .map((v) => ({
          id: v.id as number,
          label: [v.color, v.size, v.material].filter(Boolean).join(' / ') || v.sku || `Variant ${v.id}`,
          price: this.num(v.effectivePrice ?? detail.price),
          available: v.availableQuantity ?? 0
        }));
      this.lines.update((lines) => lines.map((line) => line.product.id === product.id && !line.variants
        ? { ...line, variants, variantId: variants.length === 1 ? variants[0].id : line.variantId ?? null }
        : line));
    } catch {
      // Without its options the line still shows; placing it will ask for a variant.
    }
  }

  constructor() {
    // A product chosen in the picker becomes a line; the picker empties for the next one.
    this.productPick.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      if (id != null) {
        void this.addById(id);
        this.productPick.setValue(null, { emitEvent: false });
      }
    });
  }

  ngOnInit(): void {
    void this.load();
    void this.loadAddresses();
    void this.loadStores();
    if (this.reorder()) {
      void this.loadReorder(Number(this.reorder()));
    }
  }

  /** The past order's lines at today's prices; what cannot be sold is left out and said so. */
  private async loadReorder(orderId: number): Promise<void> {
    try {
      const items = await firstValueFrom(this.ecommerce.getReorderItems(orderId));
      const usable = items.filter((item) => item.available && item.unitPrice != null);
      this.lines.set(usable.map((item) => ({
        product: { id: item.productId, name: item.name, price: item.unitPrice, availableQuantity: item.availableQuantity } as ProductPreview,
        quantity: Math.min(item.quantity, item.availableQuantity ?? item.quantity),
        variantId: item.variantId ?? null
      })));
      const notes = items.filter((item) => !item.available || item.unavailableReason)
        .map((item) => `${item.name}: ${item.unavailableReason}`);
      const changed = usable.filter((item) => Number(item.previousUnitPrice) !== Number(item.unitPrice)).length;
      this.reorderNote.set([
        'Items from the earlier order, at today\'s prices' + (changed ? ` (${changed} changed)` : '') + '.',
        ...notes
      ].join(' '));
    } catch (error) {
      this.reorderNote.set('Could not load the earlier order: ' + extractErrorMessage(error));
    }
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


  /** The picker gives an id; the product's own record gives its price, stock and variants. */
  private async addById(id: number): Promise<void> {
    this.addError.set(null);
    try {
      const detail = await firstValueFrom(this.ecommerce.getProduct(id));
      const product = {
        id: detail.id, name: detail.name, sku: detail.sku, price: detail.price,
        availableQuantity: detail.availableQuantity ?? detail.inventory?.quantity ?? null,
        hasVariants: (detail.variants ?? []).length > 0
      } as ProductPreview;
      if (!product.hasVariants && this.isOut(product)) {
        this.addError.set(`${product.name} is out of stock.`);
        return;
      }
      this.add(product);
    } catch (error) {
      this.addError.set('Could not add it: ' + extractErrorMessage(error));
    }
  }

  add(product: ProductPreview): void {
    this.problem.set(null);
    // A product with variants gets a new line each time: each line is one variant.
    if (product.hasVariants) {
      this.lines.update((lines) => [...lines, { product, quantity: 1, variantId: null }]);
      void this.loadVariants(product);
      return;
    }
    this.lines.update((lines) => lines.some((line) => line.product.id === product.id)
      ? lines.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...lines, { product, quantity: 1 }]);
  }

  setQuantity(line: Line, event: Event): void {
    const quantity = Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1));
    this.lines.update((lines) => lines.map((item) => item === line ? { ...item, quantity } : item));
  }

  remove(line: Line): void {
    this.lines.update((lines) => lines.filter((item) => item !== line));
  }

  isOut(product: ProductPreview): boolean {
    return product.availableQuantity !== null && product.availableQuantity !== undefined && product.availableQuantity <= 0;
  }

  async place(customer: EcomCustomerDetail): Promise<void> {
    const value = this.form.getRawValue();
    const unchosen = this.lines().find((line) => line.product.hasVariants && !line.variantId);
    const problem = this.lines().length === 0 ? 'Add at least one item.'
      : unchosen ? `Choose which ${unchosen.product.name} (the variant).`
      : value.deliveryMethod === 'PICK_AT_STORE' && !value.storeId ? 'Choose the store they will pick up from.'
      : value.deliveryMethod === 'HOME_DELIVERY' && this.destination() === 'DESCRIBE' && !value.deliveryLocationDescription.trim()
        ? 'Choose one of their addresses, add one, or say where to deliver as they described it.'
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
        cartItems: this.lines().map((line) => ({ productId: line.product.id, variantId: line.variantId ?? null, quantity: line.quantity })),
        deliveryMethod: value.deliveryMethod,
        deliveryAddressId: value.deliveryMethod === 'HOME_DELIVERY' && this.destination() !== 'DESCRIBE' ? this.destination() as number : null,
        deliveryLocationDescription: value.deliveryMethod === 'HOME_DELIVERY' && this.destination() === 'DESCRIBE'
          ? value.deliveryLocationDescription.trim() : null,
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
