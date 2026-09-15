import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';
import { PaymentStatus } from '../models/commerce.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-payment-detail-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, SectionCardComponent, BackLinkComponent,
    HumanLabelPipe,
    StatusChipComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.payments" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading payment..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payment(); as detail) {
        <app-section-card [title]="detail.mpesaReceiptNumber || ('Payment #' + detail.id)">
          <ng-container actions>
          </ng-container>

          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.paymentStatus" /></dd>
            </div>
            <div><dt>Method</dt><dd>{{ detail.paymentMethod | humanLabel }}</dd></div>
            <div><dt>Amount</dt><dd>{{ detail.amount ?? '-' }}</dd></div>
            <div>
              <dt>Order</dt>
              <dd>
                @if (detail.orderId) {
                  <a [routerLink]="RoutePaths.ecomOrderDetail(detail.orderId)">{{ detail.orderNumber || detail.orderId }}</a>
                } @else {
                  <span class="muted">Not linked to an order</span>
                }
              </dd>
            </div>
            <div><dt>Merchant transaction</dt><dd class="mono">{{ detail.transactionMerchantId || '-' }}</dd></div>
            <div><dt>Retries</dt><dd>{{ detail.retryCount ?? 0 }}</dd></div>
            <div><dt>Initiated</dt><dd>{{ formatDate(detail.initiatedAt) }}</dd></div>
            <div><dt>Completed</dt><dd>{{ formatDate(detail.completedAt) }}</dd></div>
          </dl>

          @if (detail.failureReason) {
            <section class="alert alert-error" role="alert">
              <strong>Failure reason</strong>
              <p>{{ detail.failureReason }}</p>
            </section>
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    p {
      margin: 0.4rem 0 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input.required<string>();

  private readonly commerce = inject(CommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payment = signal<PaymentStatus | null>(null);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.payment.set(await firstValueFrom(this.commerce.getPayment(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
