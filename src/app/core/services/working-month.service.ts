import { Injectable, effect, signal } from '@angular/core';
import { monthKey } from '../../shared/utils/format.util';

const KEY = 'unitwise.working-month';

function stored(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The billing month the operator is working on, shared by every page that shows one month's rent:
 * the dashboard, rent overview, rent per room, meter readings and adjustments. Pick December once
 * and each of them opens on December.
 *
 * Kept for the browser session only: a new session starts on the current month, so nobody opens the
 * app next week still looking at a month they picked and forgot. A date inside a form (paid on, the
 * month a payment covers) is a fact about that record and does not use this.
 */
@Injectable({ providedIn: 'root' })
export class WorkingMonthService {
  /** `YYYY-MM`. */
  readonly month = signal(stored() ?? monthKey());

  constructor() {
    effect(() => {
      const month = this.month();
      try {
        sessionStorage.setItem(KEY, month);
      } catch {
        // Private mode: the month still holds until the page reloads.
      }
    });
  }
}
