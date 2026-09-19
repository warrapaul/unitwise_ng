import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { GeoService } from '../geo.service';
import { GEO_LANDMARK_SORTABLE_FIELDS, GeoLandmarkPreview, GeoLandmarkSearchParams } from '../models/geo.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type LandmarkSortField = typeof GEO_LANDMARK_SORTABLE_FIELDS[number];

@Component({
  selector: 'app-landmark-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Geo landmarks">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.GEO_LANDMARK_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.geoLandmarkCreate">New landmark</a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name" placeholder="Landmark name"></label>
              <label class="field"><span>Type</span><input formControlName="landmarkType" placeholder="SCHOOL, MALL..."></label>
              <label class="field"><span>Region ID</span><input formControlName="regionId" placeholder="Region UUID"></label>
              <label class="field">
                <span>Status</span>
                <select formControlName="isActive">
                  <option value="">Any</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-section-card title="Find nearby">
        <app-filter-panel actions [form]="nearbyForm">
          <form class="filters" [formGroup]="nearbyForm" appFormFeedback (ngSubmit)="findNearby()">
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Latitude</span>
                <input type="number" step="any" formControlName="lat" placeholder="-1.2921">
                @if (nearbyForm.controls.lat.invalid && nearbyForm.controls.lat.touched) {
                  <small class="error-text">Latitude is required.</small>
                }
              </label>
              <label class="field">
                <span>Longitude</span>
                <input type="number" step="any" formControlName="lng" placeholder="36.8219">
                @if (nearbyForm.controls.lng.invalid && nearbyForm.controls.lng.touched) {
                  <small class="error-text">Longitude is required.</small>
                }
              </label>
              <label class="field">
                <span>Radius (km)</span>
                <input type="number" step="0.5" min="0.1" formControlName="radiusKm">
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-secondary" [disabled]="searchingNearby()">
                {{ searchingNearby() ? 'Searching...' : 'Search nearby' }}
              </button>
              @if (nearbyMode()) {
                <button type="button" class="btn btn-secondary" (click)="exitNearbyMode()">Back to all landmarks</button>
              }
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading landmarks..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (landmarks().length === 0) {
        <app-empty-state title="No landmarks found" description="Try a different search or clear the filters." />
      } @else {
        <section class="panel table-shell">
          <!-- A nearby search returns one unpaged set, so it has no pagination
               bar to carry its count. Every other mode does. -->
          @if (nearbyMode()) {
            <header class="table-shell__header">
              <p class="muted">{{ landmarks().length }} nearby landmarks</p>
            </header>
          }

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Landmark"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="landmarkType"
                      label="Type"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Coordinates</th>
                  <th>Region</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (landmark of landmarks(); track landmark.id) {
                  <tr [appRowLink]="RoutePaths.geoLandmarkDetail(landmark.id)">
                    <td>
                      <a class="record-link__primary" [routerLink]="RoutePaths.geoLandmarkDetail(landmark.id)">{{ landmark.name }}</a>
                    </td>
                    <td>{{ landmark.landmarkType || '-' }}</td>
                    <td class="mono">{{ formatCoordinates(landmark) }}</td>
                    <td>{{ landmark.regionName || '-' }}</td>
                    <td>
                      <app-status-chip [status]="landmark.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (!nearbyMode() && pagination()) {
          <app-pagination
            [shown]="landmarks().length"
            [total]="pagination()?.totalElements ?? landmarks().length"
            noun="landmarks"
            [pagination]="pagination()!"
            [size]="pagination()!.size"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .filters {
      display: grid;
      gap: 0.75rem;
    }


    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .table-shell__header p {
      margin: 0;
      font-size: 0.9rem;
    }

    .table-scroll {
      overflow: auto;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.82rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandmarkListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly geoService = inject(GeoService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchingNearby = signal(false);
  readonly nearbyMode = signal(false);
  readonly landmarks = signal<GeoLandmarkPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly form = this.formBuilder.group({
    name: '',
    landmarkType: '',
    regionId: '',
    isActive: '',
    page: 0,
    size: 20,
  });

  readonly nearbyForm = this.formBuilder.group({
    lat: [null as number | null],
    lng: [null as number | null],
    radiusKm: 2
  });

  ngOnInit(): void {
    void this.reload();
  }

  async search(): Promise<void> {
    this.nearbyMode.set(false);
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.nearbyMode.set(false);
    this.form.reset({
      name: '',
      landmarkType: '',
      regionId: '',
      isActive: '',
      page: 0,
      size: this.form.getRawValue().size,
    });
    await this.reload();
  }

  async findNearby(): Promise<void> {
    const { lat, lng, radiusKm } = this.nearbyForm.getRawValue();
    if (lat === null || lng === null) {
      this.nearbyForm.markAllAsTouched();
      return;
    }

    this.searchingNearby.set(true);
    this.error.set(null);

    try {
      const results = await firstValueFrom(this.geoService.findNearbyLandmarks(lat, lng, radiusKm || 2));
      this.landmarks.set(results);
      this.pagination.set(null);
      this.nearbyMode.set(true);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.searchingNearby.set(false);
    }
  }

  async exitNearbyMode(): Promise<void> {
    this.nearbyMode.set(false);
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.reload();
  }


  formatCoordinates(landmark: GeoLandmarkPreview): string {
    if (landmark.latitude === null || landmark.latitude === undefined
      || landmark.longitude === null || landmark.longitude === undefined) {
      return '-';
    }

    return `${landmark.latitude}, ${landmark.longitude}`;
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(
        this.geoService.searchLandmarks({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as GeoLandmarkSearchParams)
      );
      this.landmarks.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
