import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS } from '../../../shared/components/address-fields/address-fields.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';
import { OrderDetail } from '../models/ecommerce.models';

/**
 * A rider (or the desk) writing down where an order actually went — for an
 * order placed without an address, usually over the phone.
 *
 * Saved to the customer's address book too, marked as added by a rider until
 * the customer confirms it, so the next order does not need the call.
 */
@Component({
  selector: 'app-order-address-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogComponent, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective,
    AddressFieldsComponent],
  template: `
    <app-dialog title="Add delivery address" subtitle="Saved to the customer's addresses for them to confirm."
                width="40rem" (closed)="closed.emit()">
      <form id="order-address" class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
        @if (description()) {
          <p class="hint">From the call: {{ description() }}</p>
        }
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
        </div>
        <app-address-fields [group]="form.controls.place" />
        <label class="field">
          <span>Delivery note <span class="muted">(optional)</span></span>
          <textarea formControlName="deliveryNote" rows="2"></textarea>
        </label>

        @if (error(); as apiError) {
          <app-error-card title="Not saved" [message]="apiError.message" [details]="apiError.details" />
        }
      </form>
      <div dialog-actions>
        <button type="submit" form="order-address" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Saving...' : 'Save address' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
      </div>
    </app-dialog>
  `,
  styles: [`p { margin: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderAddressDialogComponent implements OnInit {
  readonly orderId = input.required<number>();
  /** The customer's number — the contact phone's starting value. */
  readonly contactPhone = input<string | null>(null);
  /** The free-text location taken over the phone, shown as a reminder. */
  readonly description = input<string | null>(null);

  readonly attached = output<OrderDetail>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly commerce = inject(CommerceService);

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    addressLine1: ['', [Validators.required, Validators.maxLength(255)]],
    landmark: '',
    contactPhone: ['', [Validators.required]],
    deliveryNote: '',
    place: this.fb.group({ ...ADDRESS_FIELD_CONTROLS })
  });

  ngOnInit(): void {
    this.form.controls.contactPhone.setValue(this.contactPhone() ?? '');
    this.form.controls.addressLine1.setValue(this.description() ?? '');
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const place = value.place;
    this.saving.set(true);
    this.error.set(null);
    try {
      const order = await firstValueFrom(this.commerce.attachOrderDeliveryAddress(this.orderId(), {
        addressLine1: value.addressLine1.trim(),
        landmark: value.landmark.trim() || null,
        contactPhone: value.contactPhone.trim(),
        deliveryNote: value.deliveryNote.trim() || null,
        address: place.countyId ? {
          countyId: place.countyId,
          subCountyId: place.subCountyId,
          wardId: place.wardId,
          townId: place.townId,
          estateAreaId: place.estateAreaId,
          streetRoadId: place.streetRoadId,
          buildingHouse: place.buildingHouse.trim() || null
        } : null
      }));
      this.attached.emit(order);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
