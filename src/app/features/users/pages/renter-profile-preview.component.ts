import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { TenantsService } from '../../tenants/tenants.service';
import { TenantDocumentPreview } from '../../tenants/models/tenant.models';

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
    HumanLabelPipe
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
    } @else if (profile(); as detail) {
      <div class="stack">
        <!--
          "Who can see this" belongs to the profile as a whole. The documents
          are part of it and go out under the same grant, so the question is
          never about the documents alone.
        -->
        <app-section-card title="Your renter profile">
          <ng-container actions>
            <div class="button-row">
              <a class="btn btn-secondary" [routerLink]="RoutePaths.renterProfileEdit">Edit</a>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.myProfileSharing">Who can see this</a>
            </div>
          </ng-container>

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

        <app-section-card title="Your documents">
          @if (documentsError()) {
            <p class="muted">Your documents could not be loaded.</p>
          } @else if (documents().length === 0) {
            <p class="muted">Nothing uploaded yet.</p>
          } @else {
            <ul class="docs">
              @for (document of documents(); track document.id) {
                <li class="docs__row">
                  <span>{{ document.documentType | humanLabel }}</span>
                  <span class="muted">{{ document.fileName }}</span>
                </li>
              }
            </ul>
          }
        </app-section-card>

        <details class="panel disclosure">
          <summary><h2>Your household</h2></summary>
          <div class="stack">
            <dl class="detail-grid">
              <div><dt>Occupants</dt><dd>{{ detail.occupantCount ?? '—' }}</dd></div>
              <div><dt>Pets</dt><dd>{{ detail.petDetails || 'None' }}</dd></div>
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
    }
  `,
  styles: [`
    :host { display: block; }
    p { margin: 0; }

    .docs { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }

    .docs__row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RenterProfilePreviewComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly service = inject(RenterProfileService);
  private readonly tenants = inject(TenantsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly profile = signal<RenterProfileDetail | null>(null);
  readonly documents = signal<TenantDocumentPreview[]>([]);
  readonly documentsError = signal(false);

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

    void this.loadDocuments();

    try {
      this.profile.set(await firstValueFrom(this.service.getMyProfile()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Secondary to the profile, so a failure here says so in place rather than replacing the page. */
  private async loadDocuments(): Promise<void> {
    this.documentsError.set(false);

    try {
      const page = await firstValueFrom(this.tenants.getMyDocuments({ size: 100 }));
      this.documents.set(page.items ?? []);
    } catch {
      this.documentsError.set(true);
    }
  }
}
