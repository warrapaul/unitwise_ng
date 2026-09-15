import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatTileComponent } from './stat-tile.component';
import { lowerIsBetter } from '../models/stat-direction.util';
import { StatMetric } from '../models/stats.models';

/**
 * A block of related figures: one leader, the rest as rows.
 *
 * Every group used to be a full-width panel holding a row of identically
 * boxed tiles. That gave a one-digit count the same visual weight as the
 * figure the section is named after, and left most of a wide screen empty —
 * so the page became a column of near-empty bands that all looked equally
 * important.
 *
 * The first metric is the group's headline and keeps its tile. The rest line
 * up beneath it as `label — value`, which reads faster precisely because it
 * is quieter, and lets the whole group sit in one column of a two-column
 * dashboard.
 */
@Component({
  selector: 'app-stat-group',
  standalone: true,
  imports: [SectionCardComponent, StatTileComponent],
  template: `
    <app-section-card [title]="title()" [subtitle]="subtitle()">
      <ng-content select="[actions]" ngProjectAs="[actions]" />

      <div class="group">
        @if (lead(); as headline) {
          <app-stat-tile
            [metric]="headline"
            [currency]="currencyFor(headline)"
            [lead]="true"
            [lowerIsBetter]="direction(headline)"
          />
        }

        @if (rest().length > 0) {
          <div class="group__rows">
            @for (metric of rest(); track metric.key || metric.label) {
              <app-stat-tile
                [metric]="metric"
                [currency]="currencyFor(metric)"
                [compact]="true"
                [lowerIsBetter]="direction(metric)"
              />
            }
          </div>
        }
      </div>

      <ng-content />
    </app-section-card>
  `,
  styles: [`
    .group {
      display: grid;
      grid-template-columns: minmax(8.5rem, 11rem) minmax(0, 1fr);
      gap: 0.5rem 1.15rem;
      align-items: start;
    }

    .group__rows { display: grid; align-content: start; }

    /* Narrow: the headline goes above its rows rather than shrinking beside
       them, because a squeezed tile stops being the thing you see first. */
    @media (max-width: 560px) {
      .group { grid-template-columns: 1fr; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatGroupComponent {
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly metrics = input.required<StatMetric[]>();
  /** From the response meta; applied only to amounts. */
  readonly currency = input<string | null>(null);

  readonly lead = computed(() => this.metrics()[0] ?? null);
  readonly rest = computed(() => this.metrics().slice(1));

  /** Whether a fall is the good news. Declared in one list, never guessed. */
  direction(metric: StatMetric): boolean | null {
    return lowerIsBetter(metric);
  }

  /**
   * Amounts get the currency; counts, rates and durations do not. The server
   * sends amounts as strings to keep their precision, which is what separates
   * them from a plain count.
   */
  currencyFor(metric: StatMetric): string | null {
    const isAmount = metric.unit == null
      && metric.denominator == null
      && (metric.changePoints === null || metric.changePoints === undefined)
      && typeof metric.value === 'string';

    return isAmount ? this.currency() : null;
  }
}
