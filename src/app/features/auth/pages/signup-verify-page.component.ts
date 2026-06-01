import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-signup-verify-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <div class="auth-panel__copy">
          <span class="pill">Verification</span>
          <h1>Verify phone</h1>
          <p class="muted">Enter the code before continuing.</p>
        </div>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="requestVerification()">
          <label class="field">
            <span>Phone number</span>
            <input type="tel" formControlName="phoneNumber" placeholder="2547XXXXXXXX">
          </label>
          <button type="submit" class="btn btn-secondary">Send OTP</button>
        </form>

        <form class="auth-form card" [formGroup]="otpForm" (ngSubmit)="confirmVerification()">
          <label class="field">
            <span>OTP code</span>
            <input formControlName="otp" placeholder="123456">
          </label>
          <button type="submit" class="btn btn-primary">Confirm OTP</button>
        </form>

        @if (store.error()) {
          <div class="alert alert-error">{{ store.error() }}</div>
        }

        @if (store.verificationMessage()) {
          <div class="alert alert-success">{{ store.verificationMessage() }}</div>
        }

        <a routerLink="/signup" class="btn btn-secondary">Back to signup</a>
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
      width: min(100%, 780px);
      display: grid;
      gap: 1rem;
      padding: 1.25rem;
    }

    .auth-panel__copy,
    .auth-form {
      padding: 1.25rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupVerifyPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{10,15}$/)]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required]]
  });

  requestVerification(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.requestSignupVerification(this.form.getRawValue());
  }

  confirmVerification(): void {
    if (this.form.invalid || this.otpForm.invalid) {
      this.form.markAllAsTouched();
      this.otpForm.markAllAsTouched();
      return;
    }

    void this.store.confirmSignupVerification({
      phoneNumber: this.form.getRawValue().phoneNumber,
      otp: this.otpForm.getRawValue().otp
    });
  }
}
