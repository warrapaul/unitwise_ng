import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { RenterProfileService } from '../renter-profile.service';
import { RenterProfileDetail } from '../models/renter-profile.models';
import { MyDocumentsPanelComponent } from '../../tenants/documents/my-documents-panel.component';
import { MyProfileGrantsPageComponent } from '../../tenants/profile-grants/my-profile-grants-page.component';

/**
 * The renter profile as the person themselves sees it, read-only.
 *
 * Separate from the form because reading and editing are different jobs: a
 * page of inputs is the wrong way to check what a landlord is about to be
 * shown, and it invites accidental edits to a record that ends up on a lease.
 * Editing is a deliberate trip to the form and back.
 */
@Component({
  selector: 'app-renter-profile-preview',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    HumanLabelPipe,
    MyDocumentsPanelComponent,
    MyProfileGrantsPageComponent
  ],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading your renter profile..." />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else if (!started()) {
      <app-empty-state
        title="No renter profile yet"
        description="Fill this in once and share it with any landlord who asks — they see it only when you approve."
        actionLabel="Set up my renter profile"
        [actionLink]="RoutePaths.renterProfileEdit"
      />
      <!-- Documents can go up before the rest of the profile is filled in. -->
      <div class="stack docs-only"><app-my-documents-panel /></div>
    } @else if (profile(); as detail) {
      <div class="stack">
        <!--
          "Who can see this" belongs to the profile as a whole. The documents
          are part of it and go out under the same grant, so the question is
          never about the documents alone.
        -->
        <!--
          One edit for the whole profile, above every card: it is one form with
          one save, so a pencil on a single card would promise to edit only that
          card. "Who can see this" sits with it — it, too, is about all of it.
        -->
        <div class="profile-bar">
          <p class="muted">What landlords see when you share your profile.</p>
          <button type="button" class="btn btn-secondary btn-sm" (click)="toSharing()">Who can see this</button>
          <button type="button" class="btn btn-secondary btn-sm" (click)="sharing()?.openShareCode()">Create a share code</button>
          <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.renterProfileEdit">
            <svg class="btn-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
            Edit renter profile
          </a>
        </div>

        <!-- Two columns on a wide screen: who you are beside who to call; documents beside the rest of the profile. -->
        <div class="pair">
        <app-section-card title="Your renter profile">

          @if (!detail.officialIdentityComplete) {
            <p class="hint">
              Your legal name and ID number are missing, so this cannot be shared and you cannot
              accept a tenancy yet.
            </p>
          }

          <dl class="detail-grid">
            <div><dt>Legal name</dt><dd>{{ fullName() || '—' }}</dd></div>
            <div><dt>National ID</dt><dd class="mono">{{ detail.nationalIdNumber || '—' }}</dd></div>
            <div><dt>Phone</dt><dd class="mono">{{ detail.officialPhoneNumber || '—' }}</dd></div>
            <div><dt>Email</dt><dd>{{ detail.officialEmail || '—' }}</dd></div>
          </dl>
        </app-section-card>

        <app-section-card title="Emergency contact">
          <dl class="detail-grid">
            <div><dt>Name</dt><dd>{{ detail.emergencyContactName || '—' }}</dd></div>
            <div><dt>Phone</dt><dd class="mono">{{ detail.emergencyContactPhone || '—' }}</dd></div>
            <div><dt>Relationship</dt><dd>{{ detail.emergencyContactRelationship || '—' }}</dd></div>
          </dl>
        </app-section-card>

        </div>

        <div class="pair">
        <!-- Upload, preview, open and delete live here now; there is no separate Documents tab. -->
        <app-my-documents-panel />

        <div class="stack side">
        <details class="panel disclosure">
          <summary><h2>Your household</h2></summary>
          <div class="stack">
            <dl class="detail-grid">
              <div><dt>Occupants</dt><dd>{{ detail.occupantCount ?? '—' }}</dd></div>
              <div><dt>Earliest move-in</dt><dd>{{ detail.preferredMoveInDate || '—' }}</dd></div>
            </dl>

            @if (detail.aboutMe) {
              <p class="muted">{{ detail.aboutMe }}</p>
            }
          </div>
        </details>

        <details class="panel disclosure">
          <summary><h2>Work and income</h2></summary>
          <dl class="detail-grid">
            <div><dt>Employment</dt><dd>{{ detail.employmentStatus ? (detail.employmentStatus | humanLabel) : '—' }}</dd></div>
            <div><dt>Employer</dt><dd>{{ detail.employerName || '—' }}</dd></div>
            <div><dt>Job title</dt><dd>{{ detail.jobTitle || '—' }}</dd></div>
            <div><dt>Since</dt><dd>{{ detail.employedSince || '—' }}</dd></div>
            <div><dt>Monthly income</dt><dd>{{ detail.monthlyIncome ? (detail.monthlyIncome | number) : '—' }}</dd></div>
          </dl>
        </details>

        <details class="panel disclosure">
          <summary><h2>Where you rented before</h2></summary>
          <dl class="detail-grid">
            <div><dt>Landlord</dt><dd>{{ detail.previousLandlordName || '—' }}</dd></div>
            <div><dt>Their phone</dt><dd class="mono">{{ detail.previousLandlordPhone || '—' }}</dd></div>
            <div><dt>Address</dt><dd>{{ detail.previousAddress || '—' }}</dd></div>
            <div><dt>Reason for leaving</dt><dd>{{ detail.reasonForLeaving || '—' }}</dd></div>
          </dl>
        </details>
        </div>
        </div>

        <!--
          Sharing lives with the profile it shares: who has it, what is waiting
          for an answer, and share codes. The buttons at the top jump here.
        -->
        <section id="sharing" class="sharing">
          <h2 class="sharing__title">Sharing</h2>
          <app-my-profile-grants-page />
        </section>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    p { margin: 0; }

    .docs-only { margin-top: 1rem; }
    .sharing { display: grid; gap: 0.75rem; scroll-margin-top: 1rem; }
    .sharing__title { margin: 0.5rem 0 0; font-size: 1.15rem; }
    .profile-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .profile-bar p { margin-right: auto; font-size: 0.88rem; }
    .btn-icon { width: 0.95rem; height: 0.95rem; margin-right: 0.35rem; fill: none; stroke: currentColor; stroke-width: 2; }
    .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr)); gap: 1rem; align-items: stretch; }
    .side { align-content: start; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RenterProfilePreviewComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly sharing = viewChild(MyProfileGrantsPageComponent);

  toSharing(): void {
    document.getElementById('sharing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private readonly service = inject(RenterProfileService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly profile = signal<RenterProfileDetail | null>(null);

  /**
   * The server hands back an empty draft when nothing is saved, so "has a
   * profile" is a question about content rather than about the response.
   */
  readonly started = computed(() => {
    const detail = this.profile();
    if (!detail) {
      return false;
    }

    return !!(detail.officialFirstName || detail.officialLastName || detail.nationalIdNumber
      || detail.employmentStatus || detail.employerName || detail.aboutMe);
  });

  readonly fullName = computed(() => {
    const detail = this.profile();
    return [detail?.officialFirstName, detail?.officialMiddleName, detail?.officialLastName]
      .filter(Boolean).join(' ');
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.profile.set(await firstValueFrom(this.service.getMyProfile()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
