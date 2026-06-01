import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [LoadingStateComponent, ErrorStateComponent, SectionCardComponent],
  template: `
    <section class="stack">
      @if (store.loading()) {
        <app-loading-state label="Loading profile..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load profile'" (retry)="reload()" />
      } @else if (store.profile()) {
        <app-section-card title="My profile" eyebrow="User">
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
            <div>
              <p class="muted">UID</p>
              <strong>{{ store.profile()?.userUid }}</strong>
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
  readonly store = inject(UsersStore);

  ngOnInit(): void {
    void this.store.loadProfile();
  }

  reload(): void {
    void this.store.loadProfile();
  }
}
