import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TrendSeries } from '../models/stats.models';
import { formatMoney } from '../../../shared/utils/format.util';

interface Bar {
  label: string;
  expected: number;
  collected: number;
}

/** Plot geometry in viewBox units; the SVG scales to its container. */
const WIDTH = 600;
const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 52 };

/**
 * Rent billed against rent collected, month by month, as paired columns: "how much, per period"
 * is a column question. Collected wears the primary hue; expected a recessive second hue behind
 * it, so the gap between the two is what the eye reads. One axis, a legend, and a tooltip per
 * month with both figures.
 *
 * Until there is a billed month to plot, sample figures stand in so the landlord can see what the
 * chart will show, and the chart says so in a badge and in its caption (skills §33.3).
 */
@Component({
  selector: 'app-rent-trend-chart',
  standalone: true,
  template: `
    <figure class="chart" [attr.aria-label]="summary()" role="img">
      <div class="chart__legend">
        <span><i class="swatch swatch--expected"></i>Expected</span>
        <span><i class="swatch swatch--collected"></i>Collected</span>
        @if (sample()) { <span class="sample-badge">Sample data</span> }
      </div>
      <div class="chart__plot" (mouseleave)="hover.set(null)">
        <svg [attr.viewBox]="'0 0 ' + width + ' ' + height">
          @for (tick of ticks(); track tick.value) {
            <line class="grid" [attr.x1]="pad.left" [attr.x2]="width - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
            <text class="axis" [attr.x]="pad.left - 6" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.text }}</text>
          }
          @for (bar of geometry(); track bar.label; let i = $index) {
            <rect class="hit" [attr.x]="bar.slotX" [attr.y]="pad.top" [attr.width]="bar.slotW" [attr.height]="plotH"
                  (mouseenter)="hover.set(i)" (focus)="hover.set(i)" tabindex="0" [attr.aria-label]="bar.aria" />
            <path class="bar bar--expected" [attr.d]="bar.expectedPath" />
            <path class="bar bar--collected" [attr.d]="bar.collectedPath" />
            <text class="axis" [attr.x]="bar.slotX + bar.slotW / 2" [attr.y]="height - 8" text-anchor="middle">{{ bar.label }}</text>
          }
        </svg>
        @if (hovered(); as tip) {
          <div class="tip" [style.left.%]="tip.leftPct">
            <strong>{{ tip.label }}</strong>
            <span>Expected {{ money(tip.expected) }}</span>
            <span>Collected {{ money(tip.collected) }}</span>
          </div>
        }
      </div>
      <figcaption class="muted">
        @if (sample()) { No billed months yet: these are sample figures, not your rent. }
        @else { Last {{ bars().length }} months, rent and charges billed against what was paid. }
      </figcaption>
    </figure>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .chart { margin: 0; display: grid; gap: var(--space-2); }
    .chart__legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); font-size: var(--text-sm); }
    .chart__legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
    .swatch { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: 3px; }
    .swatch--expected { background: var(--chart-secondary); }
    .swatch--collected { background: var(--chart-primary); }
    .chart__plot { position: relative; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    .grid { stroke: var(--chart-grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .axis { fill: var(--text-muted); font-size: 13px; }
    .bar--expected { fill: var(--chart-secondary); opacity: 0.55; }
    .bar--collected { fill: var(--chart-primary); }
    .hit { fill: transparent; cursor: default; outline: none; }
    .hit:hover, .hit:focus-visible { fill: var(--primary-tint); opacity: 0.6; }
    .tip { position: absolute; top: 0; transform: translateX(-50%); display: grid; gap: 0.1rem; padding: 0.4rem 0.6rem;
           border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-md);
           font-size: var(--text-xs); white-space: nowrap; pointer-events: none; }
    figcaption { font-size: var(--text-xs); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentTrendChartComponent {
  readonly series = input<TrendSeries | null | undefined>(null);
  readonly currency = input('KES');

  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly pad = PAD;
  readonly plotH = HEIGHT - PAD.top - PAD.bottom;
  readonly hover = signal<number | null>(null);

  private readonly real = computed<Bar[]>(() => (this.series()?.points ?? []).map((point) => ({
    label: (point.label ?? '').split(' ')[0],
    expected: Number(point.value ?? 0) || 0,
    collected: Number(point.secondaryValue ?? 0) || 0
  })));

  /** Nothing billed in any month: show the sample instead of a row of empty slots. */
  readonly sample = computed(() => !this.real().some((bar) => bar.expected > 0 || bar.collected > 0));

  readonly bars = computed<Bar[]>(() => this.sample() ? sampleBars(this.real().map((bar) => bar.label)) : this.real());

  private readonly max = computed(() => niceMax(Math.max(...this.bars().map((bar) => Math.max(bar.expected, bar.collected)), 0)));

  readonly ticks = computed(() => [0, 0.5, 1].map((share) => {
    const value = this.max() * share;
    return { value, y: PAD.top + this.plotH * (1 - share), text: compact(value) };
  }));

  readonly geometry = computed(() => {
    const bars = this.bars();
    const slotW = (WIDTH - PAD.left - PAD.right) / Math.max(bars.length, 1);
    const barW = Math.min(22, slotW * 0.3);
    const gap = 2;
    return bars.map((bar, index) => {
      const slotX = PAD.left + index * slotW;
      const centre = slotX + slotW / 2;
      return {
        label: bar.label,
        slotX,
        slotW,
        expectedPath: column(centre - gap / 2 - barW, barW, this.y(bar.expected)),
        collectedPath: column(centre + gap / 2, barW, this.y(bar.collected)),
        aria: `${bar.label}: expected ${this.money(bar.expected)}, collected ${this.money(bar.collected)}`
      };
    });
  });

  readonly hovered = computed(() => {
    const index = this.hover();
    const bars = this.bars();
    if (index === null || !bars[index]) {
      return null;
    }
    const slotW = (WIDTH - PAD.left - PAD.right) / bars.length;
    return { ...bars[index], leftPct: ((PAD.left + slotW * (index + 0.5)) / WIDTH) * 100 };
  });

  readonly summary = computed(() => {
    const prefix = this.sample() ? 'Sample data. ' : '';
    return prefix + this.bars().map((bar) => `${bar.label}: expected ${this.money(bar.expected)}, collected ${this.money(bar.collected)}`).join('; ');
  });

  money(value: number): string {
    return formatMoney(value, this.currency());
  }

  private y(value: number): number {
    const max = this.max();
    return PAD.top + this.plotH * (1 - (max > 0 ? value / max : 0));
  }
}

/** A column rising from the baseline with a 4px rounded top; a zero is a 1px stub so the month still reads. */
function column(x: number, w: number, top: number): string {
  const base = HEIGHT - PAD.bottom;
  const h = Math.max(base - top, 1);
  const r = Math.min(4, w / 2, h);
  const y = base - h;
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`;
}

function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / step) * step;
}

function compact(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return String(Math.round(value));
}

/** Plausible figures for an empty chart, over the months the series names (or the last six). */
function sampleBars(labels: string[]): Bar[] {
  const months = labels.length > 0 ? labels : lastMonths(6);
  const expected = [42000, 42000, 45500, 45500, 48000, 48000];
  const collected = [39500, 41000, 40200, 44800, 46100, 31000];
  return months.map((label, index) => ({
    label,
    expected: expected[index % expected.length],
    collected: collected[index % collected.length]
  }));
}

function lastMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) =>
    new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1).toLocaleDateString(undefined, { month: 'short' }));
}
