import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { GeoService } from '../geo.service';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { BUILDING_TYPES, GeoBuildingPreview, kindLabel } from '../models/geo.models';

@Component({
  selector: 'app-building-list-page',
  standalone: true,
  imports: [EntityPickerComponent, ReactiveFormsModule, RouterLink, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent,
    PaginationComponent, PermissionGateComponent, SectionCardComponent, StatusChipComponent, RowLinkDirective, FormFeedbackDirective],
  template: `
    <section class="stack">
      <app-section-card title="Geo buildings" subtitle="Where customers live. One record per block, shared by every customer in it.">
        <ng-container actions>
          <app-permission-gate [permissions]="['GEO_BUILDING_CREATE']">
            <a class="btn btn-primary" [routerLink]="RoutePaths.geoBuildingCreate">New building</a>
          </app-permission-gate>
        </ng-container>
        <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
          <label class="field"><span>Name or code</span><input formControlName="q" placeholder="e.g. Sunrise or KAS-B007"></label>
          <label class="field">
            <span>Region</span>
            <app-entity-picker [config]="pickers.geoRegion" formControlName="regionId" placeholder="Anywhere" />
          </label>
          @if (form.controls.regionId.value; as regionId) {
            <label class="field">
              <span>Within</span>
              <app-entity-picker [config]="pickers.geoRegionsIn(regionId)" formControlName="subRegionId" placeholder="All of it" />
            </label>
          }
          <label class="field">
            <span>Type</span>
            <select formControlName="buildingType">
              <option value="">Any</option>
              @for (type of types; track type) { <option [value]="type">{{ label(type) }}</option> }
            </select>
          </label>
          <button type="submit" class="btn btn-secondary">Search</button>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading buildings..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (buildings().length === 0) {
        <app-empty-state title="No buildings yet" description="Riders add them at the gate, or link one to an order after delivering." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Building</th><th>Code</th><th>Type</th><th>Near</th><th>Region</th><th>Status</th></tr></thead>
              <tbody>
                @for (b of buildings(); track b.id) {
                  <tr [appRowLink]="RoutePaths.geoBuildingDetail(b.id)">
                    <td><a class="record-link__primary" [routerLink]="RoutePaths.geoBuildingDetail(b.id)">{{ b.name }}</a></td>
                    <td class="mono">{{ b.code || '-' }}</td>
                    <td>{{ label(b.buildingType) }}</td>
                    <td>{{ b.landmarkName || '-' }}</td>
                    <td>{{ b.regionName || '-' }}</td>
                    <td><app-status-chip [status]="b.isActive ? 'ACTIVE' : 'INACTIVE'" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        @if (pagination(); as page) {
          <app-pagination [shown]="buildings().length" [total]="page.totalElements" noun="buildings" [pagination]="page"
                          [size]="page.size" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
        }
      }
    </section>
  `,
  styles: [`
    .filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; }
    .filters .field { flex: 1 1 12rem; max-width: 20rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly types = BUILDING_TYPES;

  private readonly geo = inject(GeoService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly pickers = inject(EntityPickerRegistry);
  /** A region, optionally narrowed to one inside it; either way its sub-regions are included. */
  readonly form = this.fb.group({ q: '', buildingType: '', regionId: null as string | null, subRegionId: null as string | null });
  readonly buildings = signal<GeoBuildingPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private page = 0;
  private size = 20;

  ngOnInit(): void {
    this.form.controls.regionId.valueChanges.subscribe(() => this.form.controls.subRegionId.setValue(null, { emitEvent: false }));
    void this.load();
  }

  search(): void {
    this.page = 0;
    void this.load();
  }

  go(page: number): void {
    this.page = Math.max(0, page);
    void this.load();
  }

  resize(size: number): void {
    this.size = size;
    this.page = 0;
    void this.load();
  }

  async load(): Promise<void> {
    const { q, buildingType, regionId, subRegionId } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.geo.searchBuildings({
        q: q.trim() || undefined, buildingType: buildingType || undefined,
        regionId: subRegionId || regionId || undefined, page: this.page, size: this.size
      }));
      this.buildings.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  label(type: string | null | undefined): string {
    return kindLabel(type);
  }
}
