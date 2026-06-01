import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';
import { RoutePaths } from '../../../core/routes/route-paths';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Signup</span>
          <h1>Create account</h1>
          <p class="muted">Verify the phone first, then finish setup.</p>
        </header>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="sendVerification()">
          <div class="stack">
            <label class="field"><span>First name</span><input formControlName="firstName"></label>
            <label class="field"><span>Middle name</span><input formControlName="middleName"></label>
            <label class="field"><span>Last name</span><input formControlName="lastName"></label>
            <label class="field"><span>Email</span><input type="email" formControlName="email"></label>
            <label class="field"><span>Phone number</span><input type="tel" formControlName="phoneNumber"></label>
            <label class="field"><span>National ID</span><input formControlName="nationalIdNumber"></label>
            <label class="field"><span>Password</span><input type="password" formControlName="password"></label>
          </div>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }

          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="store.loading()">
              {{ store.loading() ? 'Sending...' : 'Send verification code' }}
            </button>
            <a routerLink="/login" class="btn btn-secondary">Back to login</a>
          </div>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .auth-panel {
      width: min(100%, 840px);
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    firstName: ['', [Validators.required]],
    middleName: [''],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{9,15}$/)]],
    nationalIdNumber: ['', [Validators.required, Validators.minLength(8)]]
  });

  async sendVerification(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();
    await this.store.requestSignupVerification({ phoneNumber: payload.phoneNumber });

    if (this.store.error()) {
      return;
    }

    sessionStorage.setItem('signup-draft', JSON.stringify(payload));
    await this.router.navigateByUrl(`${RoutePaths.verifyPhone}?phoneNumber=${encodeURIComponent(payload.phoneNumber)}`);
  }

  ngOnInit(): void {
    this.store.clearMessages();
  }
}
