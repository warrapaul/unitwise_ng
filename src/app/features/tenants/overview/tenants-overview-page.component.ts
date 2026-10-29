import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatPercent } from '../../../shared/utils/format.util';
import { AgencyOverview, RankedEntry, StatBlock, StatMetric } from '../../stats/models/stats.models';
import { StatsService } from '../../stats/stats.service';

interface Fact {
  label: string;
  value: string;
  /** Something to act on: drawn in the warning colour when above zero. */
  act?: boolean;
}

/**
 * Tenants & leases at a glance: one card per part of the tenancy (people, agreements,
 * applications, repairs), each with the few counts that lead somewhere and one link to the full
 * list. A lease awaiting signature is counted as a current lease, so the card never reads
 * "0 leases" beside "2 awaiting signature".
 */
@Component({
  selector: 'app-tenants-overview-page',
  standalone: true,
  imports: [RouterLink, ContextGuardComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, PermissionGateComponent],
  template: `
    <app-context-guard [requireBuilding]="false" action="to see tenants and leases">
      <section class="stack">
        <header class="page-head">
          <div class="page-head__title">
            <h1>Tenants & leases</h1>
            <p>{{ context.active().buildingName || 'All buildings' }}</p>
          </div>
          <app-permission-gate [permissions]="['TENANT_CREATE', 'BUILDING_TENANT_MANAGE']">
            <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.tenantCreate">Add tenant</a>
          </app-permission-gate>
        </header>

        @if (loading() && !overview()) {
          <app-loading-state label="Loading tenancies..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (overview()) {
          <div class="cards">
            @for (card of cards(); track card.title) {
              <app-section-card [title]="card.title">
                <dl class="facts">
                  @for (fact of card.facts; track fact.label) {
                    <div [class.act]="fact.act && fact.value !== '0'"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
                  }
                </dl>
                <a class="btn btn-secondary btn-sm" [routerLink]="card.route">{{ card.link }}</a>
              </app-section-card>
            }
          </div>

          <app-section-card title="Leases ending in the next 90 days">
            @if (expiries().length > 0) {
              <div class="table-scroll">
                <table class="table table--packed">
                  <thead><tr><th>Tenant</th><th>Room</th><th class="num">Ends in</th></tr></thead>
                  <tbody>
                    @for (lease of expiries(); track lease.id) {
                      <tr>
                        <td><a [routerLink]="RoutePaths.leaseDetail(lease.id!)">{{ lease.label }}</a></td>
                        <td>{{ lease.subLabel }}</td>
                        <td class="num" [class.soon]="(lease.count ?? 0) <= 30">{{ lease.count }} day{{ lease.count === 1 ? '' : 's' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="muted">No lease ends in the next 90 days.</p>
            }
          </app-section-card>
        }
      </section>
    </app-context-guard>
  `,
  styles: [`
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr)); gap: var(--space-4); }
    .cards > * { min-width: 0; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); gap: var(--space-3); margin: 0; }
    .facts div { display: grid; gap: 0.1rem; }
    .facts dt { font-size: var(--text-xs); color: var(--text-muted); }
    .facts dd { margin: 0; font-size: var(--text-lg); font-weight: 700; font-variant-numeric: tabular-nums; }
    .facts .act dd { color: var(--warning); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .soon { color: var(--warning); font-weight: 600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantsOverviewPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly stats = inject(StatsService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly overview = signal<AgencyOverview | null>(null);

  readonly expiries = computed<RankedEntry[]>(() => (this.overview()?.leases?.['upcomingExpiries'] as RankedEntry[] | undefined) ?? []);

  readonly cards = computed(() => {
    const o = this.overview();
    const v = (block: StatBlock | null | undefined, key: string) => value(block, key);
    return [
      {
        title: 'Tenants', link: 'View tenants', route: RoutePaths.tenants,
        facts: [
          { label: 'Active', value: v(o?.tenants, 'active') },
          { label: 'Awaiting review', value: v(o?.tenants, 'pendingVerification'), act: true },
          { label: 'Verified, no room', value: v(o?.tenants, 'verifiedAwaitingRoom'), act: true },
          { label: 'Invitations open', value: v(o?.tenants, 'unclaimedInvitations') },
          { label: 'On notice', value: v(o?.tenants, 'noticeGiven'), act: true }
        ] as Fact[]
      },
      {
        title: 'Leases', link: 'View leases', route: RoutePaths.leases,
        facts: [
          { label: 'Current', value: v(o?.leases, 'current') },
          { label: 'Awaiting signature', value: v(o?.leases, 'pendingSignature'), act: true },
          { label: 'Signed and active', value: v(o?.leases, 'active') },
          { label: 'Drafts', value: v(o?.leases, 'draft') },
          { label: 'Ending in 30 days', value: v(o?.leases, 'expiringIn30Days'), act: true }
        ] as Fact[]
      },
      {
        title: 'Applications', link: 'View applications', route: RoutePaths.roomApplications,
        facts: [
          { label: 'Waiting for a decision', value: v(o?.tenants, 'applicationsPending'), act: true },
          { label: 'Vacant rooms', value: v(o?.occupancy, 'vacant') },
          { label: 'Occupancy', value: formatPercent((o?.occupancy?.['occupancyRate'] as StatMetric | undefined)?.value) }
        ] as Fact[]
      },
      {
        title: 'Repairs', link: 'View maintenance', route: RoutePaths.maintenance,
        facts: [
          { label: 'Open', value: v(o?.maintenance, 'open'), act: true },
          { label: 'Urgent', value: v(o?.maintenance, 'urgent'), act: true },
          { label: 'Rooms under repair', value: v(o?.maintenance, 'roomsNeedingRepair') }
        ] as Fact[]
      }
    ];
  });

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.context.agencyId(), this.context.buildingId()];
      untracked(() => {
        if (agencyId !== null) {
          void this.load(agencyId, buildingId);
        }
      });
    });
  }

  reload(): void {
    const agencyId = this.context.agencyId();
    if (agencyId !== null) {
      void this.load(agencyId, this.context.buildingId());
    }
  }

  private async load(agencyId: number, buildingId: number | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.overview.set(await firstValueFrom(this.stats.getAgencyOverview(agencyId, { buildingId, topN: 10 })));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

function value(block: StatBlock | null | undefined, key: string): string {
  const metric = block?.[key] as StatMetric | undefined;
  return metric?.value === null || metric?.value === undefined ? '0' : String(metric.value);
}
