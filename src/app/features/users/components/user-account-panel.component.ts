import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { MultiSelectComponent } from '../../../shared/components/multi-select/multi-select.component';
import { SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { HumanLabelPipe, humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AuthService } from '../../../core/auth/auth.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { assignableRoleNames } from '../../../core/rbac/role.constants';
import { AccessControlService } from '../../access-control/access-control.service';
import { UsersService } from '../users.service';
import { UserDetail } from '../models/user.models';

/**
 * One user account, with everything an admin can do to it: its details, roles,
 * a temporary password, signing it out everywhere and — where the page allows —
 * deleting it.
 *
 * Written once so the user page and any page that shows whose account a record
 * belongs to (a tenant, an agency's owner) offer the same facts and the same
 * operations, and cannot drift. It loads the user itself rather than through
 * the users store, so embedding it never changes what the user page is showing.
 */
@Component({
  selector: 'app-user-account-panel',
  standalone: true,
  imports: [RouterLink, FormsModule, SectionCardComponent, PermissionGateComponent, MultiSelectComponent,
    ErrorCardComponent, LoadingStateComponent, ErrorStateComponent, DangerZoneComponent, DetailGroupComponent,
    HumanLabelPipe],
  template: `
    @if (loading()) {
      <app-loading-state [compact]="embedded()" label="Loading the user account..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else if (user(); as user) {
      <div class="stack">
        <app-section-card [title]="embedded() ? 'User account' : fullName(user)"
                          [subtitle]="embedded() ? fullName(user) + (user.email ? ' · ' + user.email : '') : (user.email || null)">
          <ng-container actions>
            <div class="icon-row">
              @if (embedded()) {
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.userDetail(user.id)">Open user page</a>
              }
              <!-- Edit last in the header: the top-right corner (§19.9). -->
              <app-permission-gate [permissions]="['USER_WRITE']">
                <a class="icon-action" [routerLink]="RoutePaths.userEdit(user.id)" aria-label="Edit user" title="Edit user">
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
                </a>
              </app-permission-gate>
            </div>
          </ng-container>

          <div class="detail-groups">
            <app-detail-group label="Overview">
              <div class="lead"><dt>Status</dt><dd>{{ user.status | humanLabel }}</dd></div>
              <div><dt>Locked</dt><dd>{{ user.userAccount?.isLocked ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Roles</dt><dd>{{ roleLabels(user) || '-' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Contact">
              <div><dt>Phone</dt><dd class="mono">{{ user.phoneNumber || '-' }}</dd></div>
              <div><dt>Phone (alt)</dt><dd class="mono">{{ user.userProfile?.phoneNumberSecondary || '-' }}</dd></div>
              <div><dt>Email verified</dt><dd>{{ user.userAccount?.emailVerified ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Phone verified</dt><dd>{{ user.userAccount?.phoneVerified ? 'Yes' : 'No' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Identity">
              <div><dt>National ID</dt><dd class="mono">{{ user.nationalIdNumber || '-' }}</dd></div>
              <div><dt>Unitwise ID</dt><dd class="mono">{{ user.userUid || '-' }}</dd></div>
              <div><dt>Gender</dt><dd>{{ user.userProfile?.gender | humanLabel }}</dd></div>
            </app-detail-group>
          </div>
        </app-section-card>

        <app-permission-gate [permissions]="['ROLE_ASSIGN_USER']">
          <app-section-card [title]="embedded() ? 'Account roles' : 'Roles'">
            @if (canAssignAny()) {
              <ng-container actions>
                <button type="button" class="btn btn-primary btn-sm" [disabled]="savingRoles()" (click)="saveRoles()">
                  {{ savingRoles() ? 'Saving...' : 'Save roles' }}
                </button>
              </ng-container>
            }

            <!--
              Only the roles this operator may give. Anything else the user
              holds is shown, left alone, and sent back unchanged — the update
              replaces the whole set, so omitting it would strip it.
            -->
            @if (lockedRoles().length > 0) {
              <p class="muted">
                Also holds {{ lockedRoleLabels() }} — only a super admin can change {{ lockedRoles().length === 1 ? 'that' : 'those' }}.
              </p>
            }

            @if (canAssignAny()) {
              <app-multi-select
                [options]="roleOptions()"
                [ngModel]="selectedRoleIds()"
                (ngModelChange)="selectedRoleIds.set($event)"
                [ngModelOptions]="{ standalone: true }"
                searchPlaceholder="Search roles…"
                emptyMessage="No roles available to assign."
              />
            } @else if (lockedRoles().length === 0) {
              <p class="muted">No roles.</p>
            }

            @if (rolesError(); as apiError) {
              <app-error-card title="Unable to update the roles" [message]="apiError.message" [details]="apiError.details" />
            }
          </app-section-card>
        </app-permission-gate>

        <!-- Account actions: rarely why the page was opened, and each ends something for the user. -->
        <app-permission-gate [permissions]="['USER_RESET_PASSWORD', 'USER_ADMIN_WRITE', 'USER_FORCE_LOGOUT']">
          <app-section-card [title]="embedded() ? 'Account security' : 'Security'">
            <div class="button-row">
              <app-permission-gate [permissions]="['USER_RESET_PASSWORD']">
                <button type="button" class="btn btn-secondary" [disabled]="resetting()" (click)="resetTempPassword(user)">
                  {{ resetting() ? 'Resetting...' : 'Reset temp password' }}
                </button>
              </app-permission-gate>
              <app-permission-gate [permissions]="['USER_ADMIN_WRITE', 'USER_FORCE_LOGOUT']">
                <button type="button" class="btn btn-secondary" [disabled]="forcingLogout()" (click)="forceLogout(user)">
                  {{ forcingLogout() ? 'Signing out...' : 'Force sign-out' }}
                </button>
              </app-permission-gate>
            </div>
          </app-section-card>
        </app-permission-gate>

        @if (allowDelete()) {
          <!-- Last and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
          <app-permission-gate [permissions]="['USER_DELETE']">
            <app-danger-zone label="Delete user" [busy]="deleting()" (pressed)="deleteUser(user)" />
          </app-permission-gate>
        }
      </div>
    }
  `,
  styles: [`
    .icon-row { display: flex; align-items: center; gap: 0.4rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserAccountPanelComponent {
  readonly RoutePaths = RoutePaths;

  readonly userId = input.required<number>();
  /** Shown inside another record's page: titled "User account", with a link to the full user page. */
  readonly embedded = input(false);
  /**
   * Off where the account is not the page's subject. A second danger zone on a
   * tenant's page would sit beside "Delete tenant" and invite the wrong one.
   */
  readonly allowDelete = input(true);

  readonly loaded = output<UserDetail>();
  readonly deleted = output<void>();

  private readonly users = inject(UsersService);
  private readonly accessControl = inject(AccessControlService);
  private readonly authService = inject(AuthService);
  private readonly context = inject(ActiveContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);

  readonly user = signal<UserDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly roles = signal<{ id: number; name: string }[]>([]);
  readonly selectedRoleIds = signal<number[]>([]);
  readonly savingRoles = signal(false);
  readonly rolesError = signal<ApiError | null>(null);
  readonly resetting = signal(false);
  readonly forcingLogout = signal(false);
  readonly deleting = signal(false);

  /** Which roles this operator may give — every role they hold counts, not just the active one. */
  private readonly assignable = computed(() =>
    assignableRoleNames(this.context.options().map((option) => option.roleName)));

  /** The global roles endpoint is ROLE_ASSIGN_USER only; agency staff are managed on the agency. */
  readonly canAssignAny = computed(() => {
    const assignable = this.assignable();
    return this.context.can('ROLE_ASSIGN_USER') && (assignable === 'ALL' || assignable.size > 0);
  });

  readonly roleOptions = computed<SelectOption<number>[]>(() =>
    this.roles()
      .filter((role) => this.canAssign(role.name))
      .map((role) => ({ value: role.id, label: humanizeLabel(role.name, role.name) })));

  /** Held by the user, but not this operator's to give or take away. */
  readonly lockedRoles = computed(() =>
    (this.user()?.roles ?? []).filter((role) => !this.canAssign(role.name)));

  readonly lockedRoleLabels = computed(() =>
    this.lockedRoles().map((role) => humanizeLabel(role.name, role.name)).join(', '));

  constructor() {
    effect(() => {
      const id = this.userId();
      untracked(() => void this.load(id));
    });
    void this.loadRoles();
  }

  fullName(user: UserDetail): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || `User #${user.id}`;
  }

  roleLabels(user: UserDetail): string {
    return (user.roles ?? []).map((role) => humanizeLabel(role.name, role.name)).join(', ');
  }

  reload(): void {
    void this.load(this.userId());
  }

  private canAssign(roleName: string): boolean {
    const assignable = this.assignable();
    return assignable === 'ALL' || assignable.has(roleName);
  }

  private async load(id: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = await firstValueFrom(this.users.getUserById(id));
      this.user.set(user);
      this.selectedRoleIds.set((user.roles ?? []).filter((role) => this.canAssign(role.name)).map((role) => role.id));
      this.loaded.emit(user);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadRoles(): Promise<void> {
    try {
      this.roles.set(await firstValueFrom(this.accessControl.getRoles()));
    } catch {
      // Without ROLE_READ the picker stays empty and says so.
      this.roles.set([]);
    }
  }

  async saveRoles(): Promise<void> {
    const user = this.user();
    if (!user) {
      return;
    }
    this.savingRoles.set(true);
    this.rolesError.set(null);
    try {
      // The locked ones go back as they were: the update replaces the whole set.
      const roleIds = [...new Set([...this.selectedRoleIds(), ...this.lockedRoles().map((role) => role.id)])];
      await firstValueFrom(this.accessControl.updateUserRoles(user.id, { roleIds }));
      this.notifications.push('success', 'Roles updated.');
      await this.load(user.id);
    } catch (error) {
      this.rolesError.set(toApiError(error));
    } finally {
      this.savingRoles.set(false);
    }
  }

  async resetTempPassword(user: UserDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Reset ${this.fullName(user)}'s password?`,
      message: 'They get a new temporary password and must change it when they next sign in.',
      confirmLabel: 'Reset password'
    })) {
      return;
    }
    this.resetting.set(true);
    try {
      await firstValueFrom(this.users.regenerateTempPassword(user.id));
      this.notifications.push('success', 'A new temporary password was issued.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.resetting.set(false);
    }
  }

  /** Ends every session this user has open, on all their devices. */
  async forceLogout(user: UserDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Sign ${user.email || this.fullName(user)} out of every device?`,
      confirmLabel: 'Sign out',
      destructive: true
    })) {
      return;
    }
    this.forcingLogout.set(true);
    try {
      await firstValueFrom(this.authService.forceLogout(user.id));
      this.notifications.push('success', 'The user has been signed out everywhere.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.forcingLogout.set(false);
    }
  }

  async deleteUser(user: UserDetail): Promise<void> {
    const name = this.fullName(user);
    if (!await this.confirm.ask({
      title: `Delete ${name}?`,
      message: 'Their account, roles and access go with it. This cannot be undone.',
      confirmLabel: 'Delete user',
      destructive: true,
      typeToConfirm: name
    })) {
      return;
    }
    this.deleting.set(true);
    try {
      await firstValueFrom(this.users.deleteUser(user.id));
      this.notifications.push('success', `${name} was deleted.`);
      this.deleted.emit();
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
