import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { AuthService } from '../../../core/auth/auth.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { UidShareComponent } from '../../../shared/components/uid-share/uid-share.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, SectionCardComponent, UidShareComponent],
  template: `
    <section class="stack">
      @if (store.loading()) {
        <app-loading-state label="Loading profile..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load profile'" (retry)="reload()" />
      } @else if (store.profile()) {
        <app-section-card title="My profile" eyebrow="User">
          <ng-container actions>
            <div class="button-row">
              <a class="btn btn-secondary" [routerLink]="RoutePaths.profileEdit">Edit profile</a>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.changePassword">Change password</a>
              <button type="button" class="btn btn-secondary" [disabled]="signingOutEverywhere()" (click)="signOutEverywhere()">
                {{ signingOutEverywhere() ? 'Signing out...' : 'Sign out everywhere' }}
              </button>
            </div>
          </ng-container>

          <!--
            Above the field grid, not in it. The uid is the one value on this
            page that exists to be given to somebody else, and as one more
            cell among Name and Phone it read as a system reference nobody
            was meant to touch.
          -->
          <app-uid-share
            [uid]="store.profile()?.userUid || null"
            [name]="fullName()"
          />

          <div class="profile-grid">
            <div>
              <p class="muted">Name</p>
              <strong>{{ store.profile()?.firstName }} {{ store.profile()?.lastName }}</strong>
            </div>
            <div>
              <p class="muted">Email</p>
              <strong>{{ store.profile()?.email }}</strong>
            </div>
            <div>
              <p class="muted">Phone</p>
              <strong>{{ store.profile()?.phoneNumber }}</strong>
            </div>
          </div>
        </app-section-card>
      } @else {
        <app-loading-state label="Loading profile..." />
      }
    </section>
  `,
  styles: [`
    .profile-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfilePageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly signingOutEverywhere = signal(false);

  private readonly confirm = inject(ConfirmService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly store = inject(UsersStore);

  ngOnInit(): void {
    void this.store.loadProfile();
  }

  /** Names the share message, so the recipient knows who sent the code. */
  readonly fullName = computed(() => {
    const profile = this.store.profile();
    return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || null;
  });

  async reload(): Promise<void> {
    void this.store.loadProfile();
  }

  /** Signing out everywhere ends this session too. */
  async signOutEverywhere(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Sign out of every device? You will need to sign in again here.',
      confirmLabel: 'Sign out',
      destructive: true
    })) {
      return;
    }

    this.signingOutEverywhere.set(true);

    try {
      await firstValueFrom(this.authService.logoutAllDevices());
      await this.router.navigateByUrl(RoutePaths.login);
    } finally {
      this.signingOutEverywhere.set(false);
    }
  }
}
