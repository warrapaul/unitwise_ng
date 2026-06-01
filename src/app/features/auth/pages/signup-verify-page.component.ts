import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { RegisterRequest } from '../models/auth.models';

@Component({
  selector: 'app-signup-verify-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Verification</span>
          <h1>Confirm phone number</h1>
          <p class="muted">Send the OTP first, then confirm it to finish signup.</p>
        </header>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="requestVerification()">
          <div class="stack">
            <label class="field">
              <span>Phone number</span>
              <input type="tel" formControlName="phoneNumber" placeholder="2547XXXXXXXX">
            </label>

            <button type="submit" class="btn btn-secondary" [disabled]="store.loading()">
              {{ store.loading() ? 'Sending...' : otpRequested ? 'Resend OTP' : 'Send OTP' }}
            </button>

            @if (otpRequested) {
              <label class="field">
                <span>OTP code</span>
                <input formControlName="otp" placeholder="123456">
              </label>

              <button type="button" class="btn btn-primary" [disabled]="store.loading()" (click)="confirmVerification()">
                {{ store.loading() ? 'Confirming...' : 'Confirm OTP' }}
              </button>
            }
          </div>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }

          @if (draftError()) {
            <div class="alert alert-error">{{ draftError() }}</div>
          }

          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <div class="auth-links">
            <a routerLink="/signup">Back to signup</a>
            <a routerLink="/login">Back to login</a>
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
export class SignupVerifyPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(AuthStore);
  readonly draftError = signal<string | null>(null);

  readonly form = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{10,15}$/)]],
    otp: ['', [Validators.required]]
  });

  otpRequested = false;

  ngOnInit(): void {
    this.store.clearMessages();

    const phoneNumber = this.route.snapshot.queryParamMap.get('phoneNumber');
    if (phoneNumber) {
      this.form.patchValue({ phoneNumber });
      this.otpRequested = true;
    }
  }

  async requestVerification(): Promise<void> {
    this.draftError.set(null);

    if (this.form.controls.phoneNumber.invalid) {
      this.form.controls.phoneNumber.markAsTouched();
      return;
    }

    await this.store.requestSignupVerification({ phoneNumber: this.form.getRawValue().phoneNumber });
    if (!this.store.error()) {
      this.otpRequested = true;
    }
  }

  async confirmVerification(): Promise<void> {
    this.draftError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    await this.store.confirmSignupVerification({
      phoneNumber: this.form.getRawValue().phoneNumber,
      otp: this.form.getRawValue().otp
    });

    if (this.store.error()) {
      return;
    }

    const signupDraft = sessionStorage.getItem('signup-draft');
    if (!signupDraft) {
      this.draftError.set('Signup details were not found. Please restart signup.');
      return;
    }

    let payload: RegisterRequest;
    try {
      payload = JSON.parse(signupDraft) as RegisterRequest;
    } catch {
      this.draftError.set('Saved signup details are invalid. Please restart signup.');
      return;
    }

    await this.store.signup(payload);
    if (!this.store.error()) {
      sessionStorage.removeItem('signup-draft');
    }
  }
}
