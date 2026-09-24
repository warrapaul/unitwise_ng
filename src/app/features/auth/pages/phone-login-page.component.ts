import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { RoutePaths } from '../../../core/routes/route-paths';
import { LoginMethodTabsComponent } from '../components/login-method-tabs.component';

/**
 * Signing in with a code sent by SMS.
 *
 * Two steps, one at a time. The page used to show the phone field, the code
 * field, "Request OTP" and "Confirm login" together from the first render,
 * which asked for a code before one had been sent and left the reader to work
 * out the order from the button labels.
 *
 * There is no eligibility call before sending. There used to be a
 * `check-login-method` request whose only job was to decide which screen to
 * show; the send itself already refuses an account restricted to password
 * login, so the check was a round trip that could only repeat what the next
 * request was about to say.
 */
@Component({
  selector: 'app-phone-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, FormFeedbackDirective, LoginMethodTabsComponent],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>{{ sent() ? 'Enter your code' : 'Sign in' }}</h1>
          @if (sent()) {
            <p class="muted">
              Sent to {{ phoneForm.getRawValue().phoneNumber }}.
              <button type="button" class="link-button" (click)="changeNumber()">Use a different number</button>
            </p>
          }
        </header>

        @if (!sent()) {
          <app-login-method-tabs />

          <form class="auth-form card" [formGroup]="phoneForm" appFormFeedback (ngSubmit)="sendCode()">
            <label class="field">
              <span>Phone number</span>
              <input type="tel" formControlName="phoneNumber" placeholder="2547XXXXXXXX" autocomplete="tel">
              <app-field-error
                [control]="phoneForm.controls.phoneNumber"
                label="Phone number"
                patternMessage="9-15 digits, optionally starting with +."
              />
            </label>

            @if (store.apiError(); as apiError) {
              <app-error-card title="Unable to send a code" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
                {{ store.loading() ? 'Sending...' : 'Send code' }}
              </button>
              <a class="btn btn-secondary" [routerLink]="RoutePaths.signup">Create account</a>
            </div>
          </form>
        } @else {
          <!--
            The code, and nothing else. Re-showing the phone field here invited
            an edit that the code already in the reader's hand would no longer
            match; changing the number is a deliberate step back.
          -->
          <form class="auth-form card" [formGroup]="otpForm" appFormFeedback (ngSubmit)="confirm()">
            @if (store.verificationMessage(); as message) {
              <p class="alert alert-success">{{ message }}</p>
            }

            <label class="field">
              <span>Code</span>
              <input
                type="text"
                formControlName="otp"
                placeholder="123456"
                inputmode="numeric"
                autocomplete="one-time-code"
              >
              <app-field-error [control]="otpForm.controls.otp" label="Code" />
            </label>

            <button type="button" class="link-button" [disabled]="store.loading()" (click)="sendCode()">
              Resend code
            </button>

            @if (store.apiError(); as apiError) {
              <app-error-card title="Unable to sign in" [message]="apiError.message" [details]="apiError.details" />
            }

            <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
              {{ store.loading() ? 'Signing in...' : 'Confirm' }}
            </button>


          </form>
        }

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
export class PhoneLoginPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);
  readonly RoutePaths = RoutePaths;

  /** True once a code is actually out; the step, not an intention to move. */
  readonly sent = signal(false);

  readonly phoneForm = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{10,15}$/)]]
  });

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.store.clearMessages();
  }

  /**
   * Also the eligibility check. An account restricted to password login is
   * refused here, so the screen stays on the number with the server's own
   * reason rather than advancing to a code that was never sent.
   */
  async sendCode(): Promise<void> {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }

    const delivered = await this.store.requestLoginOtp({
      phoneNumber: this.phoneForm.getRawValue().phoneNumber
    });

    if (delivered) {
      this.sent.set(true);
    }
  }

  changeNumber(): void {
    this.sent.set(false);
    this.otpForm.reset({ otp: '' });
    this.store.clearMessages();
  }

  confirm(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    void this.store.confirmLoginOtp({
      phoneNumber: this.phoneForm.getRawValue().phoneNumber,
      otp: this.otpForm.getRawValue().otp
    });
  }
}
