import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgClass } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CommerceService } from '../../ecommerce/commerce.service';
import { OrderDetail } from '../../ecommerce/models/ecommerce.models';
import { PaymentStatus } from '../../ecommerce/models/commerce.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

/** Order statuses that are still cancellable from the customer's side. */
const CANCELLABLE = new Set(['WAITING_PAYMENT_CONFIRMATION', 'PAID', 'PROCESSING']);

@Component({
  selector: 'app-my-order-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.myOrders" label="Back to my orders" />
      @if (loading()) {
        <app-loading-state label="Loading your order..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (order(); as detail) {
        <app-section-card [title]="detail.orderNumber" [subtitle]="formatDateTime(detail.createdAt)">
          <ng-container actions>
          </ng-container>

          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Payment method</dt><dd>{{ detail.paymentMethod | humanLabel }}</dd></div>
            <div><dt>Delivery method</dt><dd>{{ detail.deliveryMethod | humanLabel }}</dd></div>
            <div><dt>Deliver to</dt><dd>{{ detail.deliveryFullAddress || '-' }}</dd></div>
            <div><dt>Subtotal</dt><dd>{{ detail.subtotal ?? '-' }}</dd></div>
            <div><dt>Discount</dt><dd>{{ detail.discountAmount ?? '-' }}</dd></div>
            <div><dt>Delivery fee</dt><dd>{{ detail.deliveryFee ?? '-' }}</dd></div>
            <div><dt>Total</dt><dd><strong>{{ detail.totalAmount ?? '-' }}</strong></dd></div>
            @if (detail.minDownPayment) {
              <div><dt>Minimum down payment</dt><dd>{{ detail.minDownPayment }}</dd></div>
              <div><dt>Balance due</dt><dd>{{ formatDateTime(detail.balanceDueDate) }}</dd></div>
            }
          </dl>
        </app-section-card>

        <app-section-card title="Items">
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Item</th><th>Unit price</th><th>Qty</th><th>Subtotal</th></tr></thead>
              <tbody>
                @for (item of detail.items ?? []; track item.id) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ item.productNameSnapshot || item.displayName || '-' }}</strong>
                        <span class="muted mono">{{ item.productSkuSnapshot || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ item.unitPrice ?? '-' }}</td>
                    <td>{{ item.quantity ?? '-' }}</td>
                    <td>{{ item.subtotal ?? '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-section-card>

        <app-section-card title="Payment">
          @if (paymentStatus(); as payment) {
            <dl class="detail-grid">
              <div>
                <dt>Status</dt>
                <dd><span class="status-chip" [ngClass]="paymentStatusClass(payment.paymentStatus)">{{ payment.paymentStatus | humanLabel }}</span></dd>
              </div>
              <div><dt>Amount</dt><dd>{{ payment.amount ?? '-' }}</dd></div>
              <div><dt>M-Pesa receipt</dt><dd class="mono">{{ payment.mpesaReceiptNumber || '-' }}</dd></div>
              <div><dt>Completed</dt><dd>{{ formatDateTime(payment.completedAt) }}</dd></div>
            </dl>

            @if (payment.failureReason) {
              <section class="alert alert-error" role="alert">
                <strong>Payment problem</strong>
                <p>{{ payment.failureReason }}</p>
              </section>
            }
          } @else {
            <p class="muted">No payment has been recorded against this order yet.</p>
          }
        </app-section-card>

        @if ((detail.statusHistory ?? []).length > 0) {
          <app-section-card title="Progress">
            <ol class="timeline">
              @for (entry of detail.statusHistory ?? []; track entry.id) {
                <li>
                  <app-status-chip [status]="entry.status" />
                  <span class="muted">{{ formatDateTime(entry.createdAt) }}</span>
                  @if (entry.reason) {
                    <span>{{ entry.reason }}</span>
                  }
                </li>
              }
            </ol>
          </app-section-card>
        }

        @if (canCancel()) {
          <app-section-card title="Cancel this order">
            <form [formGroup]="cancelForm" appFormFeedback (ngSubmit)="cancel()">
              <label class="field field--wide">
                <span>Reason</span>
                <textarea formControlName="reason" rows="2" placeholder="Why are you cancelling?"></textarea>
                @if (cancelForm.controls.reason.invalid && cancelForm.controls.reason.touched) {
                  <small class="error-text">Tell us why so the seller can act on it.</small>
                }
              </label>

              @if (cancelError(); as apiError) {
                <app-error-card title="Unable to cancel this order" [message]="apiError.message" [details]="apiError.details" />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-danger" [disabled]="cancelling()">
                  {{ cancelling() ? 'Cancelling...' : 'Cancel order' }}
                </button>
              </div>
            </form>
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

    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }

    .timeline li {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      flex-wrap: wrap;
      font-size: 0.9rem;
    }

    p {
      margin: 0;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyOrderDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly commerce = inject(CommerceService);
  private readonly authSession = inject(AuthSessionService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<OrderDetail | null>(null);
  readonly paymentStatus = signal<PaymentStatus | null>(null);

  readonly cancelling = signal(false);
  readonly cancelError = signal<ApiError | null>(null);

  /**
   * The backend gates cancel on `ORDER_CANCEL_ALL or isCurrentUserOrderOwner`,
   * so mirror both halves here (skills §8 ownership fallback).
   */
  readonly canCancel = computed(() => {
    const detail = this.order();
    if (!detail || !CANCELLABLE.has(String(detail.status))) {
      return false;
    }

    // Backend: `ORDER_CANCEL_ALL or isCurrentUserOrderOwner(#id)`.
    return this.authSession.canActOnOwn(PermissionConstants.ORDER_CANCEL_ALL, detail.customerId);
  });

  readonly cancelForm = this.formBuilder.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]]
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.order.set(await firstValueFrom(this.ecommerce.getOrder(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }

    try {
      this.paymentStatus.set(await firstValueFrom(this.commerce.getPaymentStatusForOrder(Number(this.id()))));
    } catch {
      // No payment row yet, or the customer cannot read it — the panel says so.
      this.paymentStatus.set(null);
    }
  }

  async cancel(): Promise<void> {
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }

    if (!await this.confirm.ask({ title: 'Cancel this order?' })) {
      return;
    }

    this.cancelling.set(true);
    this.cancelError.set(null);

    try {
      this.order.set(await firstValueFrom(
        this.ecommerce.cancelOrder(Number(this.id()), { reason: this.cancelForm.getRawValue().reason.trim() })
      ));
      this.cancelForm.reset({ reason: '' });
    } catch (error) {
      this.cancelError.set(toApiError(error));
    } finally {
      this.cancelling.set(false);
    }
  }


  paymentStatusClass(status?: string | null): string {
    switch (status) {
      case 'COMPLETED':
        return 'status-chip--success';
      case 'FAILED':
      case 'CANCELLED':
        return 'status-chip--danger';
      case 'PENDING':
        return 'status-chip--warning';
      default:
        return 'status-chip--neutral';
    }
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
