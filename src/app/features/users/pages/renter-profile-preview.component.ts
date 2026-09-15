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
        <app-section-card
          title="Your renter profile"
          subtitle="What a landlord sees once you approve their request."
        >
          <ng-container actions>
            <a class="btn btn-primary" [routerLink]="RoutePaths.renterProfileEdit">Edit</a>
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

        <app-section-card title="Work and income">
          <dl class="detail-grid">
            <div><dt>Employment</dt><dd>{{ detail.employmentStatus ? (detail.employmentStatus | humanLabel) : '—' }}</dd></div>
            <div><dt>Employer</dt><dd>{{ detail.employerName || '—' }}</dd></div>
            <div><dt>Job title</dt><dd>{{ detail.jobTitle || '—' }}</dd></div>
            <div><dt>Since</dt><dd>{{ detail.employedSince || '—' }}</dd></div>
            <div><dt>Monthly income</dt><dd>{{ detail.monthlyIncome ? (detail.monthlyIncome | number) : '—' }}</dd></div>
          </dl>
        </app-section-card>

        <app-section-card title="Where you rented before">
          <dl class="detail-grid">
            <div><dt>Landlord</dt><dd>{{ detail.previousLandlordName || '—' }}</dd></div>
            <div><dt>Their phone</dt><dd class="mono">{{ detail.previousLandlordPhone || '—' }}</dd></div>
            <div><dt>Address</dt><dd>{{ detail.previousAddress || '—' }}</dd></div>
            <div><dt>Reason for leaving</dt><dd>{{ detail.reasonForLeaving || '—' }}</dd></div>
          </dl>
        </app-section-card>

        <app-section-card title="Your household">
          <dl class="detail-grid">
            <div><dt>Occupants</dt><dd>{{ detail.occupantCount ?? '—' }}</dd></div>
            <div><dt>Pets</dt><dd>{{ detail.hasPets ? (detail.petDetails || 'Yes') : 'No' }}</dd></div>
            <div><dt>Smoker</dt><dd>{{ detail.smoker ? 'Yes' : 'No' }}</dd></div>
            <div><dt>Earliest move-in</dt><dd>{{ detail.preferredMoveInDate || '—' }}</dd></div>
            <div><dt>Budget</dt><dd>{{ detail.maxMonthlyBudget ? (detail.maxMonthlyBudget | number) : '—' }}</dd></div>
          </dl>

          @if (detail.aboutMe) {
            <p class="muted">{{ detail.aboutMe }}</p>
          }
        </app-section-card>

        <app-section-card title="People who can vouch for you">
          <dl class="detail-grid">
            <div><dt>Emergency contact</dt><dd>{{ detail.emergencyContactName || '—' }}</dd></div>
            <div><dt>Their phone</dt><dd class="mono">{{ detail.emergencyContactPhone || '—' }}</dd></div>
            <div><dt>Relationship</dt><dd>{{ detail.emergencyContactRelationship || '—' }}</dd></div>
            <div><dt>Reference</dt><dd>{{ detail.referenceName || '—' }}</dd></div>
            <div><dt>Their phone</dt><dd class="mono">{{ detail.referencePhone || '—' }}</dd></div>
            <div><dt>Relationship</dt><dd>{{ detail.referenceRelationship || '—' }}</dd></div>
          </dl>
        </app-section-card>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RenterProfilePreviewComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

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
