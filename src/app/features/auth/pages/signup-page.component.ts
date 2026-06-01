import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <div class="auth-panel__copy">
          <span class="pill">Signup</span>
          <h1>Create account</h1>
          <p class="muted">Verify the phone first, then finish setup.</p>
        </div>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="sendVerification()">
          <div class="grid-auto">
            <label class="field"><span>First name</span><input formControlName="firstName"></label>
            <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
            <label class="field"><span>Last name</span><input formControlName="lastName"></label>
            <label class="field"><span>Email</span><input type="email" formControlName="email"></label>
            <label class="field"><span>Phone number</span><input type="tel" formControlName="phoneNumber"></label>
            <label class="field"><span>National ID</span><input formControlName="nationalIdNumber"></label>
            <label class="field"><span>Password</span><input type="password" formControlName="password"></label>
          </div>

          <div class="button-row">
            <button type="submit" class="btn btn-secondary" [disabled]="store.loading()">
              Send verification code
            </button>
            <a routerLink="/signup/verify-phone" class="btn btn-primary">Open verification page</a>
          </div>
        </form>

        <section class="card flow">
          <form class="stack" [formGroup]="verificationForm" (ngSubmit)="confirmVerification()">
            <label class="field">
              <span>OTP code</span>
              <input formControlName="otp" placeholder="123456">
            </label>
            <button type="submit" class="btn btn-primary" [disabled]="store.loading() || !verificationSent">
              Confirm phone verification
            </button>
          </form>

          <button type="button" class="btn btn-secondary" [disabled]="store.loading() || !verified" (click)="completeSignup()">
            Complete signup
          </button>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }

          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <div class="auth-links">
            <a routerLink="/login">Back to login</a>
            <a routerLink="/forgot-password">Forgot password?</a>
          </div>
        </section>
      </section>
    </main>
  `,
  styles: [`
    .auth-screen {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1.5rem;
    }

    .auth-panel {
      width: min(100%, 1200px);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      padding: 1.25rem;
    }

    .auth-panel__copy,
    .auth-form,
    .flow {
      padding: 1.25rem;
    }

    .flow {
      display: grid;
      gap: 1rem;
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

    @media (max-width: 900px) {
      .auth-panel {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);
  verificationSent = false;
  verified = false;

  readonly form = this.fb.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{9,15}$/)]],
    nationalIdNumber: ['', [Validators.required, Validators.minLength(8)]]
  });

  readonly verificationForm = this.fb.group({
    otp: ['', [Validators.required]]
  });

  sendVerification(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { phoneNumber } = this.form.getRawValue();
    void this.store.requestSignupVerification({ phoneNumber }).then(() => {
      this.verificationSent = !this.store.error();
    });
  }

  confirmVerification(): void {
    if (this.form.invalid || this.verificationForm.invalid) {
      this.form.markAllAsTouched();
      this.verificationForm.markAllAsTouched();
      return;
    }

    const { phoneNumber } = this.form.getRawValue();
    const { otp } = this.verificationForm.getRawValue();
    void this.store.confirmSignupVerification({ phoneNumber, otp }).then(() => {
      this.verified = !this.store.error();
    });
  }

  completeSignup(): void {
    if (!this.verified || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.signup(this.form.getRawValue());
  }
}
