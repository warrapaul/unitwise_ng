import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { SettingsService } from '../settings.service';

/**
 * Clears the cached authorization snapshots.
 *
 * Exists because two sources of truth can disagree: `/users/profile` reads
 * roles and permissions from the database, while every `@PreAuthorize` check
 * reads a Redis snapshot keyed by user and agency with a 12-hour TTL. Any change
 * that does not pass through a service method — a migration, a support fix run
 * as SQL, or the bootstrap initializer writing role→permission rows on boot —
 * leaves the snapshot behind. The symptom is a **403 on an endpoint your own
 * profile says you can reach**, and it lasts until the TTL expires.
 *
 * Eviction is not destructive: the next request rebuilds the snapshot from the
 * database. The narrower scopes exist so a fix for one agency does not make
 * every signed-in user pay for a rebuild.
 */
@Component({
  selector: 'app-cache-manager-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    BackLinkComponent,
    SectionCardComponent,
    ErrorCardComponent,
    EntityPickerComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.home" label="Back" />

      <app-section-card title="Permission cache">
        <p class="hint">
          Permission checks are answered from a cached snapshot that lasts 12 hours, while your
          profile is read from the database. A change made outside the application — a migration,
          a direct SQL fix, or a new permission added on boot — leaves the two disagreeing, and the
          symptom is a 403 on something your profile says you can do. Clearing the cache rebuilds it
          from the database on the next request.
        </p>

        @if (notice(); as message) {
          <div class="alert alert-success" role="status">{{ message }}</div>
        }

        @if (error(); as apiError) {
          <app-error-card title="Unable to clear the cache" [message]="apiError.message" [details]="apiError.details" />
        }

        <div class="button-row">
          <button type="button" class="btn btn-primary" [disabled]="busy() !== null" (click)="evictAll()">
            {{ busy() === 'all' ? 'Clearing...' : 'Clear everything' }}
          </button>
        </div>
        <p class="hint">
          Every signed-in user's next request rebuilds its snapshot. Safe, but it is the whole
          platform — prefer a narrower scope below when you know what changed.
        </p>
      </app-section-card>

      <app-section-card title="Clear for one user">
        <p class="hint">After changing what a single account can do.</p>

        <form class="stack" [formGroup]="userForm" appFormFeedback (ngSubmit)="evictUser()">
          <label class="field field--wide">
            <span>User</span>
            <app-entity-picker [config]="pickers.user" formControlName="userId" placeholder="Search for the user" />
          </label>

          <div class="button-row">
            <button type="submit" class="btn btn-secondary" [disabled]="busy() !== null || !userForm.controls.userId.value">
              {{ busy() === 'user' ? 'Clearing...' : 'Clear for this user' }}
            </button>
          </div>
        </form>
      </app-section-card>

      <app-section-card title="Clear for an agency">
        <p class="hint">Every administrator of the agency, after a change to its roles or admins.</p>

        <form class="stack" [formGroup]="agencyForm" appFormFeedback (ngSubmit)="evictAgency()">
          <label class="field field--wide">
            <span>Agency</span>
            <app-entity-picker [config]="pickers.agency" formControlName="agencyId" placeholder="Search for the agency" />
          </label>

          <div class="button-row">
            <button type="submit" class="btn btn-secondary" [disabled]="busy() !== null || !agencyForm.controls.agencyId.value">
              {{ busy() === 'agency' ? 'Clearing...' : 'Clear for this agency' }}
            </button>
          </div>
        </form>
      </app-section-card>

      <app-section-card title="Clear for a role">
        <p class="hint">
          Every holder of the role, after changing which permissions it grants. This is the one to
          use after a permission is added to a role that already has members.
        </p>

        <form class="stack" [formGroup]="roleForm" appFormFeedback (ngSubmit)="evictRole()">
          <label class="field">
            <span>Role ID</span>
            <input type="number" min="1" formControlName="roleId">
            <small class="hint">From the roles page.</small>
          </label>

          <div class="button-row">
            <button type="submit" class="btn btn-secondary" [disabled]="busy() !== null || !roleForm.controls.roleId.value">
              {{ busy() === 'role' ? 'Clearing...' : 'Clear for this role' }}
            </button>
          </div>
        </form>
      </app-section-card>

      <app-section-card title="Your own session">
        <p class="hint">
          Clearing the cache does not reload what this browser already holds. Refresh your profile
          to pick up permissions you have just been granted.
        </p>

        <div class="button-row">
          <button type="button" class="btn btn-secondary" [disabled]="busy() !== null" (click)="refreshProfile()">
            {{ busy() === 'profile' ? 'Refreshing...' : 'Refresh my permissions' }}
          </button>
        </div>

        @if (permissionCount(); as count) {
          <p class="muted">{{ count }} permission(s) currently loaded in this session.</p>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CacheManagerPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly pickers = inject(EntityPickerRegistry);

  private readonly settings = inject(SettingsService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(AuthSessionService);
  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  /** Which action is running, so the others disable without a flag each. */
  readonly busy = signal<'all' | 'user' | 'role' | 'agency' | 'profile' | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);

  readonly permissionCount = computed(() => this.session.userPermissions().length);

  readonly userForm = this.formBuilder.group({ userId: [null as number | null] });
  readonly agencyForm = this.formBuilder.group({ agencyId: [null as number | null] });
  readonly roleForm = this.formBuilder.group({ roleId: [null as number | null] });

  async evictAll(): Promise<void> {
    // Confirmed because it is the whole platform, not because it is dangerous.
    if (!await this.confirm.ask({
      title: 'Clear every cached permission?',
      message: 'Every signed-in user rebuilds their permissions on the next request. Nothing is lost — but it is the whole platform.',
      confirmLabel: 'Clear everything'
    })) {
      return;
    }

    await this.run('all', () => this.settings.evictAllPermissions(), 'Authorization caches cleared.');
  }

  async evictUser(): Promise<void> {
    const userId = this.userForm.getRawValue().userId;
    if (userId === null) {
      return;
    }

    await this.run('user', () => this.settings.evictUserPermissions(userId), 'Cache cleared for that user.');
  }

  async evictAgency(): Promise<void> {
    const agencyId = this.agencyForm.getRawValue().agencyId;
    if (agencyId === null) {
      return;
    }

    await this.run('agency', () => this.settings.evictAgencyPermissions(agencyId), "Cache cleared for that agency's admins.");
  }

  async evictRole(): Promise<void> {
    const roleId = this.roleForm.getRawValue().roleId;
    if (roleId === null) {
      return;
    }

    await this.run('role', () => this.settings.evictRolePermissions(roleId), 'Cache cleared for holders of that role.');
  }

  /**
   * The server cache and this browser are separate copies. Clearing one does
   * not refresh the other, and an operator who clears the cache and still sees
   * the old menu would reasonably conclude it had not worked.
   */
  async refreshProfile(): Promise<void> {
    this.busy.set('profile');
    this.error.set(null);
    this.notice.set(null);

    try {
      const profile = await firstValueFrom(this.auth.getCurrentUserProfile());
      this.session.setUserProfile(profile);
      this.notice.set('Your permissions have been reloaded.');
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(null);
    }
  }

  private async run(
    scope: 'all' | 'user' | 'role' | 'agency',
    action: () => import('rxjs').Observable<void>,
    success: string
  ): Promise<void> {
    this.busy.set(scope);
    this.error.set(null);
    this.notice.set(null);

    try {
      await firstValueFrom(action());
      this.notice.set(success);
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(null);
    }
  }
}
