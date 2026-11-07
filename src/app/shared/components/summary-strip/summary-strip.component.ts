import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One count in a summary strip. */
export interface SummaryTile {
  /** Stable key; also what `picked` emits for a filter tile. */
  key: string;
  label: string;
  value: number | string;
  /** Waiting on the operator: drawn in the warning colour when above zero. */
  act?: boolean;
  /** A page of its own: the tile is a link. */
  route?: string | null;
  /** Filters the list below: the tile is a toggle button. Neither route nor filter: a plain figure. */
  filter?: boolean;
}

/**
 * The counts above a list, in one row: what the list holds at a glance, and a way in. A filter
 * tile narrows the table below (pressed again, it clears); a link tile opens its own page; a plain
 * tile is only a figure. One component so every list's summary looks and behaves the same.
 */
@Component({
  selector: 'app-summary-strip',
  standalone: true,
  imports: [RouterLink],
  template: `
    <!-- Chips where the tiles are only a way to filter: one line instead of a third of a phone screen. -->
    @if (chips()) {
      <ul class="filter-chips" [attr.aria-label]="label()">
        @for (tile of shown(); track tile.key) {
          <li>
            <button type="button" class="filter-chip" [attr.aria-pressed]="tile.key === active()"
                    (click)="picked.emit(tile.key === active() ? null : tile.key)">{{ tile.label }}: <strong>{{ tile.value }}</strong></button>
          </li>
        }
      </ul>
    } @else {
    @if (shown().length > 0) {
      <div class="strip" role="group" [attr.aria-label]="label()" [style.--strip-cols]="columns()">
        @for (tile of shown(); track tile.key) {
          @if (tile.route) {
            <a class="kpi kpi--compact" [class.kpi--warn]="warn(tile)" [routerLink]="tile.route">
              <span class="kpi__value">{{ tile.value }}</span>
              <span class="kpi__label">{{ tile.label }} ›</span>
            </a>
          } @else if (tile.filter) {
            <button type="button" class="kpi kpi--compact" [class.kpi--active]="tile.key === active()" [class.kpi--warn]="warn(tile)"
                    [attr.aria-pressed]="tile.key === active()" (click)="picked.emit(tile.key === active() ? null : tile.key)">
              <span class="kpi__value">{{ tile.value }}</span>
              <span class="kpi__label">{{ tile.label }}</span>
            </button>
          } @else {
            <div class="kpi kpi--compact" [class.kpi--warn]="warn(tile)">
              <span class="kpi__value">{{ tile.value }}</span>
              <span class="kpi__label">{{ tile.label }}</span>
            </div>
          }
        }
      </div>
    }
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    /* Every tile on one row on a wide screen; four, then two, as it narrows. */
    .strip { display: grid; grid-template-columns: repeat(var(--strip-cols), minmax(0, 1fr)); gap: var(--space-2); }
    @media (max-width: 1200px) { .strip { grid-template-columns: repeat(min(var(--strip-cols), 4), minmax(0, 1fr)); } }
    @media (max-width: 700px) {
      .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      /* An odd one out takes the row, rather than sitting half-width on its own. */
      .strip > :last-child:nth-child(odd) { grid-column: 1 / -1; }
    }
    button.kpi { font: inherit; text-align: start; cursor: pointer; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryStripComponent {
  readonly tiles = input<SummaryTile[]>([]);
  /** The filter tile in force, shown pressed. */
  readonly active = input<string | null>(null);
  /** Read out for the group: "Tenancies at a glance". */
  readonly label = input('Summary');
  /** A filter tile was pressed: its key, or null to clear. */
  readonly picked = output<string | null>();

  /** Leaves out tiles at zero: "0 part paid" says nothing, and the one pressed always stays. */
  readonly hideZero = input(false);
  readonly chips = input(false);

  readonly shown = computed(() => this.hideZero()
    ? this.tiles().filter((tile) => Number(tile.value) !== 0 || tile.key === this.active())
    : this.tiles());

  readonly columns = computed(() => Math.min(Math.max(this.shown().length, 1), 7));

  warn(tile: SummaryTile): boolean {
    return !!tile.act && Number(tile.value) > 0;
  }
}
