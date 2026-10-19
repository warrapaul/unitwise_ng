import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS } from '../../../shared/components/address-fields/address-fields.component';

@Component({
  selector: 'app-delivery-address-form-page',
  standalone: true,
  imports: [AddressFieldsComponent, 
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    CoordinateFieldComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading address..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit delivery address' : 'New delivery address'">

            <div class="grid-auto">
              <label class="field">
                <span>Nickname</span>
                <input formControlName="addressNickname" placeholder="Home">
              </label>

              <!-- The registry chain, county down to street/road — the same picker every address uses.
                   With no free-text line, the place itself is the address: at least the county. -->
              <app-address-fields class="field--full" [group]="form.controls.place">
                <label class="field" before-building>
                  <span>Landmark <span class="muted">(optional)</span></span>
                  <input formControlName="landmark" placeholder="e.g. Opposite St. Mary's school">
                </label>
              </app-address-fields>
              @if (placeMissing()) { <p class="error-text field--full" role="alert">Choose at least the county.</p> }


              <label class="field">
                <span>Contact phone</span>
                <input formControlName="contactPhone" placeholder="2547...">
              </label>

              <label class="field"><span>House or unit number <span class="muted">(optional)</span></span><input formControlName="unitNumber"></label>
            </div>

            <label class="field field--wide">
              <span>Delivery note</span>
              <textarea formControlName="deliveryNote" rows="2"></textarea>
            </label>

            <app-coordinate-field
              [latitude]="form.controls.latitude.value"
              [longitude]="form.controls.longitude.value"
              legend="Your location (optional)"
              hint="Standing at home? Use your current location. Otherwise skip it — the landmark is enough."
              (changed)="onCoordinatesChanged($event)"
            />

            <div class="checkbox-row">
              <label class="checkbox-field">
                <input type="checkbox" formControlName="isDefault">
                <span>Default address</span>
              </label>
            </div>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Address already exists' : 'Unable to save address'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create address') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.deliveryAddresses">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .checkbox-row {
      display: flex;
      gap: 1.15rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliveryAddressFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input<string>();
  /** Where to go after saving, when the form was opened from checkout (`?returnTo=/shop/checkout`). */
  readonly returnTo = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly commerce = inject(CommerceService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    addressNickname: '',
    // Kept so an address saved with a line keeps it; no longer asked for.
    addressLine1: ['', [Validators.maxLength(255)]],
    place: this.formBuilder.group({ ...ADDRESS_FIELD_CONTROLS }),
    landmark: '',
    contactPhone: ['', [Validators.required]],
    latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    // Carried, not edited: a Google place id is written by whatever resolved
    // the address, and an edit here must not drop it.
    placeId: '',
    unitNumber: '',
    deliveryNote: '',
    isDefault: false
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const addressId = this.id();
    if (!addressId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const address = await firstValueFrom(this.commerce.getDeliveryAddress(Number(addressId)));
      this.form.patchValue({
        addressNickname: address.addressNickname ?? '',
        addressLine1: address.addressLine1 ?? '',
        // Coarse to fine, with events on: the place picker follows each level.
        place: {
          countyId: address.address?.countyId ?? null,
          subCountyId: address.address?.subCountyId ?? null,
          wardId: address.address?.wardId ?? null,
          townId: address.address?.townId ?? null,
          estateAreaId: address.address?.estateAreaId ?? null,
          streetRoadId: address.address?.streetRoadId ?? null,
          buildingHouse: address.address?.buildingHouse ?? ''
        },
        landmark: address.landmark ?? '',
        contactPhone: address.contactPhone ?? '',
        latitude: address.latitude === null || address.latitude === undefined ? null : Number(address.latitude),
        longitude: address.longitude === null || address.longitude === undefined ? null : Number(address.longitude),
        placeId: address.placeId ?? '',
        unitNumber: address.unitNumber ?? '',
        deliveryNote: address.deliveryNote ?? '',
        isDefault: address.isDefault ?? false
      });
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  onCoordinatesChanged(point: Coordinates | null): void {
    this.form.patchValue({
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null
    });
  }

  readonly placeMissing = signal(false);

  async submit(): Promise<void> {
    // The place is the address now; without even a county there is nothing to deliver to.
    this.placeMissing.set(!this.form.controls.place.getRawValue().countyId && !this.form.controls.addressLine1.value.trim());
    if (this.form.invalid || this.placeMissing()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    const request = {
      addressNickname: value.addressNickname || null,
      addressLine1: value.addressLine1.trim() || null,
      // Only when a place was picked: an address with no county is just the typed line.
      address: value.place.countyId ? {
        countyId: value.place.countyId,
        subCountyId: value.place.subCountyId,
        wardId: value.place.wardId,
        townId: value.place.townId,
        estateAreaId: value.place.estateAreaId,
        streetRoadId: value.place.streetRoadId,
        buildingHouse: value.place.buildingHouse.trim() || null
      } : null,
      landmark: value.landmark || null,
      contactPhone: value.contactPhone || null,
      latitude: value.latitude,
      longitude: value.longitude,
      placeId: value.placeId || null,
      unitNumber: value.unitNumber || null,
      deliveryNote: value.deliveryNote || null,
      isDefault: value.isDefault
    };

    try {
      const addressId = this.id();
      const saved = addressId
        ? await firstValueFrom(this.commerce.updateDeliveryAddress(Number(addressId), request))
        : await firstValueFrom(this.commerce.createDeliveryAddress(request));
      // Back to checkout with the new address chosen; only ever to a shop page, never an outside URL.
      const back = this.returnTo();
      if (back && back.startsWith('/shop/')) {
        await this.router.navigateByUrl(`${back}?address=${saved.id}`);
      } else {
        await this.router.navigateByUrl(RoutePaths.deliveryAddressDetail(saved.id));
      }
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
