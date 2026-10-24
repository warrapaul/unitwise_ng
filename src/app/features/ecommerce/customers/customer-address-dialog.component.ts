import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS } from '../../../shared/components/address-fields/address-fields.component';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { DeliveryAddressDetail, DeliveryAddressUpsertRequest } from '../models/commerce.models';
import { EcommerceService } from '../ecommerce.service';

/**
 * Staff (an admin, or a rider at the door) adding or correcting one of a
 * customer's delivery addresses — the place, the line, the landmark and, most
 * usefully, the map pin from where they are standing.
 */
@Component({
  selector: 'app-customer-address-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective,
    AddressFieldsComponent, CoordinateFieldComponent],
  template: `
    <app-dialog [title]="address() ? 'Edit address' : 'Add address'"
                [subtitle]="address() ? null : 'Saved to the customer\\'s addresses for them to confirm.'"
                width="48rem" (closed)="closed.emit()">
      <form id="customer-address" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <!-- The customer's own "Edit address" form, field for field, so an address reads the same whoever wrote it. -->
        <label class="field">
          <span>Nickname <span class="muted">(optional)</span></span>
          <input formControlName="addressNickname" placeholder="Home">
        </label>
        <app-address-fields [group]="form.controls.place">
          <label class="field" before-building>
            <span>Landmark <span class="muted">(optional)</span></span>
            <input formControlName="landmark" placeholder="e.g. Opposite St. Mary's school">
          </label>
        </app-address-fields>
        @if (placeMissing()) { <p class="error-text" role="alert">Choose at least the county.</p> }
        <div class="form-grid">
          <label class="field">
            <span>Contact phone</span>
            <input formControlName="contactPhone" inputmode="tel" placeholder="2547...">
            <app-field-error [control]="form.controls.contactPhone" label="Contact phone" />
          </label>
          <label class="field">
            <span>House or unit number <span class="muted">(optional)</span></span>
            <input formControlName="unitNumber">
          </label>
        </div>
        <label class="field">
          <span>Delivery note <span class="muted">(optional)</span></span>
          <textarea formControlName="deliveryNote" rows="2"></textarea>
        </label>
        <!-- At the door, the pin is the most useful thing a rider can add. -->
        <app-coordinate-field
          [latitude]="form.controls.latitude.value"
          [longitude]="form.controls.longitude.value"
          legend="Location (optional)"
          (changed)="onCoordinates($event)"
        />
        <label class="checkbox-field">
          <input type="checkbox" formControlName="isDefault">
          <span>Default address</span>
        </label>

        <!-- Editing only: what riders need at the door, and whether someone has been there. -->
        @if (address(); as current) {
          <fieldset class="section">
            <legend>Door details <span class="muted">(riders only — the customer does not see these)</span></legend>
            <div class="form-grid">
              <label class="field"><span>Floor</span><input formControlName="floorNumber" placeholder="e.g. 3 or Ground"></label>
              <label class="field"><span>Room or door</span><input formControlName="roomNumber" placeholder="e.g. B12"></label>
            </div>
            <label class="field">
              <span>Notes for the next rider</span>
              <textarea formControlName="riderNotes" rows="2" placeholder="e.g. Blue door at the end of the corridor. Call on arrival."></textarea>
            </label>
          </fieldset>

          <fieldset class="section">
            <legend>Verification</legend>
            @if (current.isVerified) {
              <p class="verified">✓ Verified{{ current.verifiedByName ? ' by ' + current.verifiedByName : '' }}{{ current.lastVerifiedAt ? ' · ' + when(current.lastVerifiedAt) : '' }}</p>
            } @else {
              <p class="muted">Not verified yet.</p>
              @if (canVerify()) {
                <label class="checkbox-field">
                  <input type="checkbox" formControlName="markVerified">
                  <span>I have been there — mark this address verified</span>
                </label>
              }
            }
            @if (current.customerConfirmed === false) {
              <p class="muted">Waiting for the customer to confirm it.</p>
            }
          </fieldset>
        }

        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="customer-address" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Saving...' : 'Save address' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    .section { display: grid; gap: 0.75rem; margin: 0; padding: 0.85rem 0 0; border: 0; border-top: 1px solid var(--border); }
    .section legend { padding: 0; font-weight: 700; }
    .section p { margin: 0; }
    .verified { color: var(--success); font-weight: 600; }
    .checkbox-field { display: flex; align-items: center; gap: 0.5rem; }
    .checkbox-field input { width: auto; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerAddressDialogComponent implements OnInit {
  readonly customerId = input.required<number>();
  /** Given: edit it. Absent: add a new one. */
  readonly address = input<DeliveryAddressDetail | null>(null);
  /** The customer's number — a new address's contact phone to start from. */
  readonly customerPhone = input<string | null>(null);

  private readonly context = inject(ActiveContextService);
  readonly canVerify = computed(() => this.context.can('DELIVERY_ADDRESS_VERIFY'));

  when(value: string): string {
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }

  readonly saved = output<DeliveryAddressDetail>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    addressNickname: '',
    // Kept for addresses saved with one; no longer asked for.
    addressLine1: ['', [Validators.maxLength(255)]],
    landmark: '',
    contactPhone: ['', [Validators.required]],
    deliveryNote: '',
    unitNumber: '',
    isDefault: false,
    floorNumber: ['', [Validators.maxLength(20)]],
    roomNumber: ['', [Validators.maxLength(30)]],
    riderNotes: ['', [Validators.maxLength(2000)]],
    markVerified: false,
    latitude: [null as number | null],
    longitude: [null as number | null],
    place: this.fb.group({ ...ADDRESS_FIELD_CONTROLS })
  });

  ngOnInit(): void {
    const address = this.address();
    if (!address) {
      this.form.controls.contactPhone.setValue(this.customerPhone() ?? '');
      return;
    }
    this.form.patchValue({
      addressNickname: address.addressNickname ?? '',
      addressLine1: address.addressLine1 ?? '',
      landmark: address.landmark ?? '',
      contactPhone: address.contactPhone ?? '',
      deliveryNote: address.deliveryNote ?? '',
      unitNumber: address.unitNumber ?? '',
      isDefault: address.isDefault ?? false,
      floorNumber: address.door?.floorNumber ?? '',
      roomNumber: address.door?.roomNumber ?? '',
      riderNotes: address.door?.riderNotes ?? '',
      latitude: address.latitude === null || address.latitude === undefined ? null : Number(address.latitude),
      longitude: address.longitude === null || address.longitude === undefined ? null : Number(address.longitude),
      // Coarse to fine, with events on: the place picker follows each level.
      place: {
        countyId: address.address?.countyId ?? null,
        subCountyId: address.address?.subCountyId ?? null,
        wardId: address.address?.wardId ?? null,
        townId: address.address?.townId ?? null,
        estateAreaId: address.address?.estateAreaId ?? null,
        streetRoadId: address.address?.streetRoadId ?? null,
        buildingHouse: address.address?.buildingHouse ?? ''
      }
    });
  }

  onCoordinates(point: Coordinates | null): void {
    this.form.patchValue({ latitude: point?.latitude ?? null, longitude: point?.longitude ?? null });
  }

  readonly placeMissing = signal(false);

  async save(): Promise<void> {
    this.placeMissing.set(!this.form.controls.place.getRawValue().countyId && !this.form.controls.addressLine1.value.trim());
    if (this.form.invalid || this.placeMissing()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const place = value.place;
    const request: DeliveryAddressUpsertRequest = {
      addressNickname: value.addressNickname.trim() || null,
      addressLine1: value.addressLine1.trim() || null,
      landmark: value.landmark.trim() || null,
      contactPhone: value.contactPhone.trim(),
      deliveryNote: value.deliveryNote.trim() || null,
      // On an edit, '' clears it; null would leave it as it was.
      unitNumber: value.unitNumber.trim() || (this.address() ? '' : null),
      isDefault: value.isDefault,
      latitude: value.latitude,
      longitude: value.longitude,
      address: place.countyId ? {
        countyId: place.countyId,
        subCountyId: place.subCountyId,
        wardId: place.wardId,
        townId: place.townId,
        estateAreaId: place.estateAreaId,
        streetRoadId: place.streetRoadId,
        buildingHouse: place.buildingHouse.trim() || null
      } : null
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.address();
      let saved = await firstValueFrom(existing
        ? this.ecommerce.updateEcomCustomerAddress(this.customerId(), existing.id, request)
        : this.ecommerce.addEcomCustomerAddress(this.customerId(), request));
      if (existing) {
        // Door details and verification have their own endpoints; sent only when something changed.
        const door = existing.door;
        if ((door?.floorNumber ?? '') !== value.floorNumber.trim() || (door?.roomNumber ?? '') !== value.roomNumber.trim()
            || (door?.riderNotes ?? '') !== value.riderNotes.trim()) {
          saved = await firstValueFrom(this.ecommerce.saveEcomCustomerAddressDoor(this.customerId(), existing.id, {
            floorNumber: value.floorNumber.trim(), roomNumber: value.roomNumber.trim(), riderNotes: value.riderNotes.trim()
          }));
        }
        if (value.markVerified && !existing.isVerified) {
          saved = await firstValueFrom(this.ecommerce.verifyEcomCustomerAddress(this.customerId(), existing.id));
        }
      }
      this.saved.emit(saved);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
