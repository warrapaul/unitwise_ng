import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RankedEntry } from '../models/stats.models';

/**
 * A short league table — top debtors, collection by building, tenants by county.
 *
 * No bars. A bar beside a figure that is already written out adds a second
 * encoding of the same number, and on a phone it took a third of the row's
 * width from the name it was describing. Rank is carried by the order and the
 * figure, which is what the reader is comparing anyway.
 *
 * Capped, too. This is a summary on a dashboard, not the list: showing five
 * and linking to the rest keeps the panel a fixed height, where an
 * unbounded one grew until it pushed everything below it off the screen.
 *
 * Rows link when the server sent a path, so "who owes the most" is one click
 * from the record.
 */
@Component({
  selector: 'app-stat-ranked',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (rows().length === 0) {
      <p class="muted">{{ emptyLabel() }}</p>
    } @else {
      <ul class="ranked">
        @for (row of rows(); track row.label) {
          <li class="ranked__row">
            <span class="ranked__name">
              @if (row.targetPath) {
                <a [routerLink]="row.targetPath">{{ row.label }}</a>
              } @else {
                {{ row.label }}
              }
              @if (row.subLabel) {
                <span class="ranked__sub">{{ row.subLabel }}</span>
              }
            </span>

            <span class="ranked__value">{{ row.display }}</span>
          </li>
        }
      </ul>

      @if (hidden() > 0) {
        <p class="ranked__more">
          <ng-content select="[more]" />
          <span class="muted">and {{ hidden() }} more</span>
        </p>
      }
    }
  `,
  styles: [`
    .ranked { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }

    .ranked__row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: baseline;
      gap: 0.6rem;
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.87rem;
    }

    .ranked__row:last-child { border-bottom: 0; }

    .ranked__name { display: grid; min-width: 0; }
    .ranked__name a { color: inherit; }
    .ranked__sub { font-size: 0.72rem; color: var(--text-muted); }

    .ranked__value { font-variant-numeric: tabular-nums; font-weight: 600; }

    .ranked__more {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
      margin: 0.5rem 0 0;
      font-size: 0.82rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatRankedComponent {
  readonly entries = input<RankedEntry[]>([]);
  readonly currency = input<string | null>(null);
  readonly emptyLabel = input('Nothing to show.');

  /** How many to show before deferring to the full list. */
  readonly limit = input(5);

  readonly hidden = computed(() => Math.max(0, (this.entries() ?? []).length - this.limit()));

  readonly rows = computed(() => {
    const entries = (this.entries() ?? []).slice(0, this.limit());
    // Amount where there is one, count otherwise — the two never mix in a list.
    const magnitude = (entry: RankedEntry) => Number(entry.amount ?? entry.count ?? 0);

    return entries.map((entry) => {
      const value = magnitude(entry);
      const isAmount = entry.amount !== null && entry.amount !== undefined;

      return {
        label: entry.label ?? '—',
        subLabel: entry.subLabel,
        targetPath: entry.targetPath,
        display: isAmount && this.currency()
          ? `${this.currency()} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : value.toLocaleString()
      };
    });
  });
}
