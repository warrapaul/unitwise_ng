import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-phone-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Phone login</span>
          <h1>Phone sign in</h1>
        </header>

        <form class="auth-form card" [formGroup]="phoneForm" appFormFeedback (ngSubmit)="checkLoginMethod()">
          <label class="field">
            <span>Phone number</span>
            <input type="tel" formControlName="phoneNumber" placeholder="2547XXXXXXXX">
            <app-field-error [control]="phoneForm.controls.phoneNumber" label="Phone number" patternMessage="9-15 digits, optionally starting with +." />
          </label>

          <button type="submit" class="btn btn-secondary" [disabled]="store.loading()">
            {{ store.loading() ? 'Checking...' : 'Check login method' }}
          </button>
        </form>

        @if (showOtpFlow) {
          <section class="card flow">
            @if (store.loginMethod()) {
              <div class="alert alert-info">
                <strong>{{ store.loginMethod()?.temporary ? 'Temporary account' : 'Password login' }}</strong>
                <p>{{ store.loginMethod()?.message || 'Login method loaded' }}</p>
              </div>
            }

            <form class="stack" [formGroup]="otpForm" appFormFeedback (ngSubmit)="requestOtp()">
              <label class="field">
                <span>OTP code</span>
                <input type="text" formControlName="otp" placeholder="123456">
                <app-field-error [control]="otpForm.controls.otp" label="Code" />
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

            <div class="auth-links">
              <a routerLink="/login">Use email login</a>
              <a routerLink="/signup">Create account</a>
            </div>
          </section>
        }
      </section>
    </main>
  `,
  styles: [`
    .auth-panel {
      width: min(100%, 720px);
    }

    .flow {
      display: grid;
      gap: 1rem;
      padding: 1.25rem;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhoneLoginPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);
  showOtpFlow = false;

  readonly phoneForm = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{10,15}$/)]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.store.clearMessages();
  }

  async checkLoginMethod(): Promise<void> {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }

    this.showOtpFlow = true;
    await this.store.checkLoginMethod(this.phoneForm.getRawValue());
  }

  requestOtp(): void {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
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
