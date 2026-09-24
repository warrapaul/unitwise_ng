import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RenterProfileService } from '../renter-profile.service';
import { RenterProfileDetail, TenancyProfileStatus } from '../models/renter-profile.models';
import { DatePipe } from '@angular/common';
import { TenantsService } from '../../tenants/tenants.service';
import { DocumentType, TenantDocumentPreview } from '../../tenants/models/tenant.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';

/**
 * What a person tells landlords about themselves, written once and reused.
 *
 * The official name and ID number live here rather than on the account, and
 * the separation is deliberate: an account carries a display name people set
 * to an alias or a short form, while a tenancy ends in a lease. So the lease
 * runs on what the person deliberately stated is legally theirs.
 *
 * Nothing on this page reaches an agency on its own. It is released only by
 * approving a request that carries the profile scope, and can be withdrawn.
 */
@Component({
  selector: 'app-renter-profile-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    HumanLabelPipe,
    DatePipe,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading your renter profile..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
          <!--
            What a lease cannot be issued without comes first and open; what a
            landlord may like to know follows, collapsed. The order matches the
            preview, so a field sits in the same place read or edited.
          -->
          <app-section-card title="Your official details" subtitle="As they appear on your national ID.">
            <!--
              These are separate from the account on purpose. People put
              aliases and short forms on accounts; a lease cannot run on
              "Jay". Stating the legal name here is a deliberate act, and it
              is what gets copied onto a tenancy when you accept one.
            -->
            <div class="grid-auto">
              <label class="field">
                <span>First name</span>
                <input formControlName="officialFirstName">
                <app-field-error [control]="form.controls.officialFirstName" label="First name" />
              </label>
              <label class="field"><span>Middle name</span><input formControlName="officialMiddleName"></label>
              <label class="field">
                <span>Last name</span>
                <input formControlName="officialLastName">
                <app-field-error [control]="form.controls.officialLastName" label="Last name" />
              </label>
              <label class="field">
                <span>National ID number</span>
                <input formControlName="nationalIdNumber">
                <app-field-error [control]="form.controls.nationalIdNumber" label="National ID number" />
              </label>
              <label class="field">
                <span>Phone</span>
                <input type="tel" formControlName="officialPhoneNumber" autocomplete="tel">
                <app-field-error [control]="form.controls.officialPhoneNumber" label="Phone"
                  patternMessage="9-15 digits, optionally starting with +." />
                <small class="hint">Can differ from your login number.</small>
              </label>
              <label class="field"><span>Email</span><input type="email" formControlName="officialEmail"></label>
            </div>
          </app-section-card>

          <app-section-card title="Emergency contact">
            <div class="grid-auto">
              <label class="field"><span>Name</span><input formControlName="emergencyContactName"></label>
              <label class="field"><span>Phone</span><input type="tel" formControlName="emergencyContactPhone"></label>
              <label class="field"><span>Relationship</span><input formControlName="emergencyContactRelationship"></label>
            </div>

            <!--
              The natural pause: everything a lease needs is above. Saving here
              keeps it even if the rest never gets filled in.
            -->
            <div class="button-row">
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="saving()" (click)="saveDraft()">
                {{ saving() ? 'Saving...' : 'Save progress' }}
              </button>
              @if (draftSavedAt(); as savedAt) {
                <span class="muted" role="status">Saved at {{ savedAt | date: 'HH:mm' }}</span>
              }
            </div>
          </app-section-card>

          <!--
            Documents belong with the profile they evidence. They are saved
            the moment they are chosen, not with the form — a file upload is
            its own transaction, and losing one because a validation error
            elsewhere blocked the submit would be infuriating.
          -->
          <app-section-card title="Your documents">
            <div class="grid-auto">
              <label class="field">
                <span>Document type</span>
                <select (change)="onDocumentType($event)">
                  @for (option of documentTypes; track option.value) {
                    <option [value]="option.value" [selected]="option.value === documentType()">{{ option.label }}</option>
                  }
                </select>
              </label>

              <label class="field">
                <span>File</span>
                <input type="file" (change)="uploadDocument($event)" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
                <small class="hint">Uploads as soon as you choose it. Up to 10MB.</small>
              </label>
            </div>

            @if (uploading()) {
              <p class="muted">Uploading...</p>
            }

            @if (uploadError(); as apiError) {
              <app-error-card title="Unable to upload" [message]="apiError.message" [details]="apiError.details" />
            }

            @if (myDocuments().length === 0) {
              <p class="muted">Nothing uploaded yet.</p>
            } @else {
              <ul class="docs">
                @for (document of myDocuments(); track document.id) {
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
              <div class="grid-auto">
                <label class="field">
                  <span>People moving in</span>
                  <input type="number" min="1" formControlName="occupantCount">
                </label>
                <label class="field"><span>Pets</span><input formControlName="petDetails" placeholder="e.g. one cat"></label>
                <label class="field"><span>Earliest move-in</span><input type="date" formControlName="preferredMoveInDate"></label>
              </div>

              <label class="field field--wide">
                <span>Anything else</span>
                <textarea formControlName="aboutMe" rows="3" placeholder="Whatever you would want a landlord to know."></textarea>
              </label>
            </div>
          </details>

          <details class="panel disclosure">
            <summary><h2>Work and income</h2></summary>
            <div class="grid-auto">
              <label class="field">
                <span>Employment</span>
                <select formControlName="employmentStatus">
                  <option value="">Not stated</option>
                  <option value="EMPLOYED">Employed</option>
                  <option value="SELF_EMPLOYED">Self-employed</option>
                  <option value="STUDENT">Student</option>
                  <option value="RETIRED">Retired</option>
                  <option value="UNEMPLOYED">Unemployed</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label class="field"><span>Employer</span><input formControlName="employerName"></label>
              <label class="field"><span>Job title</span><input formControlName="jobTitle"></label>
              <label class="field"><span>Employed since</span><input type="date" formControlName="employedSince"></label>
              <label class="field">
                <span>Monthly income</span>
                <input type="number" step="0.01" formControlName="monthlyIncome">
              </label>
            </div>
          </details>

          <details class="panel disclosure">
            <summary><h2>Where you rented before</h2></summary>
            <div class="grid-auto">
              <label class="field"><span>Previous landlord</span><input formControlName="previousLandlordName"></label>
              <label class="field"><span>Their phone</span><input formControlName="previousLandlordPhone"></label>
              <label class="field field--wide"><span>Previous address</span><input formControlName="previousAddress"></label>
              <label class="field"><span>From</span><input type="date" formControlName="previousTenancyStart"></label>
              <label class="field"><span>To</span><input type="date" formControlName="previousTenancyEnd"></label>
              <label class="field field--wide">
                <span>Why you left</span>
                <input formControlName="reasonForLeaving">
              </label>
            </div>
          </details>

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save" [message]="apiError.message" [details]="apiError.details" />
          }

          <!--
            One button. The draft/complete distinction is derived from whether
            the official identity is filled in, rather than asked as a second
            question — a profile that can name you on a lease is finished
            enough to send, and one that cannot is not.
          -->
          <!-- Spread across the row: Cancel left, Save draft between, Save profile right. -->
          <div class="button-row button-row--spread">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save profile' }}
            </button>
            <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="saveDraft()">Save draft</button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.renterProfile">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
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
export class RenterProfilePageComponent implements OnInit {
  private readonly service = inject(RenterProfileService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantsService);
  readonly RoutePaths = RoutePaths;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly draftSavedAt = signal<Date | null>(null);
  readonly profile = signal<RenterProfileDetail | null>(null);

  readonly myDocuments = signal<TenantDocumentPreview[]>([]);
  readonly documentType = signal<DocumentType>('NATIONAL_ID_FRONT');
  readonly uploading = signal(false);
  readonly uploadError = signal<ApiError | null>(null);

  readonly documentTypes: readonly { value: DocumentType; label: string }[] = [
    { value: 'NATIONAL_ID_FRONT', label: 'National ID (front)' },
    { value: 'NATIONAL_ID_BACK', label: 'National ID (back)' },
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'PROOF_OF_EMPLOYMENT', label: 'Proof of employment' },
    { value: 'UTILITY_BILL', label: 'Utility bill' },
    { value: 'BANK_STATEMENT', label: 'Bank statement' },
    { value: 'REFERENCE_LETTER', label: 'Reference letter' },
    { value: 'OTHER', label: 'Other' }
  ];

  onDocumentType(event: Event): void {
    this.documentType.set((event.target as HTMLSelectElement).value as DocumentType);
  }

  /**
   * Uploads on choose, then clears the input so the same file can be picked
   * again after a failure — browsers fire no change event for an identical
   * selection, which otherwise makes a retry look broken.
   */
  async uploadDocument(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.uploading.set(true);
    this.uploadError.set(null);

    try {
      await firstValueFrom(this.tenants.uploadMyDocument(file, this.documentType()));
      await this.loadDocuments();
    } catch (error) {
      this.uploadError.set(toApiError(error));
    } finally {
      input.value = '';
      this.uploading.set(false);
    }
  }

  private async loadDocuments(): Promise<void> {
    try {
      const page = await firstValueFrom(this.tenants.getMyDocuments({ size: 100 }));
      this.myDocuments.set(page.items ?? []);
    } catch {
      this.myDocuments.set([]);
    }
  }

  readonly form = this.formBuilder.group({
    // Required in the form rather than derived on save. The server refuses a
    // COMPLETE profile without them, so asking here is the honest place: a
    // person finds out while typing rather than from a rejection afterwards.
    officialFirstName: ['', [Validators.required]],
    officialMiddleName: '',
    officialLastName: ['', [Validators.required]],
    nationalIdNumber: ['', [Validators.required]],
    // Required: it is the number a landlord calls, and the lease states it.
    officialPhoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{9,15}$/)]],
    officialEmail: '',
    employmentStatus: '', employerName: '', jobTitle: '', employedSince: '',
    monthlyIncome: [null as number | null],
    previousLandlordName: '', previousLandlordPhone: '', previousAddress: '',
    previousTenancyStart: '', previousTenancyEnd: '', reasonForLeaving: '',
    occupantCount: [null as number | null],
    petDetails: '', preferredMoveInDate: '', aboutMe: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: ''
  });



  ngOnInit(): void {
    void this.reload();
    void this.loadDocuments();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Returns an empty draft when nothing is saved, so the form always binds.
      const profile = await firstValueFrom(this.service.getMyProfile());
      this.profile.set(profile);
      this.patch(profile);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private patch(profile: RenterProfileDetail): void {
    this.form.patchValue({
      officialFirstName: profile.officialFirstName ?? '',
      officialMiddleName: profile.officialMiddleName ?? '',
      officialLastName: profile.officialLastName ?? '',
      nationalIdNumber: profile.nationalIdNumber ?? '',
      officialPhoneNumber: profile.officialPhoneNumber ?? '',
      officialEmail: profile.officialEmail ?? '',
      employmentStatus: profile.employmentStatus ?? '',
      employerName: profile.employerName ?? '',
      jobTitle: profile.jobTitle ?? '',
      employedSince: profile.employedSince ?? '',
      monthlyIncome: profile.monthlyIncome ?? null,
      previousLandlordName: profile.previousLandlordName ?? '',
      previousLandlordPhone: profile.previousLandlordPhone ?? '',
      previousAddress: profile.previousAddress ?? '',
      previousTenancyStart: profile.previousTenancyStart ?? '',
      previousTenancyEnd: profile.previousTenancyEnd ?? '',
      reasonForLeaving: profile.reasonForLeaving ?? '',
      occupantCount: profile.occupantCount ?? null,
      petDetails: profile.petDetails ?? '',
      preferredMoveInDate: profile.preferredMoveInDate ?? '',
      aboutMe: profile.aboutMe ?? '',
      emergencyContactName: profile.emergencyContactName ?? '',
      emergencyContactPhone: profile.emergencyContactPhone ?? '',
      emergencyContactRelationship: profile.emergencyContactRelationship ?? ''
    });

  }

  /**
   * Save what is there and stay, whatever is still missing. Only the format
   * of what was typed is checked — a half-typed phone number is still refused
   * — while blank required fields are allowed until the final save. The
   * server marks it a draft until the legal name, ID and phone are all in.
   */
  async saveDraft(): Promise<void> {
    const malformed = Object.values(this.form.controls).filter((control) =>
      control.errors && Object.keys(control.errors).some((key) => key !== 'required'));
    if (malformed.length > 0) {
      malformed.forEach((control) => control.markAsTouched());
      return;
    }

    if (await this.persist(this.identityComplete() ? 'COMPLETE' : 'DRAFT')) {
      this.draftSavedAt.set(new Date());
    }
  }

  /** The final save: everything required, then back to the preview. */
  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (await this.persist('COMPLETE')) {
      // Back to the preview. Staying on the form after a save left nothing
      // visibly different — the page looked identical and the only signal was
      // a line of text most people never saw.
      await this.router.navigateByUrl(RoutePaths.renterProfile);
    }
  }

  /** What the server requires before a profile can be COMPLETE and shared. */
  private identityComplete(): boolean {
    const value = this.form.getRawValue();
    return !!(value.officialFirstName.trim() && value.officialLastName.trim()
      && value.nationalIdNumber.trim() && value.officialPhoneNumber.trim());
  }

  /**
   * Whole-object replace, so every field goes including the blanks —
   * a merge would make a former employer impossible to clear.
   */
  private async persist(status: TenancyProfileStatus): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();

    try {
      const profile = await firstValueFrom(this.service.saveMyProfile({
        officialFirstName: value.officialFirstName.trim() || null,
        officialMiddleName: value.officialMiddleName.trim() || null,
        officialLastName: value.officialLastName.trim() || null,
        nationalIdNumber: value.nationalIdNumber.trim() || null,
        officialPhoneNumber: value.officialPhoneNumber.trim() || null,
        officialEmail: value.officialEmail.trim() || null,
        employmentStatus: (value.employmentStatus || null) as never,
        employerName: value.employerName || null,
        jobTitle: value.jobTitle || null,
        employedSince: value.employedSince || null,
        monthlyIncome: value.monthlyIncome,
        previousLandlordName: value.previousLandlordName || null,
        previousLandlordPhone: value.previousLandlordPhone || null,
        previousAddress: value.previousAddress || null,
        previousTenancyStart: value.previousTenancyStart || null,
        previousTenancyEnd: value.previousTenancyEnd || null,
        reasonForLeaving: value.reasonForLeaving || null,
        occupantCount: value.occupantCount,
        // Pets as a yes/no follows from whether any are described; the
        // checkbox beside the description only ever disagreed with it.
        hasPets: !!value.petDetails.trim(),
        petDetails: value.petDetails.trim() || null,
        preferredMoveInDate: value.preferredMoveInDate || null,
        aboutMe: value.aboutMe || null,
        emergencyContactName: value.emergencyContactName || null,
        emergencyContactPhone: value.emergencyContactPhone || null,
        emergencyContactRelationship: value.emergencyContactRelationship || null,
        status
      }));

      this.profile.set(profile);
      return true;
    } catch (error) {
      this.saveError.set(toApiError(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
