import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatMetric } from '../models/stats.models';

/**
 * One figure, as the server described it.
 *
 * Label, value and movement all come from the metric — nothing here names a
 * statistic, so a metric the backend adds to a block renders correctly the first
 * time it appears. Movement is shown only where the server sent a comparison:
 * an arrow with nothing behind it is worse than no arrow.
 */
@Component({
  selector: 'app-stat-tile',
  standalone: true,
  template: `
    @if (compact()) {
      <!--
        A supporting figure. A box around the number 3 is chrome carrying no
        information, and boxing every metric equally makes the reader hunt for
        the one that matters. The leader is boxed; its company is a row.
      -->
      <p class="stat-row">
        <span class="stat-row__label">{{ metric().label || metric().key }}</span>
        <span class="stat-row__value">{{ display() }}</span>
        @if (change(); as delta) {
          <span
            class="stat-row__delta"
            [class.stat-tile__delta--good]="delta.good"
            [class.stat-tile__delta--bad]="delta.good === false"
          >
            <span aria-hidden="true">{{ delta.up ? '↑' : '↓' }}</span>
            {{ delta.text }}
          </span>
        }
      </p>
    } @else {
      <article class="stat-tile" [class.stat-tile--lead]="lead()">
        <p class="stat-tile__label">{{ metric().label || metric().key }}</p>
        <p class="stat-tile__value">{{ display() }}</p>

        @if (change(); as delta) {
          <p
            class="stat-tile__delta"
            [class.stat-tile__delta--good]="delta.good"
            [class.stat-tile__delta--bad]="delta.good === false"
          >
            <span aria-hidden="true">{{ delta.up ? '↑' : '↓' }}</span>
            {{ delta.text }}
          </p>
        }
      </article>
    }
  `,
  styles: [`
    .stat-tile {
      display: grid;
      gap: 0.15rem;
      align-content: start;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    /*
     * The figure the section is about. A row of identical tiles has no lead, so
     * six equally-sized numbers make the reader find the important one for
     * themselves every time they open the page.
     */
    .stat-tile--lead {
      border-color: var(--primary-soft);
      background: var(--primary-tint);
    }

    .stat-tile--lead .stat-tile__value { font-size: 1.7rem; }
    .stat-tile--lead .stat-tile__label { color: var(--primary); }

    .stat-tile__label {
      margin: 0;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .stat-tile__value {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }

    .stat-tile__delta {
      margin: 0;
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    /*
     * Colour says good or bad, never up or down — a rise in arrears and a rise
     * in collections are the same arrow and opposite news. Which direction is
     * good is declared per tile by the dashboard that placed it, so this is a
     * stated fact rather than a guess from the metric's name. Undeclared tiles
     * stay grey.
     */
    .stat-tile__delta--good { color: var(--success); }
    .stat-tile__delta--bad { color: var(--danger); }

    /* Label left, figure right, movement after it. The three columns line up
       down the group, so the numbers can be compared by eye. */
    .stat-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: baseline;
      gap: 0.5rem 0.75rem;
      margin: 0;
      padding: 0.3rem 0;
      border-bottom: 1px solid var(--border-subtle, var(--border));
      font-size: 0.88rem;
    }

    .stat-row:last-child { border-bottom: 0; }

    .stat-row__label {
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stat-row__value {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .stat-row__delta {
      min-width: 5.5rem;
      text-align: right;
      font-size: 0.76rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    @media (max-width: 560px) {
      .stat-row { grid-template-columns: 1fr auto; }
      .stat-row__delta { grid-column: 2; text-align: right; min-width: 0; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatTileComponent {
  readonly metric = input.required<StatMetric>();
  /** Prefixed to amounts; comes from the response's meta. */
  readonly currency = input<string | null>(null);

  /** The figure its section is about, given size and the accent. One per group. */
  readonly lead = input(false);

  /** Render as a label:value row rather than a box. For supporting figures. */
  readonly compact = input(false);

  /**
   * Whether a fall is the good news — arrears, overdue, failed deliveries.
   * Left unset the movement is shown without a verdict, which is the honest
   * default for a figure that is neither.
   */
  readonly lowerIsBetter = input<boolean | null>(null);

  readonly display = computed(() => {
    const metric = this.metric();
    const value = metric.value;

    if (value === null || value === undefined || value === '') {
      return '—';
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return String(value);
    }

    // A rate carries a denominator or moves in points; either way it is a percent.
    if (metric.changePoints !== undefined && metric.changePoints !== null || metric.denominator != null) {
      return `${this.round(numeric)}%`;
    }

    if (metric.unit) {
      return `${this.round(numeric)} ${metric.unit.toLowerCase()}`;
    }

    // Amounts are the ones with fractional parts; counts are whole.
    return Number.isInteger(numeric) && !this.currency()
      ? numeric.toLocaleString()
      : `${this.currency() ? this.currency() + ' ' : ''}${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  });

  readonly change = computed(() => {
    const metric = this.metric();
    const points = metric.changePoints;
    const percent = metric.changePercent;

    if (points !== null && points !== undefined) {
      const value = Number(points);
      return Number.isFinite(value) && value !== 0
        ? { up: value > 0, good: this.verdict(value), text: `${Math.abs(value).toFixed(1)} pts vs previous` }
        : null;
    }

    if (percent === null || percent === undefined) {
      return null;
    }

    const value = Number(percent);
    return Number.isFinite(value) && value !== 0
      ? { up: value > 0, good: this.verdict(value), text: `${Math.abs(value).toFixed(1)}% vs previous` }
      : null;
  });

  /** `null` where the dashboard did not say which direction is good. */
  private verdict(change: number): boolean | null {
    const lowerIsBetter = this.lowerIsBetter();
    if (lowerIsBetter === null) {
      return null;
    }

    return lowerIsBetter ? change < 0 : change > 0;
  }

  private round(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}
