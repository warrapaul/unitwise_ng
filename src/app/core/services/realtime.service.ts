import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { NotificationService } from './notification.service';
import { WebSocketService } from './websocket.service';

interface PushedNotification {
  id?: number | string;
  title?: string | null;
  body?: string | null;
  notificationType?: string | null;
}

/**
 * Owns the single STOMP connection for the session: opens it once the user is
 * authenticated, closes it on logout, and surfaces pushed notifications as
 * toasts. Instantiated once from AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly authSession = inject(AuthSessionService);
  private readonly webSocket = inject(WebSocketService);
  private readonly notifications = inject(NotificationService);

  /** Latest push, so feature screens can react without opening their own socket. */
  private readonly lastNotificationState = signal<PushedNotification | null>(null);
  readonly lastNotification = this.lastNotificationState.asReadonly();

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      if (this.authSession.isAuthenticated()) {
        this.open();
      } else {
        this.close();
      }
    });

    inject(DestroyRef).onDestroy(() => this.close());
  }

  private open(): void {
    if (this.subscription) {
      return;
    }

    this.webSocket.connect();
    this.subscription = this.webSocket.watchNotifications<PushedNotification>()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (notification) => {
          this.lastNotificationState.set(notification);
          this.notifications.push('info', notification.title || notification.body || 'New notification');
        },
        // A dropped socket shouldn't surface as an error toast — rx-stomp reconnects on its own.
        error: () => this.close()
      });
  }

  private close(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.webSocket.disconnect();
  }
}
