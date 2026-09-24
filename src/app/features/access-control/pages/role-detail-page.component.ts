import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { AccessControlService } from '../access-control.service';
import { PermissionResponse, RoleResponse } from '../models/access-control.models';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-role-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, HumanLabelPipe, 
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    ErrorCardComponent,
    BackLinkComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.roles" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading role..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (role(); as roleDetail) {
        <app-section-card [title]="roleDetail.name" [subtitle]="roleDetail.description || null">
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.ROLE_CREATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.roleEdit(roleDetail.id)">Edit</a>
              </app-permission-gate>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This role is still assigned' : 'Unable to delete the role'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <dl class="detail-grid">
            <div><dt>Scope</dt><dd>{{ roleDetail.roleScope || '-' }}</dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <span class="status-chip" [ngClass]="roleDetail.enabled ? 'status-chip--success' : 'status-chip--danger'">
                  {{ roleDetail.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </dd>
            </div>
            <div><dt>Permissions</dt><dd>{{ sortedPermissions().length }}</dd></div>
          </dl>
        </app-section-card>

        <app-section-card title="Assigned permissions">
          @if (sortedPermissions().length === 0) {
            <p class="muted">This role grants no permissions yet.</p>
          } @else {
            <!--
              Grouped by resource, matching the edit screen. A flat list of 59
              SCREAMING_SNAKE names reads as a wall, and repeating each name as
              its own description doubled the noise for no information.
            -->
            <div class="permission-groups">
              @for (group of permissionGroups(); track group.category) {
                <section class="permission-group">
                  <h3>{{ group.category | humanLabel }}</h3>
                  <ul>
                    @for (permission of group.permissions; track permission.id) {
                      <li [title]="permission.description || permission.name">{{ permission.name | humanLabel }}</li>
                    }
                  </ul>
                </section>
              }
            </div>
          }
        </app-section-card>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="[Permissions.ROLE_DELETE]">
          <app-danger-zone label="Delete role" [busy]="deleting()" (pressed)="remove(roleDetail)" />
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

    .permission-groups {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 0.75rem;
      align-content: start;
    }

    .permission-group {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.7rem 0.8rem;
      background: var(--surface);
    }

    .permission-group h3 {
      margin: 0 0 0.4rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .permission-group ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.15rem;
      font-size: 0.85rem;
    }

    .permission-list li {
      display: grid;
      gap: 0.15rem;
      font-size: 0.9rem;
    }

    .permission-list__name {
      font-weight: 600;
    }

    .button-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly accessControl = inject(AccessControlService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly role = signal<RoleResponse | null>(null);
  readonly deleting = signal(false);

  /** A rejected delete, shown on the page rather than replacing it (§31.2). */
  readonly actionError = signal<ApiError | null>(null);

  readonly sortedPermissions = computed<PermissionResponse[]>(() =>
    [...(this.role()?.permissions ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  );

  /** Same grouping the edit screen uses, so the two views read alike. */
  readonly permissionGroups = computed(() => {
    const groups = new Map<string, PermissionResponse[]>();

    for (const permission of this.sortedPermissions()) {
      const category = permission.category || permission.name.split('_')[0] || 'General';
      groups.set(category, [...(groups.get(category) ?? []), permission]);
    }

    return [...groups.entries()]
      .map(([category, permissions]) => ({ category, permissions }))
      .sort((a, b) => a.category.localeCompare(b.category));
  });

  async ngOnInit(): Promise<void> {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.role.set(await firstValueFrom(this.accessControl.getRole(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async remove(role: RoleResponse): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the role "${role.name}"? Users holding it lose its permissions.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.accessControl.deleteRole(role.id));
      await this.router.navigateByUrl(RoutePaths.roles);
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
