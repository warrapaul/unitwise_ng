import { Injectable, computed, signal } from '@angular/core';

/** One file the viewer can show. */
export interface FileViewItem {
  name: string;
  url: string;
  /** From the API when it has one — more reliable than the extension. */
  contentType?: string | null;
}

/**
 * The full-screen file viewer — one for the whole app, like the confirm dialog.
 *
 * Opened from a preview or a list, never navigated to: looking at a document is
 * part of the task on screen, and a new tab for every "is this the right one"
 * lost the task.
 */
@Injectable({ providedIn: 'root' })
export class FileViewerService {
  private readonly state = signal<{ items: FileViewItem[]; index: number } | null>(null);
  private returnFocus: HTMLElement | null = null;

  readonly items = computed(() => this.state()?.items ?? []);
  readonly index = computed(() => this.state()?.index ?? 0);
  readonly current = computed(() => this.state()?.items[this.state()!.index] ?? null);
  readonly isOpen = computed(() => this.state() !== null);

  /** Shows `items[index]`; Previous and Next step through the rest. */
  open(items: FileViewItem[], index = 0): void {
    if (items.length === 0) {
      return;
    }

    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.state.set({ items, index: Math.min(Math.max(index, 0), items.length - 1) });
  }

  close(): void {
    this.state.set(null);
    // Back where the person was, not the top of the page.
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  step(delta: number): void {
    this.state.update((state) => {
      if (!state) {
        return state;
      }

      const count = state.items.length;
      return { ...state, index: (state.index + delta + count) % count };
    });
  }
}
