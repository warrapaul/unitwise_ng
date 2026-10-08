import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../../ecommerce/ecommerce.service';
import { CommerceService } from '../../ecommerce/commerce.service';
import { OrderDetail, OrderItem } from '../../ecommerce/models/ecommerce.models';
import { MpesaTillInstructions, PaymentStatus } from '../../ecommerce/models/commerce.models';
import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';
import { ShopBarComponent } from '../components/shop-bar.component';
import { ksh, orderStatus } from '../shop-format';

const CANCELLABLE = new Set(['WAITING_PAYMENT_CONFIRMATION', 'PAID', 'PROCESSING']);
const AWAITING_PAYMENT = new Set(['WAITING_PAYMENT_CONFIRMATION', 'PAYMENT_FAILED', 'PAYMENT_TIMEOUT']);
const STOPPED = new Set(['CANCELLED', 'REFUNDED', 'PAYMENT_FAILED', 'PAYMENT_TIMEOUT']);
/** How often, and for how long, to look for the M-Pesa result after the prompt is sent. */
const POLL_MS = 5000;
const POLL_TRIES = 24;

/**
 * One order, from the shopper's side: where it is on its way, what is in it, where
 * it is going — and, while an M-Pesa order is unpaid, everything needed to finish
 * paying: the prompt again, the paybill to pay by hand, or the code from the SMS.
 */
@Component({
  selector: 'app-my-order-detail-page',
  standalone: true,
  imports: [FormsModule, RouterLink, LoadingStateComponent, ErrorStateComponent, BackLinkComponent, ShopBarComponent],
  template: `
    <section class="shop">
      <app-shop-bar />
      <app-back-link [to]="RoutePaths.myOrders" label="My orders" />

      @if (loading()) {
        <app-loading-state label="Loading your order..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (order(); as o) {
        @if (placed()) {
          <div class="thanks" role="status">
            <strong>Thank you — your order is placed.</strong>
            <span>{{ placed() === 'sent' && awaitingPayment() ? 'Check your phone and enter your M-Pesa PIN to pay.' : 'We\\'ll keep you posted as it moves.' }}</span>
          </div>
        }

        <header class="head">
          <div>
            <h1>Order <span class="mono">{{ o.orderNumber }}</span></h1>
            <span class="muted">Placed {{ dateTime(o.createdAt) }}</span>
          </div>
          <span [class]="'status-chip status-chip--' + status().tone">{{ status().label }}</span>
        </header>

        @if (!stopped()) {
          <ol class="track" aria-label="Order progress">
            @for (step of track(); track step.label; let i = $index) {
              <li [class.track--done]="i < trackAt()" [class.track--now]="i === trackAt()">
                <span class="track__dot" aria-hidden="true">{{ i < trackAt() ? '✓' : i + 1 }}</span>
                <span>{{ step.label }}</span>
              </li>
            }
          </ol>
        }

        <!-- ─── Finish paying ─── -->
        @if (awaitingPayment() && o.paymentMethod === 'MPESA') {
          <section class="pay" aria-labelledby="pay-title">
            <h2 id="pay-title">Complete your payment · {{ ksh(o.totalAmount) }}</h2>
            @if (polling()) {
              <p class="pay__wait"><span class="spinner" aria-hidden="true"></span> Waiting for M-Pesa to confirm…</p>
            } @else if (payment()?.failureReason) {
              <p class="error-text">{{ payment()?.failureReason }}</p>
            } @else {
              <p class="muted">Not paid yet. Choose how to finish.</p>
            }
            <div class="pay__ways">
              <button type="button" class="btn btn-primary" [disabled]="prompting()" (click)="resendPrompt()">
                {{ prompting() ? 'Sending...' : 'Send M-Pesa prompt' }}
              </button>
              <button type="button" class="btn btn-secondary" [disabled]="loadingTill()" (click)="showTill()">
                {{ loadingTill() ? 'Loading...' : 'Pay with paybill instead' }}
              </button>
            </div>

            @if (till(); as t) {
              <dl class="till">
                <div><dt>{{ t.method === 'TILL' ? 'Till number' : 'Paybill' }}</dt><dd class="mono">{{ t.payableNumber }}</dd>
                  <button type="button" class="link-button" (click)="copy(t.payableNumber)">Copy</button></div>
                @if (t.accountReference) {
                  <div><dt>Account</dt><dd class="mono">{{ t.accountReference }}</dd>
                    <button type="button" class="link-button" (click)="copy(t.accountReference)">Copy</button></div>
                }
                <div><dt>Amount</dt><dd>{{ ksh(t.amount ?? o.totalAmount) }}</dd></div>
              </dl>
            }

            <form class="code" (submit)="$event.preventDefault(); confirmCode()">
              <label class="field">
                <span>Already paid? Enter the M-Pesa code from your SMS</span>
                <span class="code__row">
                  <input name="code" [(ngModel)]="code" class="mono" placeholder="e.g. SGH4K2L9PQ" maxlength="20" autocomplete="off">
                  <button type="submit" class="btn btn-secondary" [disabled]="confirming() || !code.trim()">
                    {{ confirming() ? 'Checking...' : 'Confirm' }}
                  </button>
                </span>
              </label>
              @if (codeMessage(); as message) { <p [class]="codeOk() ? 'success-text' : 'error-text'" role="status">{{ message }}</p> }
            </form>
          </section>
        }

        <div class="layout">
          <section class="card">
            <h2>Items</h2>
            <ul class="items">
              @for (item of o.items ?? []; track item.id) {
                <li>
                  <span class="items__img">
                    @if (item.productImageUrlSnapshot) { <img [src]="item.productImageUrlSnapshot" alt="" width="56" height="56"> }
                  </span>
                  <span class="items__name">
                    <a [routerLink]="RoutePaths.shopProduct(item.productIdSnapshot!)">{{ item.productNameSnapshot || item.displayName }}</a>
                    @if (variant(item); as v) { <small class="muted">{{ v }}</small> }
                    <small class="muted">{{ item.quantity }} × {{ ksh(item.unitPrice) }}</small>
                  </span>
                  <strong>{{ ksh(item.subtotal) }}</strong>
                </li>
              }
            </ul>
            <dl class="sums">
              <div><dt>Subtotal</dt><dd>{{ ksh(o.subtotal) }}</dd></div>
              @if (+(o.discountAmount ?? 0) > 0) { <div class="saving"><dt>Discount</dt><dd>−{{ ksh(o.discountAmount) }}</dd></div> }
              <div><dt>Delivery</dt><dd>{{ +(o.deliveryFee ?? 0) > 0 ? ksh(o.deliveryFee) : 'Free' }}</dd></div>
              <div class="sums__total"><dt>Total</dt><dd>{{ ksh(o.totalAmount) }}</dd></div>
            </dl>
          </section>

          <div class="side">
            <section class="card">
              <h2>{{ o.deliveryMethod === 'PICK_AT_STORE' ? 'Pickup' : 'Delivery' }}</h2>
              <p>{{ o.deliveryFullAddress || (o.deliveryMethod === 'PICK_AT_STORE' ? 'At the store' : 'The rider will call you for directions') }}</p>
              @if (o.deliveryContactPhone) { <p class="muted">Contact: <span class="mono">{{ o.deliveryContactPhone }}</span></p> }
              @if (o.deliveryInstructions) { <p class="muted">“{{ o.deliveryInstructions }}”</p> }
            </section>
            <section class="card">
              <h2>Payment</h2>
              <p>{{ o.paymentMethod === 'PAY_ON_DELIVERY' ? 'Pay on delivery' : 'M-Pesa' }}
                · <strong>{{ paid() ? 'Paid' : 'Not paid yet' }}</strong></p>
              @if (payment()?.mpesaReceiptNumber) { <p class="muted">Receipt <span class="mono">{{ payment()?.mpesaReceiptNumber }}</span></p> }
            </section>
            <section class="card actions">
              <button type="button" class="btn btn-secondary" [disabled]="chatLauncher.opening()" (click)="ask(o.id)">Ask about this order</button>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.shop">Shop again</a>
              @if (canCancel()) {
                <button type="button" class="btn btn-danger" [disabled]="cancelling()" (click)="cancel()">
                  {{ cancelling() ? 'Cancelling...' : 'Cancel order' }}
                </button>
              }
            </section>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .shop { display: grid; gap: 1rem; }
    .thanks { display: grid; gap: 0.2rem; padding: 0.9rem 1.1rem; border-radius: 14px; background: var(--success-tint); border-left: 4px solid var(--success); }
    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; }
    .head h1 { margin: 0; font-size: 1.4rem; }
    .track { margin: 0; padding: 0.9rem 1rem; list-style: none; display: flex; gap: 0.5rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); overflow-x: auto; }
    .track li { flex: 1; min-width: 6.5rem; display: grid; justify-items: center; gap: 0.35rem; text-align: center; font-size: 0.82rem; color: var(--text-muted); position: relative; }
    .track li:not(:last-child)::after { content: ''; position: absolute; top: 0.85rem; left: calc(50% + 1.1rem); right: calc(-50% + 1.1rem); height: 2px; background: var(--border); }
    .track--done:not(:last-child)::after { background: var(--primary) !important; }
    .track__dot { width: 1.75rem; height: 1.75rem; display: grid; place-items: center; border-radius: 50%; border: 2px solid var(--border-strong); background: var(--surface); font-weight: 700; }
    .track--done .track__dot { background: var(--primary); border-color: var(--primary); color: var(--on-accent); }
    .track--now { color: var(--text); font-weight: 700; }
    .track--now .track__dot { border-color: var(--primary); color: var(--primary-strong); }
    .pay { display: grid; gap: 0.75rem; padding: 1.15rem 1.25rem; border: 2px solid var(--primary); border-radius: 18px; background: var(--surface); }
    .pay h2 { margin: 0; font-size: 1.1rem; }
    .pay p { margin: 0; }
    .pay__wait { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
    .spinner { width: 1rem; height: 1rem; border: 2px solid var(--primary-soft); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .pay__ways { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .till { margin: 0; display: grid; gap: 0.35rem; padding: 0.75rem 0.9rem; border-radius: 12px; background: var(--surface-2); max-width: 26rem; }
    .till div { display: flex; align-items: baseline; gap: 0.75rem; }
    .till dt { flex: 0 0 6.5rem; color: var(--text-muted); font-size: 0.85rem; }
    .till dd { margin: 0; font-weight: 700; margin-right: auto; }
    .code__row { display: flex; gap: 0.5rem; max-width: 26rem; }
    .code__row input { flex: 1; text-transform: uppercase; }
    .success-text { color: var(--success); font-weight: 600; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: 1rem; align-items: start; }
    .side { display: grid; gap: 1rem; }
    .card { display: grid; gap: 0.6rem; padding: 1.1rem 1.2rem; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
    .card h2 { margin: 0; font-size: 1.05rem; }
    .card p { margin: 0; }
    .items { margin: 0; padding: 0; list-style: none; display: grid; }
    .items li { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid var(--border); }
    .items__img { width: 3.5rem; height: 3.5rem; border-radius: 10px; overflow: hidden; background: var(--surface-2); }
    .items__img img { width: 100%; height: 100%; object-fit: cover; }
    .items__name { display: grid; gap: 0.1rem; min-width: 0; }
    .items__name a { color: var(--text); font-weight: 600; text-decoration: none; }
    .sums { margin: 0; display: grid; gap: 0.35rem; }
    .sums div { display: flex; justify-content: space-between; }
    .sums dt { color: var(--text-muted); }
    .sums dd { margin: 0; font-variant-numeric: tabular-nums; }
    .saving dd { color: var(--success); }
    .sums__total { padding-top: 0.5rem; border-top: 1px solid var(--border); }
    .sums__total dt, .sums__total dd { color: var(--text); font-weight: 700; font-size: 1.1rem; }
    .actions .btn { justify-content: center; }
    .link-button { padding: 0; border: 0; background: none; font: inherit; font-size: 0.85rem; font-weight: 600; color: var(--primary-strong); cursor: pointer; }
    @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyOrderDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly ksh = ksh;

  readonly id = input.required<string>();
  /** `?placed=sent|manual|none` — just placed from checkout, and whether the prompt went out. */
  readonly placed = input<string | undefined>();

  private readonly ecommerce = inject(EcommerceService);
  private readonly commerce = inject(CommerceService);
  private readonly session = inject(AuthSessionService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  readonly chatLauncher = inject(ChatLauncherService);
  private readonly chat = inject(ChatService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly order = signal<OrderDetail | null>(null);
  readonly payment = signal<PaymentStatus | null>(null);
  readonly polling = signal(false);
  readonly prompting = signal(false);
  readonly till = signal<MpesaTillInstructions | null>(null);
  readonly loadingTill = signal(false);
  readonly confirming = signal(false);
  readonly codeMessage = signal<string | null>(null);
  readonly codeOk = signal(false);
  readonly cancelling = signal(false);
  code = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly status = computed(() => orderStatus(this.order()?.status));
  readonly stopped = computed(() => STOPPED.has(String(this.order()?.status)));
  readonly paid = computed(() => this.payment()?.paymentStatus === 'COMPLETED'
    || (!!this.order()?.status && !AWAITING_PAYMENT.has(String(this.order()?.status)) && this.order()?.paymentMethod === 'MPESA'));
  readonly awaitingPayment = computed(() => AWAITING_PAYMENT.has(String(this.order()?.status)) && !this.paid());

  readonly canCancel = computed(() => {
    const o = this.order();
    return !!o && CANCELLABLE.has(String(o.status)) && this.session.canActOnOwn(PermissionConstants.ORDER_CANCEL_ALL, o.customerId);
  });

  /** The steps this order goes through, which depend on how it is paid and received. */
  readonly track = computed(() => {
    const o = this.order();
    const steps = [{ label: 'Placed' }];
    if (o?.paymentMethod === 'MPESA') {
      steps.push({ label: 'Paid' });
    }
    steps.push({ label: 'Being prepared' });
    steps.push(o?.deliveryMethod === 'PICK_AT_STORE' ? { label: 'Ready for pickup' } : { label: 'Out for delivery' });
    steps.push({ label: o?.deliveryMethod === 'PICK_AT_STORE' ? 'Collected' : 'Delivered' });
    return steps;
  });

  readonly trackAt = computed(() => {
    const o = this.order();
    const mpesa = o?.paymentMethod === 'MPESA';
    const offset = mpesa ? 1 : 0;
    switch (o?.status) {
      case 'WAITING_PAYMENT_CONFIRMATION':
      case 'WAITING_PAYMENT_COMPLETION': return mpesa ? 1 : 0;
      case 'PAID': return 2;
      case 'PROCESSING': return 1 + offset;
      case 'READY_FOR_PICKUP':
      case 'OUT_FOR_DELIVERY': return 2 + offset;
      case 'DELIVERED':
      case 'COMPLETED': return this.track().length;
      default: return 0;
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  ngOnInit(): void {
    void this.reload().then(() => {
      if (this.placed() === 'sent' && this.awaitingPayment()) {
        this.startPolling();
      }
    });
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      this.order.set(await firstValueFrom(this.ecommerce.getOrder(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
    await this.refreshPayment();
  }

  private async refreshPayment(): Promise<void> {
    try {
      this.payment.set(await firstValueFrom(this.commerce.getPaymentStatusForOrder(Number(this.id()))));
    } catch {
      this.payment.set(null);
    }
  }

  /** Look for the M-Pesa result for a while after the prompt; stop as soon as it settles. */
  private startPolling(): void {
    this.stopPolling();
    this.polling.set(true);
    let tries = 0;
    this.pollTimer = setInterval(async () => {
      tries += 1;
      await this.refreshPayment();
      const status = this.payment()?.paymentStatus;
      if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' || tries >= POLL_TRIES) {
        this.stopPolling();
        if (status === 'COMPLETED') {
          this.notifications.push('success', 'Payment received. Thank you!');
          this.order.set(await firstValueFrom(this.ecommerce.getOrder(Number(this.id()))));
        }
      }
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.polling.set(false);
  }

  async resendPrompt(): Promise<void> {
    this.prompting.set(true);
    try {
      const result = await firstValueFrom(this.commerce.initiateOrderMpesa(Number(this.id())));
      if (result.outcome === 'STK_PUSH_SENT') {
        this.notifications.push('success', 'Prompt sent — check your phone.');
        this.startPolling();
      } else {
        this.till.set(result.tillInstructions ?? null);
        this.notifications.push('info', result.message || 'Pay with the paybill details below.');
      }
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.prompting.set(false);
    }
  }

  async showTill(): Promise<void> {
    this.loadingTill.set(true);
    try {
      this.till.set(await firstValueFrom(this.commerce.getOrderTillInstructions(Number(this.id()))));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.loadingTill.set(false);
    }
  }

  async confirmCode(): Promise<void> {
    const receipt = this.code.trim().toUpperCase();
    if (!receipt) {
      return;
    }
    this.confirming.set(true);
    this.codeMessage.set(null);
    try {
      const result = await firstValueFrom(this.commerce.confirmOrderMpesaCode(Number(this.id()), { mpesaReceiptNumber: receipt }));
      this.codeOk.set(result.outcome === 'SETTLED' || result.outcome === 'ALREADY_SETTLED');
      this.codeMessage.set(result.message || (this.codeOk() ? 'Payment confirmed.' : 'We could not find that payment yet.'));
      if (result.outcome === 'VERIFICATION_PENDING') {
        this.startPolling();
      }
      if (this.codeOk()) {
        await this.reload();
      }
    } catch (error) {
      this.codeOk.set(false);
      this.codeMessage.set(extractErrorMessage(error));
    } finally {
      this.confirming.set(false);
    }
  }

  async cancel(): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Cancel this order?',
      confirmLabel: 'Cancel order',
      destructive: true,
      reason: { label: 'Why are you cancelling?', required: true, maxLength: 500, hint: 'The shop reads this.' }
    });
    if (reason === null) {
      return;
    }
    this.cancelling.set(true);
    try {
      this.order.set(await firstValueFrom(this.ecommerce.cancelOrder(Number(this.id()), { reason: reason.trim() })));
      this.stopPolling();
      this.notifications.push('success', 'Order cancelled.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.cancelling.set(false);
    }
  }

  ask(orderId: number): void {
    void this.chatLauncher.open(this.chat.openShopAsCustomer(orderId));
  }

  async copy(value: string | null | undefined): Promise<void> {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      this.notifications.push('success', 'Copied.');
    } catch {
      this.notifications.push('error', 'Could not copy — select it instead.');
    }
  }

  variant(item: OrderItem): string | null {
    return [item.variantColorSnapshot, item.variantSizeSnapshot, item.variantMaterialSnapshot].filter(Boolean).join(' · ') || null;
  }

  dateTime(value?: string | null): string {
    return value ? displayDateTime(value) : '';
  }
}
