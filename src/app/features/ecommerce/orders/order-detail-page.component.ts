import { displayDate } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
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
import { CustomerPreview, OrderDetail, OrderUpdateRequest } from '../models/ecommerce.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { OrderAddressDialogComponent } from './order-address-dialog.component';
import { BuildingLinkDialogComponent, BuildingLinkFn } from '../../geo/components/building-link-dialog.component';
import { GeoBuildingPreview } from '../../geo/models/geo.models';
import { DoorDetailsComponent } from '../../geo/components/door-details.component';
import { DoorDetailsDialogComponent, DoorDetailsSaveFn } from '../../geo/components/door-details-dialog.component';

import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';

import { GeoContextComponent } from '../../geo/components/geo-context.component';
@Component({
  selector: 'app-order-detail-page',
  standalone: true,
  imports: [RouterLink, GeoContextComponent, BuildingLinkDialogComponent, DoorDetailsComponent, DoorDetailsDialogComponent, OrderAddressDialogComponent, ReactiveFormsModule, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent, ErrorCardComponent, PermissionGateComponent, EntityPickerComponent, FormFeedbackDirective, BackLinkComponent,
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
              @if (order()?.customerId) {
                <app-permission-gate [permissions]="['CHAT_ADMIN_WRITE']">
                  <button type="button" class="btn btn-secondary" [disabled]="chatLauncher.opening()" (click)="messageCustomer()">
                    Message customer
                  </button>
                </app-permission-gate>
              }
              @if (order()?.customerId) {
                <!-- Same items for the same customer, at today's prices, through the phone-order screen. -->
                <app-permission-gate [permissions]="['ORDER_CREATE_FOR_OTHERS']">
                  <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomPhoneOrder(order()!.customerId!)"
                     [queryParams]="{ reorder: order()!.id }">Reorder</a>
                </app-permission-gate>
              }
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
                    <!--
                      No saved address: the order was placed with directions only
                      (usually by phone). Show them, and let the rider record the
                      real address once they have been there.
                    -->
                    @if (order()?.deliverAddress) {
                      <strong>{{ formatAddress(order()?.deliverAddress) }}</strong>
                    } @else {
                      <strong>{{ order()?.deliveryFullAddress || 'No address — call the customer for directions' }}</strong>
                      @if (order()?.deliveryMethod === 'HOME_DELIVERY') {
                        <app-permission-gate [permissions]="['DELIVERY_ADDRESS_WRITE_ALL']">
                          <button type="button" class="btn btn-secondary btn-sm" (click)="addingAddress.set(true)">Add address</button>
                        </app-permission-gate>
                      }
                    }
                    @if (order()?.deliverAddress?.isVerified) {
                      <span class="verified-chip">✓ Verified</span>
                    }
                  </div>
                  <!-- For the rider: which area, what is near, and the way there. -->
                  @if (order()?.deliverAddress; as address) {
                    <app-geo-context [geo]="address.geo" [latitude]="address.latitude" [longitude]="address.longitude"
                                     [canLink]="canLinkBuilding()" (linkCandidate)="openLink($event)" />
                    <app-door-details [door]="address.door" />
                  }
                  <!--
                    Customers often give no pin. Once the rider has been there, they
                    say which building it was, and the next order knows the way.
                  -->
                  @if (canLinkBuilding()) {
                    <app-permission-gate [permissions]="['DELIVERY_ADDRESS_WRITE_ALL']">
                      <span class="door-actions">
                        <button type="button" class="btn btn-secondary btn-sm" (click)="editingDoor.set(true)">
                          {{ order()?.deliverAddress?.door ? 'Edit door details' : 'Add door details' }}
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" (click)="openLink(null)">
                          {{ order()?.deliverAddress?.geo?.building ? 'Change building' : 'Link to a building' }}
                        </button>
                      </span>
                    </app-permission-gate>
                  }
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
                <div><span class="muted">Paid so far</span><strong>{{ formatMoney(order()?.amountPaid) }}</strong></div>
                <div><span class="muted">Still owed</span><strong>{{ formatMoney(order()?.balanceDue) }}</strong></div>
                @if (order()?.paymentMethod === 'PARTIAL_PAYMENT') {
                  <div><span class="muted">Down payment</span><strong>{{ formatMoney(order()?.minDownPayment) }}</strong></div>
                  <div><span class="muted">Balance due by</span><strong>{{ formatDate(order()?.balanceDueDate) }}</strong></div>
                }
              </div>
            </article>
          </section>

          @if (order()?.deliveryMethod === 'HOME_DELIVERY') {
            <article class="panel subcard">
              <p class="eyebrow">Rider</p>
              <div class="rider">
                @if (order()?.assignedRiderName) {
                  <span><strong>{{ order()?.assignedRiderName }}</strong>
                    @if (order()?.assignedRiderPhone) { · <a [href]="'tel:' + order()?.assignedRiderPhone">{{ order()?.assignedRiderPhone }}</a> }
                    <span class="muted"> · since {{ formatDate(order()?.assignedAt) }}</span></span>
                } @else {
                  <span class="muted">Not assigned yet</span>
                }
                @if (order()?.deliveredByName) {
                  <span class="muted">Delivered by {{ order()?.deliveredByName }}, {{ formatDate(order()?.deliveredAt) }}</span>
                }
              </div>
              @if (canAssign()) {
                <div class="rider-assign">
                  <select [value]="order()?.assignedRiderId ?? ''" (change)="assign($any($event.target).value)" [disabled]="assigning()"
                          aria-label="Assign a rider">
                    <option value="">No rider</option>
                    @for (rider of riders(); track rider.id) {
                      <option [value]="rider.id">{{ riderName(rider) }}</option>
                    }
                  </select>
                </div>
              } @else if (canTake()) {
                <button type="button" class="btn btn-primary btn-sm" [disabled]="assigning()" (click)="take()">
                  {{ assigning() ? 'Taking...' : 'Take this delivery' }}
                </button>
              }
              @if (riderError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
            </article>
          }

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
                <!-- Only what the server will accept from this user, for this order, now. -->
                @if (order()?.allowedStatuses?.length) {
                  <label class="field">
                    <span>Move to</span>
                    <select formControlName="status">
                      <option value="">No change</option>
                      @for (status of order()?.allowedStatuses || []; track status) {
                        <option [value]="status">{{ status | humanLabel }}</option>
                      }
                    </select>
                  </label>
                }
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

          @if (order()?.canCollectPayment && order()?.paymentMethod === 'PARTIAL_PAYMENT') {
            <article class="panel subcard">
              <p class="eyebrow">Record an instalment</p>
              <form [formGroup]="partialForm" appFormFeedback (ngSubmit)="recordInstalment()">
                <div class="grid-auto">
                  <label class="field">
                    <span>How</span>
                    <select formControlName="method">
                      <option value="CASH">Cash</option>
                      <option value="MPESA">M-Pesa (link a received payment)</option>
                    </select>
                  </label>
                  @if (partialForm.controls.method.value === 'CASH') {
                    <label class="field"><span>Amount</span><input type="number" step="0.01" min="0" formControlName="amountCollected"></label>
                    <label class="field"><span>Change given</span><input type="number" step="0.01" min="0" formControlName="changeGiven"></label>
                  } @else {
                    <label class="field">
                      <span>Payment</span>
                      <app-entity-picker [config]="pickers.unlinkedPayment" formControlName="mpesaPaymentId" placeholder="Search unlinked payments" />
                    </label>
                    <label class="field"><span>M-Pesa receipt</span><input formControlName="mpesaReceiptNumber"></label>
                  }
                </div>
                <p class="hint">Still owed: KES {{ formatMoney(order()?.balanceDue) }}. The order goes out once the down payment is in.</p>
                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="collecting()">{{ collecting() ? 'Recording...' : 'Record instalment' }}</button>
                </div>
              </form>
            </article>
          }

          @if (order()?.canCollectPayment && order()?.paymentMethod !== 'PARTIAL_PAYMENT') {
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
          }

          @if (collectError(); as apiError) {
            <app-error-card title="Unable to record payment" [message]="apiError.message" [details]="apiError.details" />
          }

          @if (order()?.canCancel) {
          <article class="panel subcard">
            <p class="eyebrow">Cancel order</p>
            <form class="cancel-form" [formGroup]="cancelForm" appFormFeedback (ngSubmit)="cancel()">
              <label class="field">
                <span>Reason</span>
                <textarea formControlName="reason" rows="3" placeholder="Why is this order being cancelled?"></textarea>
              </label>
              <div class="button-row">
                <button type="submit" class="btn btn-danger-solid" [disabled]="mutating() || !cancelForm.getRawValue().reason.trim()">
                  {{ mutating() ? 'Working...' : 'Cancel order' }}
                </button>
              </div>
            </form>
          </article>
          }
        </app-section-card>
      } @else {
        <app-empty-state title="No order selected" description="Choose an order from the list to view its detail." />
      }
    </section>
  
    @if (editingDoor() && order(); as current) {
      <app-door-details-dialog [door]="current.deliverAddress?.door" [buildingName]="current.deliverAddress?.geo?.building?.name"
                               [save]="saveDoor" (saved)="editingDoor.set(false)" (closed)="editingDoor.set(false)"
                               (chooseBuilding)="editingDoor.set(false); openLink(null)" />
    }

    @if (linkingBuilding() && order(); as current) {
      <app-building-link-dialog [start]="pinOf(current)" [initialUnit]="current.deliverAddress?.unitNumber ?? null"
                                [suggested]="suggestedBuilding()" [link]="linkToOrder"
                                (linked)="linkingBuilding.set(false)" (closed)="linkingBuilding.set(false)" />
    }

    @if (addingAddress() && order(); as current) {
      <app-order-address-dialog [orderId]="current.id" [contactPhone]="current.deliveryContactPhone || current.customerPhone || null"
                                [description]="current.deliveryFullAddress || null"
                                (attached)="onAddressAttached($event)" (closed)="addingAddress.set(false)" />
    }
  `,
  styles: [`
    .door-actions { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; }
    .rider { display: grid; gap: 0.25rem; margin-bottom: 0.5rem; }
    .rider-assign select { max-width: 20rem; }
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 1rem;
    }

    .subcard {
      padding: 1rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
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
  readonly RoutePaths = RoutePaths;
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
  readonly addingAddress = signal(false);

  readonly linkingBuilding = signal(false);

  /** Home delivery that actually went (or is going) out: before or after delivery both make sense. */
  canLinkBuilding(): boolean {
    const order = this.order();
    return !!order && order.deliveryMethod === 'HOME_DELIVERY'
      && !['CANCELLED', 'REFUNDED', 'PAYMENT_TIMEOUT', 'PAYMENT_FAILED'].includes(order.status ?? '');
  }

  readonly suggestedBuilding = signal<GeoBuildingPreview | null>(null);
  readonly editingDoor = signal(false);

  readonly saveDoor: DoorDetailsSaveFn = async (request) => {
    const order = this.order();
    if (order) {
      this.order.set(await firstValueFrom(this.commerceService.saveOrderDoorDetails(order.id, request)));
    }
  };

  /** Opens the picker, with the address's nearest building chosen when that was what was tapped. */
  openLink(candidate: { id: string; name: string; code?: string | null; buildingType?: string | null; distanceMeters?: number | null } | null): void {
    this.suggestedBuilding.set(candidate ? { ...candidate } : null);
    this.linkingBuilding.set(true);
  }

  pinOf(order: OrderDetail): { lat: number; lng: number } | null {
    const address = order.deliverAddress;
    return address?.latitude != null && address?.longitude != null
      ? { lat: Number(address.latitude), lng: Number(address.longitude) }
      : null;
  }

  /** Linking from an order also gives a directions-only order an address. */
  readonly linkToOrder: BuildingLinkFn = async (geoBuildingId, unitNumber) => {
    const order = this.order();
    if (order) {
      this.order.set(await firstValueFrom(this.commerceService.linkOrderGeoBuilding(order.id, { geoBuildingId, unitNumber })));
    }
  };

  onAddressAttached(order: OrderDetail): void {
    this.addingAddress.set(false);
    this.order.set(order);
  }
  readonly chatLauncher = inject(ChatLauncherService);
  private readonly chat = inject(ChatService);

  messageCustomer(): void {
    const order = this.order();
    if (order?.customerId) {
      void this.chatLauncher.open(this.chat.openShopAsAdmin(order.customerId, order.id));
    }
  }

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

  readonly partialForm = this.formBuilder.group({
    method: 'CASH' as 'CASH' | 'MPESA',
    amountCollected: [null as number | null, [Validators.min(0)]],
    changeGiven: [null as number | null, [Validators.min(0)]],
    mpesaPaymentId: [null as number | null],
    mpesaReceiptNumber: ''
  });

  async recordInstalment(): Promise<void> {
    const orderId = this.order()?.id;
    if (!orderId) {
      return;
    }
    const v = this.partialForm.getRawValue();
    if (v.method === 'CASH' && !v.amountCollected) {
      this.collectError.set({ message: 'Enter the amount collected.' } as ApiError);
      return;
    }
    if (v.method === 'MPESA' && !v.mpesaPaymentId) {
      this.collectError.set({ message: 'Choose the M-Pesa payment to link.' } as ApiError);
      return;
    }
    this.collecting.set(true);
    this.collectError.set(null);
    try {
      this.order.set(await firstValueFrom(this.ecommerceService.recordPartialPayment(orderId, {
        method: v.method,
        amountCollected: v.method === 'CASH' ? v.amountCollected : null,
        changeGiven: v.method === 'CASH' ? v.changeGiven : null,
        mpesaPaymentId: v.method === 'MPESA' ? v.mpesaPaymentId : null,
        mpesaReceiptNumber: v.method === 'MPESA' ? (v.mpesaReceiptNumber.trim() || null) : null
      })));
      this.partialForm.reset({ method: 'CASH', amountCollected: null, changeGiven: null, mpesaPaymentId: null, mpesaReceiptNumber: '' });
    } catch (error) {
      this.collectError.set(toApiError(error));
    } finally {
      this.collecting.set(false);
    }
  }

  // ── Rider ────────────────────────────────────────────────────────────

  private readonly activeContext = inject(ActiveContextService);
  readonly riders = signal<CustomerPreview[]>([]);
  readonly assigning = signal(false);
  readonly riderError = signal<string | null>(null);

  /** Admins assign; nobody assigns a delivery that is over. */
  readonly canAssign = computed(() => this.activeContext.can('ORDER_ASSIGN') && this.isLiveDelivery());
  /** A rider takes an unassigned delivery; admins assign instead. */
  readonly canTake = computed(() => !this.activeContext.can('ORDER_ASSIGN') && this.activeContext.can('ORDER_UPDATE')
    && !this.order()?.assignedRiderId && this.isLiveDelivery());

  private isLiveDelivery(): boolean {
    const status = this.order()?.status ?? '';
    return this.order()?.deliveryMethod === 'HOME_DELIVERY'
      && !['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(status);
  }

  private async loadRiders(): Promise<void> {
    if (!this.activeContext.can('ORDER_ASSIGN') || this.riders().length > 0) {
      return;
    }
    try {
      this.riders.set((await firstValueFrom(this.ecommerceService.getRiders({ page: 0, size: 100 }))).items);
    } catch {
      this.riders.set([]);
    }
  }

  riderName(rider: CustomerPreview): string {
    return [rider.firstName, rider.lastName].filter(Boolean).join(' ') || rider.phoneNumber || `Rider #${rider.id}`;
  }

  async assign(value: string): Promise<void> {
    const order = this.order();
    if (!order) {
      return;
    }
    this.assigning.set(true);
    this.riderError.set(null);
    try {
      this.order.set(await firstValueFrom(this.ecommerceService.assignRider(order.id, value ? Number(value) : null)));
    } catch (error) {
      this.riderError.set(toApiError(error).message);
    } finally {
      this.assigning.set(false);
    }
  }

  async take(): Promise<void> {
    const order = this.order();
    if (!order) {
      return;
    }
    this.assigning.set(true);
    this.riderError.set(null);
    try {
      this.order.set(await firstValueFrom(this.ecommerceService.takeDelivery(order.id)));
    } catch (error) {
      this.riderError.set(toApiError(error).message);
    } finally {
      this.assigning.set(false);
    }
  }

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
      void this.loadRiders();
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
      address.address?.estateArea,
      address.address?.town ?? address.town,
      address.address?.county ?? address.county
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
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
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
