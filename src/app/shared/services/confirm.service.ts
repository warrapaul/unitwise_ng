import { Injectable, signal } from '@angular/core';

/**
 * Asks for text alongside the confirmation — a reason for a refusal, a note on
 * a withdrawal.
 *
 * Attached to the confirm dialog rather than given one of its own because the
 * two questions are the same question: a refusal is a decision *and* the
 * reason for it, and splitting them across two prompts lets somebody commit to
 * the first before seeing the second.
 */
export interface ReasonRequest {
  /** The field label — "Why are you declining?" */
  label: string;
  placeholder?: string;
  /** Under the field: who will read this, and what makes it useful. */
  hint?: string;
  /** When true, the confirming button stays disabled until something is typed. */
  required?: boolean;
  maxLength?: number;
}

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
  /** Ask for text as part of the same decision. */
  reason?: ReasonRequest;
}

/** What the dialog answers with: the decision, and the text if any was asked for. */
export interface ConfirmOutcome {
  confirmed: boolean;
  reason: string;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (outcome: ConfirmOutcome) => void;
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

  async ask(request: ConfirmRequest): Promise<boolean> {
    return (await this.open(request)).confirmed;
  }

  /**
   * Confirm, and collect the text that goes with it.
   *
   * Resolves to null when the operator backs out, so a call site can return
   * without having to tell a cancellation apart from an empty answer — which
   * `window.prompt` made indistinguishable from typing nothing and pressing OK.
   */
  async askForReason(request: ConfirmRequest & { reason: ReasonRequest }): Promise<string | null> {
    const outcome = await this.open(request);
    return outcome.confirmed ? outcome.reason : null;
  }

  private open(request: ConfirmRequest): Promise<ConfirmOutcome> {
    // A second question while one is open would replace it and leave the first
    // caller waiting forever, so the earlier one is answered "no" first.
    this.state()?.resolve({ confirmed: false, reason: '' });

    return new Promise<ConfirmOutcome>((resolve) => {
      this.state.set({ ...request, resolve });
    });
  }

  /** Called by the dialog only. */
  settle(confirmed: boolean, reason = ''): void {
    const pending = this.state();
    if (!pending) {
      return;
    }

    this.state.set(null);
    pending.resolve({ confirmed, reason: reason.trim() });
  }
}
