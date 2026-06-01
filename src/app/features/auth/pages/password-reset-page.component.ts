import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-password-reset-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <div class="auth-panel__copy">
          <span class="pill">Reset password</span>
          <h1>Confirm token</h1>
          <p class="muted">Use the emailed token and choose a new password.</p>
        </div>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field"><span>Reset token</span><input formControlName="token"></label>
          <label class="field"><span>New password</span><input type="password" formControlName="newPassword"></label>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }
          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }

          <button type="submit" class="btn btn-primary">Reset password</button>
          <a routerLink="/login" class="btn btn-secondary">Back to login</a>
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
      width: min(100%, 720px);
      display: grid;
      gap: 1rem;
      padding: 1.25rem;
    }

    .auth-panel__copy,
    .auth-form {
      padding: 1.25rem;
    }

    .auth-form {
      display: grid;
      gap: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordResetPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    token: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.confirmPasswordReset(this.form.getRawValue());
  }
}
