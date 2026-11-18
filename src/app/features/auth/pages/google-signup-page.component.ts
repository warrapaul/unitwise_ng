import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';

interface GoogleState {
  idToken: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * The one step a new Google user has left: a phone number, confirmed with a code, because that is
 * how rent reminders, receipts and sign-in codes reach them. Then the account is made and they are in.
 */
@Component({
  selector: 'app-google-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ErrorCardComponent, FieldErrorComponent, FormFeedbackDirective],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <h1>{{ sent() ? 'Enter your code' : 'Finish signing up' }}</h1>
          <p class="muted">Signing up as {{ google?.email }}. Add your phone number: rent reminders, receipts and sign-in codes go there.</p>
        </header>

        @if (!sent()) {
          <form class="auth-form card" [formGroup]="form" appFormFeedback (ngSubmit)="sendCode()">
            <div class="pair">
              <label class="field"><span>First name</span><input formControlName="firstName" autocomplete="given-name">
                <app-field-error [control]="form.controls.firstName" label="First name" /></label>
              <label class="field"><span>Last name</span><input formControlName="lastName" autocomplete="family-name">
                <app-field-error [control]="form.controls.lastName" label="Last name" /></label>
            </div>
            <label class="field"><span>Phone number</span>
              <input type="tel" formControlName="phoneNumber" autocomplete="tel" inputmode="tel" placeholder="0712 345 678">
              <app-field-error [control]="form.controls.phoneNumber" label="Phone number" /></label>
            <fieldset class="via">
              <legend>Send the code by</legend>
              <label class="via__option"><input type="radio" formControlName="channel" value="SMS"> SMS</label>
              <label class="via__option"><input type="radio" formControlName="channel" value="WHATSAPP"> WhatsApp</label>
            </fieldset>
            @if (error(); as e) { <app-error-card title="Unable to send a code" [message]="e.message" [details]="e.details" /> }
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Sending…' : 'Send code' }}</button>
            </div>
            <p class="auth-switch">Already have an account with this phone? <a class="auth-link" [routerLink]="RoutePaths.login">Sign in</a></p>
          </form>
        } @else {
          <form class="auth-form card" [formGroup]="codeForm" appFormFeedback (ngSubmit)="finish()">
            @if (sentMessage(); as message) { <p class="alert alert-success">{{ message }}</p> }
            <label class="field"><span>Code</span>
              <input type="text" formControlName="otp" inputmode="numeric" autocomplete="one-time-code">
              <app-field-error [control]="codeForm.controls.otp" label="Code" /></label>
            <button type="button" class="link-button" [disabled]="busy()" (click)="sent.set(false)">Use a different number</button>
            @if (error(); as e) { <app-error-card title="Unable to finish" [message]="e.message" [details]="e.details" /> }
            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Creating your account…' : 'Create account' }}</button>
            </div>
          </form>
        }
      </section>
    </main>
  `,
  styles: [`
    .auth-panel { width: min(100%, 460px); }
    .pair { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); }
    .via { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; }
    .via legend { font-weight: var(--weight-semibold); margin-bottom: var(--space-1); width: 100%; }
    .via__option { display: flex; gap: var(--space-2); align-items: center; min-height: 2.75rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoogleSignupPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Handed over by the Google button; gone on a reload, which sends them back to sign in. */
  readonly google = (this.router.getCurrentNavigation()?.extras.state ?? history.state) as GoogleState | undefined;

  readonly sent = signal(false);
  readonly busy = signal(false);
  readonly sentMessage = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\+?[0-9 ]{10,16}$/)]],
    channel: 'SMS' as 'SMS' | 'WHATSAPP'
  });
  readonly codeForm = this.fb.group({ otp: ['', Validators.required] });

  ngOnInit(): void {
    if (!this.google?.idToken) {
      void this.router.navigateByUrl(RoutePaths.login);
      return;
    }
    this.form.patchValue({ firstName: this.google.firstName ?? '', lastName: this.google.lastName ?? '' });
  }

  async sendCode(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    await this.run(async () => {
      const response = await firstValueFrom(this.auth.requestSignupPhoneVerification({ phoneNumber: v.phoneNumber.replace(/\s/g, ''), channel: v.channel }));
      this.sentMessage.set(response.message ?? 'Code sent');
      this.sent.set(true);
    });
  }

  async finish(): Promise<void> {
    if (this.codeForm.invalid || !this.google?.idToken) {
      this.codeForm.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const phoneNumber = v.phoneNumber.replace(/\s/g, '');
    await this.run(async () => {
      await firstValueFrom(this.auth.confirmSignupPhoneVerification({ phoneNumber, otp: this.codeForm.getRawValue().otp }));
      await firstValueFrom(this.auth.completeGoogleSignup({
        idToken: this.google!.idToken, phoneNumber, firstName: v.firstName.trim(), lastName: v.lastName.trim()
      }));
      await this.router.navigateByUrl(RoutePaths.home);
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (error) {
      this.error.set(toApiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
