import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { formatMoney, formatPercent, monthKey, monthLabel, monthRange } from '../../../shared/utils/format.util';
import { BuildingStatsRow } from '../../stats/models/stats.models';
import { StatsService } from '../../stats/stats.service';
import { BillingCycleComponent } from './billing-cycle.component';

/**
 * A building's month on its own page: occupancy and money in one row, then the billing cycle with
 * its next step. The same stats row the dashboard lists for this building, so the two agree.
 * Someone without dashboard figures (no STATS_AGENCY_READ) still gets the billing cycle.
 */
@Component({
  selector: 'app-building-month',
  standalone: true,
  imports: [SectionCardComponent, BillingCycleComponent],
  template: `
    <app-section-card [title]="'This month · ' + monthName">
      @if (row(); as r) {
        <div class="kpi-grid">
          <div class="kpi">
            <span class="kpi__label">Occupancy</span>
            <span class="kpi__value">{{ pct(r.occupancyRate) }}</span>
            <span class="kpi__note">{{ r.occupied ?? 0 }} of {{ r.rooms ?? 0 }} rooms · {{ r.vacant ?? 0 }} vacant</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Expected</span>
            <span class="kpi__value">{{ money(r.rentExpected) }}</span>
            <span class="kpi__note">{{ r.activeTenants ?? 0 }} active tenant{{ r.activeTenants === 1 ? '' : 's' }}</span>
          </div>
          <div class="kpi kpi--good">
            <span class="kpi__label">Collected</span>
            <span class="kpi__value">{{ money(r.rentCollected) }}</span>
            <span class="kpi__note">{{ pct(r.collectionRate) }} of expected</span>
          </div>
          <div class="kpi" [class.kpi--bad]="+(r.rentOutstanding ?? 0) > 0">
            <span class="kpi__label">Outstanding</span>
            <span class="kpi__value">{{ money(r.rentOutstanding) }}</span>
            <span class="kpi__note">{{ r.roomsWithBalance ?? 0 }} room{{ r.roomsWithBalance === 1 ? '' : 's' }} with a balance</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Leases ending</span>
            <span class="kpi__value">{{ r.leasesExpiringIn30Days ?? 0 }}</span>
            <span class="kpi__note">In the next 30 days</span>
          </div>
          <div class="kpi">
            <span class="kpi__label">Open repairs</span>
            <span class="kpi__value">{{ r.openMaintenanceRequests ?? 0 }}</span>
            <span class="kpi__note">Not yet closed</span>
          </div>
        </div>
      }
      <app-billing-cycle [agencyId]="agencyId()" [buildingId]="buildingId()" [buildingName]="buildingName()" [row]="row()" />
    </app-section-card>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingMonthComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly buildingName = input<string | null>(null);

  private readonly stats = inject(StatsService);
  readonly row = signal<BuildingStatsRow | null>(null);
  readonly monthName = monthLabel(monthKey());

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.agencyId(), this.buildingId()];
      untracked(() => void this.load(agencyId, buildingId));
    });
  }

  private async load(agencyId: number, buildingId: number): Promise<void> {
    try {
      const breakdown = await firstValueFrom(this.stats.getAgencyBuildings(agencyId, { period: 'CUSTOM', ...monthRange(monthKey()), buildingId }));
      this.row.set(breakdown.buildings?.find((row) => row.buildingId === buildingId) ?? null);
    } catch {
      // No dashboard figures for this operator: the billing cycle still shows.
      this.row.set(null);
    }
  }

  money(value: number | string | null | undefined): string {
    return formatMoney(value, 'KES');
  }

  pct(value: number | string | null | undefined): string {
    return formatPercent(value);
  }
}
