import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-phone-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <div class="auth-panel__copy">
          <span class="pill">Phone login</span>
          <h1>Phone sign in</h1>
          <p class="muted">Check the method, request OTP, and confirm in one flow.</p>
        </div>

        <form class="auth-form card" [formGroup]="phoneForm" (ngSubmit)="checkLoginMethod()">
          <label class="field">
            <span>Phone number</span>
            <input type="tel" formControlName="phoneNumber" placeholder="2547XXXXXXXX">
          </label>

          <button type="submit" class="btn btn-secondary" [disabled]="store.loading()">
            {{ store.loading() ? 'Checking...' : 'Check login method' }}
          </button>
        </form>

        <section class="card flow">
          @if (store.loginMethod()) {
            <div class="alert alert-info">
              <strong>{{ store.loginMethod()?.temporary ? 'Temporary account' : 'Password login' }}</strong>
              <p>{{ store.loginMethod()?.message || 'Login method loaded' }}</p>
            </div>
          }

          <form class="stack" [formGroup]="otpForm" (ngSubmit)="requestOtp()">
            <label class="field">
              <span>OTP code</span>
              <input type="text" formControlName="otp" placeholder="123456">
            </label>
            <div class="button-row">
              <button type="submit" class="btn btn-secondary" [disabled]="store.loading() || !phoneForm.valid">
                Request OTP
              </button>
              <button type="button" class="btn btn-primary" [disabled]="store.loading() || !phoneForm.valid" (click)="confirmOtp()">
                Confirm login
              </button>
            </div>
          </form>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }

          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <div class="auth-links">
            <a routerLink="/login">Use email login</a>
            <a routerLink="/signup">Create account</a>
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
      width: min(100%, 1120px);
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
      flex-wrap: wrap;
      gap: 0.9rem;
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
export class PhoneLoginPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly phoneForm = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{10,15}$/)]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required]]
  });

  checkLoginMethod(): void {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }

    void this.store.checkLoginMethod(this.phoneForm.getRawValue());
  }

  requestOtp(): void {
    if (this.phoneForm.invalid || this.otpForm.invalid) {
      this.phoneForm.markAllAsTouched();
      this.otpForm.markAllAsTouched();
      return;
    }

    void this.store.requestLoginOtp({
      phoneNumber: this.phoneForm.getRawValue().phoneNumber
    });
  }

  confirmOtp(): void {
    if (this.phoneForm.invalid || this.otpForm.invalid) {
      this.phoneForm.markAllAsTouched();
      this.otpForm.markAllAsTouched();
      return;
    }

    void this.store.confirmLoginOtp({
      phoneNumber: this.phoneForm.getRawValue().phoneNumber,
      otp: this.otpForm.getRawValue().otp
    });
  }
}
