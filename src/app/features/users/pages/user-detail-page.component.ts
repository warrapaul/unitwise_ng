import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { DangerZoneComponent } from '../../../shared/components/danger-zone/danger-zone.component';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { AccessControlService } from '../../access-control/access-control.service';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { MultiSelectComponent } from '../../../shared/components/multi-select/multi-select.component';
import { SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { FormsModule } from '@angular/forms';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { firstValueFrom } from 'rxjs';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { assignableRoleNames } from '../../../core/rbac/role.constants';

@Component({
  selector: 'app-user-detail-page',
  standalone: true,
  imports: [DangerZoneComponent, 
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    MultiSelectComponent,
    FormsModule,
    ErrorCardComponent,
    BackLinkComponent,
    HumanLabelPipe,
    DetailGroupComponent
  ],
  template: `
    <section class="stack">
      <app-back-link
        [to]="'/admin/users'"
        label="Back to users"
        [title]="(store.selectedUser()?.firstName || '') + ' ' + (store.selectedUser()?.lastName || '')"
      />
      @if (store.loading()) {
        <app-loading-state label="Loading user..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load user'" (retry)="reload()" />
      } @else if (store.selectedUser()) {
        <app-section-card
          [title]="(store.selectedUser()?.firstName || '') + ' ' + (store.selectedUser()?.lastName || '')"
          [subtitle]="store.selectedUser()?.email || null"
        >
          <ng-container actions>
            <!--
              Edit and Delete are icons; the two that are not obvious from a
              glyph keep their words. A header carrying four full-size buttons
              was taller than the record beneath it, and three of the four are
              rarely the reason anyone opened the page.
            -->
            <!--
              Icons only, so they stay on the title's row at every width — two
              or more full buttons take a row of their own on a phone (§36.3).
              The account actions moved to the Security card below.
            -->
            <div class="icon-row">
              <a
                class="icon-action"
                aria-label="Edit user"
                title="Edit user"
                [routerLink]="['/admin/users', store.selectedUser()?.id, 'edit']"
              ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></a>
            </div>
          </ng-container>

          <!--
            Was a bare grid of four fields plus two nested cards. The cards read
            as a different level of the page than they were, and their contents
            are plain fields — so they become groups like everything else, and a
            user now parses the same way a tenant or a building does.
          -->
          <div class="detail-groups">
            <app-detail-group label="Overview">
              <div class="lead">
                <dt>Status</dt>
                <dd>{{ store.selectedUser()?.status | humanLabel }}</dd>
              </div>
              <div><dt>Locked</dt><dd>{{ store.selectedUser()?.userAccount?.isLocked ? 'Yes' : 'No' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Contact">
              <div><dt>Phone</dt><dd class="mono">{{ store.selectedUser()?.phoneNumber || '-' }}</dd></div>
              <div><dt>Phone (alt)</dt><dd class="mono">{{ store.selectedUser()?.userProfile?.phoneNumberSecondary || '-' }}</dd></div>
              <div><dt>Email verified</dt><dd>{{ store.selectedUser()?.userAccount?.emailVerified ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Phone verified</dt><dd>{{ store.selectedUser()?.userAccount?.phoneVerified ? 'Yes' : 'No' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Identity">
              <div><dt>National ID</dt><dd class="mono">{{ store.selectedUser()?.nationalIdNumber || '-' }}</dd></div>
              <div><dt>Unitwise ID</dt><dd class="mono">{{ store.selectedUser()?.userUid || '-' }}</dd></div>
              <div><dt>Gender</dt><dd>{{ store.selectedUser()?.userProfile?.gender | humanLabel }}</dd></div>
            </app-detail-group>
          </div>
        </app-section-card>

        <!--
          Role assignment. updateUserRoles shipped in the service with nothing
          calling it, so a user's roles could only ever be set at creation.
        -->
        <app-permission-gate [permissions]="['ROLE_ASSIGN_USER']">
          <app-section-card title="Roles">
            @if (canAssignAny()) {
            <ng-container actions>
              <button type="button" class="btn btn-primary" [disabled]="savingRoles()" (click)="saveRoles()">
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
              <app-error-card
                title="Unable to update the roles"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }
          </app-section-card>
        </app-permission-gate>

        <!--
          Account actions, below the record rather than in its header: rarely
          the reason the page was opened, and each ends something for the user.
          Same place on every width, so there is one layout to learn.
        -->
        <app-permission-gate [permissions]="['USER_RESET_PASSWORD', 'USER_ADMIN_WRITE', 'USER_FORCE_LOGOUT']">
          <app-section-card title="Security">
            <div class="button-row">
              <app-permission-gate [permissions]="['USER_RESET_PASSWORD']">
                <button type="button" class="btn btn-secondary" (click)="resetTempPassword()">Reset temp password</button>
              </app-permission-gate>
              <app-permission-gate [permissions]="['USER_ADMIN_WRITE', 'USER_FORCE_LOGOUT']">
                <button type="button" class="btn btn-secondary" [disabled]="forcingLogout()" (click)="forceLogout()">
                  {{ forcingLogout() ? 'Signing out...' : 'Force sign-out' }}
                </button>
              </app-permission-gate>
            </div>
          </app-section-card>
        </app-permission-gate>
        <!-- Last on the page and worded, away from Edit: deleting is a decision, not a tap (§36.3). -->
        <app-permission-gate [permissions]="['USER_DELETE']">
          <app-danger-zone label="Delete user" [busy]="false" (pressed)="deleteUser()" />
        </app-permission-gate>
      } @else {
        <app-empty-state title="No user selected" description="Choose a user from the list to continue." />
      }
    </section>
  `,
  styles: [`
    .icon-row {
      display: flex;
      gap: 0.4rem;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserDetailPageComponent implements OnInit {
  readonly forcingLogout = signal(false);

  readonly roles = signal<{ id: number; name: string }[]>([]);
  private readonly context = inject(ActiveContextService);

  /** Which roles this operator may give — every role they hold counts, not just the active one. */
  private readonly assignable = computed(() =>
    assignableRoleNames(this.context.options().map((option) => option.roleName)));

  private canAssign(roleName: string): boolean {
    const assignable = this.assignable();
    return assignable === 'ALL' || assignable.has(roleName);
  }

  /** The global roles endpoint is ROLE_ASSIGN_USER only; agency staff are managed on the agency. */
  readonly canAssignAny = computed(() => {
    const assignable = this.assignable();
    return this.context.can('ROLE_ASSIGN_USER') && (assignable === 'ALL' || assignable.size > 0);
  });

  readonly roleOptions = computed<SelectOption<number>[]>(() =>
    this.roles()
      .filter((role) => this.canAssign(role.name))
      .map((role) => ({ value: role.id, label: humanizeLabel(role.name, role.name) }))
  );

  /** Held by the user, but not this operator's to give or take away. */
  readonly lockedRoles = computed(() =>
    (this.store.selectedUser()?.roles ?? []).filter((role) => !this.canAssign(role.name)));

  readonly lockedRoleLabels = computed(() =>
    this.lockedRoles().map((role) => humanizeLabel(role.name, role.name)).join(', '));
  readonly selectedRoleIds = signal<number[]>([]);
  readonly savingRoles = signal(false);
  readonly rolesError = signal<ApiError | null>(null);

  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(UsersStore);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly accessControl = inject(AccessControlService);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isNaN(id)) {
      void this.store.loadUser(id).then(() => {
        this.selectedRoleIds.set((this.store.selectedUser()?.roles ?? [])
          .filter((role) => this.canAssign(role.name))
          .map((role) => role.id));
      });
    }

    void this.loadRoles();
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
    const user = this.store.selectedUser();
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
      await this.store.loadUser(user.id);
    } catch (error) {
      this.rolesError.set(toApiError(error));
    } finally {
      this.savingRoles.set(false);
    }
  }

  async reload(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isNaN(id)) {
      void this.store.loadUser(id);
    }
  }

  async deleteUser(): Promise<void> {
    const selectedUser = this.store.selectedUser();
    if (!selectedUser) {
      return;
    }

    const name = [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ')
      || selectedUser.email
      || 'this user';

    if (!await this.confirm.ask({
      title: `Delete ${name}?`,
      message: 'Their account, roles and access go with it. This cannot be undone.',
      confirmLabel: 'Delete user',
      destructive: true
    })) {
      return;
    }

    await this.store.deleteUser(selectedUser.id);
    if (!this.store.mutationError()) {
      // The listing, and by its own path: '/users' is not a route in this app,
      // so the redirect was landing on the not-found page after a delete that
      // had actually succeeded.
      await this.router.navigateByUrl(RoutePaths.users);
    }
  }

  async resetTempPassword(): Promise<void> {
    const selectedUser = this.store.selectedUser();
    if (!selectedUser) {
      return;
    }

    await this.store.regenerateTempPassword(selectedUser.id);
  }

  /** Ends every session this user has open, on all their devices. */
  async forceLogout(): Promise<void> {
    const selectedUser = this.store.selectedUser();
    if (!selectedUser || !await this.confirm.ask({
      title: `Sign ${selectedUser.email} out of every device?`,
      confirmLabel: 'Sign out',
      destructive: true
    })) {
      return;
    }

    this.forcingLogout.set(true);

    try {
      await firstValueFrom(this.authService.forceLogout(selectedUser.id));
      this.notifications.push('success', 'The user has been signed out everywhere.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.forcingLogout.set(false);
    }
  }
}
