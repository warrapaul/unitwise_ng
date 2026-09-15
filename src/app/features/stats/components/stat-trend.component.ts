import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TrendSeries } from '../models/stats.models';

/**
 * A series over time, as columns.
 *
 * One hue for magnitude, never the status trio — the three status tokens sit
 * within ΔE 7.1 of each other and cannot be told apart on hue alone, so colour
 * here carries size and nothing else. Identity is carried by the axis labels,
 * and the whole series is restated as a sentence for anyone who cannot see the
 * columns at all.
 */
@Component({
  selector: 'app-stat-trend',
  standalone: true,
  template: `
    @if (points().length === 0) {
      <p class="muted">No data for this period.</p>
    } @else {
      <figure class="trend" role="img" [attr.aria-label]="summary()">
        <div class="trend__plot">
          @for (point of points(); track point.label) {
            <div class="trend__col" [title]="point.label + ': ' + point.display">
              <div class="trend__track">
                <div class="trend__bar" [style.height.%]="point.share"></div>
              </div>
              <span class="trend__tick">{{ point.label }}</span>
            </div>
          }
        </div>

        <figcaption class="muted">
          {{ series().valueLabel || 'Value' }}@if (latest(); as last) {
            <span> · latest {{ last }}</span>
          }
        </figcaption>
      </figure>
    }
  `,
  styles: [`
    .trend { margin: 0; display: grid; gap: 0.5rem; }

    .trend__plot {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 0.35rem;
      align-items: end;
    }

    .trend__col { display: grid; gap: 0.35rem; justify-items: center; min-width: 0; }

    /* A percentage height needs a track with a definite height to resolve against. */
    .trend__track { display: flex; align-items: flex-end; height: 6rem; width: 100%; }

    .trend__bar {
      width: 100%;
      min-height: 2px;
      border-radius: 4px 4px 2px 2px;
      background: var(--primary);
      opacity: 0.85;
    }

    .trend__tick {
      font-size: 0.62rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    figcaption { font-size: 0.74rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatTrendComponent {
  readonly series = input.required<TrendSeries>();
  readonly currency = input<string | null>(null);

  private readonly values = computed(() =>
    (this.series().points ?? []).map((point) => ({
      label: point.label || point.bucket || '',
      value: Number(point.value ?? 0)
    })).filter((point) => Number.isFinite(point.value)));

  readonly points = computed(() => {
    const values = this.values();
    const max = Math.max(...values.map((point) => point.value), 0);

    return values.map((point) => ({
      label: point.label,
      display: this.format(point.value),
      // Zero max would divide by zero; a flat series shows as empty tracks.
      share: max > 0 ? Math.round((point.value / max) * 100) : 0
    }));
  });

  readonly latest = computed(() => {
    const values = this.values();
    return values.length > 0 ? this.format(values[values.length - 1].value) : null;
  });

  /** What a screen reader gets instead of the columns. */
  readonly summary = computed(() => {
    const values = this.values();
    if (values.length === 0) {
      return 'No data';
    }

    const first = values[0];
    const last = values[values.length - 1];
    const direction = last.value > first.value ? 'rising' : last.value < first.value ? 'falling' : 'flat';

    return `${this.series().label || 'Trend'}: ${direction} from ${this.format(first.value)} `
      + `in ${first.label} to ${this.format(last.value)} in ${last.label}, ${values.length} periods.`;
  });

  private format(value: number): string {
    const currency = this.currency();
    const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
    return currency ? `${currency} ${rounded.toLocaleString()}` : rounded.toLocaleString();
  }
}
