import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
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
import { GeoLandmarkDetail } from '../models/geo.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-landmark-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    ErrorCardComponent,
    BackLinkComponent,
    StatusChipComponent
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
                <a class="btn btn-secondary" [routerLink]="RoutePaths.geoLandmarkEdit(detail.id)">Edit</a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.GEO_LANDMARK_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
                </button>
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

          <dl class="detail-grid">
            <div><dt>Type</dt><dd>{{ detail.landmarkType || '-' }}</dd></div>
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

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.landmark.set(await firstValueFrom(this.geoService.getLandmark(this.id())));
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
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
