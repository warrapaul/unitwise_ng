import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { TenantDocumentListPageComponent } from '../documents/document-list-page.component';
import { TenantProfilePageComponent } from './tenant-profile-page.component';
import { TenancyInvitationsComponent } from './tenancy-invitations.component';
import { RenterProfilePreviewComponent } from '../../users/pages/renter-profile-preview.component';
import { UidShareComponent } from '../../../shared/components/uid-share/uid-share.component';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { UsersStore } from '../../users/store/users.store';

type TenancyTab = 'profile' | 'tenancy' | 'documents';

/**
 * The signed-in person's **tenant record** — not their user account.
 *
 * The two are different entities and only optionally related: a tenant row
 * carries a nullable user id, a landlord owns and edits it, and one person can
 * hold several tenancies with different landlords. Their name, email and
 * password belong to the account and live under Profile; what a landlord holds
 * about them as an occupant belongs here.
 *
 * Tenancy details and documents are tabs because both hang off that same tenant
 * record — the documents are the evidence behind the tenancy, so splitting them
 * across two nav entries made the reader guess which one they were in.
 *
 * The panels are the existing route components rendered in place: the merge is
 * of navigation, not of code, so each keeps its own loading and error handling.
 */
@Component({
  selector: 'app-my-tenancy-page',
  standalone: true,
  imports: [
    RenterProfilePreviewComponent,
    TenantProfilePageComponent,
    TenantDocumentListPageComponent,
    TenancyInvitationsComponent,
    UidShareComponent
  ],
  template: `
    <section class="stack">
      <!--
        Above the tabs, not inside one: until this is answered the tenancy is
        in nobody's working queue, and burying the only thing that moves it
        behind a tab is how it stays unanswered.
      -->
      <app-tenancy-invitations />

      <!--
        Above the tabs rather than inside the tenancy one: the question it
        answers — how does a landlord find me? — is asked just as often from
        the documents tab, and before any tenancy exists at all.
      -->
      <!-- The same chip as an agency's code: the ID, copy and share — and one line on what it is for. -->
      @if (userUid()) {
        <p class="my-id">
          <span class="my-id__label">Your Unitwise ID</span>
          <app-uid-share variant="inline" [uid]="userUid()" [name]="fullName()" label="Unitwise ID" />
          <span class="muted my-id__hint">Give it to your landlord to be added.</span>
        </p>
      }

      <nav class="tabs" aria-label="My tenancy">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            class="tab"
            [class.tab--active]="active() === tab.id"
            [attr.aria-current]="active() === tab.id ? 'page' : null"
            (click)="active.set(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </nav>

      @switch (active()) {
        @case ('tenancy')   { <app-tenant-profile-page /> }
        @case ('documents') { <app-tenant-document-list-page /> }
        @default            { <app-renter-profile-preview /> }
      }
    </section>
  `,
  styles: [`
    .my-id { display: flex; align-items: center; gap: 0.4rem 0.6rem; flex-wrap: wrap; margin: 0; }
    .my-id__label { font-weight: 600; font-size: 0.9rem; }
    .my-id__hint { font-size: 0.82rem; }

    .tabs {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      padding: 0.25rem;
      border-radius: 12px;
      background: var(--surface-2);
      justify-self: start;
    }

    .tab {
      padding: 0.45rem 0.85rem;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--text-muted);
      font: inherit;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }

    .tab--active {
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow-md);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyTenancyPageComponent implements OnInit {
  private readonly session = inject(AuthSessionService);
  private readonly users = inject(UsersStore);

  readonly active = signal<TenancyTab>('profile');

  /*
   * Read from the session's profile, which is fetched once at login and
   * already carries the uid — so this costs no request, and it is there
   * whether or not the person has a tenancy yet.
   */
  readonly userUid = computed(() =>
    this.session.userProfile()?.userUid ?? this.users.profile()?.userUid ?? null
  );

  readonly fullName = computed(() => {
    const profile = this.session.userProfile() ?? this.users.profile();
    return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || null;
  });

  /**
   * The session holds the profile after a normal login, but a session
   * restored without a refresh token never re-fetches it — and the uid would
   * then simply be absent with no explanation. Fetch it only in that case.
   */
  ngOnInit(): void {
    if (!this.session.userProfile() && !this.users.profile()) {
      void this.users.loadProfile();
    }
  }

  /**
   * Both always present. Gating them on a tenancy permission would make
   * Documents unreachable for the person about to upload identity documents
   * for a room application — the panels report their own empty state instead
   * (§22.1).
   */
  readonly tabs: readonly { id: TenancyTab; label: string }[] = [
    // The profile leads: it is the thing the person fills in and shares, and
    // it exists before any tenancy does. A tenancy only appears once a
    // landlord creates one.
    { id: 'profile', label: 'Renter profile' },
    { id: 'tenancy', label: 'Tenancy' },
    { id: 'documents', label: 'Documents' }
  ];
}
