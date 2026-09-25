import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { PasswordInputComponent } from '../../../shared/components/password-input/password-input.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { RoutePaths } from '../../../core/routes/route-paths';
import { LoginMethodTabsComponent } from '../components/login-method-tabs.component';

/** An email address, or a phone number of 9-15 digits (optionally +, spaces or dashes). */
const IDENTIFIER_PATTERN = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[0-9][0-9\s-]{7,18}[0-9])$/;

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, PasswordInputComponent, FormFeedbackDirective, LoginMethodTabsComponent],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>Sign in</h1>
        </header>

        <app-login-method-tabs />

        <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <div class="stack">
            <!-- One field for either: an @ means email, otherwise a phone number. -->
            <label class="field">
              <span>Email or phone number</span>
              <input type="text" formControlName="identifier" placeholder="name@company.com or 07XXXXXXXX"
                     autocomplete="username" inputmode="email">
              <app-field-error [control]="form.controls.identifier" label="Email or phone number"
                patternMessage="Enter an email address, or a phone number of 9-15 digits." />
            </label>

            <label class="field">
              <span>Password</span>
              <app-password-input formControlName="password" autocomplete="current-password" placeholder="Enter your password" />
              <app-field-error [control]="form.controls.password" label="Password" />
            </label>

            <a class="auth-link" [routerLink]="RoutePaths.forgotPassword">Forgot password?</a>
          </div>

          @if (store.apiError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Already registered' : 'Unable to sign in'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
              {{ store.loading() ? 'Signing in...' : 'Sign in' }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.signup">Create account</a>
          </div>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .auth-panel {
      width: min(100%, 460px);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);
  readonly RoutePaths = RoutePaths;

  readonly form = this.fb.group({
    identifier: ['', [Validators.required, Validators.pattern(IDENTIFIER_PATTERN)]],
    password: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.store.clearMessages();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { identifier, password } = this.form.getRawValue();
    const value = identifier.trim();
    void this.store.login(value.includes('@')
      ? { email: value, password }
      : { phoneNumber: value.replace(/[\s-]/g, ''), password });
  }
}
