import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { matchesControl } from '../../../shared/validators/password-match.validator';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PasswordInputComponent } from '../../../shared/components/password-input/password-input.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { RoutePaths } from '../../../core/routes/route-paths';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, PasswordInputComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>Create account</h1>
        </header>

        <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="sendVerification()">
          <div class="stack">
            <label class="field">
              <span>First name</span>
              <input formControlName="firstName">
              <app-field-error [control]="form.controls.firstName" label="First name" />
            </label>
            <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
            <label class="field">
              <span>Last name</span>
              <input formControlName="lastName">
              <app-field-error [control]="form.controls.lastName" label="Last name" />
            </label>
            <label class="field">
              <span>Email</span>
              <input type="email" formControlName="email">
              <app-field-error [control]="form.controls.email" label="Email" />
            </label>
            <label class="field">
              <span>Phone number</span>
              <input type="tel" formControlName="phoneNumber">
              <app-field-error [control]="form.controls.phoneNumber" label="Phone number"
                patternMessage="9-15 digits, optionally starting with +." />
            </label>
            <label class="field">
              <span>National ID</span>
              <input formControlName="nationalIdNumber">
              <app-field-error [control]="form.controls.nationalIdNumber" label="National ID" />
            </label>
            <label class="field">
              <span>Password</span>
              <app-password-input formControlName="password" autocomplete="new-password" />
              <app-field-error [control]="form.controls.password" label="Password" />
            </label>
            <label class="field">
              <span>Confirm password</span>
              <app-password-input formControlName="confirmPassword" autocomplete="new-password" />
              <app-field-error [control]="form.controls.confirmPassword" label="Confirm password"
                [messages]="{ passwordMismatch: 'Both passwords must match.' }" />
            </label>
          </div>

          @if (store.apiError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Already registered' : 'Unable to start signup'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
              {{ store.loading() ? 'Sending...' : 'Send verification code' }}
            </button>
            <a routerLink="/login" class="btn btn-secondary">Back to login</a>
          </div>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .auth-panel {
      width: min(100%, 840px);
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .auth-links {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      color: var(--text-muted);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{9,15}$/)]],
    nationalIdNumber: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    // Editing the password after confirming it must re-judge the match.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  async sendVerification(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();
    await this.store.requestSignupVerification({ phoneNumber: payload.phoneNumber });

    if (this.store.error()) {
      return;
    }

    sessionStorage.setItem('signup-draft', JSON.stringify(payload));
    await this.router.navigateByUrl(`${RoutePaths.verifyPhone}?phoneNumber=${encodeURIComponent(payload.phoneNumber)}`);
  }

  ngOnInit(): void {
    this.store.clearMessages();
  }
}
