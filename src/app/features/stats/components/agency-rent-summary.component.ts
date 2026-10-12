import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { StatsService } from '../stats.service';
import { RentCollectionStats, StatMetric } from '../models/stats.models';

/**
 * This month's rent for an agency, compact enough to sit inside the overview card:
 * how much is in (figure, percent, bar) and the three numbers that explain it.
 * The full breakdowns live on the rent pages it links to.
 */
@Component({
  selector: 'app-agency-rent-summary',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (rent(); as collection) {
      <section class="rent" aria-label="Rent this month">
        <div class="rent__head">
          <span class="rent__label">Rent · {{ monthLabel(collection.billingMonth) }}</span>
          <a class="rent__link" [routerLink]="RoutePaths.rentPayments">All payments</a>
        </div>
        <div class="rent__figure">
          <div>
            <strong class="rent__amount">KES {{ money(value(collection.collected)) }}</strong>
            <span class="muted">of KES {{ money(value(collection.expected)) }} collected</span>
          </div>
          <span class="rent__rate" [class.rent__rate--full]="rate() >= 100">{{ rate() }}%</span>
        </div>
        <div class="rent__bar" role="progressbar" [attr.aria-valuenow]="rate()" aria-valuemin="0" aria-valuemax="100">
          <span [style.width.%]="rate() > 100 ? 100 : rate()"></span>
        </div>
        <dl class="rent__facts">
          <div><dt>Outstanding</dt><dd>KES {{ money(value(collection.outstanding)) }}</dd></div>
          <div [class.bad]="value(collection.overdue) > 0"><dt>Overdue</dt><dd>KES {{ money(value(collection.overdue)) }}</dd></div>
          <div [class.bad]="value(collection.tenantsOverdue) > 0">
            <dt>Behind</dt>
            <dd>
              {{ value(collection.tenantsOverdue) }} {{ value(collection.tenantsOverdue) === 1 ? 'tenant' : 'tenants' }}
              @if (value(collection.tenantsOverdue) > 0) { · <a [routerLink]="RoutePaths.rentArrears">See who</a> }
            </dd>
          </div>
        </dl>
      </section>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .rent { display: grid; gap: 0.5rem; padding: 0.9rem 1rem; border-radius: 14px; background: var(--surface-2); }
    .rent__head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
    .rent__label { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .rent__link { font-size: 0.84rem; font-weight: 600; color: var(--primary-strong); }
    .rent__figure { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.75rem; }
    .rent__figure > div { display: grid; gap: 0.05rem; }
    .rent__amount { font-size: 1.6rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .rent__figure .muted { font-size: 0.85rem; }
    .rent__rate { font-size: 1.25rem; font-weight: 800; color: var(--warning); font-variant-numeric: tabular-nums; }
    .rent__rate--full { color: var(--success); }
    .rent__bar { height: 0.5rem; border-radius: 999px; background: var(--surface); overflow: hidden; }
    .rent__bar span { display: block; height: 100%; border-radius: 999px; background: var(--primary); }
    .rent__facts { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem 0.75rem; }
    .rent__facts div { display: grid; gap: 0.05rem; min-width: 0; }
    .rent__facts dt { font-size: 0.75rem; color: var(--text-muted); }
    .rent__facts dd { margin: 0; font-weight: 700; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
    .rent__facts dd a { font-weight: 600; color: var(--primary-strong); }
    .bad dd { color: var(--danger); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyRentSummaryComponent {
  readonly RoutePaths = RoutePaths;
  readonly agencyId = input.required<number>();

  private readonly stats = inject(StatsService);
  readonly rent = signal<RentCollectionStats | null>(null);

  readonly rate = computed(() => {
    const collection = this.rent();
    const expected = this.value(collection?.expected);
    return expected > 0 ? Math.round(this.value(collection?.collected) * 100 / expected) : 0;
  });

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      untracked(() => void this.load(agencyId));
    });
  }

  private async load(agencyId: number): Promise<void> {
    try {
      this.rent.set(await firstValueFrom(this.stats.getAgencyRent(agencyId)));
    } catch {
      // A summary that cannot load is left out; the rent pages still answer.
      this.rent.set(null);
    }
  }

  value(metric: StatMetric | null | undefined): number {
    const parsed = Number(metric?.value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  money(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  monthLabel(value: string | null | undefined): string {
    if (!value) {
      return 'this month';
    }
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}
