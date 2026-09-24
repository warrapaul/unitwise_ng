import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { RoutePaths } from '../../../core/routes/route-paths';
import { MIN_PASSWORD_LENGTH, RegisterRequest, SIGNUP_DRAFT_KEY } from '../models/auth.models';

const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

/**
 * The code step of signup. The code went out from the details form, so this
 * page opens on the code and nothing else; the number is stated, not asked.
 *
 * Changing the number is its own small step and touches only the number —
 * the rest of the signup stays as typed, in the draft.
 */
@Component({
  selector: 'app-signup-verify-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, ErrorCardComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>Verify phone</h1>
          @if (!changingNumber() && phoneNumber()) {
            <p class="muted">
              Code sent to <span class="mono">{{ phoneNumber() }}</span>.
              <button type="button" class="link-button" (click)="startChangeNumber()">Change number</button>
            </p>
          }
        </header>

        @if (draftError(); as message) {
          <div class="alert alert-error">
            {{ message }} <a class="auth-link" [routerLink]="RoutePaths.signup">Back to signup</a>
          </div>
        } @else if (changingNumber()) {
          <form class="auth-form card" [formGroup]="phoneForm" appFormFeedback (ngSubmit)="sendToNewNumber()">
            <label class="field">
              <span>Phone number</span>
              <input type="tel" formControlName="phoneNumber" placeholder="2547XXXXXXXX" autocomplete="tel">
              <app-field-error [control]="phoneForm.controls.phoneNumber" label="Phone number"
                patternMessage="9-15 digits, optionally starting with +." />
            </label>

            @if (store.apiError(); as apiError) {
              <app-error-card title="Unable to send a code" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
                {{ store.loading() ? 'Sending...' : 'Send code' }}
              </button>
              @if (phoneNumber()) {
                <button type="button" class="btn btn-secondary" (click)="cancelChangeNumber()">Cancel</button>
              }
            </div>
          </form>
        } @else {
          <form class="auth-form card" [formGroup]="otpForm" appFormFeedback (ngSubmit)="confirm()">
            <label class="field">
              <span>Code</span>
              <input formControlName="otp" placeholder="123456" inputmode="numeric" autocomplete="one-time-code">
              <app-field-error [control]="otpForm.controls.otp" label="Code" />
            </label>

            <!-- Next to the field it refills, not after the action that uses it. -->
            <button type="button" class="link-button" [disabled]="store.loading()" (click)="resend()">
              Resend code
            </button>

            @if (store.apiError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'Already registered' : 'Unable to verify the phone'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            @if (store.verificationMessage(); as message) {
              <div class="alert alert-success">{{ message }}</div>
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
                {{ store.loading() ? 'Confirming...' : 'Confirm' }}
              </button>
            </div>
          </form>
        }

        <div class="auth-links">
          <a [routerLink]="RoutePaths.signup">Back to signup</a>
          <a [routerLink]="RoutePaths.login">Back to login</a>
        </div>
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
export class SignupVerifyPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(AuthStore);
  readonly RoutePaths = RoutePaths;

  readonly phoneNumber = signal('');
  readonly changingNumber = signal(false);
  readonly draftError = signal<string | null>(null);

  readonly otpForm = this.fb.group({
    otp: ['', [Validators.required]]
  });

  readonly phoneForm = this.fb.group({
    phoneNumber: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]]
  });

  ngOnInit(): void {
    this.store.clearMessages();

    const draft = this.readDraft();
    if (!draft) {
      return;
    }

    const phoneNumber = this.route.snapshot.queryParamMap.get('phoneNumber') || draft.phoneNumber;
    this.phoneNumber.set(phoneNumber ?? '');
    // Nowhere to have sent a code to — ask for the number rather than a code.
    this.changingNumber.set(!phoneNumber);
  }

  startChangeNumber(): void {
    this.store.clearMessages();
    this.phoneForm.reset({ phoneNumber: this.phoneNumber() });
    this.changingNumber.set(true);
  }

  cancelChangeNumber(): void {
    this.store.clearMessages();
    this.changingNumber.set(false);
  }

  /** Sends to the new number and writes it into the draft, leaving the rest alone. */
  async sendToNewNumber(): Promise<void> {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }

    const draft = this.readDraft();
    if (!draft) {
      return;
    }

    const phoneNumber = this.phoneForm.getRawValue().phoneNumber;
    await this.store.requestSignupVerification({ phoneNumber });
    if (this.store.error()) {
      return;
    }

    sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify({ ...draft, phoneNumber }));
    this.phoneNumber.set(phoneNumber);
    this.otpForm.reset({ otp: '' });
    this.changingNumber.set(false);
  }

  async resend(): Promise<void> {
    this.otpForm.reset({ otp: '' });
    await this.store.requestSignupVerification({ phoneNumber: this.phoneNumber() });
  }

  /**
   * The draft is judged before the code is spent. Signup posts the draft only
   * after the code is confirmed, so a draft the server will refuse used to
   * fail at the very end — a used code and an error about the password.
   */
  async confirm(): Promise<void> {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    const draft = this.readDraft();
    if (!draft) {
      return;
    }

    if ((draft.password ?? '').length < MIN_PASSWORD_LENGTH) {
      this.draftError.set(`Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    await this.store.confirmSignupVerification({
      phoneNumber: this.phoneNumber(),
      otp: this.otpForm.getRawValue().otp
    });
    if (this.store.error()) {
      return;
    }

    await this.store.signup({ ...draft, phoneNumber: this.phoneNumber() });
    if (!this.store.error()) {
      sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    }
  }

  /** The signup details, or null with the reason on screen. */
  private readDraft(): RegisterRequest | null {
    const stored = sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!stored) {
      this.draftError.set('Your signup details were not found.');
      return null;
    }

    try {
      return JSON.parse(stored) as RegisterRequest;
    } catch {
      sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
      this.draftError.set('Your saved signup details could not be read.');
      return null;
    }
  }
}
