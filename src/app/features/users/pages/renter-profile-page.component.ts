import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { RenterProfileDetail } from '../models/renter-profile.models';
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
          <app-section-card
            title="Your renter profile"
            [subtitle]="statusLine()"
          >
            <p class="muted">
              Fill this in once and share it with any landlord who asks. They see it only when
              you approve their request, and you can stop sharing at any time — which leaves
              them whatever copy they took while verifying you, and nothing live.
            </p>
          </app-section-card>

          <app-section-card
            title="Your official details"
            subtitle="As they appear on your national ID — not the name on your account."
          >
            <!--
              These are separate from the account on purpose. People put
              aliases and short forms on accounts; a lease cannot run on
              "Jay". Stating the legal name here is a deliberate act, and it
              is what gets copied onto a tenancy when you accept one.
            -->
            <div class="grid-auto">
              <label class="field">
                <span>Legal first name</span>
                <input formControlName="officialFirstName">
                <app-field-error [control]="form.controls.officialFirstName" label="Legal first name" />
              </label>
              <label class="field"><span>Middle name</span><input formControlName="officialMiddleName"></label>
              <label class="field">
                <span>Legal last name</span>
                <input formControlName="officialLastName">
                <app-field-error [control]="form.controls.officialLastName" label="Legal last name" />
              </label>
              <label class="field">
                <span>National ID number</span>
                <input formControlName="nationalIdNumber">
                <app-field-error [control]="form.controls.nationalIdNumber" label="National ID number" />
                <small class="hint">A landlord checks this against your documents.</small>
              </label>
              <label class="field">
                <span>Phone for landlords</span>
                <input formControlName="officialPhoneNumber">
                <small class="hint">Can differ from your login number.</small>
              </label>
              <label class="field"><span>Email for landlords</span><input type="email" formControlName="officialEmail"></label>
            </div>

            <p class="hint">
              Required. Without these the profile cannot name you on a tenancy, so nothing can be
              shared and no tenancy can be accepted.
            </p>
          </app-section-card>

          <app-section-card title="Work and income">
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
          </app-section-card>

          <app-section-card title="Where you rented before">
            <div class="grid-auto">
              <label class="field"><span>Previous landlord</span><input formControlName="previousLandlordName"></label>
              <label class="field"><span>Their phone</span><input formControlName="previousLandlordPhone"></label>
              <label class="field field--full"><span>Previous address</span><input formControlName="previousAddress"></label>
              <label class="field"><span>From</span><input type="date" formControlName="previousTenancyStart"></label>
              <label class="field"><span>To</span><input type="date" formControlName="previousTenancyEnd"></label>
              <label class="field field--full">
                <span>Why you left</span>
                <input formControlName="reasonForLeaving">
              </label>
            </div>
          </app-section-card>

          <app-section-card title="Your household">
            <div class="grid-auto">
              <label class="field">
                <span>People moving in</span>
                <input type="number" min="1" formControlName="occupantCount">
              </label>
              <label class="field"><span>Pets</span><input formControlName="petDetails" placeholder="e.g. one cat"></label>
              <label class="field"><span>Earliest move-in</span><input type="date" formControlName="preferredMoveInDate"></label>
              <label class="field">
                <span>Most you can pay monthly</span>
                <input type="number" step="0.01" formControlName="maxMonthlyBudget">
              </label>
            </div>

            <div class="checkbox-row">
              <label class="checkbox-field">
                <input type="checkbox" formControlName="hasPets"><span>I have pets</span>
              </label>
              <label class="checkbox-field">
                <input type="checkbox" formControlName="smoker"><span>I smoke</span>
              </label>
            </div>

            <label class="field field--wide">
              <span>Anything else</span>
              <textarea formControlName="aboutMe" rows="3" placeholder="Whatever you would want a landlord to know."></textarea>
            </label>
          </app-section-card>

          <app-section-card title="People who can vouch for you">
            <div class="grid-auto">
              <label class="field"><span>Emergency contact</span><input formControlName="emergencyContactName"></label>
              <label class="field"><span>Their phone</span><input formControlName="emergencyContactPhone"></label>
              <label class="field"><span>Relationship</span><input formControlName="emergencyContactRelationship"></label>
              <label class="field"><span>Reference</span><input formControlName="referenceName"></label>
              <label class="field"><span>Their phone</span><input formControlName="referencePhone"></label>
              <label class="field"><span>Relationship</span><input formControlName="referenceRelationship"></label>
            </div>
          </app-section-card>

          <!--
            Documents belong with the profile they evidence. They are saved
            the moment they are chosen, not with the form — a file upload is
            its own transaction, and losing one because a validation error
            elsewhere blocked the submit would be infuriating.
          -->
          <app-section-card
            title="Your documents"
            subtitle="The evidence behind what you stated. Shared together with the profile, never separately."
          >
            <div class="grid-auto">
              <label class="field">
                <span>Document type</span>
                <select [value]="documentType()" (change)="onDocumentType($event)">
                  <option value="NATIONAL_ID_FRONT">National ID (front)</option>
                  <option value="NATIONAL_ID_BACK">National ID (back)</option>
                  <option value="PASSPORT">Passport</option>
                  <option value="PROOF_OF_EMPLOYMENT">Proof of employment</option>
                  <option value="UTILITY_BILL">Utility bill</option>
                  <option value="BANK_STATEMENT">Bank statement</option>
                  <option value="REFERENCE_LETTER">Reference letter</option>
                  <option value="OTHER">Other</option>
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

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save" [message]="apiError.message" [details]="apiError.details" />
          }

          <!--
            One button. The draft/complete distinction is derived from whether
            the official identity is filled in, rather than asked as a second
            question — a profile that can name you on a lease is finished
            enough to send, and one that cannot is not.
          -->
          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save profile' }}
            </button>
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
  readonly profile = signal<RenterProfileDetail | null>(null);

  readonly myDocuments = signal<TenantDocumentPreview[]>([]);
  readonly documentType = signal<DocumentType>('NATIONAL_ID_FRONT');
  readonly uploading = signal(false);
  readonly uploadError = signal<ApiError | null>(null);

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
    officialPhoneNumber: '', officialEmail: '',
    employmentStatus: '', employerName: '', jobTitle: '', employedSince: '',
    monthlyIncome: [null as number | null],
    previousLandlordName: '', previousLandlordPhone: '', previousAddress: '',
    previousTenancyStart: '', previousTenancyEnd: '', reasonForLeaving: '',
    occupantCount: [null as number | null],
    hasPets: false, petDetails: '', smoker: false,
    preferredMoveInDate: '', maxMonthlyBudget: [null as number | null], aboutMe: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelationship: '',
    referenceName: '', referencePhone: '', referenceRelationship: ''
  });



  statusLine(): string {
    return 'Fill this in once. Share it with any landlord who asks, and stop whenever you like.';
  }

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
      hasPets: profile.hasPets ?? false,
      petDetails: profile.petDetails ?? '',
      smoker: profile.smoker ?? false,
      preferredMoveInDate: profile.preferredMoveInDate ?? '',
      maxMonthlyBudget: profile.maxMonthlyBudget ?? null,
      aboutMe: profile.aboutMe ?? '',
      emergencyContactName: profile.emergencyContactName ?? '',
      emergencyContactPhone: profile.emergencyContactPhone ?? '',
      emergencyContactRelationship: profile.emergencyContactRelationship ?? '',
      referenceName: profile.referenceName ?? '',
      referencePhone: profile.referencePhone ?? '',
      referenceRelationship: profile.referenceRelationship ?? ''
    });

  }

  /**
   * Whole-object replace, so every field goes including the blanks —
   * a merge would make a former employer impossible to clear.
   */
  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

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
        hasPets: value.hasPets,
        petDetails: value.petDetails || null,
        smoker: value.smoker,
        preferredMoveInDate: value.preferredMoveInDate || null,
        maxMonthlyBudget: value.maxMonthlyBudget,
        aboutMe: value.aboutMe || null,
        emergencyContactName: value.emergencyContactName || null,
        emergencyContactPhone: value.emergencyContactPhone || null,
        emergencyContactRelationship: value.emergencyContactRelationship || null,
        referenceName: value.referenceName || null,
        referencePhone: value.referencePhone || null,
        referenceRelationship: value.referenceRelationship || null,
        // Always complete. The form will not submit without the legal name
        // and ID number, which is the only thing the server's own check is
        // about — so there is no state left for a draft to represent.
        status: 'COMPLETE'
      }));

      this.profile.set(profile);

      // Back to the preview. Staying on the form after a save left nothing
      // visibly different — the page looked identical and the only signal was
      // a line of text most people never saw.
      await this.router.navigateByUrl(RoutePaths.renterProfile);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
