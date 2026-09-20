import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatMetric } from '../models/stats.models';

/**
 * One figure, as the server described it.
 *
 * Label and value come from the metric — nothing here names a statistic, so a
 * metric the backend adds to a block renders correctly the first time it
 * appears.
 *
 * Movement against the previous month is deliberately not shown. The server
 * still sends it, but "↓ 4.2% vs previous" on a rent figure invited a reading
 * the number could not support: a month is a small sample, the comparison
 * moved on the calendar as much as on performance, and an arrow beside every
 * figure made the whole page look like it was reporting a trend. What an
 * operator opens this for is the figure itself.
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
      </p>
    } @else {
      <article class="stat-tile" [class.stat-tile--lead]="lead()">
        <p class="stat-tile__label">{{ metric().label || metric().key }}</p>
        <p class="stat-tile__value">{{ display() }}</p>
      </article>
    }
  `,
  styles: [`
    .stat-tile {
      display: grid;
      gap: 0.1rem;
      align-content: start;
      padding: 0.55rem 0.7rem;
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

    .stat-tile--lead .stat-tile__value { font-size: 1.45rem; }
    .stat-tile--lead .stat-tile__label { color: var(--primary); }

    .stat-tile__label {
      margin: 0;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .stat-tile__value {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }

    /* Label left, figure right. The two columns line up down the group, so
       the numbers can be compared by eye. */
    .stat-row {
      display: grid;
      grid-template-columns: 1fr auto;
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

    /*
     * Tighter again on a phone, so two tiles fit across a 360px screen rather
     * than one billboard per row.
     */
    @media (max-width: 560px) {
      .stat-tile { padding: 0.45rem 0.55rem; }
      .stat-tile__label { font-size: 0.72rem; }
      .stat-tile__value { font-size: 1.05rem; }
      .stat-tile--lead .stat-tile__value { font-size: 1.25rem; }
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
   * Kept so call sites need not change, and so the direction list stays the
   * one place that knows which way is good — nothing renders from it while
   * movement is hidden.
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

  private round(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}
