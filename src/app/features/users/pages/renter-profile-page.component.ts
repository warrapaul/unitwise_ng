import { Location } from '@angular/common';
import { canGoBack } from '../../../shared/directives/back.directive';
import { BackDirective } from '../../../shared/directives/back.directive';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { phoneValidator } from '../../../shared/utils/phone.validator';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { UsersStore } from '../store/users.store';
import { RenterProfileDetail, TenancyProfileStatus } from '../models/renter-profile.models';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { compactPhone, formatPhone } from '../../../shared/utils/format.util';
import { isValidPhone } from '../../../shared/utils/phone.validator';
import { toSignal } from '@angular/core/rxjs-interop';
import { MyDocumentsPanelComponent } from '../../tenants/documents/my-documents-panel.component';

const RELATIONSHIPS = ['Parent', 'Sibling', 'Spouse or partner', 'Child', 'Relative', 'Friend', 'Other'];
const IDENTITY = ['officialFirstName', 'officialMiddleName', 'officialLastName', 'nationalIdNumber'] as const;
const PHONES = ['officialPhoneNumber', 'emergencyContactPhone', 'previousLandlordPhone'] as const;

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
  imports: [BackDirective, DateDisplayDirective, 
    ReactiveFormsModule,
    RouterLink,
    SectionCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    FieldErrorComponent,
    MyDocumentsPanelComponent,
    MoneyInputDirective,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading your tenant profile..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else {
        <form class="stack" [formGroup]="form" appFormFeedback (ngSubmit)="save()">
          @if (mode === 'profile') {
          <div class="pair">
          <app-section-card title="Your official details" subtitle="As they appear on your national ID.">
            <!--
              Separate from the account on purpose: accounts carry aliases and short forms, and a lease
              cannot run on "Jay". What is stated here is copied onto a tenancy when you accept one.
            -->
            @if (prefilled().length > 0) {
              <p class="info" role="status">Some fields were filled in from your account — marked below. Check they match your ID.</p>
            }
            <div class="grid-auto">
              <label class="field">
                <span>First name</span>
                <input formControlName="officialFirstName">
                @if (isPrefilled('officialFirstName')) { <small class="hint">From your account</small> }
                <app-field-error [control]="form.controls.officialFirstName" label="First name" />
              </label>
              <label class="field"><span>Middle name</span><input formControlName="officialMiddleName">
                @if (isPrefilled('officialMiddleName')) { <small class="hint">From your account</small> }</label>
              <label class="field">
                <span>Last name</span>
                <input formControlName="officialLastName">
                @if (isPrefilled('officialLastName')) { <small class="hint">From your account</small> }
                <app-field-error [control]="form.controls.officialLastName" label="Last name" />
              </label>
              <label class="field">
                <span>National ID number</span>
                <input formControlName="nationalIdNumber" inputmode="numeric">
                @if (isPrefilled('nationalIdNumber')) { <small class="hint">From your account</small> }
                <app-field-error [control]="form.controls.nationalIdNumber" label="National ID number" />
              </label>
              <label class="field">
                <span>Phone</span>
                <input type="tel" formControlName="officialPhoneNumber" autocomplete="tel" inputmode="tel" (blur)="tidyPhone('officialPhoneNumber')">
                <app-field-error [control]="form.controls.officialPhoneNumber" label="Phone" />
                <small class="hint">Can differ from your login number.</small>
              </label>
              <label class="field field--wide"><span>Email</span><input type="email" formControlName="officialEmail" inputmode="email" autocomplete="email">
                @if (isPrefilled('officialEmail')) { <small class="hint">From your account</small> }</label>
            </div>
            @if (identityChanged()) {
              <p class="alert alert-warning" role="alert">Changing your legal name or ID number means a landlord who verified you will need to check it again.</p>
            }
          </app-section-card>

          <app-section-card title="Emergency contact">
            <div class="grid-auto">
              <label class="field"><span>Name</span><input formControlName="emergencyContactName"></label>
              <label class="field"><span>Phone</span><input type="tel" formControlName="emergencyContactPhone" inputmode="tel" autocomplete="tel" (blur)="tidyPhone('emergencyContactPhone')">
                <app-field-error [control]="form.controls.emergencyContactPhone" label="Phone" /></label>
              <label class="field"><span>Relationship</span>
                <select formControlName="emergencyContactRelationship">
                  <option value="">Choose</option>
                  @for (option of relationships; track option) { <option [value]="option">{{ option }}</option> }
                  @if (otherRelationship()) { <option [value]="form.controls.emergencyContactRelationship.value">{{ form.controls.emergencyContactRelationship.value }}</option> }
                </select>
              </label>
            </div>
          </app-section-card>
          </div>

          <!-- Documents are saved the moment they are chosen, not with the form: an upload is its own transaction. -->
          <app-my-documents-panel [editing]="true" />
          } @else {
          <p class="info">Only what a landlord needs to consider you for a room. Everything here is optional, and nobody sees it until you share your profile.</p>
          <div class="pair">
          <app-section-card title="Your household">
            <div class="grid-auto">
              <label class="field">
                <span>People moving in</span>
                <input type="number" min="1" formControlName="occupantCount" inputmode="numeric">
              </label>
              <label class="field"><span>Earliest move-in</span><input type="date" appDateDisplay formControlName="preferredMoveInDate"></label>
            </div>
            <label class="field field--wide">
              <span>Note to landlord</span>
              <textarea formControlName="aboutMe" rows="3"></textarea>
            </label>
          </app-section-card>

          <app-section-card title="Work and income" subtitle="Income is the most personal question here — leave it out if you prefer.">
            <div class="grid-auto">
              <label class="field">
                <span>Employment</span>
                <select formControlName="employmentStatus">
                  <option value="">Prefer not to say</option>
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
              <label class="field"><span>Employed since</span><input type="month" formControlName="employedSince"></label>
              <label class="field">
                <span>Monthly income</span>
                <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="monthlyIncome" aria-label="Monthly income in KES"></span>
              </label>
            </div>
          </app-section-card>
          </div>

          <app-section-card title="Where you rented before">
            <div class="grid-auto">
              <label class="field"><span>Previous landlord</span><input formControlName="previousLandlordName"></label>
              <label class="field"><span>Their phone</span><input formControlName="previousLandlordPhone" type="tel" inputmode="tel" autocomplete="off" (blur)="tidyPhone('previousLandlordPhone')">
                <app-field-error [control]="form.controls.previousLandlordPhone" label="Their phone" />
                <small class="hint">Only if they agreed to be contacted.</small></label>
              <label class="field field--wide"><span>Previous address</span><input formControlName="previousAddress"></label>
              <label class="field"><span>From</span><input type="month" formControlName="previousTenancyStart"></label>
              <label class="field"><span>To</span><input type="month" formControlName="previousTenancyEnd"></label>
            </div>
          </app-section-card>
          }

          @if (saveError(); as apiError) {
            <app-error-card title="Unable to save" [message]="apiError.message" [details]="apiError.details" />
          }

          <!-- One action bar, at the end; on a phone it stays pinned to the bottom of the screen. -->
          <div class="button-row">
            <a appBack class="btn btn-secondary" [routerLink]="RoutePaths.renterProfile" [queryParams]="{ tab: 'profile' }">Cancel</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    .info { padding: var(--space-2-5) var(--space-3); border-left: 3px solid var(--info, var(--primary)); border-radius: var(--radius-xs);
            background: var(--info-tint, var(--surface-2)); font-size: var(--text-md); }
    .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr)); gap: var(--space-4); align-items: stretch; }
    .side { align-content: start; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RenterProfilePageComponent implements OnInit, HasUnsavedChanges {
  private readonly service = inject(RenterProfileService);
  private readonly users = inject(UsersStore);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notifications = inject(NotificationService);
  readonly RoutePaths = RoutePaths;
  /** The tenant profile (who you are) or the rental application (household, work, past rentals). */
  readonly mode: 'profile' | 'application' = inject(ActivatedRoute).snapshot.data['mode'] === 'application' ? 'application' : 'profile';
  readonly relationships = RELATIONSHIPS;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly draftSavedAt = signal<Date | null>(null);
  readonly profile = signal<RenterProfileDetail | null>(null);

  readonly form = this.formBuilder.group({
    // Required in the form rather than derived on save. The server refuses a
    // COMPLETE profile without them, so asking here is the honest place: a
    // person finds out while typing rather than from a rejection afterwards.
    officialFirstName: ['', [Validators.required]],
    officialMiddleName: '',
    officialLastName: ['', [Validators.required]],
    nationalIdNumber: ['', [Validators.required]],
    // Required: it is the number a landlord calls, and the lease states it.
    officialPhoneNumber: ['', [Validators.required, phoneValidator()]],
    officialEmail: '',
    employmentStatus: '', employerName: '', jobTitle: '', employedSince: '',
    monthlyIncome: [null as number | null],
    previousLandlordName: '', previousLandlordPhone: ['', [phoneValidator()]], previousAddress: '',
    previousTenancyStart: '', previousTenancyEnd: '', reasonForLeaving: '',
    occupantCount: [null as number | null],
    preferredMoveInDate: '', aboutMe: '',
    emergencyContactName: '', emergencyContactPhone: ['', [phoneValidator()]], emergencyContactRelationship: ''
  });



  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** A relationship typed in before the list existed stays choosable. */
  readonly otherRelationship = computed(() => {
    const value = this.values().emergencyContactRelationship ?? '';
    return !!value && !RELATIONSHIPS.includes(value);
  });

  /** The legal name or ID moved away from what a completed profile said. */
  readonly identityChanged = computed(() => {
    const saved = this.profile();
    const now = this.values();
    if (saved?.status !== 'COMPLETE') {
      return false;
    }
    return IDENTITY.some((name) => ((saved[name] as string | null | undefined) ?? '').trim() !== ((now[name] as string | undefined) ?? '').trim());
  });

  ngOnInit(): void {
    void this.reload();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  isPrefilled(name: string): boolean {
    return this.prefilled().includes(name);
  }

  /** A valid number is shown the way it is written everywhere else: +254 700 000 202. */
  tidyPhone(name: typeof PHONES[number]): void {
    const control = this.form.controls[name];
    if (control.value && isValidPhone(control.value)) {
      control.setValue(formatPhone(control.value));
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Returns an empty draft when nothing is saved, so the form always binds.
      const profile = await firstValueFrom(this.service.getMyProfile());
      this.profile.set(profile);
      this.patch(profile);
      await this.prefillFromAccount();
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** The fields filled from the account rather than a saved profile, marked so they get checked. */
  readonly prefilled = signal<string[]>([]);

  /**
   * A new profile starts from the account's name, phone, email and ID, but only
   * into fields that are empty: once saved, the saved values are what show.
   */
  private async prefillFromAccount(): Promise<void> {
    if (!this.users.profile()) {
      await this.users.loadProfile();
    }
    const account = this.users.profile();
    if (!account) {
      return;
    }
    const fill: Record<string, string | null | undefined> = {
      officialFirstName: account.firstName,
      officialMiddleName: account.middleName,
      officialLastName: account.lastName,
      officialPhoneNumber: account.phoneNumber,
      officialEmail: account.email,
      nationalIdNumber: account.nationalIdNumber
    };
    const filled: string[] = [];
    for (const [name, value] of Object.entries(fill)) {
      const control = this.form.get(name);
      if (control && !control.value && value) {
        control.setValue(name === 'officialPhoneNumber' ? formatPhone(value) : value);
        filled.push(name);
      }
    }
    this.prefilled.set(filled);
  }

  private patch(profile: RenterProfileDetail): void {
    this.form.patchValue({
      officialFirstName: profile.officialFirstName ?? '',
      officialMiddleName: profile.officialMiddleName ?? '',
      officialLastName: profile.officialLastName ?? '',
      nationalIdNumber: profile.nationalIdNumber ?? '',
      officialPhoneNumber: formatPhone(profile.officialPhoneNumber),
      officialEmail: profile.officialEmail ?? '',
      employmentStatus: profile.employmentStatus ?? '',
      employerName: profile.employerName ?? '',
      jobTitle: profile.jobTitle ?? '',
      employedSince: profile.employedSince?.slice(0, 7) ?? '',
      monthlyIncome: profile.monthlyIncome ?? null,
      previousLandlordName: profile.previousLandlordName ?? '',
      previousLandlordPhone: formatPhone(profile.previousLandlordPhone),
      previousAddress: profile.previousAddress ?? '',
      previousTenancyStart: profile.previousTenancyStart?.slice(0, 7) ?? '',
      previousTenancyEnd: profile.previousTenancyEnd?.slice(0, 7) ?? '',
      reasonForLeaving: profile.reasonForLeaving ?? '',
      occupantCount: profile.occupantCount ?? null,
      preferredMoveInDate: profile.preferredMoveInDate ?? '',
      aboutMe: profile.aboutMe ?? '',
      emergencyContactName: profile.emergencyContactName ?? '',
      emergencyContactPhone: formatPhone(profile.emergencyContactPhone),
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

  /**
   * The profile needs everything required. The application checks only what it shows (a phone
   * typed wrongly), and saves the profile as complete or draft by what the profile already holds.
   */
  async save(): Promise<void> {
    if (this.mode === 'profile' && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.mode === 'application' && this.form.controls.previousLandlordPhone.invalid) {
      this.form.controls.previousLandlordPhone.markAsTouched();
      return;
    }

    if (await this.persist(this.mode === 'profile' || this.identityComplete() ? 'COMPLETE' : 'DRAFT')) {
      this.form.markAsPristine();
      this.notifications.push('success', this.mode === 'profile' ? 'Tenant profile saved.' : 'Rental application saved.');
      // Back where they came from, so the app bar's Back does not return to this form.
      if (canGoBack(this.location)) {
        this.location.back();
      } else {
        await this.router.navigate([RoutePaths.renterProfile], { queryParams: { tab: 'profile' } });
      }
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
        officialPhoneNumber: compactPhone(value.officialPhoneNumber) || null,
        officialEmail: value.officialEmail.trim() || null,
        employmentStatus: (value.employmentStatus || null) as never,
        employerName: value.employerName || null,
        jobTitle: value.jobTitle || null,
        employedSince: monthToDate(value.employedSince),
        monthlyIncome: value.monthlyIncome,
        previousLandlordName: value.previousLandlordName || null,
        previousLandlordPhone: compactPhone(value.previousLandlordPhone) || null,
        previousAddress: value.previousAddress || null,
        previousTenancyStart: monthToDate(value.previousTenancyStart),
        previousTenancyEnd: monthToDate(value.previousTenancyEnd),
        reasonForLeaving: value.reasonForLeaving || null,
        occupantCount: value.occupantCount,
        preferredMoveInDate: value.preferredMoveInDate || null,
        aboutMe: value.aboutMe || null,
        emergencyContactName: value.emergencyContactName || null,
        emergencyContactPhone: compactPhone(value.emergencyContactPhone) || null,
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

/** A month field (`YYYY-MM`) as the date the server stores: the first of that month. */
function monthToDate(value: string): string | null {
  return value ? (value.length === 7 ? `${value}-01` : value) : null;
}
