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
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';

@Component({
  selector: 'app-delivery-address-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    EntityPickerComponent,
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

              <label class="field">
                <span>Address line</span>
                <input formControlName="addressLine1" placeholder="Riverside Drive, Apt 4B">
                @if (form.controls.addressLine1.invalid && form.controls.addressLine1.touched) {
                  <small class="error-text">An address line is required.</small>
                }
              </label>

              <label class="field"><span>Town</span><input formControlName="town"></label>
              <label class="field"><span>City</span>
                <app-entity-picker [config]="pickers.cityName" formControlName="city" placeholder="Select a city" />
              </label>
              <label class="field"><span>County</span>
                <app-entity-picker [config]="pickers.countyName" formControlName="county" placeholder="Select a county" />
              </label>
              <label class="field"><span>Landmark</span><input formControlName="landmark"></label>

              <label class="field">
                <span>Contact phone</span>
                <input formControlName="contactPhone" placeholder="2547...">
              </label>

              <label class="field">
                <span>Building ID</span>
                <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Not in a managed building" />
                <small class="hint">Set only when the address is a unit in a managed building.</small>
              </label>
              <label class="field"><span>Unit number</span><input formControlName="unitNumber"></label>
            </div>

            <label class="field field--wide">
              <span>Delivery note</span>
              <textarea formControlName="deliveryNote" rows="2"></textarea>
            </label>

            <app-coordinate-field
              [latitude]="form.controls.latitude.value"
              [longitude]="form.controls.longitude.value"
              hint="Only if you have it. A clear landmark gets a rider there just as well."
              (changed)="onCoordinatesChanged($event)"
            />

            <div class="checkbox-row">
              <label class="checkbox-field">
                <input type="checkbox" formControlName="isTenantResidence">
                <span>Tenant residence</span>
              </label>
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
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;

  readonly id = input<string>();

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
    addressLine1: ['', [Validators.required, Validators.maxLength(255)]],
    town: '',
    city: '',
    county: '',
    landmark: '',
    contactPhone: ['', [Validators.required]],
    latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    // Carried, not edited: a Google place id is written by whatever resolved
    // the address, and an edit here must not drop it.
    placeId: '',
    buildingId: [null as number | null],
    unitNumber: '',
    deliveryNote: '',
    isTenantResidence: false,
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
        town: address.town ?? '',
        city: address.city ?? '',
        county: address.county ?? '',
        landmark: address.landmark ?? '',
        contactPhone: address.contactPhone ?? '',
        latitude: address.latitude === null || address.latitude === undefined ? null : Number(address.latitude),
        longitude: address.longitude === null || address.longitude === undefined ? null : Number(address.longitude),
        placeId: address.placeId ?? '',
        buildingId: address.buildingId ?? null,
        unitNumber: address.unitNumber ?? '',
        deliveryNote: address.deliveryNote ?? '',
        isTenantResidence: address.isTenantResidence ?? false,
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

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    const request = {
      addressNickname: value.addressNickname || null,
      addressLine1: value.addressLine1,
      town: value.town || null,
      city: value.city || null,
      county: value.county || null,
      landmark: value.landmark || null,
      contactPhone: value.contactPhone || null,
      latitude: value.latitude,
      longitude: value.longitude,
      placeId: value.placeId || null,
      buildingId: value.buildingId,
      unitNumber: value.unitNumber || null,
      deliveryNote: value.deliveryNote || null,
      isTenantResidence: value.isTenantResidence,
      isDefault: value.isDefault
    };

    try {
      const addressId = this.id();
      const saved = addressId
        ? await firstValueFrom(this.commerce.updateDeliveryAddress(Number(addressId), request))
        : await firstValueFrom(this.commerce.createDeliveryAddress(request));
      await this.router.navigateByUrl(RoutePaths.deliveryAddressDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
