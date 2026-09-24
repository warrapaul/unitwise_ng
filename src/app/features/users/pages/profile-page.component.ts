import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { AuthService } from '../../../core/auth/auth.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      @if (store.loading()) {
        <app-loading-state label="Loading profile..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load profile'" (retry)="reload()" />
      } @else if (store.profile()) {
        <app-section-card title="My profile">
          <!--
            An icon, not a button: the title already names what is edited, and
            a full "Edit profile" button beside it outweighed the page's content.
          -->
          <ng-container actions>
            <a class="icon-action" [routerLink]="RoutePaths.profileEdit" aria-label="Edit profile" title="Edit profile">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
            </a>
          </ng-container>

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

          <!--
            Account security last. Neither is why anyone opens their profile,
            and at the top they outranked the details the page is for.
          -->
          <div class="button-row">
            <a class="btn btn-secondary" [routerLink]="RoutePaths.changePassword">Change password</a>
            <button type="button" class="btn btn-secondary" [disabled]="signingOutEverywhere()" (click)="signOutEverywhere()">
              {{ signingOutEverywhere() ? 'Signing out...' : 'Sign out other devices' }}
            </button>
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
  private readonly notifications = inject(NotificationService);
  private readonly authService = inject(AuthService);

  readonly store = inject(UsersStore);

  ngOnInit(): void {
    void this.store.loadProfile();
  }

  async reload(): Promise<void> {
    void this.store.loadProfile();
  }

  /**
   * This device is the one that survives. Everything else signed in as this
   * user — another browser, an old phone, whoever the user is worried about —
   * is signed out and cannot refresh its way back in.
   */
  async signOutEverywhere(): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Sign out of all other devices?',
      message: 'Every other browser and phone signed in to this account will be signed out. This device stays signed in.',
      confirmLabel: 'Sign out others',
      destructive: true
    })) {
      return;
    }

    this.signingOutEverywhere.set(true);

    try {
      await firstValueFrom(this.authService.logoutAllDevices());
      this.notifications.push('success', 'All other devices have been signed out. This one is still signed in.');
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.signingOutEverywhere.set(false);
    }
  }
}
