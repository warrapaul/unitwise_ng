import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
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
  imports: [RoomTitlePipe, PhoneMenuComponent, MonthNavComponent, CardTableDirective, RowLinkDirective, RouterLink, ContextGuardComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent,
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
            <app-month-nav [(month)]="month" />
          </div>
          <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE']">
            <a class="btn btn-primary btn-sm record-action" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
          </app-permission-gate>
        </header>

        @if (loading() && !rent()) {
          <app-loading-state label="Loading the month..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (rent(); as r) {
          <div class="kpi-grid">
            <a class="kpi" [class.kpi--bad]="num(r.overdue) > 0" [class.kpi--zero]="!num(r.overdue)" [routerLink]="RoutePaths.rentPortfolioOverdue">
              <span class="kpi__label">Overdue</span>
              <span class="kpi__value">{{ money(r.overdue) }}</span>
              <span class="kpi__note">{{ num(r.tenantsOverdue) }} tenant{{ num(r.tenantsOverdue) === 1 ? '' : 's' }} late on {{ monthName() }}'s bill</span>
            </a>
            <a class="kpi" [class.kpi--zero]="!num(r.paymentsToConfirm)" [class.kpi--warn]="num(r.paymentsToConfirm) > 0" [routerLink]="RoutePaths.paymentReports">
              <span class="kpi__label">To confirm</span>
              <span class="kpi__value">{{ num(r.paymentsToConfirm) }}</span>
              <span class="kpi__note">Payments tenants reported</span>
            </a>
          </div>

          <app-section-card title="Monthly billing cycle" subtitle="Five steps close a month: create the bills, add readings, confirm, collect payments, check balances.">
            <!-- Where the month's work is done, room by room: one clear way in. -->
            <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentArrears">Open rent per room</a>
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

            <app-section-card title="Who owes most">
              <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPortfolioOverdue">All arrears</a>
              @if ((r.topDebtors ?? []).length > 0) {
                <!--
                  Who, how much, and a way to reach them, one tenant to a line. On a phone each debtor
                  is a line item instead: name and amount on top, the number under the name, room and
                  age beneath.
                -->
                <div class="table-scroll">
                <table appCardTable class="table table--packed table--lines debtors">
                  <thead><tr><th>Tenant</th><th class="num">Balance</th><th>Phone</th><th>Room</th><th class="num">Oldest</th></tr></thead>
                  <tbody>
                    @for (debtor of r.topDebtors; track debtor.id; let rank = $index) {
                      <tr [appRowLink]="debtor.targetPath || null">
                        <td>
                          <div class="debtor-name">
                            <span class="debtor-rank" [attr.aria-label]="'Rank ' + (rank + 1)">{{ rank + 1 }}</span>
                            @if (debtor.targetPath) {
                              <a class="record-link__primary" [routerLink]="debtor.targetPath">{{ debtor.label }}</a>
                            } @else {
                              <span class="record-link__primary">{{ debtor.label }}</span>
                            }
                            @if (debtor.formerTenant) { <span class="status-chip status-chip--neutral">Former tenant</span> }
                          </div>
                          @if (debtor.phone) {
                            <div class="card-sub debtor-reach"><app-phone-menu [phone]="debtor.phone" /></div>
                          }
                        </td>
                        <td class="num owing">{{ money(debtor.amount) }}</td>
                        <td class="card-skip">
                          @if (debtor.phone) { <app-phone-menu [phone]="debtor.phone" /> } @else { - }
                        </td>
                        <td class="card-skip">{{ debtor.subLabel | roomTitle }}</td>
                        <td class="num muted card-skip">{{ debtor.count }} {{ debtor.count === 1 ? 'day' : 'days' }}</td>
                        <td class="card-only">{{ debtor.subLabel ? 'Room ' + debtor.subLabel + ' · ' : '' }}oldest {{ debtor.count }} {{ debtor.count === 1 ? 'day' : 'days' }} overdue</td>
                      </tr>
                    }
                  </tbody>
                </table>
                </div>
              } @else {
                <p class="muted">No arrears.</p>
              }
            </app-section-card>
        }
      </section>
    </app-context-guard>
  `,
  styles: [`
    .debtor-name { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); }
    .debtor-rank { flex: none; min-width: 1.25rem; font-variant-numeric: tabular-nums; color: var(--text-muted); font-weight: var(--weight-semibold); }
    .debtor-reach { display: none; }
    @media (min-width: 641px) {
      .debtor-name { flex-wrap: nowrap; white-space: nowrap; }
    }
    .debtors td { vertical-align: middle; }
    @media (max-width: 640px) {
      .debtor-reach { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin-top: var(--space-1); }
    }
    .building { display: grid; gap: var(--space-2); }
    .building + .building { padding-top: var(--space-4); border-top: 1px solid var(--border); }
    /* The building's page is one tap away: styled as the link it is, not as a label. */
    .building__name { justify-self: start; font-weight: var(--weight-semibold); color: var(--primary-strong);
                      text-decoration: underline; text-decoration-color: var(--primary-ring); text-underline-offset: 0.2em; }
    .building__name:hover, .building__name:focus-visible { text-decoration-color: currentColor; }
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
  /** Shared with the other rent pages. */
  readonly month = inject(WorkingMonthService).month;
  readonly monthName = computed(() => monthLabel(this.month()));
  readonly agencyId = computed(() => this.context.agencyId());

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly rent = signal<RentCollectionStats | null>(null);
  readonly rows = signal<BuildingStatsRow[]>([]);

  readonly currency = computed(() => this.rent()?.meta?.currency ?? 'KES');

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
