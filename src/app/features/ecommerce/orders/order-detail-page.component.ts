import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { OrderDetail, OrderUpdateRequest } from '../models/ecommerce.models';

@Component({
  selector: 'app-order-detail-page',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading order..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load order'" (retry)="reload()" />
      } @else if (order()) {
        <app-section-card [title]="order()?.orderNumber || 'Order detail'" [subtitle]="order()?.customerName || null">
          <ng-container actions>
            <div class="detail-actions">
              <a class="btn btn-secondary" routerLink="/ecommerce/orders">Back to orders</a>
              <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          <div class="detail-grid">
            <article class="panel subcard">
              <p class="eyebrow">Order</p>
              <div class="meta-grid">
                <div><span class="muted">Status</span><strong>{{ order()?.status || '-' }}</strong></div>
                <div><span class="muted">Payment</span><strong>{{ order()?.payment?.paymentStatus || order()?.payment?.paymentMethod || order()?.paymentMethod || '-' }}</strong></div>
                <div><span class="muted">Delivery</span><strong>{{ order()?.deliveryMethod || '-' }}</strong></div>
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
                <div><span class="muted">Method</span><strong>{{ order()?.payment?.paymentMethod || '-' }}</strong></div>
                <div><span class="muted">Status</span><strong>{{ order()?.payment?.paymentStatus || '-' }}</strong></div>
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
                    <strong>{{ entry.status || '-' }}</strong>
                    <span class="muted">{{ formatDate(entry.createdAt) }}</span>
                  </div>
                }
              </div>
            </article>
          }

          <article class="panel subcard">
            <p class="eyebrow">Update order</p>
            <form class="update-form" [formGroup]="form" (ngSubmit)="save()">
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
                <button type="submit" class="btn btn-primary" [disabled]="mutating()">{{ mutating() ? 'Saving...' : 'Save changes' }}</button>
              </div>
            </form>
          </article>

          <article class="panel subcard">
            <p class="eyebrow">Cancel order</p>
            <form class="cancel-form" [formGroup]="cancelForm" (ngSubmit)="cancel()">
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
      gap: 0.3rem;
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
      color: #1f6d52;
      background: rgba(31, 157, 106, 0.1);
      border: 1px solid rgba(31, 157, 106, 0.16);
    }

    .update-form,
    .cancel-form {
      display: grid;
      gap: 0.75rem;
    }

    .filters-grid {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.6rem;
    }

    .field {
      gap: 0.3rem;
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
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

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
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.mutating.set(false);
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
      this.error.set(this.extractErrorMessage(error));
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
      this.error.set(this.extractErrorMessage(error));
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

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
