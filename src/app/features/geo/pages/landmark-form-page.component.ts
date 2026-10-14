import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, merge } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { MapActionsComponent } from '../../../shared/components/map-actions/map-actions.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { GeoService } from '../geo.service';
import { MAP_LINK_FAILURES, MapLinkService } from '../../../shared/services/map-link.service';
import { GeoRegionLookup, LANDMARK_TYPES } from '../models/geo.models';

type Coverage = { state: 'idle' | 'checking' } | { state: 'covered'; region: GeoRegionLookup } | { state: 'uncovered' };

/**
 * A landmark is a point everyone in the area knows. Its region is never picked:
 * the server takes the innermost region holding the point and refuses one
 * outside every region, so the form shows that answer as soon as there is a point.
 *
 * The point can come from a pasted Maps link or coordinates, from the device
 * (a rider standing at the gate), or typed in.
 */
@Component({
  selector: 'app-landmark-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    MapActionsComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading landmark..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit landmark' : 'New landmark'"
                            subtitle="A place everyone nearby knows: a school, a church, a petrol station.">
            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="e.g. St. Mary's Primary School">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field">
                <span>Type</span>
                <input formControlName="landmarkType" list="landmark-types" placeholder="School, church...">
                <datalist id="landmark-types">
                  @for (type of types; track type) { <option [value]="type">{{ label(type) }}</option> }
                </datalist>
              </label>
            </div>

            <label class="field field--wide">
              <span>Description <span class="muted">(optional)</span></span>
              <textarea formControlName="description" rows="2" placeholder="e.g. Opposite the stage, blue gate"></textarea>
            </label>

            <label class="checkbox-field">
              <input type="checkbox" formControlName="isActive">
              <span>Active</span>
            </label>
          </app-section-card>

          <app-section-card title="Location" subtitle="Paste a Google Maps link, use where you are standing, or type the coordinates.">
            <div class="locate">
              <label class="field locate__link">
                <span class="visually-hidden">Google Maps link or coordinates</span>
                <input [value]="link()" (input)="link.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); readLink()"
                       placeholder="https://maps.app.goo.gl/...  or  -1.2921, 36.8219" autocomplete="off">
              </label>
              <button type="button" class="btn btn-secondary" [disabled]="reading() || !link().trim()" (click)="readLink()">
                {{ reading() ? 'Reading...' : 'Use link' }}
              </button>
              <button type="button" class="btn btn-secondary" [disabled]="locating()" (click)="useMyLocation()">
                {{ locating() ? 'Locating...' : 'Use my location' }}
              </button>
            </div>
            @if (locateMessage(); as message) { <small class="hint">{{ message }}</small> }
            @if (locateError(); as message) { <small class="error-text" role="alert">{{ message }}</small> }

            <div class="grid-auto">
              <label class="field">
                <span>Latitude</span>
                <input type="number" step="any" formControlName="latitude" placeholder="-1.2611">
                @if (form.controls.latitude.invalid && form.controls.latitude.touched) {
                  <small class="error-text">Latitude must be between -90 and 90.</small>
                }
              </label>

              <label class="field">
                <span>Longitude</span>
                <input type="number" step="any" formControlName="longitude" placeholder="36.8009">
                @if (form.controls.longitude.invalid && form.controls.longitude.touched) {
                  <small class="error-text">Longitude must be between -180 and 180.</small>
                }
              </label>
            </div>

            @switch (coverage().state) {
              @case ('checking') { <p class="muted coverage">Checking the area...</p> }
              @case ('covered') {
                @if (coveredRegion(); as region) {
                  <p class="coverage coverage--ok">
                    In <strong>{{ region.name }}</strong>
                    @if (region.parentName) { <span class="muted"> · {{ region.parentName }}</span> }
                  </p>
                }
              }
              @case ('uncovered') {
                <p class="coverage error-text" role="alert">This area is not covered yet. Landmarks can only be added inside a mapped region.</p>
              }
            }
            <app-map-actions [latitude]="form.controls.latitude.value" [longitude]="form.controls.longitude.value" />
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Landmark already exists' : 'Unable to save landmark'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving() || coverage().state === 'uncovered'">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create landmark') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.geoLandmarks">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form { display: grid; gap: 1rem; }
    .field--wide textarea { max-width: var(--field-max-width-wide, 720px); }
    .checkbox-field { display: flex; align-items: center; gap: 0.5rem; }
    .checkbox-field input { width: auto; }
    .button-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .locate { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start; }
    .locate__link { flex: 1 1 18rem; max-width: 36rem; }
    .coverage { margin: 0; }
    .coverage--ok strong { color: var(--success); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandmarkFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly types = LANDMARK_TYPES;

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly geoService = inject(GeoService);
  private readonly mapLinks = inject(MapLinkService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly link = signal('');
  readonly reading = signal(false);
  readonly locating = signal(false);
  readonly locateMessage = signal<string | null>(null);
  readonly locateError = signal<string | null>(null);
  readonly coverage = signal<Coverage>({ state: 'idle' });
  readonly coveredRegion = computed(() => {
    const coverage = this.coverage();
    return coverage.state === 'covered' ? coverage.region : null;
  });

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: '',
    landmarkType: '',
    latitude: [null as number | null, [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.required, Validators.min(-180), Validators.max(180)]],
    isActive: true
  });

  ngOnInit(): void {
    merge(this.form.controls.latitude.valueChanges, this.form.controls.longitude.valueChanges)
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.checkCoverage());
    void this.reload();
  }

  async reload(): Promise<void> {
    const landmarkId = this.id();
    if (!landmarkId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const landmark = await firstValueFrom(this.geoService.getLandmark(landmarkId));
      this.form.patchValue({
        name: landmark.name,
        description: landmark.description ?? '',
        landmarkType: landmark.landmarkType ?? '',
        latitude: landmark.latitude ?? null,
        longitude: landmark.longitude ?? null,
        isActive: landmark.isActive ?? true
      });
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** A Maps link (short or full) or "lat, lng", read by the server. */
  async readLink(): Promise<void> {
    const link = this.link().trim();
    if (!link) {
      return;
    }
    this.reading.set(true);
    this.locateError.set(null);
    this.locateMessage.set(null);
    try {
      const result = await firstValueFrom(this.mapLinks.resolve(link));
      if (!result.found || result.latitude == null || result.longitude == null) {
        this.locateError.set(MAP_LINK_FAILURES[result.reason ?? ''] ?? MAP_LINK_FAILURES['NO_LOCATION_IN_LINK']);
        return;
      }
      this.setPoint(result.latitude, result.longitude);
      if (result.name && !this.form.controls.name.value.trim()) {
        this.form.controls.name.setValue(result.name);
      }
      this.locateMessage.set(result.source === 'viewport'
        ? 'Taken from where the map was centred, not a pin — check it before saving.'
        : 'Location filled from the link.');
    } catch (error) {
      this.locateError.set(toApiError(error).message);
    } finally {
      this.reading.set(false);
    }
  }

  /** Where the device is: a rider standing at the place adds it without typing. */
  useMyLocation(): void {
    if (!('geolocation' in navigator)) {
      this.locateError.set('This device cannot share its location.');
      return;
    }
    this.locating.set(true);
    this.locateError.set(null);
    this.locateMessage.set(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.locating.set(false);
        this.setPoint(position.coords.latitude, position.coords.longitude);
        this.locateMessage.set(`Your location, accurate to about ${Math.round(position.coords.accuracy)} m.`);
      },
      (failure) => {
        this.locating.set(false);
        this.locateError.set(failure.code === failure.PERMISSION_DENIED
          ? 'Location is blocked for this site. Allow it in the browser, or paste a Maps link.'
          : 'Could not get your location. Try again outdoors, or paste a Maps link.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  private setPoint(lat: number, lng: number): void {
    this.form.patchValue({ latitude: round(lat), longitude: round(lng) });
    this.form.controls.latitude.markAsTouched();
    this.form.controls.longitude.markAsTouched();
  }

  private async checkCoverage(): Promise<void> {
    const { latitude, longitude } = this.form.getRawValue();
    if (latitude === null || longitude === null || this.form.controls.latitude.invalid || this.form.controls.longitude.invalid) {
      this.coverage.set({ state: 'idle' });
      return;
    }
    this.coverage.set({ state: 'checking' });
    try {
      const region = await firstValueFrom(this.geoService.findRegionForPoint(latitude, longitude));
      const current = this.form.getRawValue();
      if (current.latitude !== latitude || current.longitude !== longitude) {
        return; // Moved again while checking.
      }
      this.coverage.set(region ? { state: 'covered', region } : { state: 'uncovered' });
    } catch {
      // The save still checks; an unanswered preview is not a refusal.
      this.coverage.set({ state: 'idle' });
    }
  }

  label(type: string): string {
    return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
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
      name: value.name.trim(),
      description: value.description || null,
      landmarkType: value.landmarkType || null,
      latitude: value.latitude!,
      longitude: value.longitude!,
      isActive: value.isActive
    };

    try {
      const landmarkId = this.id();
      const saved = landmarkId
        ? await firstValueFrom(this.geoService.updateLandmark(landmarkId, request))
        : await firstValueFrom(this.geoService.createLandmark(request));

      await this.router.navigateByUrl(RoutePaths.geoLandmarkDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}

/** Seven decimals: what the columns hold, about a centimetre. */
function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
