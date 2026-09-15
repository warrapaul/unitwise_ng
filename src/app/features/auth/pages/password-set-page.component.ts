import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { matchesControl } from '../../../shared/validators/password-match.validator';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PasswordInputComponent } from '../../../shared/components/password-input/password-input.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-password-set-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, PasswordInputComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Temporary account</span>
          <h1>Set password</h1>
        </header>

        <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <label class="field">
            <span>Phone number</span>
            <input type="tel" formControlName="phoneNumber">
            <app-field-error [control]="form.controls.phoneNumber" label="Phone number"
              patternMessage="9-15 digits, optionally starting with +." />
          </label>
          <label class="field">
            <span>Verification token</span>
            <input formControlName="verificationToken">
            <app-field-error [control]="form.controls.verificationToken" label="Verification token" />
          </label>
          <label class="field">
            <span>New password</span>
            <app-password-input formControlName="password" autocomplete="new-password" />
            <app-field-error [control]="form.controls.password" label="Password" />
          </label>
          <label class="field">
            <span>Confirm password</span>
            <app-password-input formControlName="confirmPassword" autocomplete="new-password" />
            <app-field-error [control]="form.controls.confirmPassword" label="Confirm password"
              [messages]="{ passwordMismatch: 'Both passwords must match.' }" />
          </label>

          @if (store.apiError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Already registered' : 'Unable to set the password'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <button type="submit" class="btn btn-primary" [disabled]="store.loading()">Set password</button>
          <a routerLink="/login" class="btn btn-secondary">Back to login</a>
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
export class PasswordSetPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{9,15}$/)]],
    verificationToken: ['', [Validators.required]]
  });

  constructor() {
    // Editing the password after confirming it must re-judge the match.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.setPassword(this.form.getRawValue());
  }
}
