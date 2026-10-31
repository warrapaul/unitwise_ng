import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
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
import { formatMoney, formatPercent, monthKey, monthLabel, monthRange } from '../../../shared/utils/format.util';
import { BuildingStatsRow, RentCollectionStats, StatMetric } from '../../stats/models/stats.models';
import { StatsService } from '../../stats/stats.service';
import { BillingCycleComponent } from '../components/billing-cycle.component';

/**
 * Rent & billing opens here: the month as a workflow rather than a list of pages. The figures
 * first, then each building's month as its five steps (bills, readings and adjustments, confirm,
 * payments, balances) with the next action, then who owes and for how long.
 *
 * Every amount is the stats endpoint's, which computes balances with the same calculator as the
 * room's month record and the arrears pages; nothing here is summed in the browser.
 */
@Component({
  selector: 'app-rent-overview-page',
  standalone: true,
  imports: [RowLinkDirective, ContextScopeNoticeComponent, RouterLink, ContextGuardComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent,
    PermissionGateComponent, BillingCycleComponent],
  template: `
    <app-context-guard [requireBuilding]="false" action="to see rent and billing">
      <section class="stack">
        <header class="page-head">
          <div class="page-head__title">
            <h1>Rent & billing</h1>
            <p>{{ monthName() }} · {{ context.active().buildingName || 'All buildings' }}</p>
          </div>
          <div class="page-head__filters">
            <label class="sr-only" for="rent-month">Month</label>
            <input id="rent-month" type="month" [value]="month()" (change)="month.set($any($event.target).value || thisMonth)">
          </div>
          <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
            <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
          </app-permission-gate>
        </header>
        <app-context-scope-notice noun="rent figures" />

        @if (loading() && !rent()) {
          <app-loading-state label="Loading the month..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (rent(); as r) {
          <div class="kpi-grid">
            <a class="kpi" [routerLink]="RoutePaths.rentArrears">
              <span class="kpi__label">Expected</span>
              <span class="kpi__value">{{ money(r.expected) }}</span>
              <span class="kpi__note">Rent and charges billed</span>
            </a>
            <a class="kpi kpi--good" [routerLink]="RoutePaths.rentPayments">
              <span class="kpi__label">Collected</span>
              <span class="kpi__value">{{ money(r.collected) }}</span>
              <span class="kpi__note">{{ pct(r.collectionRate?.value) }} of expected</span>
            </a>
            <a class="kpi" [class.kpi--bad]="num(r.outstanding) > 0" [routerLink]="RoutePaths.rentArrears">
              <span class="kpi__label">Outstanding</span>
              <span class="kpi__value">{{ money(r.outstanding) }}</span>
              <span class="kpi__note">{{ num(r.roomsWithBalance) }} room{{ num(r.roomsWithBalance) === 1 ? '' : 's' }} with a balance</span>
            </a>
            <a class="kpi" [class.kpi--bad]="num(r.overdue) > 0" [routerLink]="RoutePaths.rentPortfolioOverdue">
              <span class="kpi__label">Overdue</span>
              <span class="kpi__value">{{ money(r.overdue) }}</span>
              <span class="kpi__note">{{ num(r.tenantsOverdue) }} tenant{{ num(r.tenantsOverdue) === 1 ? '' : 's' }} past the due date</span>
            </a>
            <a class="kpi" [routerLink]="RoutePaths.paymentReports">
              <span class="kpi__label">To confirm</span>
              <span class="kpi__value">{{ num(r.paymentsToConfirm) }}</span>
              <span class="kpi__note">Payments tenants reported</span>
            </a>
          </div>

          <app-section-card title="Monthly billing cycle" subtitle="Generate → readings & adjustments → review & confirm → payments → balances">
            <!-- Where the month's work is done, room by room: one clear way in. -->
            <a actions class="btn btn-primary btn-sm" [routerLink]="RoutePaths.rentArrears">Open rent per room</a>
            @for (row of rows(); track row.buildingId) {
              <div class="building">
                @if (rows().length > 1) {
                  <a class="building__name" title="Open this building" [routerLink]="RoutePaths.buildingDetail(agencyId()!, row.buildingId!)">{{ row.buildingName }} <span aria-hidden="true">›</span></a>
                }
                <app-billing-cycle [agencyId]="agencyId()!" [buildingId]="row.buildingId!" [buildingName]="row.buildingName ?? null"
                                   [month]="month()" [row]="row" [currency]="currency()" />
              </div>
            } @empty {
              <p class="muted">No buildings to bill yet.</p>
            }
          </app-section-card>

          <div class="cols">
            <app-section-card title="Arrears by age">
              @if (aging().length > 0) {
                <ul class="aging">
                  @for (bucket of aging(); track bucket.key) {
                    <li>
                      <span class="aging__label">{{ bucket.label }}</span>
                      <span class="progress progress--thin" aria-hidden="true"><span [style.width.%]="bucket.share"></span></span>
                      <span class="aging__amount">{{ money(bucket.amount) }}</span>
                      <span class="muted aging__count">{{ bucket.tenants }} tenant{{ bucket.tenants === 1 ? '' : 's' }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="muted">Nobody is past the due date.</p>
              }
            </app-section-card>

            <app-section-card title="Who owes most">
              <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPortfolioOverdue">All arrears</a>
              @if ((r.topDebtors ?? []).length > 0) {
                <table class="table table--packed">
                  <thead><tr><th>Tenant</th><th>Room</th><th class="num">Owes</th><th class="num">Oldest</th></tr></thead>
                  <tbody>
                    @for (debtor of r.topDebtors; track debtor.id) {
                      <tr>
                        <td>{{ debtor.label }}</td>
                        <td>{{ debtor.subLabel }}</td>
                        <td class="num owing">{{ money(debtor.amount) }}</td>
                        <td class="num muted">{{ debtor.count }} days</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted">No arrears.</p>
              }
            </app-section-card>
          </div>

          <app-section-card [title]="'Rooms with a balance · ' + monthName()">
            <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentArrears">Rent per room</a>
            @if ((r.roomBalances ?? []).length > 0) {
              <div class="table-scroll">
                <table class="table table--packed">
                  <thead><tr><th>Room</th><th>Tenant</th><th class="num">Balance</th><th>Status</th></tr></thead>
                  <tbody>
                    @for (room of r.roomBalances; track room.id) {
                      <tr [appRowLink]="RoutePaths.rentArrears">
                        <td><a class="record-link__primary" [routerLink]="RoutePaths.rentArrears">{{ room.label }}</a></td>
                        <td>{{ room.subLabel }}</td>
                        <td class="num owing">{{ money(room.amount) }}</td>
                        <td>
                          @if (room.count) { <span class="status-chip status-chip--danger">Overdue {{ room.count }} days</span> }
                          @else { <span class="status-chip status-chip--warning">Not yet due</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="muted">Every room is paid up for {{ monthName() }}.</p>
            }
          </app-section-card>
        }
      </section>
    </app-context-guard>
  `,
  styles: [`
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: var(--space-4); }
    .cols > * { min-width: 0; }
    .building { display: grid; gap: var(--space-2); }
    .building + .building { padding-top: var(--space-4); border-top: 1px solid var(--border); }
    /* The building's page is one tap away: styled as the link it is, not as a label. */
    .building__name { justify-self: start; font-weight: var(--weight-semibold); color: var(--primary-strong);
                      text-decoration: underline; text-decoration-color: var(--primary-ring); text-underline-offset: 0.2em; }
    .building__name:hover, .building__name:focus-visible { text-decoration-color: currentColor; }
    .aging { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .aging li { display: grid; grid-template-columns: 6rem minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-3); font-size: var(--text-sm); }
    .aging__amount { font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; text-align: right; }
    .aging__count { font-size: var(--text-xs); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentOverviewPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly stats = inject(StatsService);

  readonly thisMonth = monthKey();
  readonly month = signal(this.thisMonth);
  readonly monthName = computed(() => monthLabel(this.month()));
  readonly agencyId = computed(() => this.context.agencyId());

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly rent = signal<RentCollectionStats | null>(null);
  readonly rows = signal<BuildingStatsRow[]>([]);

  readonly currency = computed(() => this.rent()?.meta?.currency ?? 'KES');

  readonly aging = computed(() => {
    const buckets = this.rent()?.arrearsAging ?? [];
    const max = Math.max(...buckets.map((bucket) => Number(bucket.amount ?? 0)), 0);
    if (max <= 0) {
      return [];
    }
    return buckets.map((bucket) => ({
      key: bucket.key ?? bucket.label ?? '',
      label: bucket.label ?? '',
      amount: bucket.amount,
      tenants: bucket.tenantCount ?? 0,
      share: (Number(bucket.amount ?? 0) / max) * 100
    }));
  });

  constructor() {
    effect(() => {
      const [agencyId, month, buildingId] = [this.agencyId(), this.month(), this.context.buildingId()];
      untracked(() => {
        if (agencyId !== null) {
          void this.load(agencyId, month, buildingId);
        }
      });
    });
  }

  reload(): void {
    const agencyId = this.agencyId();
    if (agencyId !== null) {
      void this.load(agencyId, this.month(), this.context.buildingId());
    }
  }

  private async load(agencyId: number, month: string, buildingId: number | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const query = { period: 'CUSTOM' as const, ...monthRange(month), buildingId, topN: 5 };
    try {
      const [rent, buildings] = await Promise.all([
        firstValueFrom(this.stats.getAgencyRent(agencyId, query)),
        firstValueFrom(this.stats.getAgencyBuildings(agencyId, query))
      ]);
      this.rent.set(rent);
      this.rows.set(buildings.buildings ?? []);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  num(metric: StatMetric | null | undefined): number {
    const parsed = Number(metric?.value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  money(value: StatMetric | number | string | null | undefined): string {
    const raw = typeof value === 'object' && value !== null ? value.value : value;
    return formatMoney(raw, this.currency());
  }

  pct(value: number | string | null | undefined): string {
    return formatPercent(value);
  }
}
