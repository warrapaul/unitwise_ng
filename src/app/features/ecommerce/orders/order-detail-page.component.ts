import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { normalizeMpesaPhone } from '../models/commerce.models';
import { CommerceService } from '../commerce.service';
import { EcommerceService } from '../ecommerce.service';
import { OrderDetail, OrderUpdateRequest } from '../models/ecommerce.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';

@Component({
  selector: 'app-order-detail-page',
  standalone: true,
  imports: [ReactiveFormsModule, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent, ErrorCardComponent, PermissionGateComponent, EntityPickerComponent, FormFeedbackDirective, BackLinkComponent,
    HumanLabelPipe],
  template: `
    <section class="stack">
      <app-back-link [to]="'/admin/ecommerce/orders'" label="Back to orders" />
      @if (loading()) {
        <app-loading-state label="Loading order..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load order'" (retry)="reload()" />
      } @else if (order()) {
        <app-section-card [title]="order()?.orderNumber || 'Order detail'" [subtitle]="order()?.customerName || null">
          <ng-container actions>
            <div class="detail-actions">
              <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          <div class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Order</p>
              <div class="meta-grid">
                <div><span class="muted">Status</span><strong>{{ order()?.status | humanLabel }}</strong></div>
                <div><span class="muted">Payment</span><strong>{{ order()?.payment?.paymentStatus || order()?.payment?.paymentMethod || order()?.paymentMethod || '-' }}</strong></div>
                <div><span class="muted">Delivery</span><strong>{{ order()?.deliveryMethod | humanLabel }}</strong></div>
                <div><span class="muted">Total</span><strong>{{ formatMoney(order()?.totalAmount) }}</strong></div>
              </div>
            </article>

            <article class="panel subcard">
              <p class="eyebrow">Customer</p>
              <div class="stack compact">
                <div><span class="muted">Name</span><strong>{{ order()?.customerName || '-' }}</strong></div>
                <div><span class="muted">Email</span><strong>{{ order()?.customerEmail || '-' }}</strong></div>
                <div><span class="muted">Phone</span><strong>{{ order()?.customerPhone || '-' }}</strong></div>
                <div><span class="muted">Created</span><strong>{{ formatDate(order()?.createdAt) }}</strong></div>
              </div>
            </article>
          </div>

          <section class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Delivery</p>
              <div class="stack compact">
                <div class="delivery-address">
                  <span class="muted">Address</span>
                  <div class="delivery-address__row">
                    <strong>{{ formatAddress(order()?.deliverAddress) }}</strong>
                    @if (order()?.deliverAddress?.isVerified) {
                      <span class="verified-chip">✓ Verified</span>
                    }
                  </div>
                </div>
                <div><span class="muted">Nickname</span><strong>{{ order()?.deliverAddress?.addressNickname || '-' }}</strong></div>
                <div><span class="muted">Contact</span><strong>{{ order()?.deliverAddress?.contactPhone || order()?.deliveryContactPhone || '-' }}</strong></div>
                <div><span class="muted">Instructions</span><strong>{{ order()?.deliveryInstructions || '-' }}</strong></div>
              </div>
            </article>

            <article class="panel subcard">
              <p class="eyebrow">Payment summary</p>
              <div class="stack compact">
                <div><span class="muted">Subtotal</span><strong>{{ formatMoney(order()?.subtotal) }}</strong></div>
                <div><span class="muted">Discount</span><strong>{{ formatMoney(order()?.discountAmount) }}</strong></div>
                <div><span class="muted">Tax</span><strong>{{ formatMoney(order()?.taxAmount) }}</strong></div>
                <div><span class="muted">Delivery fee</span><strong>{{ formatMoney(order()?.deliveryFee) }}</strong></div>
                <div><span class="muted">Balance due</span><strong>{{ formatDate(order()?.balanceDueDate) }}</strong></div>
              </div>
            </article>
          </section>

          @if (order()?.payment) {
            <article class="panel subcard">
              <p class="eyebrow">Payment record</p>
              <div class="meta-grid">
                <div><span class="muted">Method</span><strong>{{ order()?.payment?.paymentMethod | humanLabel }}</strong></div>
                <div><span class="muted">Status</span><strong>{{ order()?.payment?.paymentStatus | humanLabel }}</strong></div>
                <div><span class="muted">Paid</span><strong>{{ formatMoney(order()?.payment?.totalPaid) }}</strong></div>
                <div><span class="muted">Remaining</span><strong>{{ formatMoney(order()?.payment?.remainingBalance) }}</strong></div>
              </div>
            </article>
          }

          @if (order()?.items?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Items</p>
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of order()?.items || []; track item.id ?? item.displayName) {
                      <tr>
                        <td>{{ item.productNameSnapshot || item.displayName || '-' }}</td>
                        <td>{{ joinParts([item.variantColorSnapshot, item.variantSizeSnapshot], ' / ') }}</td>
                        <td>{{ formatMoney(item.unitPrice) }}</td>
                        <td>{{ item.quantity ?? '-' }}</td>
                        <td>{{ formatMoney(item.subtotal) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </article>
          }

          @if (order()?.statusHistory?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Status history</p>
              <div class="history">
                @for (entry of order()?.statusHistory || []; track entry.id ?? entry.createdAt) {
                  <div class="history__row">
                    <strong>{{ entry.status | humanLabel }}</strong>
                    <span class="muted">{{ formatDate(entry.createdAt) }}</span>
                  </div>
                }
              </div>
            </article>
          }

          <article class="panel subcard">
            <p class="eyebrow">Update order</p>
            <form class="update-form" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
              <div class="grid-auto filters-grid">
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">No change</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="SHIPPED">Shipped</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label class="field"><span>Contact name</span><input formControlName="deliveryContactName"></label>
                <label class="field"><span>Contact phone</span><input formControlName="deliveryContactPhone"></label>
              </div>
              <label class="field">
                <span>Delivery instructions</span>
                <textarea formControlName="deliveryInstructions" rows="3"></textarea>
              </label>
              <label class="field">
                <span>Notes</span>
                <textarea formControlName="notes" rows="3"></textarea>
              </label>
              <div class="button-row">
                <app-permission-gate [permissions]="[Permissions.ORDER_UPDATE]">
                  <button type="submit" class="btn btn-primary" [disabled]="mutating()">{{ mutating() ? 'Saving...' : 'Save changes' }}</button>
                </app-permission-gate>
              </div>
            </form>
          </article>

          <app-permission-gate [permissions]="[Permissions.ORDER_PAYMENT_COLLECT]">
            <article class="panel subcard">
              <p class="eyebrow">Record cash collected</p>
              <form [formGroup]="cashForm" appFormFeedback (ngSubmit)="markCashCollected()">
                <div class="grid-auto">
                  <label class="field">
                    <span>Amount collected</span>
                    <input type="number" step="0.01" min="0" formControlName="amountCollected">
                    @if (cashForm.controls.amountCollected.invalid && cashForm.controls.amountCollected.touched) {
                      <small class="error-text">An amount is required and cannot be negative.</small>
                    }
                  </label>
                  <label class="field">
                    <span>Change given</span>
                    <input type="number" step="0.01" min="0" formControlName="changeGiven">
                  </label>
                </div>
                <label class="field">
                  <span>Notes</span>
                  <input formControlName="notes">
                </label>
                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="collecting()">
                    {{ collecting() ? 'Recording...' : 'Record cash' }}
                  </button>
                </div>
              </form>
            </article>
          </app-permission-gate>

          <app-permission-gate [permissions]="[Permissions.ORDER_PAYMENT_COLLECT]">
            <article class="panel subcard">
              <p class="eyebrow">Reconcile M-Pesa payment</p>
              <form [formGroup]="mpesaForm" appFormFeedback (ngSubmit)="markMpesaCollected()">
                <div class="grid-auto">
                  <label class="field">
                    <span>M-Pesa receipt</span>
                    <input formControlName="mpesaReceiptNumber" placeholder="QGH7X...">
                  </label>
                  <label class="field">
                    <span>Payment ID</span>
                    <app-entity-picker [config]="pickers.unlinkedPayment" formControlName="paymentId" placeholder="Search unlinked payments" />
                    <small class="hint">Use an unlinked payment from the payments list.</small>
                  </label>
                  <label class="field">
                    <span>Transaction ID</span>
                    <input formControlName="mpesaTransactionId">
                  </label>
                  <label class="field">
                    <span>Phone used</span>
                    <input formControlName="phoneNumberUsed" placeholder="2547...">
                  </label>
                </div>
                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="collecting()">
                    {{ collecting() ? 'Recording...' : 'Reconcile payment' }}
                  </button>
                </div>
              </form>
            </article>
          </app-permission-gate>

          @if (collectError(); as apiError) {
            <app-error-card title="Unable to record payment" [message]="apiError.message" [details]="apiError.details" />
          }

          <article class="panel subcard">
            <p class="eyebrow">Cancel order</p>
            <form class="cancel-form" [formGroup]="cancelForm" appFormFeedback (ngSubmit)="cancel()">
              <label class="field">
                <span>Reason</span>
                <textarea formControlName="reason" rows="3" placeholder="Why is this order being cancelled?"></textarea>
              </label>
              <div class="button-row">
                <button type="submit" class="btn btn-danger" [disabled]="mutating() || !cancelForm.getRawValue().reason.trim()">
                  {{ mutating() ? 'Working...' : 'Cancel order' }}
                </button>
              </div>
            </form>
          </article>
        </app-section-card>
      } @else {
        <app-empty-state title="No order selected" description="Choose an order from the list to view its detail." />
      }
    </section>
  `,
  styles: [`
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .subcard {
      padding: 1rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .meta-grid div,
    .stack.compact div {
      display: grid;
      gap: 0.15rem;
    }

    .table-scroll {
      overflow: auto;
    }

    .history {
      display: grid;
      gap: 0.5rem;
    }

    .history__row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .delivery-address {
      display: grid;
      gap: 0.4rem;
    }

    .delivery-address__row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .verified-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.25rem 0.55rem;
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--success);
      background: var(--success-tint);
      border: 1px solid var(--success-border);
    }

    .update-form,
    .cancel-form {
      display: grid;
      gap: 0.75rem;
    }


    .field {
      gap: 0.4rem;
    }

    .field span {
      font-size: 0.82rem;
    }

    .field input,
    .field select,
    .field textarea {
      min-height: 2.7rem;
      padding-block: 0.65rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderDetailPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly Permissions = PermissionConstants;

  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);
  private readonly commerceService = inject(CommerceService);

  readonly loading = signal(false);
  readonly mutating = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<OrderDetail | null>(null);

  readonly form = this.formBuilder.group({
    status: '',
    deliveryContactName: '',
    deliveryContactPhone: '',
    deliveryInstructions: '',
    notes: ''
  });

  readonly collecting = signal(false);
  readonly collectError = signal<ApiError | null>(null);

  readonly cashForm = this.formBuilder.group({
    amountCollected: [null as number | null, [Validators.required, Validators.min(0)]],
    changeGiven: [null as number | null, [Validators.min(0)]],
    notes: ''
  });

  readonly mpesaForm = this.formBuilder.group({
    paymentId: [null as number | null],
    mpesaReceiptNumber: '',
    mpesaTransactionId: '',
    phoneNumberUsed: ''
  });

  readonly cancelForm = this.formBuilder.group({
    reason: ''
  });

  ngOnInit(): void {
    void this.load();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  async save(): Promise<void> {
    const orderId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(orderId)) {
      return;
    }

    const payload = this.form.getRawValue();
    const request = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== null && value !== undefined && value !== '')
    ) as OrderUpdateRequest;

    if (Object.keys(request).length === 0) {
      return;
    }

    this.mutating.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.ecommerceService.updateOrder(orderId, request));
      await this.load();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.mutating.set(false);
    }
  }

  async markCashCollected(): Promise<void> {
    const orderId = this.order()?.id;
    if (!orderId) {
      return;
    }

    if (this.cashForm.invalid) {
      this.cashForm.markAllAsTouched();
      return;
    }

    this.collecting.set(true);
    this.collectError.set(null);

    const value = this.cashForm.getRawValue();

    try {
      this.order.set(await firstValueFrom(this.commerceService.markCashCollected(orderId, {
        amountCollected: value.amountCollected!,
        changeGiven: value.changeGiven,
        notes: value.notes || null
      })));
      this.cashForm.reset({ amountCollected: null, changeGiven: null, notes: '' });
    } catch (error) {
      this.collectError.set(toApiError(error));
    } finally {
      this.collecting.set(false);
    }
  }

  async markMpesaCollected(): Promise<void> {
    const orderId = this.order()?.id;
    if (!orderId) {
      return;
    }

    this.collecting.set(true);
    this.collectError.set(null);

    const value = this.mpesaForm.getRawValue();

    try {
      this.order.set(await firstValueFrom(this.commerceService.markMpesaCollected(orderId, {
        paymentId: value.paymentId,
        mpesaReceiptNumber: value.mpesaReceiptNumber || null,
        mpesaTransactionId: value.mpesaTransactionId || null,
        phoneNumberUsed: value.phoneNumberUsed ? normalizeMpesaPhone(value.phoneNumberUsed) : null
      })));
      this.mpesaForm.reset({ paymentId: null, mpesaReceiptNumber: '', mpesaTransactionId: '', phoneNumberUsed: '' });
    } catch (error) {
      this.collectError.set(toApiError(error));
    } finally {
      this.collecting.set(false);
    }
  }

  async cancel(): Promise<void> {
    const orderId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(orderId)) {
      return;
    }

    const reason = this.cancelForm.getRawValue().reason.trim();
    if (!reason) {
      return;
    }

    this.mutating.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.ecommerceService.cancelOrder(orderId, { reason }));
      this.cancelForm.reset({ reason: '' });
      await this.load();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.mutating.set(false);
    }
  }

  private async load(): Promise<void> {
    const orderId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(orderId)) {
      this.error.set('Invalid order id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const order = await firstValueFrom(this.ecommerceService.getOrder(orderId));
      this.order.set(order);
      this.form.reset({
        status: '',
        deliveryContactName: order.deliveryContactName ?? '',
        deliveryContactPhone: order.deliveryContactPhone ?? '',
        deliveryInstructions: order.deliveryInstructions ?? '',
        notes: order.notes ?? ''
      });
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  formatAddress(address?: OrderDetail['deliverAddress'] | null): string {
    if (!address) {
      return '-';
    }

    const parts = [
      address.addressLine1,
      address.unitNumber,
      address.landmark,
      address.town,
      address.city,
      address.county
    ]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .map((value) => value.trim());

    if (parts.length === 0) {
      return address.addressNickname || '-';
    }

    return parts.join(', ');
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  formatMoney(value?: number | string | null): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const numeric = Number(value);
    return Number.isNaN(numeric) ? String(value) : numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  joinParts(values: Array<string | null | undefined>, separator = ', '): string {
    return values.filter((value): value is string => Boolean(value)).join(separator) || '-';
  }

}
