import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (notifications.items().length > 0) {
      <section class="toast-stack">
        @for (notification of notifications.items(); track notification.id) {
          <article class="toast toast-{{ notification.type }}">
            <span>{{ notification.message }}</span>
            <button type="button" aria-label="Dismiss notification" (click)="notifications.dismiss(notification.id)">×</button>
          </article>
        }
      </section>
    }
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
    }

    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.95rem 1rem;
      border-radius: 1rem;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.96);
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

    .toast-info { border-color: rgba(79, 132, 217, 0.24); }
    .toast-success { border-color: rgba(31, 157, 106, 0.24); }
    .toast-warning { border-color: rgba(217, 130, 43, 0.24); }
    .toast-error { border-color: rgba(201, 79, 79, 0.24); }

    .global-loader {
      position: fixed;
      left: 50%;
      bottom: 1rem;
      transform: translateX(-50%);
      width: min(28rem, calc(100% - 2rem));
      height: 0.2rem;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(15, 23, 42, 0.08);
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
  readonly loading = inject(LoadingService);
  readonly notifications = inject(NotificationService);
}
