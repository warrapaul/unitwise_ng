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
import { GeoRegionDetail } from '../models/geo.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-region-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, 
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    ErrorCardComponent,
    BackLinkComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.geoRegions" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading region..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (region(); as detail) {
        <app-section-card [title]="detail.name" [subtitle]="detail.description || null">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.GEO_REGION_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.geoRegionEdit(detail.id)">Edit</a>
              </app-permission-gate>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This region still has landmarks' : 'Unable to delete the region'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <dl class="detail-grid">
            <div><dt>Area code</dt><dd>{{ detail.areaCode || '-' }}</dd></div>
            <div><dt>Parent region</dt><dd>{{ detail.parentName || '-' }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <app-status-chip [status]="detail.isActive ? 'ACTIVE' : 'INACTIVE'" />
              </dd>
            </div>
            <div><dt>Region ID</dt><dd class="mono">{{ detail.id }}</dd></div>
            <div><dt>Created</dt><dd>{{ formatDate(detail.createdAt) }}</dd></div>
            <div><dt>Updated</dt><dd>{{ formatDate(detail.updatedAt) }}</dd></div>
          </dl>
        </app-section-card>

        <app-section-card title="Boundary">
          @if (detail.polygonWkt) {
            <pre class="wkt">{{ detail.polygonWkt }}</pre>
          } @else {
            <p class="muted">No polygon mapped — this region will not match GPS point lookups.</p>
          }
        </app-section-card>

        <app-section-card title="Sub-regions">
          @if ((detail.subRegions ?? []).length === 0) {
            <p class="muted">No sub-regions.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Region</th><th>Area code</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (child of detail.subRegions ?? []; track child.id) {
                    <tr [appRowLink]="RoutePaths.geoRegionDetail(child.id)">
                      <td><a class="record-link__primary" [routerLink]="RoutePaths.geoRegionDetail(child.id)">{{ child.name }}</a></td>
                      <td>{{ child.areaCode || '-' }}</td>
                      <td>
                        <app-status-chip [status]="child.isActive ? 'ACTIVE' : 'INACTIVE'" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.GEO_REGION_DELETE]">
          <app-danger-zone label="Delete region" [busy]="deleting()" (pressed)="remove(detail)" />
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

    .wkt {
      margin: 0;
      padding: 0.75rem;
      border-radius: 10px;
      border: 1px solid var(--border);
      overflow-x: auto;
      font-size: 0.8rem;
    }

    .table-scroll {
      overflow: auto;
    }

    .button-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegionDetailPageComponent implements OnInit {
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
  readonly region = signal<GeoRegionDetail | null>(null);

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.region.set(await firstValueFrom(this.geoService.getRegion(this.id())));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async remove(region: GeoRegionDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the region "${region.name}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.geoService.deleteRegion(region.id));
      await this.router.navigateByUrl(RoutePaths.geoRegions);
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
