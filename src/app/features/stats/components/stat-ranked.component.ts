import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RankedEntry } from '../models/stats.models';

/**
 * A short league table — top debtors, collection by building, tenants by county.
 *
 * The bar carries magnitude only; the name and the figure carry identity, which
 * is why the bar is one hue and unlabelled. Rows link when the server sent a
 * path, so "who owes the most" is one click from the record.
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

            <span class="ranked__track" aria-hidden="true">
              <span class="ranked__bar" [style.width.%]="row.share"></span>
            </span>

            <span class="ranked__value">{{ row.display }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    .ranked { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }

    .ranked__row {
      display: grid;
      grid-template-columns: minmax(6rem, 1.2fr) minmax(3rem, 1fr) auto;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.87rem;
    }

    .ranked__name { display: grid; min-width: 0; }
    .ranked__name a { color: inherit; }
    .ranked__sub { font-size: 0.72rem; color: var(--text-muted); }

    .ranked__track {
      height: 0.45rem;
      border-radius: 999px;
      background: var(--surface-2);
      overflow: hidden;
    }

    .ranked__bar { display: block; height: 100%; background: var(--primary); opacity: 0.75; }

    .ranked__value { font-variant-numeric: tabular-nums; font-weight: 600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatRankedComponent {
  readonly entries = input<RankedEntry[]>([]);
  readonly currency = input<string | null>(null);
  readonly emptyLabel = input('Nothing to show.');

  readonly rows = computed(() => {
    const entries = this.entries() ?? [];
    // Amount where there is one, count otherwise — the two never mix in a list.
    const magnitude = (entry: RankedEntry) => Number(entry.amount ?? entry.count ?? 0);
    const max = Math.max(...entries.map(magnitude), 0);

    return entries.map((entry) => {
      const value = magnitude(entry);
      const isAmount = entry.amount !== null && entry.amount !== undefined;

      return {
        label: entry.label ?? '—',
        subLabel: entry.subLabel,
        targetPath: entry.targetPath,
        display: isAmount && this.currency()
          ? `${this.currency()} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : value.toLocaleString(),
        share: max > 0 ? Math.round((value / max) * 100) : 0
      };
    });
  });
}
