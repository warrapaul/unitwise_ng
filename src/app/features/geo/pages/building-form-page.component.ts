import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CoordinateFieldComponent, Coordinates } from '../../../shared/components/coordinate-field/coordinate-field.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { distanceLabel } from '../../../shared/utils/maps.util';
import { GeoService } from '../geo.service';
import { BUILDING_TYPES, BuildingType, GeoBuildingPreview, GeoLandmarkPreview, GeoRegionLookup, kindLabel } from '../models/geo.models';

/**
 * A building customers live in. The point decides the region (and is refused
 * outside every region); the landmark is the nearest unless one is chosen.
 *
 * Before a second record is made for the same block, buildings already mapped
 * within a few metres are shown — riders at the same gate should land on one.
 */
@Component({
  selector: 'app-building-form-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FormFeedbackDirective, LoadingStateComponent, ErrorStateComponent,
    ErrorCardComponent, SectionCardComponent, CoordinateFieldComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading building..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit building' : 'New building'"
                            subtitle="Where customers live: an apartment block, a court, a hostel, a home.">
            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="e.g. Sunrise Apartments, Block B">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>
              <label class="field">
                <span>Code <span class="muted">(optional)</span></span>
                <input formControlName="code" class="slug" placeholder="e.g. KAS-B007" autocomplete="off">
                <small class="hint">{{ isEdit() ? 'Printed on banners; change it only if nothing uses it yet.' : 'Leave empty to generate one from the region.' }}</small>
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="buildingType">
                  @for (type of types; track type) { <option [value]="type">{{ label(type) }}</option> }
                </select>
              </label>
              <label class="field">
                <span>Floors <span class="muted">(optional)</span></span>
                <input type="number" min="0" formControlName="floors">
              </label>
            </div>
            <label class="field field--wide">
              <span>How to get in <span class="muted">(optional)</span></span>
              <textarea formControlName="description" rows="2" placeholder="e.g. Black gate on the left, park by the kiosk"></textarea>
            </label>
            <div class="grid-auto">
              <label class="field">
                <span>Caretaker or guard <span class="muted">(optional)</span></span>
                <input formControlName="contactName">
              </label>
              <label class="field">
                <span>Their phone <span class="muted">(optional)</span></span>
                <input formControlName="contactPhone" inputmode="tel">
              </label>
            </div>
            <label class="checkbox-field">
              <input type="checkbox" formControlName="isActive">
              <span>Active</span>
            </label>
          </app-section-card>

          <app-section-card title="Location">
            <app-coordinate-field
              [latitude]="form.controls.latitude.value"
              [longitude]="form.controls.longitude.value"
              legend="The gate"
              hint="Stand at the gate and use your location, or paste a Google Maps link."
              (changed)="onPoint($event)"
            />
            @if (coverage() === 'uncovered') {
              <p class="error-text" role="alert">This area is not covered yet. Buildings can only be added inside a mapped region.</p>
            } @else if (region(); as found) {
              <p class="ok">In <strong>{{ found.name }}</strong>@if (found.parentName) { <span class="muted"> · {{ found.parentName }}</span> }</p>
            }

            @if (duplicates().length > 0) {
              <div class="alert alert-warning">
                <strong>Already mapped here?</strong>
                <ul class="plain">
                  @for (building of duplicates(); track building.id) {
                    <li>
                      <a [routerLink]="RoutePaths.geoBuildingDetail(building.id)">{{ building.name }}</a>
                      <span class="muted"> · {{ building.code }} · {{ distance(building.distanceMeters) }} away</span>
                    </li>
                  }
                </ul>
              </div>
            }

            <label class="field">
              <span>Near landmark</span>
              <select formControlName="landmarkId">
                <option value="">{{ isEdit() ? 'None' : 'The closest one' }}</option>
                @for (landmark of landmarks(); track landmark.id) {
                  <option [value]="landmark.id">{{ landmark.name }}{{ landmark.code ? ' (' + landmark.code + ')' : '' }}</option>
                }
              </select>
              <small class="hint">Landmarks within 1.5 km of the point.</small>
            </label>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card title="Building not saved" [message]="apiError.message" [details]="apiError.details" />
          }
          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving() || coverage() === 'uncovered'">
              {{ saving() ? 'Saving...' : isEdit() ? 'Save changes' : 'Create building' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.geoBuildings">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    .field--wide textarea { max-width: var(--field-max-width-wide, 720px); }
    .checkbox-field { display: flex; align-items: center; gap: 0.5rem; }
    .checkbox-field input { width: auto; }
    .ok { margin: 0; }
    .ok strong { color: var(--success); }
    .plain { margin: 0.35rem 0 0; padding-left: 1.1rem; }
    .error-text { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly types = BUILDING_TYPES;
  readonly id = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly geo = inject(GeoService);
  private readonly router = inject(Router);

  readonly isEdit = computed(() => !!this.id());
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly region = signal<GeoRegionLookup | null>(null);
  readonly coverage = signal<'unknown' | 'covered' | 'uncovered'>('unknown');
  readonly landmarks = signal<GeoLandmarkPreview[]>([]);
  readonly duplicates = signal<GeoBuildingPreview[]>([]);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    buildingType: 'APARTMENT' as BuildingType,
    code: ['', [Validators.maxLength(50)]],
    floors: [null as number | null, [Validators.min(0)]],
    description: '',
    contactName: '',
    contactPhone: '',
    latitude: [null as number | null, [Validators.required]],
    longitude: [null as number | null, [Validators.required]],
    landmarkId: '',
    isActive: true
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const id = this.id();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const b = await firstValueFrom(this.geo.getBuilding(id));
      this.form.patchValue({
        name: b.name, code: b.code ?? '', buildingType: (b.buildingType ?? 'APARTMENT') as BuildingType, floors: b.floors ?? null,
        description: b.description ?? '', contactName: b.contactName ?? '', contactPhone: b.contactPhone ?? '',
        latitude: b.latitude ?? null, longitude: b.longitude ?? null, landmarkId: b.landmarkId ?? '', isActive: b.isActive ?? true
      });
      if (b.latitude != null && b.longitude != null) {
        void this.lookAround(Number(b.latitude), Number(b.longitude));
      }
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  onPoint(point: Coordinates | null): void {
    this.form.patchValue({ latitude: point?.latitude ?? null, longitude: point?.longitude ?? null });
    if (point) {
      void this.lookAround(point.latitude, point.longitude);
    } else {
      this.region.set(null);
      this.coverage.set('unknown');
      this.duplicates.set([]);
      this.landmarks.set([]);
    }
  }

  /** Region, landmarks to choose from, and buildings already at this gate. */
  private async lookAround(lat: number, lng: number): Promise<void> {
    const [region, landmarks, nearby] = await Promise.all([
      firstValueFrom(this.geo.findRegionForPoint(lat, lng)).catch(() => undefined),
      firstValueFrom(this.geo.findNearbyLandmarks(lat, lng, 1.5)).catch(() => []),
      firstValueFrom(this.geo.nearbyBuildings(lat, lng, 100)).catch(() => [])
    ]);
    if (this.form.controls.latitude.value !== lat || this.form.controls.longitude.value !== lng) {
      return; // Moved again meanwhile.
    }
    this.region.set(region ?? null);
    this.coverage.set(region === undefined ? 'unknown' : region ? 'covered' : 'uncovered');
    this.landmarks.set(landmarks);
    this.duplicates.set(nearby.filter((b) => b.id !== this.id()));
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.latitude.invalid) {
        this.saveError.set({ message: 'Set the location: use your location at the gate, or paste a map link.' } as ApiError);
      }
      return;
    }
    const v = this.form.getRawValue();
    const request = {
      name: v.name.trim(),
      // Empty: generated on create, left as it is on edit.
      code: v.code.trim() ? v.code.trim().toUpperCase() : undefined,
      buildingType: v.buildingType,
      floors: v.floors,
      description: v.description.trim() || null,
      contactName: v.contactName.trim() || null,
      contactPhone: v.contactPhone.trim() || null,
      latitude: v.latitude!,
      longitude: v.longitude!,
      isActive: v.isActive
    };
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const id = this.id();
      const saved = id
        ? await firstValueFrom(this.geo.updateBuilding(id, { ...request, landmarkId: v.landmarkId }))
        : await firstValueFrom(this.geo.createBuilding({ ...request, landmarkId: v.landmarkId || null }));
      await this.router.navigateByUrl(RoutePaths.geoBuildingDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  label(type: string): string {
    return kindLabel(type);
  }

  distance(meters: number | null | undefined): string {
    return distanceLabel(meters);
  }
}
