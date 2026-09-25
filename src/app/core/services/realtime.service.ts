import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { NotificationService } from './notification.service';
import { WebSocketService } from './websocket.service';

/** As the server sends it on /queue/notifications (WebSocketPayload). */
interface NotificationFrame {
  type?: string | null;
  title?: string | null;
  message?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  data?: Record<string, unknown> | null;
  /** The recipient's unread total after this event, when the server knows it. */
  unreadCount?: number | null;
  timestamp?: string | null;
}

/** The same, in the names the rest of the app uses. */
export interface PushedNotification {
  title: string | null;
  body: string | null;
  notificationType: string | null;
  entityType: string | null;
  entityId: number | null;
  data: Record<string, string>;
  /** Null when the frame did not say — then the count must be fetched. */
  unreadCount: number | null;
  receivedAt: number;
}

/** A chat frame from /queue/chat, stamped so identical frames still register. */
export interface PushedChatEvent<T = unknown> {
  frame: T;
  receivedAt: number;
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

  /** The inbox's unread total, as last pushed — including the silent UNREAD_COUNT events. */
  private readonly pushedUnreadState = signal<{ count: number; receivedAt: number } | null>(null);
  readonly pushedUnread = this.pushedUnreadState.asReadonly();

  /** Latest chat frame; the chat feature interprets it. */
  private readonly lastChatEventState = signal<PushedChatEvent | null>(null);
  readonly lastChatEvent = this.lastChatEventState.asReadonly();

  private chatSubscription: Subscription | null = null;

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
    // No takeUntilDestroyed here: this runs from an effect, outside an injection
    // context, where it throws. close() unsubscribes, and the root service lives
    // as long as the app.
    this.subscription = this.webSocket.watchNotifications<NotificationFrame>()
      .subscribe({
        next: (frame) => {
          if (typeof frame.unreadCount === 'number') {
            this.pushedUnreadState.set({ count: frame.unreadCount, receivedAt: Date.now() });
          }
          // A count update, not news: the badge moves, nothing is announced.
          if (frame.type === 'UNREAD_COUNT') {
            return;
          }

          const notification: PushedNotification = {
            title: frame.title ?? null,
            body: frame.message ?? null,
            notificationType: frame.type ?? null,
            entityType: frame.entityType ?? null,
            entityId: frame.entityId ?? null,
            data: toStrings(frame.data),
            unreadCount: typeof frame.unreadCount === 'number' ? frame.unreadCount : null,
            // Always a new value, so two identical pushes both register.
            receivedAt: Date.now()
          };
          this.lastNotificationState.set(notification);
          this.notifications.push('info', notification.title || notification.body || 'New notification');
        },
        // A dropped socket shouldn't surface as an error toast — rx-stomp reconnects on its own.
        error: () => this.close()
      });

    this.chatSubscription = this.webSocket.watchChatMessages<unknown>()
      .subscribe({
        next: (frame) => this.lastChatEventState.set({ frame, receivedAt: Date.now() }),
        error: () => this.close()
      });
  }

  private close(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.chatSubscription?.unsubscribe();
    this.chatSubscription = null;
    this.webSocket.disconnect();
  }
}

function toStrings(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value !== null && value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}
