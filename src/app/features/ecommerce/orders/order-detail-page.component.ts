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
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { BuildingLinkDialogComponent, BuildingLinkFn } from '../../geo/components/building-link-dialog.component';
import { GeoBuildingPreview } from '../../geo/models/geo.models';
import { DoorDetailsComponent } from '../../geo/components/door-details.component';
import { DoorDetailsDialogComponent, DoorDetailsSaveFn } from '../../geo/components/door-details-dialog.component';

import { ChatLauncherService } from '../../chat/chat-launcher.service';
import { ChatService } from '../../chat/chat.service';

import { GeoContextComponent } from '../../geo/components/geo-context.component';
interface PaymentLogEntry {
  key: string;
  label: string;
  amount: number | string | null | undefined;
  /** Counted towards what is paid: collected cash, a completed M-Pesa payment. */
  counted: boolean;
  status: string;
  reference: string | null;
  by: string | null;
  at: string | null;
  notes: string | null;
}

@Component({
  selector: 'app-order-detail-page',
  standalone: true,
  imports: [RouterLink, DialogComponent, GeoContextComponent, BuildingLinkDialogComponent, DoorDetailsComponent, DoorDetailsDialogComponent, OrderAddressDialogComponent, ReactiveFormsModule, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent, ErrorCardComponent, PermissionGateComponent, EntityPickerComponent, FormFeedbackDirective, BackLinkComponent,
    HumanLabelPipe],
  template: `
    <section class="stack">
      <app-back-link [to]="'/admin/ecommerce/orders'" label="Back to orders" />
      @if (loading() && !order()) {
        <app-loading-state label="Loading order..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load order'" (retry)="reload()" />
      } @else if (order(); as o) {
        <app-section-card [title]="o.orderNumber || 'Order detail'" [subtitle]="o.customerName || null">
          <ng-container actions>
            <div class="detail-actions">
              <app-permission-gate [permissions]="[Permissions.ORDER_UPDATE]">
                <button type="button" class="btn btn-primary" (click)="openUpdate()">Update order</button>
              </app-permission-gate>
              @if (o.canCollectPayment) {
                <button type="button" class="btn btn-secondary" (click)="openPayment()">Record payment</button>
              }
              @if (o.customerId) {
                <app-permission-gate [permissions]="['CHAT_ADMIN_WRITE']">
                  <button type="button" class="btn btn-secondary" [disabled]="chatLauncher.opening()" (click)="messageCustomer()">
                    Message customer
                  </button>
                </app-permission-gate>
                <!-- Same items for the same customer, at today's prices, through the phone-order screen. -->
                <app-permission-gate [permissions]="['ORDER_CREATE_FOR_OTHERS']">
                  <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomPhoneOrder(o.customerId!)"
                     [queryParams]="{ reorder: o.id }">Reorder</a>
                </app-permission-gate>
              }
              <button type="button" class="btn btn-secondary" [disabled]="loading()" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          <dl class="detail-grid">
            <div class="lead"><dt>Status</dt><dd>{{ o.status | humanLabel }}</dd></div>
            <div class="lead"><dt>Total</dt><dd>KES {{ formatMoney(o.totalAmount) }}</dd></div>
            <div><dt>Payment</dt><dd>{{ (o.payment?.paymentMethod || o.paymentMethod) | humanLabel }} · {{ (o.payment?.paymentStatus || 'PENDING') | humanLabel }}</dd></div>
            <div><dt>Still owed</dt><dd>{{ formatMoney(o.balanceDue) }}</dd></div>
            <div><dt>Delivery</dt><dd>{{ o.deliveryMethod | humanLabel }}</dd></div>
            <div><dt>Placed</dt><dd>{{ formatDate(o.createdAt) }}</dd></div>
            <div><dt>Customer</dt><dd>{{ o.customerName || '-' }}</dd></div>
            <div><dt>Phone</dt><dd>@if (o.customerPhone) { <a [href]="'tel:' + o.customerPhone">{{ o.customerPhone }}</a> } @else { - }</dd></div>
            <div><dt>Email</dt><dd>{{ o.customerEmail || '-' }}</dd></div>
          </dl>
          @if (o.notes) {
            <p class="note"><span class="muted">Notes:</span> {{ o.notes }}</p>
          }
        </app-section-card>

        <div class="layout">
          <div class="stack">
            <app-section-card title="Items" [subtitle]="itemCount(o) + (itemCount(o) === 1 ? ' item' : ' items')">
              @if (o.items?.length) {
                <div class="table-scroll">
                  <table class="table">
                    <thead>
                      <tr><th class="thumb-col"><span class="sr-only">Image</span></th><th>Product</th><th>Variant</th><th class="num">Unit</th><th class="num">Qty</th><th class="num">Subtotal</th></tr>
                    </thead>
                    <tbody>
                      @for (item of o.items || []; track item.id ?? item.displayName) {
                        <tr>
                          <td class="thumb-col">
                            <!-- The picture as it was when ordered, like the name and price beside it. -->
                            @if (item.productImageUrlSnapshot && !brokenImages().has(item.id ?? -1)) {
                              <img class="thumb" [src]="item.productImageUrlSnapshot" alt="" loading="lazy" (error)="markBroken(item.id)">
                            } @else {
                              <span class="thumb thumb--ph" aria-hidden="true">{{ (item.productNameSnapshot || item.displayName || '?').charAt(0) }}</span>
                            }
                          </td>
                          <td>{{ item.productNameSnapshot || item.displayName || '-' }}</td>
                          <td>{{ joinParts([item.variantColorSnapshot, item.variantSizeSnapshot], ' / ') }}</td>
                          <td class="num">{{ formatMoney(item.unitPrice) }}</td>
                          <td class="num">{{ item.quantity ?? '-' }}</td>
                          <td class="num">{{ formatMoney(item.subtotal) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="muted">No items.</p>
              }
            </app-section-card>

            <app-section-card title="Delivery">
              <div class="delivery-address">
                <div class="delivery-address__row">
                  <!--
                    No saved address: the order was placed with directions only
                    (usually by phone). Show them, and let the rider record the
                    real address once they have been there.
                  -->
                  @if (o.deliverAddress) {
                    <strong>{{ formatAddress(o.deliverAddress) }}</strong>
                  } @else {
                    <strong>{{ o.deliveryFullAddress || 'No address — call the customer for directions' }}</strong>
                    @if (o.deliveryMethod === 'HOME_DELIVERY') {
                      <app-permission-gate [permissions]="['DELIVERY_ADDRESS_WRITE_ALL']">
                        <button type="button" class="btn btn-secondary btn-sm" (click)="addingAddress.set(true)">Add address</button>
                      </app-permission-gate>
                    }
                  }
                  @if (o.deliverAddress?.isVerified) {
                    <span class="verified-chip">✓ Verified</span>
                  }
                </div>
                <!-- For the rider: which area, what is near, and the way there. -->
                @if (o.deliverAddress; as address) {
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
                        {{ o.deliverAddress?.door ? 'Edit door details' : 'Add door details' }}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" (click)="openLink(null)">
                        {{ o.deliverAddress?.geo?.building ? 'Change building' : 'Link to a building' }}
                      </button>
                    </span>
                  </app-permission-gate>
                }
              </div>
              <dl class="detail-grid">
                <div><dt>Nickname</dt><dd>{{ o.deliverAddress?.addressNickname || '-' }}</dd></div>
                <div><dt>Contact</dt><dd>{{ o.deliveryContactName || '' }} {{ o.deliverAddress?.contactPhone || o.deliveryContactPhone || '-' }}</dd></div>
                <div class="wide"><dt>Instructions</dt><dd>{{ o.deliveryInstructions || '-' }}</dd></div>
              </dl>
            </app-section-card>

            @if (o.statusHistory?.length) {
              <app-section-card title="Status history">
                <ol class="history">
                  @for (entry of o.statusHistory || []; track entry.id ?? entry.createdAt) {
                    <li>
                      <div class="history__what">
                        <strong>{{ entry.newStatus | humanLabel }}</strong>
                        @if (entry.reason) { <span>{{ entry.reason }}</span> }
                      </div>
                      <span class="muted history__who">
                        {{ entry.updatedByName || (entry.updatedBySystem ? 'System' : '-') }} · {{ formatDateTime(entry.createdAt) }}
                      </span>
                    </li>
                  }
                </ol>
              </app-section-card>
            }
          </div>

          <aside class="stack">
            <app-section-card title="Payment">
              @if (o.canCollectPayment) {
                <ng-container actions>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="openPayment()">Record</button>
                </ng-container>
              }
              <dl class="sums">
                <div><dt>Method</dt><dd>{{ (o.payment?.paymentMethod || o.paymentMethod) | humanLabel }}</dd></div>
                <div><dt>Status</dt><dd>{{ (o.payment?.paymentStatus || 'PENDING') | humanLabel }}</dd></div>
                <div class="sums__rule"><dt>Subtotal</dt><dd>{{ formatMoney(o.subtotal) }}</dd></div>
                <div><dt>Discount</dt><dd>{{ formatMoney(o.discountAmount) }}</dd></div>
                <div><dt>Tax</dt><dd>{{ formatMoney(o.taxAmount) }}</dd></div>
                <div><dt>Delivery fee</dt><dd>{{ formatMoney(o.deliveryFee) }}</dd></div>
                <div class="sums__rule sums__strong"><dt>Total</dt><dd>{{ formatMoney(o.totalAmount) }}</dd></div>
                <div><dt>Paid so far</dt><dd>{{ formatMoney(o.amountPaid) }}</dd></div>
                <div class="sums__strong"><dt>Still owed</dt><dd>{{ formatMoney(o.balanceDue) }}</dd></div>
                @if (o.paymentMethod === 'PARTIAL_PAYMENT') {
                  <div class="sums__rule"><dt>Down payment</dt><dd>{{ formatMoney(o.minDownPayment) }}</dd></div>
                  <div><dt>Balance due by</dt><dd>{{ formatDate(o.balanceDueDate) }}</dd></div>
                }
              </dl>
            </app-section-card>

            <!-- Every payment taken on this order, and who took it: the money's own history. -->
            @if (paymentLog(o).length) {
              <app-section-card title="Payments received">
                <ol class="ledger">
                  @for (entry of paymentLog(o); track entry.key) {
                    <li>
                      <div class="ledger__top">
                        <strong>{{ entry.label }}</strong>
                        <strong class="ledger__amount" [class.muted]="!entry.counted">{{ formatMoney(entry.amount) }}</strong>
                      </div>
                      <div class="ledger__meta muted">
                        @if (!entry.counted) { <span class="ledger__status">{{ entry.status | humanLabel }}</span> · }
                        @if (entry.reference) { {{ entry.reference }} · }
                        {{ entry.by || 'Automatic' }} · {{ formatDateTime(entry.at) }}
                      </div>
                      @if (entry.notes) { <div class="ledger__notes">{{ entry.notes }}</div> }
                    </li>
                  }
                </ol>
              </app-section-card>
            }

            @if (o.deliveryMethod === 'HOME_DELIVERY') {
              <app-section-card title="Rider">
                <div class="rider">
                  @if (o.assignedRiderName) {
                    <span><strong>{{ o.assignedRiderName }}</strong>
                      @if (o.assignedRiderPhone) { · <a [href]="'tel:' + o.assignedRiderPhone">{{ o.assignedRiderPhone }}</a> }</span>
                    <span class="muted">Since {{ formatDate(o.assignedAt) }}</span>
                  } @else {
                    <span class="muted">Not assigned yet</span>
                  }
                  @if (o.deliveredByName) {
                    <span class="muted">Delivered by {{ o.deliveredByName }}, {{ formatDate(o.deliveredAt) }}</span>
                  }
                </div>
                @if (canAssign()) {
                  <label class="field">
                    <span>{{ o.assignedRiderId ? 'Reassign' : 'Assign a rider' }}</span>
                    <select [value]="o.assignedRiderId ?? ''" (change)="assign($any($event.target).value)" [disabled]="assigning()">
                      <option value="">No rider</option>
                      @for (rider of riders(); track rider.id) {
                        <option [value]="rider.id">{{ riderName(rider) }}</option>
                      }
                    </select>
                  </label>
                } @else if (canTake()) {
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="assigning()" (click)="take()">
                    {{ assigning() ? 'Taking...' : 'Take this delivery' }}
                  </button>
                }
                @if (riderError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
              </app-section-card>
            }

            @if (o.canCancel) {
              <button type="button" class="btn btn-danger cancel-link" (click)="openCancel()">Cancel this order</button>
            }
          </aside>
        </div>
      } @else {
        <app-empty-state title="No order selected" description="Choose an order from the list to view its detail." />
      }
    </section>

    @if (dialog() === 'update' && order(); as o) {
      <app-dialog title="Update order" [subtitle]="o.orderNumber || null" width="36rem" (closed)="closeDialog()">
        <form id="order-update" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
          <!-- Only what the server will accept from this user, for this order, now. -->
          @if (o.allowedStatuses?.length) {
            <label class="field">
              <span>Move to</span>
              <select formControlName="status">
                <option value="">No change ({{ o.status | humanLabel }})</option>
                @for (status of o.allowedStatuses || []; track status) {
                  <option [value]="status">{{ status | humanLabel }}</option>
                }
              </select>
            </label>
          }
          <div class="grid-auto">
            <label class="field"><span>Contact name</span><input formControlName="deliveryContactName"></label>
            <label class="field"><span>Contact phone</span><input formControlName="deliveryContactPhone" inputmode="tel"></label>
          </div>
          <label class="field">
            <span>Delivery instructions</span>
            <textarea formControlName="deliveryInstructions" rows="2"></textarea>
          </label>
          <label class="field">
            <span>Notes <span class="muted">(staff only)</span></span>
            <textarea formControlName="notes" rows="2"></textarea>
          </label>
          @if (dialogError(); as apiError) {
            <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
          }
        </form>
        <div dialog-actions>
          <button type="submit" form="order-update" class="btn btn-primary" [disabled]="mutating()">{{ mutating() ? 'Saving...' : 'Save changes' }}</button>
          <button type="button" class="btn btn-secondary" (click)="closeDialog()">Close</button>
        </div>
      </app-dialog>
    }

    @if (dialog() === 'payment' && order(); as o) {
      <app-dialog [title]="o.paymentMethod === 'PARTIAL_PAYMENT' ? 'Record an instalment' : 'Record payment'"
                  [subtitle]="'Still owed: KES ' + formatMoney(o.balanceDue)" width="34rem" (closed)="closeDialog()">
        @if (o.paymentMethod === 'PARTIAL_PAYMENT') {
          <form id="order-payment" class="stack" [formGroup]="partialForm" appFormFeedback (ngSubmit)="recordInstalment()">
            <div class="tabs" role="tablist">
              <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="partialForm.controls.method.value === 'CASH'"
                      (click)="partialForm.controls.method.setValue('CASH')">Cash</button>
              <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="partialForm.controls.method.value === 'MPESA'"
                      (click)="partialForm.controls.method.setValue('MPESA')">M-Pesa</button>
            </div>
            @if (partialForm.controls.method.value === 'CASH') {
              <div class="grid-auto">
                <label class="field"><span>Amount</span><input type="number" step="0.01" min="0" formControlName="amountCollected"></label>
                <label class="field"><span>Change given</span><input type="number" step="0.01" min="0" formControlName="changeGiven"></label>
              </div>
            } @else {
              <label class="field">
                <span>Payment received</span>
                <app-entity-picker [config]="pickers.unlinkedPayment" formControlName="mpesaPaymentId" placeholder="Search unlinked payments" />
              </label>
              <label class="field"><span>M-Pesa receipt <span class="muted">(optional)</span></span><input formControlName="mpesaReceiptNumber"></label>
            }
            <p class="hint">The order goes out once the down payment is in.</p>
            @if (collectError(); as apiError) {
              <app-error-card title="Unable to record payment" [message]="apiError.message" [details]="apiError.details" />
            }
          </form>
        } @else {
          <div class="tabs" role="tablist">
            <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="payWith() === 'CASH'" (click)="payWith.set('CASH')">Cash collected</button>
            <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="payWith() === 'MPESA'" (click)="payWith.set('MPESA')">M-Pesa</button>
          </div>
          @if (payWith() === 'CASH') {
            <form id="order-payment" class="stack" [formGroup]="cashForm" appFormFeedback (ngSubmit)="markCashCollected()">
              <div class="grid-auto">
                <label class="field">
                  <span>Amount collected</span>
                  <input type="number" step="0.01" min="0" formControlName="amountCollected">
                  @if (cashForm.controls.amountCollected.invalid && cashForm.controls.amountCollected.touched) {
                    <small class="error-text">An amount is required and cannot be negative.</small>
                  }
                </label>
                <label class="field">
                  <span>Change given <span class="muted">(optional)</span></span>
                  <input type="number" step="0.01" min="0" formControlName="changeGiven">
                </label>
              </div>
              <label class="field">
                <span>Notes <span class="muted">(optional)</span></span>
                <input formControlName="notes">
              </label>
              @if (collectError(); as apiError) {
                <app-error-card title="Unable to record payment" [message]="apiError.message" [details]="apiError.details" />
              }
            </form>
          } @else {
            <form id="order-payment" class="stack" [formGroup]="mpesaForm" appFormFeedback (ngSubmit)="markMpesaCollected()">
              <label class="field">
                <span>Payment received</span>
                <app-entity-picker [config]="pickers.unlinkedPayment" formControlName="paymentId" placeholder="Search unlinked payments" />
                <small class="hint">Pick it from the payments that came in, or type the receipt below.</small>
              </label>
              <div class="grid-auto">
                <label class="field"><span>M-Pesa receipt</span><input formControlName="mpesaReceiptNumber" placeholder="QGH7X..."></label>
                <label class="field"><span>Phone used</span><input formControlName="phoneNumberUsed" placeholder="2547..." inputmode="tel"></label>
              </div>
              <label class="field"><span>Transaction ID <span class="muted">(optional)</span></span><input formControlName="mpesaTransactionId"></label>
              @if (collectError(); as apiError) {
                <app-error-card title="Unable to record payment" [message]="apiError.message" [details]="apiError.details" />
              }
            </form>
          }
        }
        <div dialog-actions>
          <button type="submit" form="order-payment" class="btn btn-primary" [disabled]="collecting()">
            {{ collecting() ? 'Recording...' : o.paymentMethod === 'PARTIAL_PAYMENT' ? 'Record instalment' : payWith() === 'CASH' ? 'Record cash' : 'Reconcile payment' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="closeDialog()">Close</button>
        </div>
      </app-dialog>
    }

    @if (dialog() === 'cancel' && order(); as o) {
      <app-dialog title="Cancel this order?" [subtitle]="o.orderNumber || null" (closed)="closeDialog()">
        <form id="order-cancel" class="stack" [formGroup]="cancelForm" appFormFeedback (ngSubmit)="cancel()">
          <label class="field">
            <span>Reason</span>
            <textarea formControlName="reason" rows="3" placeholder="Why is this order being cancelled?"></textarea>
          </label>
          @if (dialogError(); as apiError) {
            <app-error-card title="Not cancelled" [message]="apiError.message" [details]="apiError.details" />
          }
        </form>
        <div dialog-actions>
          <button type="submit" form="order-cancel" class="btn btn-danger-solid" [disabled]="mutating() || !cancelForm.getRawValue().reason.trim()">
            {{ mutating() ? 'Working...' : 'Cancel order' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="closeDialog()">Keep it</button>
        </div>
      </app-dialog>
    }

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
    .detail-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .note { margin: 0; }

    /* Items and the address are what the page is read for; money and rider sit beside them. */
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
      gap: 1rem;
      align-items: start;
    }
    @media (max-width: 1000px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }

    .table-scroll { overflow: auto; }
    .num { text-align: right; white-space: nowrap; }

    .delivery-address { display: grid; gap: 0.5rem; }
    .delivery-address__row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .door-actions { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; }
    .detail-grid .wide { grid-column: 1 / -1; }
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

    .history { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
    .history li { display: flex; justify-content: space-between; gap: 0.25rem 1rem; flex-wrap: wrap; }
    .history__what { display: grid; gap: 0.1rem; }
    .history__what span { font-size: 0.88rem; }
    .history__who { font-size: 0.85rem; }

    .thumb-col { width: 3.25rem; }
    .thumb { width: 2.5rem; height: 2.5rem; border-radius: 8px; object-fit: cover; display: block; background: var(--surface-2); }
    .thumb--ph { display: grid; place-items: center; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
    .table td { vertical-align: middle; }

    .ledger { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .ledger li + li { border-top: 1px solid var(--border); padding-top: 0.75rem; }
    .ledger__top { display: flex; justify-content: space-between; gap: 1rem; }
    .ledger__amount { font-variant-numeric: tabular-nums; }
    .ledger__meta { font-size: 0.85rem; }
    .ledger__status { font-weight: 600; }
    .ledger__notes { font-size: 0.88rem; }

    /* A receipt: labels left, amounts right, rules between the groups. */
    .sums { margin: 0; display: grid; gap: 0.4rem; }
    .sums div { display: flex; justify-content: space-between; gap: 1rem; }
    .sums dt { color: var(--text-muted); }
    .sums dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .sums__rule { border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.15rem; }
    .sums__strong dt, .sums__strong dd { color: var(--text); font-weight: 700; }

    .rider { display: grid; gap: 0.2rem; }
    .field select { max-width: var(--field-max-width); }
    .cancel-link { justify-self: start; }
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

  /** One task at a time, in a dialog: the page itself stays a record to read. */
  readonly dialog = signal<'update' | 'payment' | 'cancel' | null>(null);
  readonly dialogError = signal<ApiError | null>(null);
  readonly payWith = signal<'CASH' | 'MPESA'>('CASH');

  openUpdate(): void {
    const order = this.order();
    if (order) {
      this.resetUpdateForm(order);
    }
    this.dialogError.set(null);
    this.dialog.set('update');
  }

  openPayment(): void {
    this.collectError.set(null);
    this.payWith.set(this.order()?.paymentMethod === 'MPESA' ? 'MPESA' : 'CASH');
    this.dialog.set('payment');
  }

  openCancel(): void {
    this.dialogError.set(null);
    this.dialog.set('cancel');
  }

  closeDialog(): void {
    this.dialog.set(null);
  }

  readonly brokenImages = signal<ReadonlySet<number>>(new Set());

  markBroken(id: number | null | undefined): void {
    if (id != null) {
      this.brokenImages.update((ids) => new Set(ids).add(id));
    }
  }

  /** Cash and M-Pesa payments in one list, newest first; failed or unconfirmed ones shown but not counted. */
  paymentLog(order: OrderDetail): PaymentLogEntry[] {
    const cash = (order.payment?.cashLegs ?? []).map((leg): PaymentLogEntry => ({
      key: 'c' + leg.id,
      label: 'Cash',
      amount: leg.amountCollected ?? leg.amount,
      counted: leg.status === 'COLLECTED',
      status: leg.status ?? '',
      reference: leg.changeGiven && Number(leg.changeGiven) > 0 ? 'Change ' + this.formatMoney(leg.changeGiven) : null,
      by: leg.collectedByName ?? null,
      at: leg.collectedAt ?? null,
      notes: leg.notes ?? null
    }));
    const mpesa = (order.payment?.mpesaLegs ?? []).map((leg): PaymentLogEntry => ({
      key: 'm' + leg.id,
      label: 'M-Pesa',
      amount: leg.amount,
      counted: leg.status === 'COMPLETED',
      status: leg.status ?? '',
      reference: [leg.mpesaReceiptNumber, leg.phoneNumber].filter(Boolean).join(' · ') || null,
      by: leg.associatedByName ?? null,
      at: leg.completedAt ?? leg.associatedAt ?? leg.initiatedAt ?? null,
      notes: null
    }));
    return [...cash, ...mpesa].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }

  itemCount(order: OrderDetail): number {
    return (order.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }

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
      this.closeDialog();
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
      this.closeDialog();
      return;
    }

    this.mutating.set(true);
    this.dialogError.set(null);

    try {
      await firstValueFrom(this.ecommerceService.updateOrder(orderId, request));
      this.closeDialog();
      await this.load();
    } catch (error) {
      this.dialogError.set(toApiError(error));
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
      this.closeDialog();
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
      this.closeDialog();
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
    this.dialogError.set(null);

    try {
      await firstValueFrom(this.ecommerceService.cancelOrder(orderId, { reason }));
      this.cancelForm.reset({ reason: '' });
      this.closeDialog();
      await this.load();
    } catch (error) {
      this.dialogError.set(toApiError(error));
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
      this.resetUpdateForm(order);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private resetUpdateForm(order: OrderDetail): void {
    this.form.reset({
      status: '',
      deliveryContactName: order.deliveryContactName ?? '',
      deliveryContactPhone: order.deliveryContactPhone ?? '',
      deliveryInstructions: order.deliveryInstructions ?? '',
      notes: order.notes ?? ''
    });
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

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value
      : `${displayDate(date)}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
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
