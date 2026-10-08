import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { UserAccountPanelComponent } from '../components/user-account-panel.component';
import { UserDetail } from '../models/user.models';

/**
 * A user account on its own page. Everything about the account — details,
 * roles, password reset, sign-out, delete — is the shared panel, which other
 * pages (a tenant's, an agency owner's) embed, so all of them offer the same.
 */
@Component({
  selector: 'app-user-detail-page',
  standalone: true,
  imports: [BackLinkComponent, EmptyStateComponent, UserAccountPanelComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.users" label="Back to users" [title]="title()" />
      @if (userId(); as id) {
        <app-user-account-panel [userId]="id" (loaded)="onLoaded($event)" (deleted)="onDeleted()" />
      } @else {
        <app-empty-state title="No user selected" description="Choose a user from the list to continue." />
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserDetailPageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly userId = signal<number | null>((() => {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    return Number.isNaN(id) || id <= 0 ? null : id;
  })());
  readonly title = signal('');

  onLoaded(user: UserDetail): void {
    this.title.set([user.firstName, user.lastName].filter(Boolean).join(' '));
  }

  /** The listing, by its own path: '/users' is not a route in this app. */
  onDeleted(): void {
    void this.router.navigateByUrl(RoutePaths.users);
  }
}
