import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { AccessControlService } from '../access-control.service';
import { RoleResponse } from '../models/access-control.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';

@Component({
  selector: 'app-role-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Roles">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.ROLE_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.roleCreate">New role</a>
          </app-permission-gate>
        </ng-container>

        <label class="field">
          <span>Filter</span>
          <input [formControl]="filter" placeholder="Role name or description">
        </label>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading roles..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (visibleRoles().length === 0) {
        <app-empty-state title="No roles found" description="Create a role to start grouping permissions." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Scope</th>
                  <th>Permissions</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (role of visibleRoles(); track role.id) {
                  <tr [appRowLink]="RoutePaths.roleDetail(role.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.roleDetail(role.id)">{{ role.name }}</a>
                        <span class="muted">{{ role.description || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ role.roleScope || '-' }}</td>
                    <td>{{ role.permissions.length }}</td>
                    <td>
                      <span class="status-chip" [ngClass]="role.enabled ? 'status-chip--success' : 'status-chip--danger'">
                        {{ role.enabled ? 'Enabled' : 'Disabled' }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </section>
  `,
  styles: [`
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .table-scroll {
      overflow: auto;
    }

    .row-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly accessControl = inject(AccessControlService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly roles = signal<RoleResponse[]>([]);

  readonly filter = new FormControl('', { nonNullable: true });
  private readonly filterValue = toSignal(this.filter.valueChanges, { initialValue: '' });

  readonly visibleRoles = computed(() => {
    const term = this.filterValue().trim().toLowerCase();
    if (!term) {
      return this.roles();
    }

    return this.roles().filter((role) =>
      role.name.toLowerCase().includes(term) || (role.description ?? '').toLowerCase().includes(term)
    );
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.roles.set(await firstValueFrom(this.accessControl.getRoles()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
