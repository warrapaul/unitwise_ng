import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SortState } from '../../utils/sort-state.util';

/**
 * A sortable column heading.
 *
 * Replaces a `<button class="sort-button">` plus a hand-rolled `sortMarker()`
 * per page, and fixes what those could not show: which column the table is
 * actually ordered by. A grey caret that only appears on the active column is
 * indistinguishable from decoration — here the active column's label and arrow
 * take the accent colour, and when more than one key is active each carries its
 * position, so "newest first, then by name" is legible at a glance.
 */
@Component({
  selector: 'app-sort-header',
  standalone: true,
  template: `
    <button
      type="button"
      class="sort-button"
      [class.sort-button--active]="direction() !== null"
      [attr.aria-sort]="ariaSort()"
      [title]="hint()"
      (click)="onClick($event)"
    >
      <span>{{ label() }}</span>

      @if (direction(); as active) {
        <span class="sort-button__arrow" aria-hidden="true">{{ active === 'asc' ? '↑' : '↓' }}</span>
        @if (rank(); as position) {
          <span class="sort-button__rank" aria-hidden="true">{{ position }}</span>
        }
      } @else {
        <span class="sort-button__arrow sort-button__arrow--idle" aria-hidden="true">↕</span>
      }
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortHeaderComponent {
  readonly state = input.required<SortState>();
  readonly field = input.required<string>();
  readonly label = input.required<string>();

  /** Emitted after the state changes, so the page can refetch. */
  readonly sorted = output<void>();

  readonly direction = computed(() => this.state().entries().find((entry) => entry.field === this.field())?.direction ?? null);
  readonly rank = computed(() => this.state().rankOf(this.field()));

  /** `aria-sort` belongs on the `th`, but the button is what carries the state. */
  readonly ariaSort = computed(() => {
    const direction = this.direction();
    return direction === null ? 'none' : direction === 'asc' ? 'ascending' : 'descending';
  });

  readonly hint = computed(() =>
    `Sort by ${this.label().toLowerCase()}. Shift-click to add it to the current ordering.`);

  onClick(event: MouseEvent): void {
    this.state().toggle(this.field(), event.shiftKey || event.ctrlKey || event.metaKey);
    this.sorted.emit();
  }
}
