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
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { GeoService } from '../geo.service';

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
          <app-section-card [title]="isEdit() ? 'Edit landmark' : 'New landmark'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Sarit Centre">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field">
                <span>Type</span>
                <input formControlName="landmarkType" placeholder="MALL">
              </label>

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

              @if (isEdit()) {
                <label class="field">
                  <span>Region ID</span>
                  <input formControlName="regionId" placeholder="Manual override only">
                  <small class="hint">Leave empty to let the backend assign the region from the coordinates.</small>
                </label>
              }
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>

            <label class="checkbox-field">
              <input type="checkbox" formControlName="isActive">
              <span>Active</span>
            </label>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Landmark already exists' : 'Unable to save landmark'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create landmark') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.geoLandmarks">Cancel</a>
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
      max-width: var(--field-max-width-wide, 720px);
    }

    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .checkbox-field input {
      width: auto;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandmarkFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly geoService = inject(GeoService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: '',
    landmarkType: '',
    latitude: [null as number | null, [Validators.required, Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.required, Validators.min(-180), Validators.max(180)]],
    regionId: '',
    isActive: true
  });

  ngOnInit(): void {
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
        regionId: landmark.regionId ?? '',
        isActive: landmark.isActive ?? true
      });
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      const landmarkId = this.id();
      const saved = landmarkId
        ? await firstValueFrom(this.geoService.updateLandmark(landmarkId, {
          name: value.name,
          description: value.description || null,
          landmarkType: value.landmarkType || null,
          latitude: value.latitude!,
          longitude: value.longitude!,
          regionId: value.regionId || null,
          isActive: value.isActive
        }))
        : await firstValueFrom(this.geoService.createLandmark({
          name: value.name,
          description: value.description || null,
          landmarkType: value.landmarkType || null,
          latitude: value.latitude!,
          longitude: value.longitude!,
          isActive: value.isActive
        }));

      await this.router.navigateByUrl(RoutePaths.geoLandmarkDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
