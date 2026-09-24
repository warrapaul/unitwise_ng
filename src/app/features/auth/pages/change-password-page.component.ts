import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { matchesControl } from '../../../shared/validators/password-match.validator';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PasswordInputComponent } from '../../../shared/components/password-input/password-input.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, PasswordInputComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>Change password</h1>
          @if (compulsory) {
            <p class="muted">Your password must be changed before you can continue.</p>
          }
        </header>

        <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <!--
            Absent when the login password was carried over: it was typed one
            screen ago, and the store sends it for them.
          -->
          @if (askCurrentPassword) {
            <label class="field">
              <span>Current password</span>
              <app-password-input formControlName="currentPassword" autocomplete="current-password" />
              <app-field-error [control]="form.controls.currentPassword" label="Current password" />
            </label>
          }
          <label class="field">
            <span>New password</span>
            <app-password-input formControlName="newPassword" autocomplete="new-password" />
            <app-field-error [control]="form.controls.newPassword" label="New password" />
          </label>
          <label class="field">
            <span>Confirm password</span>
            <app-password-input formControlName="confirmPassword" autocomplete="new-password" />
            <app-field-error [control]="form.controls.confirmPassword" label="Confirm password"
              [messages]="{ passwordMismatch: 'Both passwords must match.' }" />
          </label>

          @if (store.apiError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Already registered' : 'Unable to change the password'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
              {{ store.loading() ? 'Updating...' : 'Update password' }}
            </button>
            <!--
              No way out when the change is compulsory. Offering one on a
              session that may do nothing else invites a dead end: /home
              would only bounce the user straight back here.
            -->
            @if (!compulsory) {
              <a routerLink="/home" class="btn btn-secondary">Skip for now</a>
            }
          </div>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .auth-panel {
      width: min(100%, 560px);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePasswordPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);
  private readonly session = inject(AuthSessionService);

  /**
   * Read once, on arrival. A successful change clears the session flag while
   * the profile is still loading, and a live read put "Skip for now" on
   * screen for that moment — an escape the compulsory flow never offers.
   */
  readonly compulsory = this.session.passwordResetRequired();
  readonly askCurrentPassword = !(this.compulsory && this.store.hasCarriedPassword());

  readonly form = this.fb.group({
    currentPassword: ['', this.askCurrentPassword ? [Validators.required] : []],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required, matchesControl('newPassword')]]
  });

  constructor() {
    // Editing the password after confirming it must re-judge the match.
    this.form.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.changePassword(this.form.getRawValue());
  }
}
