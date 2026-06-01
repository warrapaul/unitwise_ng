import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <div class="auth-panel__copy">
          <h1>Sign in</h1>
        </div>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="submit()">
          <div class="stack">
            <label class="field">
              <span>Email</span>
              <input type="email" formControlName="email" placeholder="name@company.com">
            </label>

            <label class="field">
              <span>Password</span>
              <input type="password" formControlName="password" placeholder="Enter your password">
            </label>
          </div>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
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
    .auth-screen {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1.5rem;
    }

    .auth-panel {
      width: min(100%, 1120px);
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 1.25rem;
      padding: 1.25rem;
    }

    .auth-panel__copy,
    .auth-form {
      padding: 1.4rem;
    }

    .auth-form {
      display: grid;
      gap: 1rem;
      align-content: start;
    }

    .auth-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.9rem;
      color: var(--text-muted);
      font-size: 0.92rem;
    }

    .auth-links a:hover {
      color: var(--text);
    }

    @media (max-width: 900px) {
      .auth-panel {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.login(this.form.getRawValue());
  }
}
