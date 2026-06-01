import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
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
        <header class="auth-header">
          <h1>Sign in</h1>
        </header>

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
    .auth-panel {
      width: min(100%, 560px);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.store.clearMessages();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.login(this.form.getRawValue());
  }
}
