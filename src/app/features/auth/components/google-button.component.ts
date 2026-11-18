import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, NgZone, OnInit, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';

/** Google Identity Services, loaded once from Google. Only what this button uses. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: string }): void;
      renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

const SCRIPT = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleIdentity> | null = null;

function loadGoogle(document: Document): Promise<GoogleIdentity> {
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const existing = (window as unknown as { google?: GoogleIdentity }).google;
    if (existing?.accounts?.id) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as unknown as { google: GoogleIdentity }).google);
    script.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in could not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * "Continue with Google". Shows nothing until the platform has a Google client id. An account with
 * the Google email is signed in; someone new goes on to confirm a phone number, which every
 * account needs, before the account is made.
 */
@Component({
  selector: 'app-google-button',
  standalone: true,
  template: `
    @if (enabled()) {
      <div class="google">
        <div class="google__divider" aria-hidden="true"><span>or</span></div>
        <div #slot class="google__button"></div>
        @if (busy()) { <p class="muted small">Signing in with Google…</p> }
        @if (error(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
      </div>
    }
  `,
  styles: [`
    .google { display: grid; gap: var(--space-2); justify-items: center; }
    .google__divider { display: flex; align-items: center; gap: var(--space-2); width: 100%; color: var(--text); opacity: 0.7; font-size: var(--text-sm); }
    .google__divider::before, .google__divider::after { content: ''; flex: 1; border-top: 1px solid var(--border); }
    .google__button { min-height: 44px; }
    .small { font-size: var(--text-xs); margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoogleButtonComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly slot = viewChild<ElementRef<HTMLElement>>('slot');

  readonly enabled = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const clientId = await this.auth.googleClientId();
    if (!clientId) {
      return;
    }
    this.enabled.set(true);
    try {
      const google = await loadGoogle(this.document);
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => this.zone.run(() => void this.signIn(response.credential))
      });
      // Rendered after the @if above has created the slot.
      setTimeout(() => {
        const element = this.slot()?.nativeElement;
        if (element) {
          google.accounts.id.renderButton(element, {
            theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill',
            width: Math.min(element.parentElement?.clientWidth ?? 320, 400)
          });
        }
      });
    } catch {
      this.enabled.set(false);
    }
  }

  private async signIn(idToken: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.auth.signInWithGoogle(idToken));
      if (result.status === 'SIGNED_IN') {
        await this.router.navigateByUrl(result.tokens?.passwordResetRequired ? RoutePaths.changePassword : RoutePaths.home);
      } else {
        await this.router.navigateByUrl(RoutePaths.googleSignup, {
          state: { idToken, email: result.email, firstName: result.firstName, lastName: result.lastName }
        });
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
