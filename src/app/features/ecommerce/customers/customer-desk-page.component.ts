import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS } from '../../../shared/components/address-fields/address-fields.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EcomCustomerDetail, EcomCustomerLookup, EcomCustomerSource, OrderPreview } from '../models/ecommerce.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { displayDate } from '../../../shared/utils/display-date.util';
import { EcommerceService } from '../ecommerce.service';
import { CustomerAddressesComponent } from './customer-addresses.component';
import { PhoneSearchComponent } from '../../../shared/components/phone-search/phone-search.component';

/**
 * The ecommerce desk, for admins and riders: type the customer's phone number.
 *
 * - A customer comes back with their details and addresses, ready to correct,
 *   confirm and pin.
 * - A number with an account that is not a customer yet, or no account at all,
 *   opens a short form to add them. Names are optional (a new account without
 *   them reads "Customer 5678") and the address is left off unless asked for.
 *
 * As "New order" (route data `forOrder`) the same desk is the first step of a
 * phone order: a customer found goes straight to the order, and one added here
 * continues to it.
 */
@Component({
  selector: 'app-customer-desk-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, BackLinkComponent, SectionCardComponent, ErrorCardComponent,
    FieldErrorComponent, PermissionGateComponent, FormFeedbackDirective, AddressFieldsComponent, CustomerAddressesComponent,
    StatusChipComponent, PhoneSearchComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="forOrder() ? RoutePaths.ecomOrders : RoutePaths.ecomCustomers"
                     [label]="forOrder() ? 'Back to orders' : 'Back to customers'" />

      <!-- One field: no reason for it to span the page. -->
      <div class="lookup-card">
        <app-section-card [title]="forOrder() ? 'New order' : 'Find or add a customer'"
                          subtitle="Paste or type their phone number — the search starts on its own.">
          <app-phone-search [busy]="searching()" [initial]="phone() ?? null" (search)="lookup($event)" />
          @if (lookupError(); as apiError) {
            <app-error-card title="Could not search" [message]="apiError.message" [details]="apiError.details" />
          }
        </app-section-card>
      </div>

      @if (result(); as found) {
        @if (found.outcome === 'CUSTOMER' && found.customer; as c) {
          <!-- Who they are beside where they live: one row on a desktop, stacked on a phone. -->
          <div class="found">
          <app-section-card title="Customer">
            <ng-container actions>
              @if (c.status === 'ACTIVE') {
                <app-permission-gate [permissions]="['ORDER_CREATE_FOR_OTHERS']">
                  <a class="btn btn-primary" [routerLink]="RoutePaths.ecomPhoneOrder(c.id)">Create order</a>
                </app-permission-gate>
              }
            </ng-container>

            <!-- The name and number open the customer's full record. -->
            <a class="who" [routerLink]="RoutePaths.ecomCustomerDetail(c.id)" title="Open the customer">
              <strong class="who__name">{{ name(c) }}</strong>
              @if (c.phoneNumber) { <span class="who__phone">{{ c.phoneNumber }}</span> }
            </a>

            @if (c.status === 'BLOCKED') {
              <p class="error-text">Blocked{{ c.blockedReason ? ': ' + c.blockedReason : '' }}</p>
            }

            <!-- What the desk needs before taking an order: who they are to the shop, and how they pay. -->
            <dl class="detail-grid">
              <div><dt>Status</dt><dd><app-status-chip [status]="c.status" /></dd></div>
              <div><dt>Added by</dt><dd>{{ sourceLabel(c.source) }}</dd></div>
              <div><dt>Account</dt><dd>{{ c.claimed ? 'Their own (claimed)' : 'Not claimed yet' }}</dd></div>
              <div><dt>Orders</dt><dd>{{ c.orderCount }}{{ c.lastOrderAt ? ' · last ' + date(c.lastOrderAt) : '' }}</dd></div>
              <div><dt>Pay on delivery</dt><dd>{{ c.payOnDeliveryAllowed ? 'Allowed' : 'Not allowed — pay first' }}</dd></div>
              @if (c.standingDeliveryInstructions) {
                <div class="wide"><dt>Their delivery instructions</dt><dd>{{ c.standingDeliveryInstructions }}</dd></div>
              }
            </dl>

            <!-- Staff notes: written by the desk or a rider, never shown to the customer. -->
            <app-permission-gate [permissions]="['ECOM_CUSTOMER_UPDATE']">
              <form class="notes" [formGroup]="notesForm" (ngSubmit)="saveNotes(c)">
                <label class="field">
                  <span>Staff notes <span class="muted">(only staff and riders see these)</span></span>
                  <textarea formControlName="staffNotes" rows="2" placeholder="e.g. Prefers calls after 6pm; gate code 1234"></textarea>
                </label>
                @if (!notesForm.pristine) {
                  <button type="submit" class="btn btn-secondary btn-sm" [disabled]="savingNotes()">{{ savingNotes() ? 'Saving...' : 'Save notes' }}</button>
                }
              </form>
            </app-permission-gate>

            <!-- A claimed account is the person's own; until then the desk may correct who they are. -->
            @if (!c.claimed) {
              <app-permission-gate [permissions]="['ECOM_CUSTOMER_CREATE']">
                <form class="stack" [formGroup]="detailsForm" appFormFeedback (ngSubmit)="saveDetails(c)">
                  <div class="form-grid">
                    <label class="field"><span>First name</span><input formControlName="firstName"></label>
                    <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
                    <label class="field"><span>Last name</span><input formControlName="lastName"></label>
                  </div>
                  @if (detailsError(); as apiError) {
                    <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
                  }
                  <div class="button-row">
                    <button type="submit" class="btn btn-secondary" [disabled]="savingDetails() || detailsForm.pristine">
                      {{ savingDetails() ? 'Saving...' : 'Save details' }}
                    </button>
                  </div>
                </form>
              </app-permission-gate>
            }
          
          </app-section-card>

          <app-customer-addresses [customerId]="c.id" [customerPhone]="c.phoneNumber || null" [initial]="found.addresses"
                                  [limit]="3" [moreLink]="RoutePaths.ecomCustomerDetail(c.id)" />
          </div>

          <app-section-card title="Recent orders" [subtitle]="c.orderCount > 8 ? 'The last 8 of ' + c.orderCount : null">
            @if (c.orderCount > 8) {
              <ng-container actions>
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomCustomerDetail(c.id)">All orders</a>
              </ng-container>
            }
            @if (ordersLoading()) {
              <p class="muted">Loading orders...</p>
            } @else if (ordersError()) {
              <p class="muted">Their orders could not be loaded here — open the customer to see them.</p>
            } @else if (recentOrders().length === 0) {
              <p class="muted">No orders yet.</p>
            } @else {
              <div class="table-scroll">
                <table class="table">
                  <thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Payment</th><th class="num">Total</th></tr></thead>
                  <tbody>
                    @for (order of recentOrders(); track order.id) {
                      <tr>
                        <td><a [routerLink]="RoutePaths.ecomOrderDetail(order.id)">{{ order.orderNumber }}</a></td>
                        <td>{{ date(order.createdAt) }}</td>
                        <td><app-status-chip [status]="order.status" /></td>
                        <td><app-status-chip [status]="order.paymentStatus" /></td>
                        <td class="num">{{ money(order.totalAmount) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>
        } @else {
          <app-section-card [title]="found.outcome === 'ACCOUNT_ONLY' ? 'Not a customer yet' : 'No customer with this number'">
            <app-permission-gate [permissions]="['ECOM_CUSTOMER_CREATE']">
              <form class="stack" [formGroup]="createForm" appFormFeedback (ngSubmit)="create()">
                <div class="form-grid">
                  <label class="field">
                    <span>First name <span class="muted">(optional)</span></span><input formControlName="firstName" placeholder="Customer">
                    <app-field-error [control]="createForm.controls.firstName" label="First name" />
                  </label>
                  <label class="field"><span>Middle name <span class="muted">(optional)</span></span><input formControlName="middleName"></label>
                  <label class="field">
                    <span>Last name <span class="muted">(optional)</span></span><input formControlName="lastName" [placeholder]="lastFour()">
                    <app-field-error [control]="createForm.controls.lastName" label="Last name" />
                  </label>
                </div>
                @if (found.outcome !== 'ACCOUNT_ONLY') {
                  <small class="hint">No names? It is saved as "Customer {{ lastFour() }}".</small>
                }

                <label class="checkbox-field">
                  <input type="checkbox" formControlName="withAddress">
                  <span>Add their delivery address now</span>
                </label>
                @if (createForm.controls.withAddress.value) {
                  <app-address-fields [group]="createForm.controls.place">
                    <label class="field" before-building>
                      <span>Landmark <span class="muted">(optional)</span></span>
                      <input formControlName="landmark" placeholder="e.g. Next to Mwihoko primary">
                    </label>
                  </app-address-fields>
                }

                <!-- An existing account keeps its own sign-in; this is only for a new one. -->
                @if (found.outcome !== 'ACCOUNT_ONLY') {
                  <label class="checkbox-field">
                    <input type="checkbox" formControlName="sendPasswordBySms">
                    <span>Text them a password</span>
                  </label>
                  <small class="hint">
                    {{ createForm.controls.sendPasswordBySms.value
                      ? 'They get a password by SMS and choose their own on first sign-in.'
                      : 'No password is sent. They sign in with a code sent to their phone and choose a password then.' }}
                  </small>
                }

                @if (createError(); as apiError) {
                  <app-error-card title="Not added" [message]="apiError.message" [details]="apiError.details" />
                }
                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="creating()">{{ creating() ? 'Adding...' : forOrder() ? 'Add and take order' : 'Add customer' }}</button>
                </div>
              </form>
            </app-permission-gate>
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
    .lookup-card { max-width: 40rem; }
    .found { display: grid; gap: var(--space-4); align-items: start; }
    @media (min-width: 1100px) { .found { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .who { display: grid; gap: var(--space-0-5); justify-self: start; color: inherit; text-decoration: none; }
    .who__name { font-size: var(--text-lg); color: var(--primary-strong); text-decoration: underline; text-underline-offset: 0.2em; text-decoration-thickness: 1px; }
    .who__phone { color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .who:hover .who__name { text-decoration-thickness: 2px; }
    .detail-grid .wide { grid-column: 1 / -1; }
    .notes { display: grid; gap: var(--space-2); justify-items: start; }
    .notes .field { width: 100%; max-width: var(--field-max-width-wide, 720px); }
    .table-scroll { overflow: auto; }
    .num { text-align: right; white-space: nowrap; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerDeskPageComponent {
  readonly RoutePaths = RoutePaths;
  /** From route data: the first step of a phone order rather than the customer desk. */
  readonly forOrder = input(false);

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  readonly context = inject(ActiveContextService);

  readonly result = signal<EcomCustomerLookup | null>(null);
  readonly searching = signal(false);
  readonly lookupError = signal<ApiError | null>(null);
  readonly creating = signal(false);
  readonly createError = signal<ApiError | null>(null);
  readonly savingDetails = signal(false);
  readonly detailsError = signal<ApiError | null>(null);
  private readonly searchedPhone = signal('');

  readonly recentOrders = signal<OrderPreview[]>([]);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal(false);
  readonly notesForm = this.fb.group({ staffNotes: '' });
  readonly savingNotes = signal(false);

  private async loadRecentOrders(customerId: number): Promise<void> {
    this.ordersLoading.set(true);
    try {
      const page = await firstValueFrom(this.ecommerce.getOrders({ customerId, page: 0, size: 8, sort: 'createdAt,desc' }));
      this.recentOrders.set(page.items);
      this.ordersError.set(false);
    } catch {
      this.recentOrders.set([]);
      this.ordersError.set(true);
    } finally {
      this.ordersLoading.set(false);
    }
  }

  async saveNotes(c: EcomCustomerDetail): Promise<void> {
    this.savingNotes.set(true);
    try {
      const updated = await firstValueFrom(this.ecommerce.updateEcomCustomer(c.id, {
        staffNotes: this.notesForm.getRawValue().staffNotes.trim() || null
      }));
      this.result.update((current) => current ? { ...current, customer: updated } : current);
      this.notesForm.reset({ staffNotes: updated.staffNotes ?? '' });
      this.notifications.push('success', 'Notes saved.');
    } catch (error) {
      this.notifications.push('error', toApiError(error).message);
    } finally {
      this.savingNotes.set(false);
    }
  }

  sourceLabel(source: EcomCustomerSource | null | undefined): string {
    switch (source) {
      case 'SELF_SERVICE': return 'Signed up themselves';
      case 'ADMIN_CREATED': return 'Shop desk';
      case 'RIDER_CREATED': return 'A rider';
      case 'PHONE_ORDER': return 'Phone order';
      default: return '-';
    }
  }

  date(value?: string | null): string {
    if (!value) {
      return '-';
    }
    const parsed = new Date(value.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? value : displayDate(parsed);
  }

  money(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
  }

  /** `?phone=` — from the dashboard's quick search: look it up straight away. */
  readonly phone = input<string>();

  readonly detailsForm = this.fb.group({ firstName: '', middleName: '', lastName: '' });

  readonly createForm = this.fb.group({
    firstName: ['', [Validators.maxLength(50)]],
    middleName: [''],
    lastName: ['', [Validators.maxLength(50)]],
    // Off by default: they sign in with a code and choose their own password.
    sendPasswordBySms: false,
    // Off by default: most callers give a number, and the rider records the real address at the door.
    withAddress: false,
    landmark: [''],
    place: this.fb.group({ ...ADDRESS_FIELD_CONTROLS })
  });

  readonly found = computed(() => this.result()?.customer ?? null);
  /** What a nameless new account's last name becomes, shown as the placeholder. */
  readonly lastFour = computed(() => this.searchedPhone().replace(/\D/g, '').slice(-4) || 'New');

  name(c: EcomCustomerDetail): string {
    return [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ') || c.phoneNumber || `Customer #${c.id}`;
  }

  async lookup(phone: string): Promise<void> {
    this.searching.set(true);
    this.lookupError.set(null);
    this.result.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.lookupEcomCustomer(phone));
      this.searchedPhone.set(phone);
      if (await this.continueToOrder(result)) {
        return;
      }
      this.show(result);
    } catch (error) {
      this.lookupError.set(toApiError(error));
    } finally {
      this.searching.set(false);
    }
  }

  async create(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    const value = this.createForm.getRawValue();
    const place = value.place;
    const withAddress = value.withAddress && !!place.countyId;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.createEcomCustomer({
        phoneNumber: this.searchedPhone(),
        firstName: value.firstName.trim() || null,
        middleName: value.middleName.trim() || null,
        lastName: value.lastName.trim() || null,
        sendPasswordBySms: value.sendPasswordBySms,
        address: withAddress ? {
          addressLine1: null,
          landmark: value.landmark.trim() || null,
          contactPhone: this.searchedPhone(),
          address: place.countyId ? {
            countyId: place.countyId,
            subCountyId: place.subCountyId,
            wardId: place.wardId,
            townId: place.townId,
            estateAreaId: place.estateAreaId,
            streetRoadId: place.streetRoadId,
            buildingHouse: place.buildingHouse.trim() || null
          } : null
        } : null
      }));
      this.notifications.push('success', 'Customer added.');
      if (await this.continueToOrder(result)) {
        return;
      }
      this.show(result);
    } catch (error) {
      this.createError.set(toApiError(error));
    } finally {
      this.creating.set(false);
    }
  }

  async saveDetails(c: EcomCustomerDetail): Promise<void> {
    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      return;
    }
    const value = this.detailsForm.getRawValue();
    this.savingDetails.set(true);
    this.detailsError.set(null);
    try {
      const updated = await firstValueFrom(this.ecommerce.updateEcomCustomerDetails(c.id, {
        firstName: value.firstName.trim() || null,
        middleName: value.middleName.trim(),
        lastName: value.lastName.trim() || null
      }));
      this.result.update((current) => current ? { ...current, customer: updated } : current);
      this.detailsForm.markAsPristine();
      this.notifications.push('success', 'Details saved.');
    } catch (error) {
      this.detailsError.set(toApiError(error));
    } finally {
      this.savingDetails.set(false);
    }
  }

  /** In order mode, an active customer goes on to the order; a blocked one stays here to be seen. */
  private async continueToOrder(result: EcomCustomerLookup): Promise<boolean> {
    const customer = result.outcome === 'CUSTOMER' ? result.customer : null;
    if (!this.forOrder() || !customer || customer.status !== 'ACTIVE') {
      return false;
    }
    return this.router.navigateByUrl(RoutePaths.ecomPhoneOrder(customer.id));
  }

  private show(result: EcomCustomerLookup): void {
    this.result.set(result);
    const c = result.customer;
    this.recentOrders.set([]);
    if (c) {
      this.detailsForm.reset({
        firstName: c.firstName ?? '', middleName: c.middleName ?? '', lastName: c.lastName ?? ''
      });
      this.notesForm.reset({ staffNotes: c.staffNotes ?? '' });
      void this.loadRecentOrders(c.id);
    } else {
      this.createForm.reset({ firstName: '', middleName: '', lastName: '', sendPasswordBySms: false, withAddress: false, landmark: '' });
    }
  }
}
