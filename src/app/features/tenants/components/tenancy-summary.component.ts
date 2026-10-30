import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { SummaryStripComponent, SummaryTile } from '../../../shared/components/summary-strip/summary-strip.component';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { AgencyOverview, StatBlock, StatMetric } from '../../stats/models/stats.models';
import { StatsService } from '../../stats/stats.service';

/**
 * The tenancy pipeline in one row above the tenants table: who is living here, who is waiting
 * on the landlord, and the leases and applications that need a decision. A tenant count filters
 * the table to that status; a lease or application count opens its own list.
 *
 * Compact on purpose. It replaced a separate overview page of four tall cards that each led to
 * another page; here the counts sit beside the list they summarise.
 */
@Component({
  selector: 'app-tenancy-summary',
  standalone: true,
  imports: [SummaryStripComponent],
  template: `
    <app-summary-strip label="Tenancies at a glance" [tiles]="tiles()" [active]="activeStatus() || null"
                       (picked)="statusPicked.emit($event ?? '')" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenancySummaryComponent {
  /** The status the table is filtered to, so its tile shows as selected. */
  readonly activeStatus = input<string | null>(null);
  /** A tenant-status tile was pressed: filter to it, or '' to clear. */
  readonly statusPicked = output<string>();

  private readonly stats = inject(StatsService);
  private readonly context = inject(ActiveContextService);
  private readonly overview = signal<AgencyOverview | null>(null);

  readonly tiles = computed<SummaryTile[]>(() => {
    const o = this.overview();
    if (!o) {
      return [];
    }
    return [
      { key: 'ACTIVE', label: 'Active', value: count(o.tenants, 'active'), filter: true },
      { key: 'PENDING', label: 'Pending my review', value: count(o.tenants, 'pendingVerification'), filter: true, act: true },
      { key: 'VERIFIED', label: 'Verified, not moved in', value: count(o.tenants, 'verifiedAwaitingRoom'), filter: true },
      { key: 'NOTICE_GIVEN', label: 'Notice given', value: count(o.tenants, 'noticeGiven'), filter: true, act: true },
      { key: 'leases-sign', label: 'Leases to sign', value: count(o.leases, 'pendingSignature'), route: RoutePaths.leases, act: true },
      { key: 'leases-ending', label: 'Leases ending in 30 days', value: count(o.leases, 'expiringIn30Days'), route: RoutePaths.leases, act: true },
      { key: 'applications', label: 'Applications', value: count(o.tenants, 'applicationsPending'), route: RoutePaths.roomApplications, act: true }
    ];
  });

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.context.agencyId(), this.context.buildingId()];
      untracked(() => void this.load(agencyId, buildingId));
    });
  }

  private async load(agencyId: number | null, buildingId: number | null): Promise<void> {
    if (agencyId === null) {
      this.overview.set(null);
      return;
    }
    try {
      this.overview.set(await firstValueFrom(this.stats.getAgencyOverview(agencyId, { buildingId })));
    } catch {
      // The counts are a convenience; the table below still answers without them.
      this.overview.set(null);
    }
  }
}

function count(block: StatBlock | null | undefined, key: string): number {
  const value = Number((block?.[key] as StatMetric | undefined)?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}
