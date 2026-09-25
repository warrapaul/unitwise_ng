import { DOCUMENT, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { NotificationsService } from './notifications.service';

/**
 * The unread count behind the menu badge — one number for the whole app.
 *
 * The server is the truth: the count is fetched at sign-in, taken from every
 * live event that carries it, and fetched again when the tab comes back into
 * view (anything missed while the socket was down).
 * Local changes — reading one, reading all — move it at once, so the badge
 * never lags the click.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly api = inject(NotificationsService);
  private readonly session = inject(AuthSessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly document = inject(DOCUMENT);

  private readonly unreadState = signal(0);
  readonly unread = this.unreadState.asReadonly();

  constructor() {
    effect(() => {
      if (this.session.isAuthenticated()) {
        untracked(() => void this.refresh());
      } else {
        this.unreadState.set(0);
      }
    });

    // The server sends the new total with every inbox change (and alone, as
    // UNREAD_COUNT, when one is read elsewhere) — so every tab agrees.
    effect(() => {
      const pushed = this.realtime.pushedUnread();
      if (pushed) {
        this.unreadState.set(pushed.count);
      }
    });

    // A frame without a count (a broadcast, say) still means one more unread: ask.
    effect(() => {
      const pushed = this.realtime.lastNotification();
      if (pushed && pushed.unreadCount === null) {
        untracked(() => void this.refresh());
      }
    });

    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible' && this.session.isAuthenticated()) {
        void this.refresh();
      }
    });
  }

  async refresh(): Promise<void> {
    try {
      this.unreadState.set(await firstValueFrom(this.api.getUnreadCount()));
    } catch {
      // A badge is a hint; a failed count leaves the last known one.
    }
  }

  /** One was read here. */
  markedRead(): void {
    this.unreadState.update((count) => Math.max(0, count - 1));
  }

  markedAllRead(): void {
    this.unreadState.set(0);
  }
}
