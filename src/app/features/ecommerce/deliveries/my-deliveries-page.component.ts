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
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-my-deliveries-page',
  standalone: true,
  imports: [RouterLink, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent, SectionCardComponent, HumanLabelPipe,
    StatusChipComponent, AddressPreviewComponent],
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
              <!-- The customer's "My orders" card, with the rider's one action on it. -->
              <li class="delivery">
                <div class="delivery__top">
                  <a class="mono delivery__number" [routerLink]="RoutePaths.ecomOrderDetail(o.id)">{{ o.orderNumber }}</a>
                  <app-status-chip [status]="o.status" />
                </div>
                <div class="delivery__who">
                  <strong>{{ o.customerName || 'Customer' }}</strong>
                  @if (o.customerPhone) { <a [href]="'tel:' + o.customerPhone">{{ o.customerPhone }}</a> }
                </div>
                <div class="delivery__meta muted">
                  @if (o.deliverAddress) {
                    <span>{{ o.deliverAddress.addressNickname ? o.deliverAddress.addressNickname + ' · ' : '' }}<app-address-preview [address]="previewOf(o)" /></span>
                  } @else { <span>No address yet — call for directions</span> }
                  <span>{{ o.itemCount ?? 0 }} {{ o.itemCount === 1 ? 'item' : 'items' }}</span>
                  <span>{{ o.paymentMethod | humanLabel }}</span>
                </div>
                <div class="delivery__bottom">
                  <span class="delivery__money">
                    <strong>KES {{ money(o.totalAmount) }}</strong>
                    @if (o.paymentStatus) { <app-status-chip [status]="o.paymentStatus" /> }
                  </span>
                  @if (open()) {
                    <button type="button" class="btn btn-primary btn-sm" [disabled]="taking() === o.id" (click)="take(o)">
                      {{ taking() === o.id ? 'Taking...' : 'Take it' }}
                    </button>
                  } @else if (['PAID', 'PROCESSING', 'OUT_FOR_DELIVERY'].includes(o.status ?? '')) {
                    <button type="button" class="btn btn-primary btn-sm" [disabled]="delivering() === o.id" (click)="deliver(o)">
                      {{ delivering() === o.id ? 'Saving...' : 'Mark delivered' }}
                    </button>
                  } @else {
                    <a class="delivery__go" [routerLink]="RoutePaths.ecomOrderDetail(o.id)">View order ›</a>
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
    .tabs { display: flex; gap: var(--space-1-5); margin-bottom: var(--space-3); }
    .tabs .active { border-color: var(--primary); background: var(--primary-tint); }
    /* The same card as the customer's "My orders": side by side as the width allows. */
    .deliveries { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); gap: var(--space-3); }
    .delivery { display: grid; gap: var(--space-2); align-content: start; padding: var(--space-4) var(--space-4); border: 1px solid var(--border); border-radius: 16px;
                background: var(--surface); transition: box-shadow 0.15s, border-color 0.15s; }
    .delivery:hover { border-color: var(--border-strong); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07); }
    .delivery__top, .delivery__bottom { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .delivery__number { font-weight: var(--weight-bold); color: var(--text); text-decoration: none; }
    .delivery__number:hover { text-decoration: underline; }
    .delivery__who { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); align-items: baseline; }
    .delivery__meta { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--text-sm); }
    .delivery__bottom { margin-top: auto; }
    .delivery__money { display: flex; align-items: center; gap: var(--space-2); }
    .delivery__money strong { font-size: var(--text-lg); font-variant-numeric: tabular-nums; }
    .delivery__go { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: none; }
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
  readonly delivering = signal<number | null>(null);
  private readonly confirm = inject(ConfirmService);

  previewOf(order: OrderPreview) {
    const address = order.deliverAddress;
    return { ...(address?.address ?? {}), description: address?.landmark ?? null, latitude: address?.latitude, longitude: address?.longitude };
  }

  /** Handed over at the door: the same shortcut as on the order page. */
  async deliver(order: OrderPreview): Promise<void> {
    if (!await this.confirm.ask({
      title: `Mark ${order.orderNumber} as delivered?`,
      message: 'It moves to Delivered now. Record any payment collected on the order page.',
      confirmLabel: 'Mark delivered'
    })) {
      return;
    }
    this.delivering.set(order.id);
    try {
      await firstValueFrom(this.ecommerce.markDelivered(order.id));
      this.notifications.push('success', `${order.orderNumber} delivered.`);
      void this.load();
    } catch (error) {
      this.notifications.push('error', toApiError(error).message);
    } finally {
      this.delivering.set(null);
    }
  }

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
