import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { matchesControl } from '../../../shared/validators/password-match.validator';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PasswordInputComponent } from '../../../shared/components/password-input/password-input.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { MIN_PASSWORD_LENGTH } from '../models/auth.models';
import { AuthStore } from '../store/auth.store';

/** What the code sign-in hands over: the phone it proved and the one-use token for this step. */
interface PasswordSetState {
  phoneNumber?: string;
  verificationToken?: string;
  next?: string;
}

/**
 * First sign-in to an account someone opened for this person — the shop desk,
 * a landlord. The code proved the phone; choosing a password finishes the
 * account and starts the session. Arrives only from the code sign-in, which
 * passes the phone and token along; opened any other way (a reload, a link) it
 * sends them back to sign in with a code, since the token is not theirs to type.
 */
@Component({
  selector: 'app-password-set-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, PasswordInputComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Welcome</span>
          <h1>Choose your password</h1>
          <p class="muted">
            @if (handover) {
              Your account is ready. Pick a password to finish setting it up.
            } @else {
              Sign in with a code sent to your phone first, then you'll choose your password here.
            }
          </p>
        </header>

        @if (handover) {
          <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
            <label class="field">
              <span>New password</span>
              <app-password-input formControlName="password" autocomplete="new-password" />
              <app-field-error [control]="form.controls.password" label="Password" />
              <small class="hint">At least {{ minLength }} characters.</small>
            </label>
            <label class="field">
              <span>Confirm password</span>
              <app-password-input formControlName="confirmPassword" autocomplete="new-password" />
              <app-field-error [control]="form.controls.confirmPassword" label="Confirm password"
                [messages]="{ passwordMismatch: 'Both passwords must match.' }" />
            </label>

            @if (store.apiError(); as apiError) {
              <app-error-card title="Password not set" [message]="apiError.message" [details]="apiError.details" />
            }

            <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
              {{ store.loading() ? 'Saving...' : 'Set password and continue' }}
            </button>
          </form>
        } @else {
          <a class="btn btn-primary" [routerLink]="RoutePaths.phoneLogin">Sign in with a code</a>
        }
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
export class PasswordSetPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly minLength = MIN_PASSWORD_LENGTH;
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  /** Read once: the navigation that brought them here carries it. */
  readonly handover = this.readHandover();

  readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]]
  });

  constructor() {
    // Editing the password after confirming it must re-judge the match.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  submit(): void {
    const handover = this.handover;
    if (!handover || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    void this.store.setPassword({
      phoneNumber: handover.phoneNumber,
      verificationToken: handover.verificationToken,
      password: this.form.getRawValue().password
    }, handover.next);
  }

  private readHandover(): { phoneNumber: string; verificationToken: string; next: string | null } | null {
    const state = (inject(Router).getCurrentNavigation()?.extras.state ?? history.state) as PasswordSetState | null;
    return state?.phoneNumber && state.verificationToken
      ? { phoneNumber: state.phoneNumber, verificationToken: state.verificationToken, next: state.next ?? null }
      : null;
  }
}
