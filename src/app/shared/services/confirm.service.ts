import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  /** What is about to happen, as a question or a statement of the act. */
  title: string;
  /** What it will affect, and anything that cannot be undone. */
  message?: string | null;
  /** Names the act — "Delete building", not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive acts get the danger button. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

/**
 * Asks the operator to confirm, and waits for the answer.
 *
 * `window.confirm` blocks the whole tab, cannot be styled, announces the page's
 * origin, and — the part that matters — labels its buttons "OK" and "Cancel"
 * whatever the question was. "OK" is the same word for archiving a notice and
 * for deleting a building with sixty tenancies under it.
 *
 * One dialog is rendered by the shell and driven from here, so a call site says
 * only what it is asking:
 *
 *     if (!await this.confirm.ask({
 *       title: `Delete ${building.name}?`,
 *       message: 'Its floors, rooms and their tenancies go with it.',
 *       confirmLabel: 'Delete building',
 *       destructive: true
 *     })) {
 *       return;
 *     }
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = signal<PendingConfirm | null>(null);

  /** Read by the shell's dialog; nothing else should touch it. */
  readonly pending = this.state.asReadonly();

  ask(request: ConfirmRequest): Promise<boolean> {
    // A second question while one is open would replace it and leave the first
    // caller waiting forever, so the earlier one is answered "no" first.
    this.state()?.resolve(false);

    return new Promise<boolean>((resolve) => {
      this.state.set({ ...request, resolve });
    });
  }

  /** Called by the dialog only. */
  settle(confirmed: boolean): void {
    const pending = this.state();
    if (!pending) {
      return;
    }

    this.state.set(null);
    pending.resolve(confirmed);
  }
}
