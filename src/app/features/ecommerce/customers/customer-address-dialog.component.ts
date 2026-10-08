import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
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
                width="40rem" (closed)="closed.emit()">
      <form id="customer-address" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        <div class="form-grid">
          <label class="field">
            <span>Address line</span>
            <input formControlName="addressLine1" placeholder="e.g. Blue gate opposite the church, house 12">
            <app-field-error [control]="form.controls.addressLine1" label="Address line" />
          </label>
          <label class="field">
            <span>Landmark</span>
            <input formControlName="landmark" placeholder="e.g. Next to Mwihoko primary">
          </label>
          <label class="field">
            <span>Contact phone</span>
            <input formControlName="contactPhone" inputmode="tel">
            <app-field-error [control]="form.controls.contactPhone" label="Contact phone" />
          </label>
          <label class="field">
            <span>Nickname <span class="muted">(optional)</span></span>
            <input formControlName="addressNickname" placeholder="e.g. Home">
          </label>
        </div>
        <app-address-fields [group]="form.controls.place" />
        <label class="field">
          <span>Delivery note <span class="muted">(optional)</span></span>
          <textarea formControlName="deliveryNote" rows="2"></textarea>
        </label>
        <!-- At the door, the pin is the most useful thing a rider can add. -->
        <app-coordinate-field
          [latitude]="form.controls.latitude.value"
          [longitude]="form.controls.longitude.value"
          legend="Map pin"
          hint="Use your location when you are at the customer's door."
          (changed)="onCoordinates($event)"
        />

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerAddressDialogComponent implements OnInit {
  readonly customerId = input.required<number>();
  /** Given: edit it. Absent: add a new one. */
  readonly address = input<DeliveryAddressDetail | null>(null);
  /** The customer's number — a new address's contact phone to start from. */
  readonly customerPhone = input<string | null>(null);

  readonly saved = output<DeliveryAddressDetail>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    addressNickname: '',
    addressLine1: ['', [Validators.required, Validators.maxLength(255)]],
    landmark: '',
    contactPhone: ['', [Validators.required]],
    deliveryNote: '',
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

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const place = value.place;
    const request: DeliveryAddressUpsertRequest = {
      addressNickname: value.addressNickname.trim() || null,
      addressLine1: value.addressLine1.trim(),
      landmark: value.landmark.trim() || null,
      contactPhone: value.contactPhone.trim(),
      deliveryNote: value.deliveryNote.trim() || null,
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
      this.saved.emit(await firstValueFrom(existing
        ? this.ecommerce.updateEcomCustomerAddress(this.customerId(), existing.id, request)
        : this.ecommerce.addEcomCustomerAddress(this.customerId(), request)));
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
