import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';

@Component({
  selector: 'app-user-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    PermissionGateComponent
  ],
  template: `
    <section class="stack">
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
              <a class="btn btn-secondary" routerLink="/users">Back to users</a>
              <a class="btn btn-secondary" [routerLink]="['/users', store.selectedUser()?.id, 'edit']">Edit</a>
              <app-permission-gate [permissions]="['USER_RESET_PASSWORD']">
                <button type="button" class="btn btn-secondary" (click)="resetTempPassword()">Reset temp password</button>
              </app-permission-gate>
              <button type="button" class="btn btn-danger" (click)="deleteUser()">Delete</button>
            </div>
          </ng-container>

          <div class="detail-grid">
            <div><p class="muted">Phone</p><strong>{{ store.selectedUser()?.phoneNumber }}</strong></div>
            <div><p class="muted">National ID</p><strong>{{ store.selectedUser()?.nationalIdNumber }}</strong></div>
            <div><p class="muted">UID</p><strong>{{ store.selectedUser()?.userUid }}</strong></div>
            <div><p class="muted">Status</p><strong>{{ store.selectedUser()?.status || 'ACTIVE' }}</strong></div>
          </div>

          <section class="detail-grid cards">
            <article class="card subcard">
              <p class="eyebrow">Account</p>
              <p class="muted">Email verified: {{ store.selectedUser()?.userAccount?.emailVerified ? 'Yes' : 'No' }}</p>
              <p class="muted">Phone verified: {{ store.selectedUser()?.userAccount?.phoneVerified ? 'Yes' : 'No' }}</p>
              <p class="muted">Locked: {{ store.selectedUser()?.userAccount?.isLocked ? 'Yes' : 'No' }}</p>
            </article>

            <article class="card subcard">
              <p class="eyebrow">Profile</p>
              <p class="muted">Gender: {{ store.selectedUser()?.userProfile?.gender || 'N/A' }}</p>
              <p class="muted">Phone alt: {{ store.selectedUser()?.userProfile?.phoneNumberSecondary || 'N/A' }}</p>
            </article>
          </section>
        </app-section-card>
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

    .detail-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .cards {
      margin-top: 0.5rem;
    }

    .subcard {
      padding: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(UsersStore);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isNaN(id)) {
      void this.store.loadUser(id);
    }
  }

  reload(): void {
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
    if (!this.store.error()) {
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
}
