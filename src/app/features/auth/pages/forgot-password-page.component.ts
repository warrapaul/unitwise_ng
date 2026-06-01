import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Reset</span>
          <h1>Reset access</h1>
          <p class="muted">We send a generic reset message for safety.</p>
        </header>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field"><span>Email</span><input type="email" formControlName="email"></label>
          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }
          @if (store.verificationMessage()) {
            <div class="alert alert-success">{{ store.verificationMessage() }}</div>
          }
          <button type="submit" class="btn btn-primary">Send reset link</button>
          <a routerLink="/login" class="btn btn-secondary">Back to login</a>
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
export class ForgotPasswordPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.initiatePasswordReset(this.form.getRawValue());
  }
}
