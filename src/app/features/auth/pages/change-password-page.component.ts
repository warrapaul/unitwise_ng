import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-screen">
      <section class="auth-panel panel">
        <header class="auth-header">
          <span class="pill">Security</span>
          <h1>Change password</h1>
          <p class="muted">Use this when the backend asks for a reset.</p>
        </header>

        <form class="auth-form card" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field"><span>Current password</span><input type="password" formControlName="currentPassword"></label>
          <label class="field"><span>New password</span><input type="password" formControlName="newPassword"></label>

          @if (store.error()) {
            <div class="alert alert-error">{{ store.error() }}</div>
          }

          <button type="submit" class="btn btn-primary">Update password</button>
          <a routerLink="/home" class="btn btn-secondary">Skip for now</a>
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
export class ChangePasswordPageComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(AuthStore);

  readonly form = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]]
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    void this.store.changePassword(this.form.getRawValue());
  }
}
