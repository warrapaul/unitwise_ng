import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { LANDMARK_RELATIONSHIP_LABELS, LandmarkRelationship, LOCATION_TYPE_LABELS, LocationType } from '../models/geo.models';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MapActionsComponent } from '../../../shared/components/map-actions/map-actions.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { coordinatesText, copyText } from '../../../shared/utils/maps.util';
import { GeoService } from '../geo.service';
import { GeoBuildingDetail, auditLabel, kindLabel } from '../models/geo.models';

@Component({
  selector: 'app-building-detail-page',
  standalone: true,
  imports: [RouterLink, BackLinkComponent, DangerZoneComponent, ErrorCardComponent, ErrorStateComponent,
    LoadingStateComponent, MapActionsComponent, PermissionGateComponent, SectionCardComponent, StatusChipComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.geoBuildings" label="Back to buildings" />
      @if (loading()) {
        <app-loading-state label="Loading building..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (building(); as b) {
        <app-section-card [title]="b.name" [subtitle]="b.description || null">
          <ng-container actions>
            <app-permission-gate [permissions]="['GEO_BUILDING_UPDATE']">
              <a class="icon-action" [routerLink]="RoutePaths.geoBuildingEdit(b.id)" aria-label="Edit building" title="Edit building">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
              </a>
            </app-permission-gate>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card title="Could not delete the building" [message]="apiError.message" [details]="apiError.details" />
          }

          <div class="code-row">
            @if (b.code) {
              <span class="code">{{ b.code }}</span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="copyCode(b.code)">{{ copied() ? 'Copied' : 'Copy code' }}</button>
            }
            <app-map-actions [latitude]="b.latitude" [longitude]="b.longitude" />
          </div>

          <dl class="detail-grid">
            <div><dt>Type</dt><dd>{{ label(b.buildingType) }}</dd></div>
            <div><dt>Floors</dt><dd>{{ b.floors ?? '-' }}</dd></div>
            <div>
              <dt>Coordinates</dt>
              <dd class="coords">
                <span class="mono">{{ coordinates(b) }}</span>
                @if (b.latitude != null && b.longitude != null) {
                  <button type="button" class="link-button" (click)="copyCoordinates(b)">{{ coordsCopied() ? 'Copied' : 'Copy' }}</button>
                }
              </dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>
                @if (b.regionId) {
                  <a [routerLink]="RoutePaths.geoRegionDetail(b.regionId)">{{ b.regionName || 'Region' }}</a>
                } @else { {{ b.regionName || '-' }} }
              </dd>
            </div>
            <div>
              <dt>Within</dt>
              <dd>
                @if (b.parentRegionId) {
                  <a [routerLink]="RoutePaths.geoRegionDetail(b.parentRegionId)">{{ b.parentRegionName }}</a>
                } @else { {{ b.parentRegionName || '-' }} }
              </dd>
            </div>
            <div><dt>The pin marks</dt><dd>{{ locationLabel(b.locationType) }}</dd></div>
            <!-- Every landmark chosen for it, with how it relates and how far it is. -->
            <div>
              <dt>Landmarks</dt>
              <dd>
                @for (link of b.landmarks ?? []; track link.landmarkId; let last = $last) {
                  <a [routerLink]="RoutePaths.geoLandmarkDetail(link.landmarkId)">{{ link.name }}</a>
                  <span class="muted"> · {{ relationLabel(link.relationship) }}@if (link.distanceMeters != null) { , {{ link.distanceMeters }} m }</span>@if (!last) {<br>}
                } @empty { - }
              </dd>
            </div>
            <div>
              <dt>Caretaker</dt>
              <dd>
                {{ b.contactName || '-' }}
                @if (b.contactPhone) { · <a [href]="'tel:' + b.contactPhone">{{ b.contactPhone }}</a> }
              </dd>
            </div>
            <div><dt>Status</dt><dd><app-status-chip [status]="b.isActive ? 'ACTIVE' : 'INACTIVE'" /></dd></div>
            <div><dt>Added by</dt><dd>{{ who(b.createdBy) }}</dd></div>
            <div><dt>Last changed by</dt><dd>{{ who(b.updatedBy) }}</dd></div>
          </dl>
        </app-section-card>

        <app-permission-gate [permissions]="['GEO_BUILDING_DELETE']">
          <app-danger-zone label="Delete building" [busy]="deleting()" (pressed)="remove(b)" />
        </app-permission-gate>
      }
    </section>
  `,
  styles: [`
    dt { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
    dd { margin: var(--space-1) 0 0; }
    .coords { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--text-md); }
    .code-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2-5); margin-bottom: var(--space-3); }
    .code { padding: var(--space-1) var(--space-3); border-radius: 10px; background: var(--primary-tint); color: var(--primary-strong);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--text-lg); font-weight: var(--weight-bold); letter-spacing: 0.04em; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly id = input.required<string>();

  private readonly geo = inject(GeoService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);

  readonly building = signal<GeoBuildingDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);
  readonly actionError = signal<ApiError | null>(null);
  readonly copied = signal(false);
  readonly coordsCopied = signal(false);

  coordinates(point: { latitude?: number | null; longitude?: number | null }): string {
    return point.latitude != null && point.longitude != null ? coordinatesText(point.latitude, point.longitude) : '-';
  }

  async copyCoordinates(point: { latitude?: number | null; longitude?: number | null }): Promise<void> {
    if (point.latitude != null && point.longitude != null && await copyText(coordinatesText(point.latitude, point.longitude))) {
      this.coordsCopied.set(true);
      setTimeout(() => this.coordsCopied.set(false), 2000);
    }
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.building.set(await firstValueFrom(this.geo.getBuilding(this.id())));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async copyCode(code: string): Promise<void> {
    if (await copyText(code)) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  async remove(b: GeoBuildingDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the building "${b.name}"?`,
      message: 'Addresses linked to it keep their own details.',
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }
    this.deleting.set(true);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.geo.deleteBuilding(b.id));
      await this.router.navigateByUrl(RoutePaths.geoBuildings);
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }

  who(value: string | null | undefined): string {
    return auditLabel(value);
  }

  locationLabel(type: string | null | undefined): string {
    return LOCATION_TYPE_LABELS[(type ?? 'MAIN_ENTRANCE') as LocationType] ?? '-';
  }

  relationLabel(relation: string | null | undefined): string {
    return LANDMARK_RELATIONSHIP_LABELS[(relation ?? 'NEARBY') as LandmarkRelationship] ?? 'Nearby';
  }

  label(type: string | null | undefined): string {
    return kindLabel(type);
  }
}
