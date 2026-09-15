import { Injectable, computed, signal } from '@angular/core';

export type NotificationVariant = 'info' | 'success' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationVariant;
  message: string;
  /** How many times this identical message has arrived while still on screen. */
  count: number;
}

/** Long enough to read a failure, short enough not to become wallpaper. */
const DISMISS_AFTER: Record<NotificationVariant, number> = {
  info: 4500,
  success: 4500,
  warning: 9000,
  error: 9000
};

/** Beyond this the oldest is dropped; a screenful of toasts informs nobody. */
const MAX_VISIBLE = 3;

/**
 * App-wide toasts. Success/info go to the polite region; warnings and errors to
 * the assertive one (skills §21).
 *
 * Identical messages collapse rather than stack. One rejected permission
 * typically fails several parallel requests, and six copies of the same sentence
 * is not six pieces of information — it is one, repeated until it hides the page.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messages = signal<NotificationMessage[]>([]);
  private readonly timers = new Map<string, number>();

  readonly items = this.messages.asReadonly();
  readonly polite = computed(() => this.messages().filter((item) => item.type === 'info' || item.type === 'success'));
  readonly assertive = computed(() => this.messages().filter((item) => item.type === 'warning' || item.type === 'error'));

  push(type: NotificationVariant, message: string): void {
    const existing = this.messages().find((item) => item.type === type && item.message === message);
    if (existing) {
      this.messages.update((current) =>
        current.map((item) => (item.id === existing.id ? { ...item, count: item.count + 1 } : item))
      );
      // Restart the clock: the condition is still happening.
      this.schedule(existing.id, type);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.messages.update((current) => {
      const next = [...current, { id, type, message, count: 1 }];
      const overflow = next.length - MAX_VISIBLE;
      if (overflow <= 0) {
        return next;
      }

      for (const dropped of next.slice(0, overflow)) {
        this.clearTimer(dropped.id);
      }

      return next.slice(overflow);
    });

    this.schedule(id, type);
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this.messages.update((current) => current.filter((item) => item.id !== id));
  }

  clear(): void {
    for (const id of [...this.timers.keys()]) {
      this.clearTimer(id);
    }

    this.messages.set([]);
  }

  /**
   * Every toast self-dismisses, errors included.
   *
   * They used to persist so assistive tech had time to read them, but an
   * undismissable pile is its own accessibility problem — and a failure the
   * operator must act on is shown by the page's own error card (§31.2), which
   * is where it belongs. The toast is the notice, not the record.
   */
  private schedule(id: string, type: NotificationVariant): void {
    this.clearTimer(id);
    this.timers.set(id, window.setTimeout(() => this.dismiss(id), DISMISS_AFTER[type]));
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
