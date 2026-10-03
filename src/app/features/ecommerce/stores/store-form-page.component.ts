import { ChangeDetectionStrategy, Component, computed, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { AddressFieldsComponent, ADDRESS_FIELD_CONTROLS, EMPTY_ADDRESS_FIELDS } from '../../../shared/components/address-fields/address-fields.component';
import { EcommerceService } from '../ecommerce.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { StoreDetail, StoreUpsertRequest } from '../models/ecommerce.models';

type StoreFormValue = {
  name: string;
  code: string;
  countyId: number | null;
  subCountyId: number | null;
  wardId: number | null;
  townId: number | null;
  estate: string;
  street: string;
  buildingHouse: string;
  landmark: string;
  contactPhone: string;
  operatingHours: string;
  latitude: string;
  longitude: string;
  pickupInstructions: string;
  isActive: boolean;
};

@Component({
  selector: 'app-store-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadingStateComponent, ErrorStateComponent, AddressFieldsComponent, FieldErrorComponent, ErrorCardComponent, FormFeedbackDirective],
  template: `
    <section class="panel form-shell">
      <div class="stack">
        <h1 class="heading-lg">{{ isEditMode ? 'Update store details' : 'Create a new store' }}</h1>
        <p class="muted">Pick the county, sub-county, ward and town/locality before saving the store.</p>
      </div>

      @if (loading()) {
        <app-loading-state [label]="isEditMode ? 'Loading store...' : 'Preparing form...'" />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load store form'" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <div class="grid-auto">
            <label class="field">
              <span>Name</span>
              <input formControlName="name" placeholder="Store name">
              <app-field-error [control]="form.controls.name" label="Name" />
            </label>
            <label class="field">
              <span>Code</span>
              <input class="uppercase" formControlName="code" placeholder="Store code">
              <app-field-error [control]="form.controls.code" label="Code" />
            </label>
            <!-- The same place chain as every address; Street/road is the store's address line. -->
            <app-address-fields class="field--full" [group]="form" />
            <label class="field"><span>Landmark</span><input formControlName="landmark" placeholder="Landmark"></label>
            <label class="field"><span>Contact phone</span><input formControlName="contactPhone" placeholder="Contact phone"></label>
            <label class="field"><span>Operating hours</span><input formControlName="operatingHours" placeholder="Operating hours"></label>
            <label class="field"><span>Latitude</span><input type="number" formControlName="latitude" placeholder="Latitude"></label>
            <label class="field"><span>Longitude</span><input type="number" formControlName="longitude" placeholder="Longitude"></label>
            <label class="field field--full"><span>Pickup instructions</span><textarea formControlName="pickupInstructions" rows="4" placeholder="Pickup instructions"></textarea></label>
          </div>

          <label class="checkbox-field">
            <input type="checkbox" formControlName="isActive">
            <span>Active store</span>
          </label>

          @if (saveError(); as apiError) {

            <app-error-card

              [title]="apiError.status === 409 ? 'Already exists' : 'Unable to save the store'"

              [message]="apiError.message"

              [details]="apiError.details"

            />

          }


          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save store' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomStores">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    .form-shell {
      padding: 1.25rem;
      display: grid;
      gap: 1rem;
    }

    .uppercase {
      text-transform: uppercase;
    }

    .field--full {
      grid-column: 1 / -1;
    }

    .field textarea {
      min-height: 6.5rem;
      resize: vertical;
    }

    .checkbox-field {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 600;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StoreFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  /** A rejected save, kept apart from the load error above it (§31.2). */
  readonly saveError = signal<ApiError | null>(null);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({
    name: ['', [Validators.required]],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    ...ADDRESS_FIELD_CONTROLS,
    // A store is placed at least to its county and town; the levels between follow from the town.
    countyId: [null as number | null, [Validators.required]],
    townId: [null as number | null, [Validators.required]],
    landmark: [''],
    contactPhone: ['', [Validators.required]],
    operatingHours: [''],
    latitude: [''],
    longitude: [''],
    pickupInstructions: [''],
    isActive: [true]
  });

  get isEditMode(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      if (!this.isEditMode) {
        this.form.reset({
          name: '',
          code: '',
          ...EMPTY_ADDRESS_FIELDS,
          landmark: '',
          contactPhone: '',
          operatingHours: '',
          latitude: '',
          longitude: '',
          pickupInstructions: '',
          isActive: true
        });
        return;
      }

      const storeId = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isNaN(storeId)) {
        this.error.set('Invalid store id');
        return;
      }

      const store = await firstValueFrom(this.ecommerceService.getStore(storeId));
      this.patchForm(store);
    } catch (error) {
      // A failed load belongs in the error-state that replaces the form, not in
      // the save card, which is about a submit the operator just made.
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.toRequestPayload(this.form.getRawValue());
    this.saving.set(true);
    this.saveError.set(null);

    try {
      const savedStore = this.isEditMode
        ? await firstValueFrom(this.ecommerceService.updateStore(this.getStoreId(), payload))
        : await firstValueFrom(this.ecommerceService.createStore(payload));

      await this.router.navigateByUrl(RoutePaths.ecomStoreDetail(savedStore.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private patchForm(store: StoreDetail): void {
    this.form.patchValue({
      name: store.name || '',
      code: store.code || '',
      countyId: store.countyId ?? null,
      subCountyId: store.subCountyId ?? null,
      wardId: store.wardId ?? null,
      townId: store.townId ?? null,
      estate: store.estate ?? '',
      street: store.addressLine1 ?? '',
      buildingHouse: store.buildingHouse ?? '',
      landmark: store.landmark || '',
      contactPhone: store.contactPhone || '',
      operatingHours: store.operatingHours || '',
      latitude: store.latitude === null || store.latitude === undefined ? '' : String(store.latitude),
      longitude: store.longitude === null || store.longitude === undefined ? '' : String(store.longitude),
      pickupInstructions: store.pickupInstructions || '',
      isActive: store.isActive ?? true
    });
  }

  private toRequestPayload(raw: StoreFormValue): StoreUpsertRequest {
    return {
      name: raw.name.trim(),
      code: raw.code.trim().toUpperCase(),
      countyId: Number(raw.countyId),
      subCountyId: raw.subCountyId,
      wardId: raw.wardId,
      townId: Number(raw.townId),
      estate: this.normalizeText(raw.estate),
      addressLine1: this.normalizeText(raw.street),
      buildingHouse: this.normalizeText(raw.buildingHouse),
      landmark: this.normalizeText(raw.landmark),
      contactPhone: this.normalizeText(raw.contactPhone),
      operatingHours: this.normalizeText(raw.operatingHours),
      latitude: this.normalizeNumber(raw.latitude),
      longitude: this.normalizeNumber(raw.longitude),
      pickupInstructions: this.normalizeText(raw.pickupInstructions),
      isActive: raw.isActive
    };
  }

  private normalizeText(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? null : numeric;
  }

  private getStoreId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

}
