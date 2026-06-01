import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { AddressesService } from '../../addresses/addresses.service';
import { CityOption, CountyOption, TownOption } from '../../addresses/models/address.models';
import { EcommerceService } from '../ecommerce.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { StoreDetail, StoreUpsertRequest } from '../models/ecommerce.models';

type StoreFormValue = {
  name: string;
  code: string;
  countyId: string;
  cityId: string;
  townId: string;
  addressLine1: string;
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
  imports: [ReactiveFormsModule, RouterLink, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="panel form-shell">
      <div class="stack">
        <span class="pill">{{ isEditMode ? 'Edit store' : 'Create store' }}</span>
        <h1 class="heading-lg">{{ isEditMode ? 'Update store details' : 'Create a new store' }}</h1>
        <p class="muted">Pick county, then city, then town before saving the store.</p>
      </div>

      @if (loading()) {
        <app-loading-state [label]="isEditMode ? 'Loading store...' : 'Preparing form...'" />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load store form'" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <div class="grid-auto">
            <label class="field"><span>Name</span><input formControlName="name" placeholder="Store name"></label>
            <label class="field"><span>Code</span><input class="uppercase" formControlName="code" placeholder="Store code"></label>
            <label class="field">
              <span>County</span>
              <select formControlName="countyId" (change)="handleCountyChange()">
                <option value="">Select county</option>
                @for (county of counties(); track county.id) {
                  <option [value]="county.id">{{ county.name }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>City</span>
              <select formControlName="cityId" (change)="handleCityChange()" [disabled]="!form.controls.countyId.value">
                <option value="">Select city</option>
                @for (city of cities(); track city.id) {
                  <option [value]="city.id">{{ city.name }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span>Town</span>
              <select formControlName="townId" [disabled]="!form.controls.cityId.value">
                <option value="">Select town</option>
                @for (town of towns(); track town.id) {
                  <option [value]="town.id">{{ town.name }}</option>
                }
              </select>
            </label>
            <label class="field"><span>Address line</span><input formControlName="addressLine1" placeholder="Street or building address"></label>
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
      gap: 0.55rem;
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
  private readonly addressesService = inject(AddressesService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly counties = signal<CountyOption[]>([]);
  readonly cities = signal<CityOption[]>([]);
  readonly towns = signal<TownOption[]>([]);

  readonly form = this.fb.group({
    name: ['', [Validators.required]],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    countyId: ['', [Validators.required]],
    cityId: ['', [Validators.required]],
    townId: ['', [Validators.required]],
    addressLine1: [''],
    landmark: [''],
    contactPhone: [''],
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
      await this.loadCounties();

      if (!this.isEditMode) {
        this.form.reset({
          name: '',
          code: '',
          countyId: '',
          cityId: '',
          townId: '',
          addressLine1: '',
          landmark: '',
          contactPhone: '',
          operatingHours: '',
          latitude: '',
          longitude: '',
          pickupInstructions: '',
          isActive: true
        });
        this.cities.set([]);
        this.towns.set([]);
        return;
      }

      const storeId = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isNaN(storeId)) {
        this.error.set('Invalid store id');
        return;
      }

      const store = await firstValueFrom(this.ecommerceService.getStore(storeId));
      this.patchForm(store);
      await this.hydrateLocationSelections(store);
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async handleCountyChange(): Promise<void> {
    const countyId = this.form.controls.countyId.value;
    this.form.patchValue({ cityId: '', townId: '' });
    this.cities.set([]);
    this.towns.set([]);

    if (!countyId) {
      return;
    }

    await this.loadCities(Number(countyId));
  }

  async handleCityChange(): Promise<void> {
    const cityId = this.form.controls.cityId.value;
    this.form.patchValue({ townId: '' });
    this.towns.set([]);

    if (!cityId) {
      return;
    }

    await this.loadTowns(Number(cityId));
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.toRequestPayload(this.form.getRawValue());
    this.saving.set(true);
    this.error.set(null);

    try {
      const savedStore = this.isEditMode
        ? await firstValueFrom(this.ecommerceService.updateStore(this.getStoreId(), payload))
        : await firstValueFrom(this.ecommerceService.createStore(payload));

      await this.router.navigateByUrl(RoutePaths.ecomStoreDetail(savedStore.id));
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async loadCounties(): Promise<void> {
    this.counties.set(await firstValueFrom(this.addressesService.getCounties()));
  }

  private async loadCities(countyId: number): Promise<void> {
    this.cities.set(await firstValueFrom(this.addressesService.getCitiesByCounty(countyId)));
  }

  private async loadTowns(cityId: number): Promise<void> {
    this.towns.set(await firstValueFrom(this.addressesService.getTownsByCity(cityId)));
  }

  private async hydrateLocationSelections(store: StoreDetail): Promise<void> {
    const countyId = await this.resolveCountyId(store);
    if (!countyId) {
      return;
    }

    this.form.patchValue({ countyId: String(countyId) });
    await this.loadCities(countyId);

    const cityId = await this.resolveCityId(store, countyId);
    if (!cityId) {
      return;
    }

    this.form.patchValue({ cityId: String(cityId) });
    await this.loadTowns(cityId);

    const townId = await this.resolveTownId(store, cityId);
    if (townId) {
      this.form.patchValue({ townId: String(townId) });
    }
  }

  private async resolveCountyId(store: StoreDetail): Promise<number | null> {
    if (store.countyId) {
      return Number(store.countyId);
    }

    const countyName = store.county?.trim();
    if (!countyName) {
      return null;
    }

    const match = this.counties().find((county) => county.name.trim().toLowerCase() === countyName.toLowerCase());
    if (match) {
      return match.id;
    }

    const counties = await firstValueFrom(this.addressesService.getCounties(countyName));
    return counties.find((county) => county.name.trim().toLowerCase() === countyName.toLowerCase())?.id ?? null;
  }

  private async resolveCityId(store: StoreDetail, countyId: number): Promise<number | null> {
    if (store.cityId) {
      return Number(store.cityId);
    }

    const cityName = store.city?.trim();
    if (!cityName) {
      return null;
    }

    const match = this.cities().find((city) => city.name.trim().toLowerCase() === cityName.toLowerCase());
    if (match) {
      return match.id;
    }

    const cities = await firstValueFrom(this.addressesService.getCitiesByCounty(countyId, cityName));
    return cities.find((city) => city.name.trim().toLowerCase() === cityName.toLowerCase())?.id ?? null;
  }

  private async resolveTownId(store: StoreDetail, cityId: number): Promise<number | null> {
    if (store.townId) {
      return Number(store.townId);
    }

    const townName = store.town?.trim();
    if (!townName) {
      return null;
    }

    const match = this.towns().find((town) => town.name.trim().toLowerCase() === townName.toLowerCase());
    if (match) {
      return match.id;
    }

    const towns = await firstValueFrom(this.addressesService.getTownsByCity(cityId, townName));
    return towns.find((town) => town.name.trim().toLowerCase() === townName.toLowerCase())?.id ?? null;
  }

  private patchForm(store: StoreDetail): void {
    this.form.patchValue({
      name: store.name || '',
      code: store.code || '',
      countyId: store.countyId ? String(store.countyId) : '',
      cityId: store.cityId ? String(store.cityId) : '',
      townId: store.townId ? String(store.townId) : '',
      addressLine1: store.addressLine1 || '',
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
      cityId: Number(raw.cityId),
      townId: Number(raw.townId),
      addressLine1: this.normalizeText(raw.addressLine1),
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

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
