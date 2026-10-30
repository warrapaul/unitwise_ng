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
import { parseLatLng } from '../../../shared/utils/maps.util';
import { GeoService } from '../geo.service';
import { GEO_LANDMARK_SORTABLE_FIELDS, GeoLandmarkPreview, GeoLandmarkSearchParams, LANDMARK_TYPES, kindLabel } from '../models/geo.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type LandmarkSortField = typeof GEO_LANDMARK_SORTABLE_FIELDS[number];

import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
@Component({
  selector: 'app-landmark-list-page',
  standalone: true,
  imports: [EntityPickerComponent, 
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

        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <!-- One row on a desktop: name, code, type, region, status. -->
            <div class="grid-auto filters-grid landmark-filters">
              <label class="field"><span>Name</span><input formControlName="name" placeholder="Landmark name"></label>
              <label class="field"><span>Code</span><input formControlName="code" class="slug" placeholder="e.g. KAS-014" autocomplete="off"></label>
              <label class="field">
                <span>Type</span>
                <select formControlName="landmarkType">
                  <option value="">Any</option>
                  @for (type of landmarkTypes; track type) { <option [value]="type">{{ kind(type) }}</option> }
                </select>
              </label>
              <label class="field"><span>Region</span><app-entity-picker [config]="pickers.geoRegion" formControlName="regionId" placeholder="Anywhere" /></label>
              @if (form.controls.regionId.value; as regionId) {
                <label class="field"><span>Within</span><app-entity-picker [config]="pickers.geoRegionsIn(regionId)" formControlName="subRegionId" placeholder="All of it" /></label>
              }
              <label class="field field--narrow">
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

        <!-- Search by place rather than by name: collapsed until wanted. -->
        <details class="by-coords" [open]="nearbyMode()">
          <summary>Find by coordinates</summary>
          <form class="filters" [formGroup]="nearbyForm" appFormFeedback (ngSubmit)="findNearby()">
            <!-- What people have is a pair copied from a map: one box, "latitude, longitude". -->
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Coordinates</span>
                <input formControlName="coords" placeholder="-1.292066, 36.821946" autocomplete="off">
                @if (coordsError()) {
                  <small class="error-text">Paste them as "latitude, longitude", e.g. -1.2921, 36.8219.</small>
                } @else {
                  <small class="hint">Copied from Google Maps: right-click the place, click the numbers.</small>
                }
              </label>
              <label class="field field--narrow">
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
        </details>
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
                  <th>Code</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="landmarkType"
                      label="Type"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Description</th>
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
                    <td class="mono">{{ landmark.code || '-' }}</td>
                    <td>{{ landmark.landmarkType ? kind(landmark.landmarkType) : '-' }}</td>
                    <td class="desc">{{ landmark.description || '-' }}</td>
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
    .by-coords { margin-top: var(--space-3); padding-top: var(--space-2-5); border-top: 1px solid var(--border); }
    .by-coords summary { cursor: pointer; font-weight: var(--weight-semibold); color: var(--primary-strong); margin-bottom: var(--space-2); }
    /* Five filters across one row on a desktop; status needs little room. */
    @media (min-width: 1100px) {
      .landmark-filters { grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
    }
    .field--narrow select, .field--narrow input { max-width: 9rem; }
    .desc { max-width: 28rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .filters {
      display: grid;
      gap: var(--space-3);
    }


    .button-row {
      display: flex;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .table-shell {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    .table-shell__header p {
      margin: 0;
      font-size: var(--text-md);
    }

    .table-scroll {
      overflow: auto;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: var(--text-sm);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandmarkListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
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
    code: '',
    landmarkType: '',
    regionId: '',
    subRegionId: '',
    isActive: '',
    page: 0,
    size: 20,
  });

  readonly landmarkTypes = LANDMARK_TYPES;
  readonly coordsError = signal(false);

  kind(type: string): string {
    return kindLabel(type);
  }

  readonly nearbyForm = this.formBuilder.group({
    coords: '',
    radiusKm: 2
  });

  ngOnInit(): void {
    // A different region makes the narrower choice meaningless.
    this.form.controls.regionId.valueChanges.subscribe(() => this.form.controls.subRegionId.setValue('', { emitEvent: false }));
    void this.reload();
  }

  async search(): Promise<void> {
    this.nearbyMode.set(false);
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  /** The narrower region wins; the server includes everything inside whichever is sent. */
  private searchParams(): GeoLandmarkSearchParams {
    const { subRegionId, regionId, ...rest } = this.form.getRawValue();
    return { ...rest, regionId: subRegionId || regionId || undefined, sort: this.sorting.toParams() } as GeoLandmarkSearchParams;
  }

  async clear(): Promise<void> {
    this.nearbyMode.set(false);
    this.form.reset({
      name: '',
      code: '',
      landmarkType: '',
      regionId: '',
      subRegionId: '',
      isActive: '',
      page: 0,
      size: this.form.getRawValue().size,
    });
    await this.reload();
  }

  async findNearby(): Promise<void> {
    const { coords, radiusKm } = this.nearbyForm.getRawValue();
    const point = parseLatLng(coords);
    this.coordsError.set(!point);
    if (!point) {
      return;
    }
    const { lat, lng } = point;

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



  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(
        this.geoService.searchLandmarks(this.searchParams())
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
