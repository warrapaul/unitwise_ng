import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { UsersService } from '../users.service';
import { UserDetail } from '../models/user.models';

/**
 * Self-service edit of the signed-in user's own details. The backend gates
 * `PATCH /v1/users/{id}` on "USER_WRITE **or** owner", so no permission guard is
 * needed here — the id always comes from the caller's own profile.
 */
@Component({
  selector: 'app-profile-edit-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading your profile..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card title="Edit my profile">
            <ng-container actions>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.userProfile">Cancel</a>
            </ng-container>

            <div class="grid-auto">
              <label class="field">
                <span>First name</span>
                <input formControlName="firstName">
                @if (form.controls.firstName.invalid && form.controls.firstName.touched) {
                  <small class="error-text">First name is required.</small>
                }
              </label>

              <label class="field"><span>Middle name</span><input formControlName="middleName"></label>

              <label class="field">
                <span>Last name</span>
                <input formControlName="lastName">
                @if (form.controls.lastName.invalid && form.controls.lastName.touched) {
                  <small class="error-text">Last name is required.</small>
                }
              </label>

              <label class="field">
                <span>Email</span>
                <input type="email" formControlName="email">
                @if (form.controls.email.invalid && form.controls.email.touched) {
                  <small class="error-text">Enter a valid email address.</small>
                }
              </label>

              <label class="field">
                <span>Phone number</span>
                <input formControlName="phoneNumber">
                @if (form.controls.phoneNumber.invalid && form.controls.phoneNumber.touched) {
                  <small class="error-text">A phone number is required.</small>
                }
              </label>

              <label class="field"><span>Secondary phone</span><input formControlName="phoneNumberSecondary"></label>
              <label class="field"><span>National ID</span><input formControlName="nationalIdNumber"></label>
              <label class="field"><span>Date of birth</span><input type="date" formControlName="dateOfBirth"></label>

              <label class="field">
                <span>Gender</span>
                <select formControlName="gender">
                  <option value="">Prefer not to say</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>

              <label class="field"><span>Profile image URL</span><input formControlName="profileImageUrl"></label>
            </div>

            <p class="hint">To change your password, use the change-password screen — it signs you out everywhere.</p>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Those details are already in use' : 'Unable to save your profile'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          @if (saved()) {
            <section class="alert alert-success" role="status">Your profile has been updated.</section>
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save profile' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.changePassword">Change password</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileEditPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly usersService = inject(UsersService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly saved = signal(false);
  private readonly profile = signal<UserDetail | null>(null);

  readonly form = this.formBuilder.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    middleName: '',
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required]],
    phoneNumberSecondary: '',
    nationalIdNumber: '',
    dateOfBirth: '',
    gender: '',
    profileImageUrl: ''
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      const profile = await firstValueFrom(this.usersService.getProfile());
      this.profile.set(profile);
      this.form.patchValue({
        firstName: profile.firstName ?? '',
        middleName: profile.middleName ?? '',
        lastName: profile.lastName ?? '',
        email: profile.email ?? '',
        phoneNumber: profile.phoneNumber ?? '',
        phoneNumberSecondary: profile.userProfile?.phoneNumberSecondary ?? '',
        nationalIdNumber: profile.nationalIdNumber ?? '',
        dateOfBirth: profile.userProfile?.dateOfBirth ?? '',
        gender: profile.userProfile?.gender ?? '',
        profileImageUrl: profile.userProfile?.profileImageUrl ?? profile.profileImageUrl ?? ''
      });
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);

    const value = this.form.getRawValue();

    try {
      await firstValueFrom(this.usersService.updateUser(profile.id, {
        firstName: value.firstName,
        middleName: value.middleName || null,
        lastName: value.lastName,
        email: value.email,
        phoneNumber: value.phoneNumber,
        phoneNumberSecondary: value.phoneNumberSecondary || undefined,
        nationalIdNumber: value.nationalIdNumber || undefined,
        dateOfBirth: value.dateOfBirth || null,
        gender: (value.gender || null) as 'MALE' | 'FEMALE' | 'OTHER' | null,
        profileImageUrl: value.profileImageUrl || undefined
      }));

      this.saved.set(true);
      await this.router.navigateByUrl(RoutePaths.userProfile);
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
