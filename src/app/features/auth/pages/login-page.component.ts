import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { PasswordInputComponent } from '../../../shared/components/password-input/password-input.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, PasswordInputComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>Sign in</h1>
        </header>

        <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <div class="stack">
            <label class="field">
              <span>Email</span>
              <input type="email" formControlName="email" placeholder="name@company.com">
              <app-field-error [control]="form.controls.email" label="Email" />
            </label>

            <label class="field">
              <span>Password</span>
              <app-password-input formControlName="password" autocomplete="current-password" placeholder="Enter your password" />
              <app-field-error [control]="form.controls.password" label="Password" />
            </label>
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

          <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
            {{ store.loading() ? 'Signing in...' : 'Sign in' }}
          </button>

          <div class="auth-links">
            <a routerLink="/phone-login">Use phone login</a>
            <a routerLink="/signup">Create account</a>
            <a routerLink="/forgot-password">Forgot password?</a>
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
export class LoginPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
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

    void this.store.login(this.form.getRawValue());
  }
}
