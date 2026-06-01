import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { AddressesService } from '../addresses.service';
import { AddressDetail, AddressUpsertRequest } from '../models/address.models';

@Component({
  selector: 'app-address-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="panel form-shell">
      <div class="stack">
        <span class="pill">{{ isEditMode ? 'Edit address' : 'Create address' }}</span>
        <h1 class="heading-lg">{{ isEditMode ? 'Update address' : 'Create a new address' }}</h1>
        <p class="muted">Manage city, county, sub-county, ward, and map details in one place.</p>
      </div>

      @if (loading()) {
        <app-loading-state [label]="isEditMode ? 'Loading address...' : 'Preparing form...'" />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load address form'" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
          <div class="grid-auto">
            <label class="field"><span>County</span><input formControlName="county" placeholder="County"></label>
            <label class="field"><span>City</span><input formControlName="city" placeholder="City"></label>
            <label class="field"><span>Sub-county</span><input formControlName="subCounty" placeholder="Sub-county"></label>
            <label class="field"><span>Ward</span><input formControlName="ward" placeholder="Ward"></label>
            <label class="field"><span>Postal code</span><input formControlName="postalCode" placeholder="Postal code"></label>
            <label class="field"><span>Latitude</span><input type="number" formControlName="latitude" placeholder="Latitude"></label>
            <label class="field"><span>Longitude</span><input type="number" formControlName="longitude" placeholder="Longitude"></label>
            <label class="field field--full"><span>Map pin</span><textarea formControlName="mapPin" rows="4" placeholder="Map pin or location reference"></textarea></label>
          </div>

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly addressesService = inject(AddressesService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    county: [''],
    city: [''],
    subCounty: [''],
    ward: [''],
    postalCode: [''],
    latitude: [''],
    longitude: [''],
    mapPin: ['']
  });

  get isEditMode(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.isEditMode) {
      this.loading.set(false);
      this.error.set(null);
      this.form.reset({
        county: '',
        city: '',
        subCounty: '',
        ward: '',
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
      this.error.set(this.extractErrorMessage(error));
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
    this.error.set(null);

    try {
      const saved = this.isEditMode
        ? await firstValueFrom(this.addressesService.updateAddress(this.getAddressId(), payload))
        : await firstValueFrom(this.addressesService.createAddress(payload));

      await this.router.navigateByUrl(RoutePaths.addressDetail(saved.id));
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private patchForm(address: AddressDetail): void {
    this.form.patchValue({
      county: address.county || '',
      city: address.city || '',
      subCounty: address.subCounty || '',
      ward: address.ward || '',
      postalCode: address.postalCode || '',
      latitude: address.latitude === null || address.latitude === undefined ? '' : String(address.latitude),
      longitude: address.longitude === null || address.longitude === undefined ? '' : String(address.longitude),
      mapPin: address.mapPin || ''
    });
  }

  private toRequestPayload(raw: ReturnType<typeof this.form.getRawValue>): AddressUpsertRequest {
    return {
      county: this.normalizeText(raw.county),
      city: this.normalizeText(raw.city),
      subCounty: this.normalizeText(raw.subCounty),
      ward: this.normalizeText(raw.ward),
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

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
