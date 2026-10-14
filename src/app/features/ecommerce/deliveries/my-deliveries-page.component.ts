import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { NotificationService } from '../../../core/services/notification.service';
import { EcommerceService } from '../ecommerce.service';
import { OrderPreview } from '../models/ecommerce.models';

/**
 * A rider's day: the deliveries that are theirs, in the order they came in, and the ones nobody
 * has taken yet. Taking one makes it theirs; the order page does the rest (status, payment,
 * door details).
 */
@Component({
  selector: 'app-my-deliveries-page',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent, SectionCardComponent, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-section-card title="My deliveries" subtitle="Yours first; below, deliveries nobody has taken yet.">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" class="btn btn-secondary btn-sm" [class.active]="!open()" [attr.aria-selected]="!open()" (click)="show(false)">Mine</button>
          <button type="button" role="tab" class="btn btn-secondary btn-sm" [class.active]="open()" [attr.aria-selected]="open()" (click)="show(true)">Not taken</button>
        </div>

        @if (loading()) {
          <app-loading-state label="Loading deliveries..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else if (orders().length === 0) {
          <app-empty-state [title]="open() ? 'Nothing waiting' : 'No deliveries on you'"
                           [description]="open() ? 'Every ready delivery has a rider.' : 'Take one from Not taken, or wait to be assigned.'" />
        } @else {
          <ul class="deliveries">
            @for (o of orders(); track o.id) {
              <li class="delivery">
                <div class="delivery__head">
                  <a class="record-link__primary" [routerLink]="RoutePaths.ecomOrderDetail(o.id)">{{ o.orderNumber }}</a>
                  <span class="status-chip status-chip--neutral">{{ o.status | humanLabel }}</span>
                </div>
                <p>{{ o.customerName || 'Customer' }} · <a [href]="'tel:' + o.customerPhone">{{ o.customerPhone }}</a></p>
                <p class="muted">{{ o.deliverAddress?.addressLine1 || 'No address yet — call for directions' }}</p>
                <p class="muted">KES {{ money(o.totalAmount) }} · {{ o.paymentMethod | humanLabel }}@if (o.paymentStatus) { · {{ o.paymentStatus | humanLabel }} }</p>
                <div class="delivery__actions">
                  <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomOrderDetail(o.id)">Open</a>
                  @if (open()) {
                    <button type="button" class="btn btn-primary btn-sm" [disabled]="taking() === o.id" (click)="take(o)">
                      {{ taking() === o.id ? 'Taking...' : 'Take it' }}
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .tabs { display: flex; gap: 0.4rem; margin-bottom: 0.75rem; }
    .tabs .active { border-color: var(--primary); background: var(--primary-tint); }
    .deliveries { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
    .delivery { display: grid; gap: 0.25rem; padding: 0.75rem 0.85rem; border: 1px solid var(--border); border-radius: 12px; }
    .delivery p { margin: 0; }
    .delivery__head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .delivery__actions { display: flex; gap: 0.4rem; margin-top: 0.25rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyDeliveriesPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly ecommerce = inject(EcommerceService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  readonly open = signal(false);
  readonly orders = signal<OrderPreview[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly taking = signal<number | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  show(open: boolean): void {
    this.open.set(open);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.orders.set((await firstValueFrom(this.ecommerce.getDeliveries(this.open(), 0, 50))).items);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async take(order: OrderPreview): Promise<void> {
    this.taking.set(order.id);
    try {
      await firstValueFrom(this.ecommerce.takeDelivery(order.id));
      this.notifications.push('success', `${order.orderNumber} is yours.`);
      await this.router.navigateByUrl(RoutePaths.ecomOrderDetail(order.id));
    } catch (error) {
      this.notifications.push('error', toApiError(error).message);
      void this.load();
    } finally {
      this.taking.set(null);
    }
  }

  money(value: number | string | null | undefined): string {
    return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
