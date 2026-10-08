import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { EcomCustomerDetail, EcomCustomerLookup } from '../models/ecommerce.models';
import { EcommerceService } from '../ecommerce.service';
import { CustomerAddressesComponent } from './customer-addresses.component';

/**
 * The ecommerce desk, for admins and riders: type the customer's phone number.
 *
 * - A customer comes back with their details and addresses, ready to correct,
 *   confirm and pin.
 * - A number with an account that is not a customer yet, or no account at all,
 *   opens a short form — names and, if known, an address — to add them.
 */
@Component({
  selector: 'app-customer-desk-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, BackLinkComponent, SectionCardComponent, ErrorCardComponent,
    FieldErrorComponent, PermissionGateComponent, FormFeedbackDirective, AddressFieldsComponent, CustomerAddressesComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.ecomCustomers" label="Back to customers" />

      <app-section-card title="Find or add a customer" subtitle="Start with their phone number.">
        <form class="lookup" [formGroup]="phoneForm" appFormFeedback (ngSubmit)="lookup()">
          <label class="field">
            <span class="visually-hidden">Phone number</span>
            <input formControlName="phoneNumber" inputmode="tel" placeholder="e.g. 0712 345 678" autocomplete="off">
            <app-field-error [control]="phoneForm.controls.phoneNumber" label="Phone number" />
          </label>
          <button type="submit" class="btn btn-primary" [disabled]="searching()">{{ searching() ? 'Searching...' : 'Find' }}</button>
        </form>
        @if (lookupError(); as apiError) {
          <app-error-card title="Could not search" [message]="apiError.message" [details]="apiError.details" />
        }
      </app-section-card>

      @if (result(); as found) {
        @if (found.outcome === 'CUSTOMER' && found.customer; as c) {
          <app-section-card [title]="name(c)" [subtitle]="c.phoneNumber || null">
            <ng-container actions>
              <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomCustomerDetail(c.id)">Open customer</a>
              @if (c.status === 'ACTIVE') {
                <app-permission-gate [permissions]="['ORDER_CREATE_FOR_OTHERS']">
                  <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.ecomPhoneOrder(c.id)">Phone order</a>
                </app-permission-gate>
              }
            </ng-container>

            @if (c.status === 'BLOCKED') {
              <p class="error-text">Blocked{{ c.blockedReason ? ': ' + c.blockedReason : '' }}</p>
            }

            <!-- A claimed account is the person's own; until then the desk may correct who they are. -->
            @if (!c.claimed) {
              <app-permission-gate [permissions]="['ECOM_CUSTOMER_CREATE']">
                <form class="stack" [formGroup]="detailsForm" appFormFeedback (ngSubmit)="saveDetails(c)">
                  <div class="form-grid">
                    <label class="field"><span>First name</span><input formControlName="firstName"></label>
                    <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
                    <label class="field"><span>Last name</span><input formControlName="lastName"></label>
                    <label class="field"><span>Email <span class="muted">(optional)</span></span><input type="email" formControlName="email"></label>
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
            } @else {
              <p class="muted">They have claimed their account, so their name and email are theirs to change.</p>
            }
          </app-section-card>

          <app-customer-addresses [customerId]="c.id" [customerPhone]="c.phoneNumber || null" [initial]="found.addresses" />
        } @else {
          <app-section-card [title]="found.outcome === 'ACCOUNT_ONLY' ? 'Not a customer yet' : 'No customer with this number'"
                            [subtitle]="found.outcome === 'ACCOUNT_ONLY'
                              ? 'This number already has an account. Adding them as a customer links it.'
                              : 'Add them — they can claim the account later by verifying this number.'">
            <app-permission-gate [permissions]="['ECOM_CUSTOMER_CREATE']">
              <form class="stack" [formGroup]="createForm" appFormFeedback (ngSubmit)="create()">
                <div class="form-grid">
                  <label class="field">
                    <span>First name</span><input formControlName="firstName">
                    <app-field-error [control]="createForm.controls.firstName" label="First name" />
                  </label>
                  <label class="field"><span>Middle name <span class="muted">(optional)</span></span><input formControlName="middleName"></label>
                  <label class="field">
                    <span>Last name</span><input formControlName="lastName">
                    <app-field-error [control]="createForm.controls.lastName" label="Last name" />
                  </label>
                  <label class="field">
                    <span>Email <span class="muted">(optional)</span></span><input type="email" formControlName="email">
                    <app-field-error [control]="createForm.controls.email" label="Email" />
                  </label>
                </div>

                <label class="checkbox-field">
                  <input type="checkbox" formControlName="withAddress">
                  <span>Add their delivery address now</span>
                </label>
                @if (createForm.controls.withAddress.value) {
                  <div class="form-grid">
                    <label class="field">
                      <span>Address line</span>
                      <input formControlName="addressLine1" placeholder="e.g. Blue gate opposite the church, house 12">
                    </label>
                    <label class="field"><span>Landmark</span><input formControlName="landmark"></label>
                  </div>
                  <app-address-fields [group]="createForm.controls.place" />
                }

                @if (createError(); as apiError) {
                  <app-error-card title="Not added" [message]="apiError.message" [details]="apiError.details" />
                }
                <div class="button-row">
                  <button type="submit" class="btn btn-primary" [disabled]="creating()">{{ creating() ? 'Adding...' : 'Add customer' }}</button>
                </div>
              </form>
            </app-permission-gate>
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
    .lookup { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.6rem; }
    .lookup .field { flex: 1 1 14rem; max-width: 22rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerDeskPageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly notifications = inject(NotificationService);
  readonly context = inject(ActiveContextService);

  readonly result = signal<EcomCustomerLookup | null>(null);
  readonly searching = signal(false);
  readonly lookupError = signal<ApiError | null>(null);
  readonly creating = signal(false);
  readonly createError = signal<ApiError | null>(null);
  readonly savingDetails = signal(false);
  readonly detailsError = signal<ApiError | null>(null);
  private readonly searchedPhone = signal('');

  readonly phoneForm = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9 ]{9,16}$/)]]
  });

  readonly detailsForm = this.fb.group({ firstName: '', middleName: '', lastName: '', email: ['', [Validators.email]] });

  readonly createForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    middleName: [''],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.email]],
    withAddress: true,
    addressLine1: [''],
    landmark: [''],
    place: this.fb.group({ ...ADDRESS_FIELD_CONTROLS })
  });

  readonly found = computed(() => this.result()?.customer ?? null);

  name(c: EcomCustomerDetail): string {
    return [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ') || c.phoneNumber || `Customer #${c.id}`;
  }

  async lookup(): Promise<void> {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }
    const phone = this.phoneForm.getRawValue().phoneNumber.replace(/\s+/g, '');
    this.searching.set(true);
    this.lookupError.set(null);
    this.result.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.lookupEcomCustomer(phone));
      this.searchedPhone.set(phone);
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
    const withAddress = value.withAddress && (value.addressLine1.trim() || place.countyId);
    this.creating.set(true);
    this.createError.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.createEcomCustomer({
        phoneNumber: this.searchedPhone(),
        firstName: value.firstName.trim(),
        middleName: value.middleName.trim() || null,
        lastName: value.lastName.trim(),
        email: value.email.trim() || null,
        address: withAddress ? {
          addressLine1: value.addressLine1.trim() || value.landmark.trim() || 'See map pin',
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
        lastName: value.lastName.trim() || null,
        email: value.email.trim()
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

  private show(result: EcomCustomerLookup): void {
    this.result.set(result);
    const c = result.customer;
    if (c) {
      this.detailsForm.reset({
        firstName: c.firstName ?? '', middleName: c.middleName ?? '', lastName: c.lastName ?? '', email: c.email ?? ''
      });
    } else {
      this.createForm.reset({ firstName: '', middleName: '', lastName: '', email: '', withAddress: true, addressLine1: '', landmark: '' });
    }
  }
}
