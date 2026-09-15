import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingService } from './core/services/loading.service';
import { NotificationService } from './core/services/notification.service';
import { RealtimeService } from './core/services/realtime.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialogComponent],
  template: `
    <router-outlet />

    <!-- One dialog for the whole app; ConfirmService decides what it asks. -->
    <app-confirm-dialog />

    <section class="toast-stack" aria-live="polite" aria-atomic="false" role="status">
      @for (notification of notifications.polite(); track notification.id) {
        <article class="toast toast-{{ notification.type }}">
          <span>{{ notification.message }}</span>
          @if (notification.count > 1) {
            <span class="toast__count" [attr.aria-label]="notification.count + ' occurrences'">×{{ notification.count }}</span>
          }
          <button type="button" aria-label="Dismiss notification" (click)="notifications.dismiss(notification.id)">×</button>
        </article>
      }
    </section>

    <section class="toast-stack toast-stack--assertive" aria-live="assertive" aria-atomic="false" role="alert">
      @for (notification of notifications.assertive(); track notification.id) {
        <article class="toast toast-{{ notification.type }}">
          <span>{{ notification.message }}</span>
          @if (notification.count > 1) {
            <span class="toast__count" [attr.aria-label]="notification.count + ' occurrences'">×{{ notification.count }}</span>
          }
          <button type="button" aria-label="Dismiss notification" (click)="notifications.dismiss(notification.id)">×</button>
        </article>
      }
    </section>

    @if (loading.isLoading()) {
      <div class="global-loader" aria-live="polite" aria-label="Loading"></div>
    }
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }

    .toast-stack {
      position: fixed;
      z-index: 60;
      top: 1rem;
      right: 1rem;
      display: grid;
      gap: 0.75rem;
      width: min(100% - 2rem, 22rem);
      pointer-events: none;
    }

    /* Errors stack below the polite region so the two never overlap. */
    .toast-stack--assertive {
      top: auto;
      bottom: 1rem;
    }

    .toast-stack:empty {
      display: none;
    }

    .toast {
      pointer-events: auto;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.95rem 1rem;
      border-radius: 1rem;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-md);
      color: var(--text);
    }

    .toast button {
      border: 0;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 1.1rem;
      line-height: 1;
    }

    /*
     * Tint plus a glyph, not a 1px border. A toast appears away from where the
     * operator is looking, so the hue has to register peripherally — and the
     * palette's own rule is that status is never carried by colour alone, since
     * the darkened accents converge in luminance (see the token header).
     */
    .toast::before {
      flex: none;
      font-size: 0.95rem;
      line-height: 1.35;
    }

    .toast-info {
      border-color: var(--primary-soft);
      background: var(--primary-tint, var(--surface));
    }

    .toast-info::before { content: 'ℹ'; color: var(--primary); }

    .toast-success {
      border-color: var(--success-border);
      background: var(--success-tint);
    }

    .toast-success::before { content: '✓'; color: var(--success); }

    .toast-warning {
      border-color: var(--warning-border);
      background: var(--warning-tint);
    }

    .toast-warning::before { content: '!'; color: var(--warning); font-weight: 700; }

    .toast-error {
      border-color: var(--danger-border);
      background: var(--danger-tint);
      border-left: 4px solid var(--danger-fill);
    }

    .toast-error::before { content: '✕'; color: var(--danger); font-weight: 700; }

    /* "and 4 more" — the repeat count for a collapsed message. */
    .toast__count {
      flex: none;
      align-self: center;
      min-width: 1.5rem;
      padding: 0 0.4rem;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
    }

    .global-loader {
      position: fixed;
      left: 50%;
      bottom: 1rem;
      transform: translateX(-50%);
      width: min(28rem, calc(100% - 2rem));
      height: 0.2rem;
      border-radius: 999px;
      overflow: hidden;
      background: var(--border);
    }

    .global-loader::before {
      content: '';
      position: absolute;
      inset: 0;
      width: 40%;
      background: linear-gradient(90deg, transparent, var(--primary), transparent);
      animation: slide 1.2s linear infinite;
    }

    @keyframes slide {
      from { transform: translateX(-100%); }
      to { transform: translateX(300%); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  /** Instantiated for its side effect: one STOMP connection per session. */
  private readonly realtime = inject(RealtimeService);

  readonly loading = inject(LoadingService);
  readonly notifications = inject(NotificationService);
}
