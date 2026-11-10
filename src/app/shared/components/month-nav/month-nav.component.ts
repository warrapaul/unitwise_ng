import { DateDisplayDirective } from '../../directives/date-display.directive';
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { monthKey } from '../../utils/format.util';

/**
 * The month, with a step either side: the native picker alone takes several taps to reach the month
 * next to this one. Months ahead are closed unless a page can act on them.
 */
@Component({
  selector: 'app-month-nav',
  standalone: true,
  template: `
    <div class="month-nav" role="group" aria-label="Month">
      <button type="button" class="icon-action" aria-label="Previous month" (click)="step(-1)">‹</button>
      <input type="month" aria-label="Month" [value]="month()" [attr.max]="allowFuture() ? null : thisMonth"
             (change)="pick($any($event.target).value)">
      <button type="button" class="icon-action" aria-label="Next month" [disabled]="atLimit()" (click)="step(1)">›</button>
    </div>
  `,
  styles: [`
    .month-nav { display: inline-flex; align-items: center; gap: var(--space-1); max-width: 100%; }
    .month-nav input { min-width: 0; min-height: var(--control-sm); padding: var(--space-1) var(--space-2-5); border: 1px solid var(--border);
                       border-radius: var(--radius-sm); background: var(--field-bg); color: var(--text); font: inherit; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthNavComponent {
  /** `YYYY-MM`. */
  readonly month = model.required<string>();
  /** For a page that can prepare a month before it starts. */
  readonly allowFuture = input(false);

  readonly thisMonth = monthKey();
  readonly atLimit = computed(() => !this.allowFuture() && this.month().slice(0, 7) >= this.thisMonth);

  step(by: number): void {
    const [year, month] = this.month().split('-').map(Number);
    this.month.set(monthKey(new Date(year, month - 1 + by, 1)));
  }

  /** Clearing the native picker sends an empty value, which is not a month. */
  pick(value: string): void {
    this.month.set(value || this.thisMonth);
  }
}
