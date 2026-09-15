import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom } from 'rxjs';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';
import { AddressesService } from '../addresses.service';
import { AddressDetail, AddressUpsertRequest } from '../models/address.models';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AddressLike, AddressPreviewComponent } from '../../../shared/components/address-preview/address-preview.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

@Component({
  selector: 'app-address-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    FormFeedbackDirective,
    EntityPickerComponent,
    SectionCardComponent,
    AddressPreviewComponent,
    CoordinateFieldComponent
  ],
  template: `
    <section class="panel form-shell">
      <div class="stack">
        <h1 class="heading-lg">{{ isEditMode ? 'Update address' : 'Create a new address' }}</h1>
        <p class="muted">Manage city, county, sub-county, ward, and map details in one place.</p>
      </div>

      @if (loading()) {
        <app-loading-state [label]="isEditMode ? 'Loading address...' : 'Preparing form...'" />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load address form'" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <!--
            County first, because everything else is scoped by it: the city,
            sub-county, ward and town pickers each search inside the county
            already chosen, which turns four thousand wards into eight.
          -->
          <div class="grid-auto">
            <label class="field"><span>County</span>
              <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="Select a county" />
            </label>

            <label class="field"><span>City</span>
              @if (countyId(); as county) {
                <app-entity-picker [config]="pickers.citiesIn(county)" formControlName="cityId" placeholder="Select a city" />
              } @else {
                <app-entity-picker [config]="pickers.city" formControlName="cityId" placeholder="Select a city" />
              }
            </label>

            <label class="field"><span>Town</span>
              <app-entity-picker
                [config]="pickers.townsIn(cityId(), countyId())"
                formControlName="townId"
                placeholder="Select a town"
              />
              @if (!cityId() && !countyId()) {
                <small class="hint">Choose a county to narrow this.</small>
              }
            </label>

            <label class="field"><span>Sub-county</span>
              @if (countyId(); as county) {
                <app-entity-picker
                  [config]="pickers.subCountiesIn(county)"
                  formControlName="subCountyId"
                  placeholder="Select a sub-county"
                />
              } @else {
                <small class="hint">Choose a county first.</small>
              }
            </label>

            <label class="field"><span>Ward</span>
              @if (subCountyId() || countyId()) {
                <app-entity-picker
                  [config]="pickers.wardsIn(subCountyId(), countyId())"
                  formControlName="wardId"
                  placeholder="Select a ward"
                />
              } @else {
                <small class="hint">Choose a county first.</small>
              }
            </label>

            <label class="field"><span>Postal code</span><input formControlName="postalCode" placeholder="Postal code"></label>

            <label class="field field--full"><span>Description</span>
              <input formControlName="description" placeholder="e.g. Gate 3, opposite the petrol station">
              <small class="hint">How someone finds it on the ground. Optional.</small>
            </label>
          </div>

          <app-coordinate-field
            legend="Location"
            [latitude]="form.controls.latitude.value"
            [longitude]="form.controls.longitude.value"
            [pin]="form.controls.mapPin.value"
            (changed)="onCoordinatesChanged($event)"
            (pinChanged)="form.controls.mapPin.setValue($event)"
          />

          <app-section-card title="Preview">
            <app-address-preview [address]="previewAddress()" [block]="true" empty="Nothing entered yet" />
          </app-section-card>

          @if (saveError(); as apiError) {

            <app-error-card

              [title]="apiError.status === 409 ? 'Already exists' : 'Unable to save the address'"

              [message]="apiError.message"

              [details]="apiError.details"

            />

          }


          <div class="button-row">
            <button type="submit" class="btn btn-primary">
              {{ isEditMode ? 'Save changes' : 'Create address' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.addressRecords">Cancel</a>
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

    .field--full {
      grid-column: 1 / -1;
    }

    .field textarea {
      min-height: 6.5rem;
      resize: vertical;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly fb = inject(NonNullableFormBuilder);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly addressesService = inject(AddressesService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** A rejected save, kept apart from the load error above it (§31.2). */
  readonly saveError = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    /*
     * Ids, not names. The backend resolves each to its canonical name and stores
     * that alongside for display, so two operators can no longer file the same
     * place under "Nairobi" and "nairobi".
     */
    countyId: [null as number | null],
    cityId: [null as number | null],
    townId: [null as number | null],
    subCountyId: [null as number | null],
    wardId: [null as number | null],
    description: [''],
    postalCode: [''],
    latitude: [''],
    longitude: [''],
    mapPin: ['']
  });

  /*
   * Read as signals so the dependent pickers rebuild when their parent changes:
   * a ward picker scoped to the wrong sub-county is worse than an unscoped one.
   */
  readonly countyId = toSignal(this.form.controls.countyId.valueChanges, {
    initialValue: this.form.controls.countyId.value
  });
  readonly cityId = toSignal(this.form.controls.cityId.valueChanges, {
    initialValue: this.form.controls.cityId.value
  });
  readonly subCountyId = toSignal(this.form.controls.subCountyId.valueChanges, {
    initialValue: this.form.controls.subCountyId.value
  });

  /** Names for the preview, resolved from what the pickers chose. */
  readonly resolvedNames = signal<Record<string, string>>({});

  readonly previewAddress = computed<AddressLike>(() => {
    const value = this.form.getRawValue();
    const names = this.resolvedNames();

    return {
      ward: names['ward'] ?? null,
      subCounty: names['subCounty'] ?? null,
      town: names['town'] ?? null,
      city: names['city'] ?? null,
      county: names['county'] ?? null,
      postalCode: value.postalCode || null,
      description: value.description || null,
      latitude: value.latitude || null,
      longitude: value.longitude || null,
      mapPin: value.mapPin || null
    };
  });

  onCoordinatesChanged(point: Coordinates | null): void {
    this.form.patchValue({
      latitude: point ? String(point.latitude) : '',
      longitude: point ? String(point.longitude) : ''
    });
  }

  get isEditMode(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  constructor() {
    // The preview needs names, and the pickers only hand back ids.
    this.form.valueChanges
      .pipe(debounceTime(150), takeUntilDestroyed())
      .subscribe(() => void this.resolveNames());
  }

  ngOnInit(): void {
    void this.load();
  }

  /**
   * Turns the chosen ids into names for the preview. Each lookup is a single
   * GET the backend serves as reference data, and a failure just leaves that
   * part of the preview blank rather than breaking the form.
   */
  private async resolveNames(): Promise<void> {
    const value = this.form.getRawValue();
    const names: Record<string, string> = {};

    const lookups: Array<[string, Promise<{ name: string } | null>]> = [
      ['county', value.countyId ? firstValueFrom(this.addressesService.getCounty(value.countyId)).catch(() => null) : Promise.resolve(null)],
      ['city', value.cityId ? firstValueFrom(this.addressesService.getCity(value.cityId)).catch(() => null) : Promise.resolve(null)],
      ['town', value.townId ? firstValueFrom(this.addressesService.getTown(value.townId)).catch(() => null) : Promise.resolve(null)],
      ['subCounty', value.subCountyId ? firstValueFrom(this.addressesService.getSubCounty(value.subCountyId)).catch(() => null) : Promise.resolve(null)],
      ['ward', value.wardId ? firstValueFrom(this.addressesService.getWard(value.wardId)).catch(() => null) : Promise.resolve(null)]
    ];

    for (const [key, lookup] of lookups) {
      const result = await lookup;
      if (result?.name) {
        names[key] = result.name;
      }
    }

    this.resolvedNames.set(names);
  }

  async load(): Promise<void> {
    if (!this.isEditMode) {
      this.loading.set(false);
      this.error.set(null);
      this.form.reset({
        countyId: null,
        cityId: null,
        townId: null,
        subCountyId: null,
        wardId: null,
        description: '',
        postalCode: '',
        latitude: '',
        longitude: '',
        mapPin: ''
      });
      return;
    }

    const addressId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(addressId)) {
      this.error.set('Invalid address id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const address = await firstValueFrom(this.addressesService.getAddress(addressId));
      this.patchForm(address);
    } catch (error) {
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
    this.loading.set(true);
    this.saveError.set(null);

    try {
      const saved = this.isEditMode
        ? await firstValueFrom(this.addressesService.updateAddress(this.getAddressId(), payload))
        : await firstValueFrom(this.addressesService.createAddress(payload));

      await this.router.navigateByUrl(RoutePaths.addressDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private patchForm(address: AddressDetail): void {
    this.form.patchValue({
      countyId: address.countyId ?? null,
      cityId: address.cityId ?? null,
      townId: address.townId ?? null,
      subCountyId: address.subCountyId ?? null,
      wardId: address.wardId ?? null,
      description: address.description || '',
      postalCode: address.postalCode || '',
      latitude: address.latitude === null || address.latitude === undefined ? '' : String(address.latitude),
      longitude: address.longitude === null || address.longitude === undefined ? '' : String(address.longitude),
      mapPin: address.mapPin || ''
    });
  }

  private toRequestPayload(raw: ReturnType<typeof this.form.getRawValue>): AddressUpsertRequest {
    return {
      countyId: raw.countyId,
      cityId: raw.cityId,
      townId: raw.townId,
      subCountyId: raw.subCountyId,
      wardId: raw.wardId,
      description: this.normalizeText(raw.description),
      postalCode: this.normalizeText(raw.postalCode),
      latitude: this.normalizeNumber(raw.latitude),
      longitude: this.normalizeNumber(raw.longitude),
      mapPin: this.normalizeText(raw.mapPin)
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

  private getAddressId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

}
