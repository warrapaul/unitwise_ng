import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { RenterProfileService } from '../renter-profile.service';
import { RenterProfileDetail } from '../models/renter-profile.models';
import { TenantsService } from '../../tenants/tenants.service';
import { MyTenanciesStore } from '../../tenants/tenants/my-tenancies.store';
import { MyDocumentsPanelComponent } from '../../tenants/documents/my-documents-panel.component';
import { MyProfileGrantsPageComponent } from '../../tenants/profile-grants/my-profile-grants-page.component';

/**
 * The tenant profile as the person themselves sees it, read-only.
 *
 * Separate from the form because reading and editing are different jobs: a
 * page of inputs is the wrong way to check what a landlord is about to be
 * shown, and it invites accidental edits to a record that ends up on a lease.
 * Editing is a deliberate trip to the form and back.
 */
@Component({
  selector: 'app-renter-profile-preview',
  standalone: true,
  imports: [PhoneMenuComponent, 
    RouterLink,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    MyDocumentsPanelComponent,
    MyProfileGrantsPageComponent
  ],
  template: `
    @if (loading()) {
      <app-loading-state label="Loading your tenant profile…" />
    } @else if (error()) {
      <app-error-state [message]="error()!" (retry)="reload()" />
    } @else if (!started()) {
      <app-empty-state
        title="No tenant profile yet"
        description="Fill this in once and share it with any landlord who asks — they see it only when you approve."
        actionLabel="Set up my tenant profile"
        [actionLink]="RoutePaths.renterProfileEdit"
      />
      <!-- Documents can go up before the rest of the profile is filled in. -->
      <div class="stack docs-only"><app-my-documents-panel /></div>
    } @else if (profile(); as detail) {
      <div class="stack">
        <!-- One action: the profile is one form with one save. Sharing and share codes are in Sharing below. -->
        <div class="profile-bar">
          <p class="muted">What landlords see when you share your profile.</p>
          <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.renterProfileEdit">
            <svg class="btn-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg>
            Edit tenant profile
          </a>
        </div>

        <!-- How far along it is, and exactly what is missing: a profile is shared as a whole. -->
        @if (completeness().done < completeness().total) {
        <div class="progress-card">
          <div class="progress-card__head">
            <strong>{{ completeness().done }} of {{ completeness().total }} done</strong>
            <span class="bar" aria-hidden="true"><span [style.width.%]="100 * completeness().done / completeness().total"></span></span>
          </div>
          @if (completeness().missing.length > 0) {
            <p class="muted">Still to add: {{ completeness().missing.join(', ') }}.</p>
          }
        </div>
        }

        <div class="pair">
        <app-section-card title="Your tenant profile" [subtitle]="detail.officialIdentityComplete ? 'Complete' : 'Missing details'">
          @if (!detail.officialIdentityComplete) {
            <p class="hint">Your legal name and ID number are missing, so this cannot be shared and you cannot accept a tenancy yet.</p>
          }
          <dl class="detail-grid">
            <div><dt>Legal name</dt><dd>{{ fullName() || '—' }}</dd></div>
            <div><dt>National ID</dt><dd class="mono">{{ detail.nationalIdNumber || '—' }}</dd></div>
            <div><dt>Phone</dt><dd>@if (detail.officialPhoneNumber) { <app-phone-menu [phone]="detail.officialPhoneNumber" /> } @else { — }</dd></div>
            <div><dt>Email</dt><dd>@if (detail.officialEmail) { {{ detail.officialEmail }} } @else { <a class="text-link" [routerLink]="RoutePaths.renterProfileEdit">Add email</a> }</dd></div>
          </dl>
        </app-section-card>

        <app-section-card title="Emergency contact" [subtitle]="detail.emergencyContactName && detail.emergencyContactPhone ? 'Complete' : 'Not added'">
          @if (detail.emergencyContactName || detail.emergencyContactPhone) {
            <dl class="detail-grid">
              <div><dt>Name</dt><dd>{{ detail.emergencyContactName || '—' }}</dd></div>
              <div><dt>Phone</dt><dd>@if (detail.emergencyContactPhone) { <app-phone-menu [phone]="detail.emergencyContactPhone" /> } @else { — }</dd></div>
              @if (detail.emergencyContactRelationship) { <div><dt>Relationship</dt><dd>{{ detail.emergencyContactRelationship }}</dd></div> }
            </dl>
          } @else {
            <p class="muted">Someone to call if your landlord cannot reach you.</p>
            <a class="btn btn-secondary btn-sm start" [routerLink]="RoutePaths.renterProfileEdit">Add emergency contact</a>
          }
        </app-section-card>
        </div>

        <app-my-documents-panel />

        <!--
          Household, work and rental history are for applying, not for someone already living here:
          shown to a person without a home yet, or when they have filled some in already.
        -->
        @if (!livingHere() || applicationParts() > 0) {
          <app-section-card title="Rental application" subtitle="Optional — household, work and past rentals, for when you apply for a room.">
            <p class="muted">{{ applicationParts() === 0 ? 'Not filled in.' : applicationParts() + ' of 3 parts filled in.' }}</p>
            <a class="btn btn-secondary btn-sm start" [routerLink]="RoutePaths.rentalApplication">{{ applicationParts() === 0 ? 'Fill in' : 'Edit' }}</a>
          </app-section-card>
        }

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

    .docs-only { margin-top: var(--space-4); }
    .sharing { display: grid; gap: var(--space-3); scroll-margin-top: 1rem; }
    .sharing__title { margin: var(--space-2) 0 0; font-size: var(--text-lg); }
    .profile-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .profile-bar p { margin-right: auto; font-size: var(--text-md); }
    .btn-icon { width: 0.95rem; height: 0.95rem; margin-right: var(--space-1-5); fill: none; stroke: currentColor; stroke-width: 2; }
    .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr)); gap: var(--space-4); align-items: stretch; }
    .start { justify-self: start; }
    .progress-card { display: grid; gap: var(--space-1-5); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
    .progress-card--done { border-color: var(--success); }
    .progress-card__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
    .bar { flex: 1 1 8rem; height: 0.5rem; border-radius: var(--radius-pill); background: var(--surface-2); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--primary); }
    .progress-card--done .bar span { background: var(--success); }

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
  private readonly tenancies = inject(MyTenanciesStore);
  private readonly tenantsService = inject(TenantsService);

  /** Someone with a home now: the application questions are not theirs to answer. */
  readonly livingHere = computed(() => this.tenancies.tenancies().some((tenancy) => tenancy.status === 'ACTIVE'));

  /** The documents uploaded, by type: the ID's two sides count towards completeness. */
  private readonly documentTypes = signal<ReadonlySet<string>>(new Set());

  /** Four parts make a profile a landlord can act on: who you are, how to reach you, someone to call, your ID. */
  readonly completeness = computed(() => {
    const d = this.profile();
    const docs = this.documentTypes();
    const parts: [boolean, string][] = [
      [!!(d?.officialFirstName && d?.officialLastName && d?.nationalIdNumber), 'legal name and ID number'],
      [!!d?.officialPhoneNumber, 'phone number'],
      [!!(d?.emergencyContactName && d?.emergencyContactPhone), 'emergency contact'],
      [(docs.has('NATIONAL_ID_FRONT') && docs.has('NATIONAL_ID_BACK')) || docs.has('PASSPORT'), 'a photo of your ID (both sides) or passport']
    ];
    return { done: parts.filter(([ok]) => ok).length, total: parts.length, missing: parts.filter(([ok]) => !ok).map(([, label]) => label) };
  });

  /** How many of household, work and past rentals hold anything. */
  readonly applicationParts = computed(() => {
    const d = this.profile();
    if (!d) {
      return 0;
    }
    return [d.occupantCount || d.preferredMoveInDate || d.aboutMe,
      d.employmentStatus || d.employerName || d.jobTitle || d.monthlyIncome,
      d.previousLandlordName || d.previousAddress].filter(Boolean).length;
  });

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

  private async loadDocumentTypes(): Promise<void> {
    try {
      const page = await firstValueFrom(this.tenantsService.getMyDocuments({ size: 100 }));
      this.documentTypes.set(new Set((page.items ?? []).filter((doc) => doc.isCurrentVersion !== false).map((doc) => doc.documentType ?? '')));
    } catch {
      // Without the list, the indicator counts the ID as missing; the documents card still shows what is there.
    }
  }

  ngOnInit(): void {
    void this.tenancies.load();
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.profile.set(await firstValueFrom(this.service.getMyProfile()));
      void this.loadDocumentTypes();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
