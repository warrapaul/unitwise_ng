import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
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

@Component({
  selector: 'app-user-detail-page',
  standalone: true,
  imports: [
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
          eyebrow="User detail"
          [subtitle]="store.selectedUser()?.email || null"
        >
          <ng-container actions>
            <div class="detail-actions">
              <a class="btn btn-secondary" [routerLink]="['/admin/users', store.selectedUser()?.id, 'edit']">Edit</a>
              <app-permission-gate [permissions]="['USER_RESET_PASSWORD']">
                <button type="button" class="btn btn-secondary" (click)="resetTempPassword()">Reset temp password</button>
              </app-permission-gate>
              <app-permission-gate [permissions]="['USER_ADMIN_WRITE', 'USER_FORCE_LOGOUT']">
                <button type="button" class="btn btn-secondary" [disabled]="forcingLogout()" (click)="forceLogout()">
                  {{ forcingLogout() ? 'Signing out...' : 'Force sign-out' }}
                </button>
              </app-permission-gate>
              <app-permission-gate [permissions]="['USER_DELETE']">
                <button type="button" class="btn btn-danger" (click)="deleteUser()">Delete</button>
              </app-permission-gate>
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
              <div><dt>UID</dt><dd class="mono">{{ store.selectedUser()?.userUid || '-' }}</dd></div>
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
            <ng-container actions>
              <button type="button" class="btn btn-primary" [disabled]="savingRoles()" (click)="saveRoles()">
                {{ savingRoles() ? 'Saving...' : 'Save roles' }}
              </button>
            </ng-container>

            <app-multi-select
              [options]="roleOptions()"
              [ngModel]="selectedRoleIds()"
              (ngModelChange)="selectedRoleIds.set($event)"
              [ngModelOptions]="{ standalone: true }"
              searchPlaceholder="Search roles…"
              emptyMessage="No roles available to assign."
            />

            @if (rolesError(); as apiError) {
              <app-error-card
                title="Unable to update the roles"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }
          </app-section-card>
        </app-permission-gate>
      } @else {
        <app-empty-state title="No user selected" description="Choose a user from the list to continue." />
      }
    </section>
  `,
  styles: [`
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserDetailPageComponent implements OnInit {
  readonly forcingLogout = signal(false);
  readonly forceLogoutNotice = signal<string | null>(null);

  readonly roles = signal<{ id: number; name: string }[]>([]);
  readonly roleOptions = computed<SelectOption<number>[]>(() =>
    this.roles().map((role) => ({ value: role.id, label: role.name }))
  );
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
        this.selectedRoleIds.set(this.store.selectedUser()?.roles?.map((role) => role.id) ?? []);
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
      await firstValueFrom(this.accessControl.updateUserRoles(user.id, { roleIds: this.selectedRoleIds() }));
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

    await this.store.deleteUser(selectedUser.id);
    if (!this.store.mutationError()) {
      await this.router.navigateByUrl('/users');
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
    this.forceLogoutNotice.set(null);

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
