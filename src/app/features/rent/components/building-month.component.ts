import { RoutePaths } from '../../../core/routes/route-paths';
import { RouterLink } from '@angular/router';
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
  imports: [SectionCardComponent, BillingCycleComponent, RouterLink],
  template: `
    <app-section-card [title]="'This month · ' + monthName">
      @if (row(); as r) {
        <!-- Each tile opens the list it counts; colour only where something needs attention; zeros dimmed. -->
        <div class="kpi-grid">
          <a class="kpi" [routerLink]="RoutePaths.rentRooms">
            <span class="kpi__label">Occupancy</span>
            <span class="kpi__value">{{ pct(r.occupancyRate) }}</span>
            <span class="kpi__note">{{ r.occupied ?? 0 }} of {{ r.rooms ?? 0 }} rooms · {{ r.vacant ?? 0 }} vacant</span>
          </a>
          <a class="kpi" [class.kpi--zero]="!+(r.rentExpected ?? 0)" [routerLink]="RoutePaths.rentArrears">
            <span class="kpi__label">Expected</span>
            <span class="kpi__value">{{ money(r.rentExpected) }}</span>
            <span class="kpi__note">{{ r.activeTenants ?? 0 }} active tenant{{ r.activeTenants === 1 ? '' : 's' }}</span>
          </a>
          <a class="kpi" [class.kpi--zero]="!+(r.rentCollected ?? 0)" [routerLink]="RoutePaths.rentPayments">
            <span class="kpi__label">Collected</span>
            <span class="kpi__value">{{ money(r.rentCollected) }}</span>
            <span class="kpi__note">{{ pct(r.collectionRate) }} of expected</span>
          </a>
          <a class="kpi" [class.kpi--bad]="+(r.rentOutstanding ?? 0) > 0" [class.kpi--zero]="!+(r.rentOutstanding ?? 0)" [routerLink]="RoutePaths.rentArrears">
            <span class="kpi__label">Balance</span>
            <span class="kpi__value">{{ money(r.rentOutstanding) }}</span>
            <span class="kpi__note">{{ r.roomsWithBalance ?? 0 }} room{{ r.roomsWithBalance === 1 ? '' : 's' }} with a balance</span>
          </a>
          <a class="kpi" [class.kpi--zero]="!(r.leasesExpiringIn30Days ?? 0)" [routerLink]="RoutePaths.leases">
            <span class="kpi__label">Leases ending</span>
            <span class="kpi__value">{{ r.leasesExpiringIn30Days ?? 0 }}</span>
            <span class="kpi__note">In the next 30 days</span>
          </a>
          <a class="kpi" [class.kpi--zero]="!(r.openMaintenanceRequests ?? 0)" [routerLink]="RoutePaths.maintenance">
            <span class="kpi__label">Open repairs</span>
            <span class="kpi__value">{{ r.openMaintenanceRequests ?? 0 }}</span>
            <span class="kpi__note">Not yet closed</span>
          </a>
        </div>
      }
      <app-billing-cycle [agencyId]="agencyId()" [buildingId]="buildingId()" [buildingName]="buildingName()" [row]="row()" />
    </app-section-card>
  `,
  // Six tiles: auto-fit leaves one alone on a second row at some widths; three columns always pair up.
  styles: [`@media (min-width: 701px) { .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingMonthComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly buildingName = input<string | null>(null);
  readonly RoutePaths = RoutePaths;

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
