import { displayDateTime } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { GeoService } from '../geo.service';
import { GeoBuildingPreview, GeoLandmarkDetail, kindLabel } from '../models/geo.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { MapActionsComponent } from '../../../shared/components/map-actions/map-actions.component';
import { copyText } from '../../../shared/utils/maps.util';

@Component({
  selector: 'app-landmark-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, 
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    ErrorCardComponent,
    BackLinkComponent,
    StatusChipComponent,
    MapActionsComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.geoLandmarks" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading landmark..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (landmark(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.description || null">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.GEO_LANDMARK_UPDATE]">
                <a class="icon-action" [routerLink]="RoutePaths.geoLandmarkEdit(detail.id)" aria-label="Edit landmark" title="Edit landmark">
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                </a>
              </app-permission-gate>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This landmark is in use' : 'Unable to delete the landmark'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <!-- The code is what goes on a banner and what a caller reads out, so it leads. -->
          <div class="code-row">
            @if (detail.code) {
              <span class="code">{{ detail.code }}</span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="copyCode(detail.code)">{{ codeCopied() ? 'Copied' : 'Copy code' }}</button>
            } @else {
              <span class="muted">Code is assigned within a few minutes of a point drawn in QGIS.</span>
            }
          </div>
          <app-map-actions [latitude]="detail.latitude" [longitude]="detail.longitude" />

          <dl class="detail-grid">
            <div><dt>Type</dt><dd>{{ detail.landmarkType ? label(detail.landmarkType) : '-' }}</dd></div>
            <div><dt>Latitude</dt><dd class="mono">{{ detail.latitude ?? '-' }}</dd></div>
            <div><dt>Longitude</dt><dd class="mono">{{ detail.longitude ?? '-' }}</dd></div>
            <div>
              <dt>Region</dt>
              <dd>
                @if (detail.regionId) {
                  <a [routerLink]="RoutePaths.geoRegionDetail(detail.regionId)">{{ detail.regionName || detail.regionId }}</a>
                } @else {
                  -
                }
              </dd>
            </div>
            <div><dt>Within</dt><dd>{{ detail.parentRegionName || '-' }}</dd></div>
            <div><dt>Area code</dt><dd>{{ detail.regionAreaCode || '-' }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <app-status-chip [status]="detail.isActive ? 'ACTIVE' : 'INACTIVE'" />
              </dd>
            </div>
            <div><dt>Landmark ID</dt><dd class="mono">{{ detail.id }}</dd></div>
            <div><dt>Created</dt><dd>{{ formatDate(detail.createdAt) }}</dd></div>
            <div><dt>Updated</dt><dd>{{ formatDate(detail.updatedAt) }}</dd></div>
          </dl>
        </app-section-card>

        <!-- The buildings people describe as "near" this landmark. -->
        <app-permission-gate [permissions]="['GEO_BUILDING_READ']">
          <app-section-card title="Buildings near it" [subtitle]="buildings().length === 0 ? 'None linked yet.' : null">
            @if (buildings().length > 0) {
              <ul class="buildings">
                @for (b of buildings(); track b.id) {
                  <li>
                    <a [routerLink]="RoutePaths.geoBuildingDetail(b.id)">{{ b.name }}</a>
                    <span class="muted"> · {{ b.code }} · {{ kind(b.buildingType) }}</span>
                  </li>
                }
              </ul>
            }
          </app-section-card>
        </app-permission-gate>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.GEO_LANDMARK_DELETE]">
          <app-danger-zone label="Delete landmark" [busy]="deleting()" (pressed)="remove(detail)" />
        </app-permission-gate>
      }
    </section>
  `,
  styles: [`
    dt {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    dd {
      margin: 0.25rem 0 0;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.82rem;
    }

    .buildings { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.3rem; }

    .code-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-bottom: 0.6rem; }
    .code { padding: 0.25rem 0.7rem; border-radius: 10px; background: var(--primary-tint); color: var(--primary-strong);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.15rem; font-weight: 800; letter-spacing: 0.04em; }

    .button-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandmarkDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly geoService = inject(GeoService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);

  /** A rejected delete, shown on the page rather than replacing it (§31.2). */
  readonly actionError = signal<ApiError | null>(null);
  readonly landmark = signal<GeoLandmarkDetail | null>(null);
  readonly codeCopied = signal(false);
  readonly buildings = signal<GeoBuildingPreview[]>([]);

  kind(type: string | null | undefined): string {
    return kindLabel(type);
  }

  private async loadBuildings(): Promise<void> {
    try {
      const page = await firstValueFrom(this.geoService.searchBuildings({ landmarkId: this.id(), page: 0, size: 50 }));
      this.buildings.set(page.items);
    } catch {
      // Without building access, or on a failed read, the section stays empty.
      this.buildings.set([]);
    }
  }

  async copyCode(code: string): Promise<void> {
    if (await copyText(code)) {
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    }
  }

  label(type: string): string {
    return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.landmark.set(await firstValueFrom(this.geoService.getLandmark(this.id())));
      void this.loadBuildings();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async remove(landmark: GeoLandmarkDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the landmark "${landmark.name}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.geoService.deleteLandmark(landmark.id));
      await this.router.navigateByUrl(RoutePaths.geoLandmarks);
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDateTime(date);
  }
}
