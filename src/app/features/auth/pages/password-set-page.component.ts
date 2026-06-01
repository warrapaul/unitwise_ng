import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-password-set-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Temporary account</span>
          <h1>Set password</h1>
          <p class="muted">Finish registration after OTP verification.</p>
        </header>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field"><span>Phone number</span><input type="tel" formControlName="phoneNumber"></label>
          <label class="field"><span>Verification token</span><input formControlName="verificationToken"></label>
          <label class="field"><span>New password</span><input type="password" formControlName="password"></label>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }

          <button type="submit" class="btn btn-primary" [disabled]="store.loading()">Set password</button>
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
export class PasswordSetPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^\\+?[0-9]{9,15}$/)]],
    verificationToken: ['', [Validators.required]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.setPassword(this.form.getRawValue());
  }
}
