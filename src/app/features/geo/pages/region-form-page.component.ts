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
  selector: 'app-region-form-page',
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
        <app-loading-state label="Loading region..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit region' : 'New region'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name" placeholder="Westlands">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field">
                <span>Area code</span>
                <input formControlName="areaCode" placeholder="NRB-01">
              </label>

              <label class="field">
                <span>Parent region ID</span>
                <input formControlName="parentId" placeholder="Leave empty for a top-level region">
              </label>
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>

            <label class="field field--wide">
              <span>Polygon (WKT)</span>
              <textarea formControlName="polygonWkt" rows="4" placeholder="POLYGON((36.80 -1.26, 36.82 -1.26, 36.82 -1.28, 36.80 -1.28, 36.80 -1.26))"></textarea>
              <small class="hint">Leave empty to keep the region unmapped — GPS point lookups will skip it.</small>
            </label>

            <label class="checkbox-field">
              <input type="checkbox" formControlName="isActive">
              <span>Active</span>
            </label>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Region already exists' : 'Unable to save region'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create region') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.geoRegions">Cancel</a>
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
export class RegionFormPageComponent implements OnInit {
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
    name: ['', [Validators.required, Validators.maxLength(120)]],
    areaCode: '',
    description: '',
    parentId: '',
    polygonWkt: '',
    isActive: true
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const regionId = this.id();
    if (!regionId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const region = await firstValueFrom(this.geoService.getRegion(regionId));
      this.form.patchValue({
        name: region.name,
        areaCode: region.areaCode ?? '',
        description: region.description ?? '',
        parentId: region.parentId ?? '',
        polygonWkt: region.polygonWkt ?? '',
        isActive: region.isActive ?? true
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
    const request = {
      name: value.name,
      areaCode: value.areaCode || null,
      description: value.description || null,
      parentId: value.parentId || null,
      polygonWkt: value.polygonWkt || null,
      isActive: value.isActive
    };

    try {
      const regionId = this.id();
      const saved = regionId
        ? await firstValueFrom(this.geoService.updateRegion(regionId, request))
        : await firstValueFrom(this.geoService.createRegion(request));
      await this.router.navigateByUrl(RoutePaths.geoRegionDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
