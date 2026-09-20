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
import { GEO_REGION_SORTABLE_FIELDS, GeoRegionPreview, GeoRegionSearchParams } from '../models/geo.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type RegionSortField = typeof GEO_REGION_SORTABLE_FIELDS[number];

@Component({
  selector: 'app-region-list-page',
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
      <app-section-card title="Geo regions">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.GEO_REGION_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.geoRegionCreate">New region</a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name" placeholder="Region name"></label>
              <label class="field"><span>Area code</span><input formControlName="areaCode" placeholder="e.g. NRB-01"></label>
              <label class="field"><span>Parent region ID</span><input formControlName="parentId" placeholder="Parent UUID"></label>
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
              <button type="button" class="btn btn-secondary" (click)="loadRoots()">Root regions only</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading regions..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (regions().length === 0) {
        <app-empty-state title="No regions found" description="Try a different search or clear the filters." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Region"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="areaCode"
                      label="Area code"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Parent</th>
                  <th>Status</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="createdAt"
                      label="Created"
                      (sorted)="search()"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (region of regions(); track region.id) {
                  <tr [appRowLink]="RoutePaths.geoRegionDetail(region.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.geoRegionDetail(region.id)">{{ region.name }}</a>
                        <span class="muted">{{ region.description || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ region.areaCode || '-' }}</td>
                    <td>{{ region.parentName || '-' }}</td>
                    <td>
                      <app-status-chip [status]="region.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td>{{ formatDate(region.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="regions().length"
            [total]="pagination()?.totalElements ?? regions().length"
            noun="regions"
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


    .table-scroll {
      overflow: auto;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegionListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly geoService = inject(GeoService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly regions = signal<GeoRegionPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly rootsOnly = signal(false);

  readonly form = this.formBuilder.group({
    name: '',
    areaCode: '',
    parentId: '',
    isActive: '',
    page: 0,
    size: 20,
  });

  ngOnInit(): void {
    void this.reload();
  }

  async search(): Promise<void> {
    this.rootsOnly.set(false);
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.rootsOnly.set(false);
    this.form.reset({
      name: '',
      areaCode: '',
      parentId: '',
      isActive: '',
      page: 0,
      size: this.form.getRawValue().size,
    });
    await this.reload();
  }

  async loadRoots(): Promise<void> {
    this.rootsOnly.set(true);
    this.form.patchValue({ page: 0 });
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


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as GeoRegionSearchParams;

    try {
      const result = this.rootsOnly()
        ? await firstValueFrom(this.geoService.getRootRegions({ page: params.page, size: params.size }))
        : await firstValueFrom(this.geoService.searchRegions(params));
      this.regions.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
