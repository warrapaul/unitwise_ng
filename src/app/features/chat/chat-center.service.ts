import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ChatService } from './chat.service';
import { ThreadEvent } from './models/chat.models';

/**
 * Chat's unread total and its live messages — the Chat badge and every open
 * thread read from here, so there is one socket interpretation.
 *
 * The total is fetched (a pushed event carries one thread's count, not the
 * total): at sign-in, on every message event, and when the tab is shown again.
 */
@Injectable({ providedIn: 'root' })
export class ChatCenterService {
  private readonly api = inject(ChatService);
  private readonly session = inject(AuthSessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly document = inject(DOCUMENT);

  private readonly unreadState = signal(0);
  readonly unread = this.unreadState.asReadonly();

  /** The latest THREAD_MESSAGE event, typed; null until one arrives. */
  readonly lastEvent = computed<ThreadEvent | null>(() => {
    const pushed = this.realtime.lastChatEvent();
    const frame = pushed?.frame as ThreadEvent | undefined;
    return frame && frame.threadId && (frame.eventType ?? 'THREAD_MESSAGE') === 'THREAD_MESSAGE' ? { ...frame } : null;
  });

  constructor() {
    effect(() => {
      if (this.session.isAuthenticated()) {
        untracked(() => void this.refresh());
      } else {
        this.unreadState.set(0);
      }
    });

    effect(() => {
      if (this.lastEvent()) {
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
      // A badge is a hint; keep the last known count.
    }
  }

  /** A thread with `count` unread was just read here. */
  threadRead(count: number): void {
    this.unreadState.update((total) => Math.max(0, total - count));
  }
}
