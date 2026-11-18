import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { asText, downloadCsv } from '../../../shared/utils/csv-export.util';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatCurrency, formatPhone, monthLabel, monthRange } from '../../../shared/utils/format.util';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { StatsService } from '../../stats/stats.service';
import { BuildingStatsRow } from '../../stats/models/stats.models';
import { ArrearsAgeing, CollectionsByMethod, DepositsHeld, RentRoll, ReportsService } from './reports.service';

type Tab = 'roll' | 'collections' | 'deposits' | 'ageing';
type Bucket = 'days0to30' | 'days31to60' | 'days61to90' | 'days90plus';


/**
 * The reports a landlord hands an accountant or an owner: who lives where and pays what (rent
 * roll), what came in and how (collections), and the deposits held. Each exports as CSV.
 */
@Component({
  selector: 'app-rent-reports-page',
  standalone: true,
  imports: [RouterLink, CardTableDirective, ContextGuardComponent, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent,
    MonthNavComponent, SectionCardComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="RENT_ARREAR_READ">
        <div class="tabs" role="tablist" aria-label="Report">
          @for (t of tabs; track t.key) {
            <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="tab() === t.key"
                    [attr.aria-selected]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
          }
        </div>

        @if (loading()) {
          <app-loading-state label="Preparing the report…" />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else {
          @switch (tab()) {
            @case ('roll') {
              @if (roll(); as r) {
                <div class="kpi-grid">
                  <div class="kpi"><span class="kpi__label">Occupied</span><span class="kpi__value">{{ r.occupiedRooms }} of {{ r.totalRooms }}</span>
                    <span class="kpi__note">{{ occupancy(r) }} occupied</span></div>
                  <div class="kpi"><span class="kpi__label">Monthly rent</span><span class="kpi__value">{{ money(r.monthlyRent) }}</span>
                    <span class="kpi__note">From the occupied rooms</span></div>
                  <div class="kpi"><span class="kpi__label">Deposits held</span><span class="kpi__value">{{ money(r.depositsHeld) }}</span>
                    <span class="kpi__note">For current tenants</span></div>
                  <div class="kpi" [class.kpi--bad]="+r.owed > 0"><span class="kpi__label">Balance</span><span class="kpi__value">{{ money(r.owed) }}</span>
                    <span class="kpi__note">Rent, late fees and charges, all months</span></div>
                </div>
                <app-section-card title="Rent roll" [subtitle]="scopeLabel() + ' · as of ' + date(r.asOf)">
                  <button type="button" actions class="btn btn-secondary" [disabled]="r.rows.length === 0" (click)="exportRoll(r)">Export CSV</button>
                  @if (r.rows.length === 0) {
                    <app-empty-state title="No tenants living here yet" description="Rooms appear here once a tenant has moved in." />
                  } @else {
                    <div class="table-scroll">
                      <table appCardTable class="table">
                        <thead><tr><th>Room</th><th>Tenant</th><th>Moved in</th><th>Lease ends</th><th class="num">Rent</th>
                          <th class="num">Deposit held</th><th class="num">Balance</th></tr></thead>
                        <tbody>
                          @for (row of r.rows; track row.tenantId) {
                            <tr>
                              <td class="card-title"><div class="cell-stack"><strong>Room {{ row.roomName }}</strong>
                                @if (!context.buildingId()) { <span class="muted">{{ row.buildingName }}</span> }</div></td>
                              <td data-label="Tenant"><div class="cell-stack">
                                <a class="text-link" [routerLink]="tenantLink(row.buildingId, row.tenantId)">{{ row.tenantName }}</a>
                                @if (row.tenantPhone) { <span class="muted">{{ phone(row.tenantPhone) }}</span> }</div></td>
                              <td data-label="Moved in">{{ row.moveInDate ? date(row.moveInDate) : '—' }}</td>
                              <td data-label="Lease ends">{{ row.leaseEndDate ? date(row.leaseEndDate) : 'No end date' }}</td>
                              <td class="num" data-label="Rent">{{ money(row.monthlyRent) }}</td>
                              <td class="num" data-label="Deposit held">{{ money(row.depositHeld) }}@if (+(row.depositExpected ?? 0) > +(row.depositHeld ?? 0)) {
                                <span class="muted small"> of {{ money(row.depositExpected) }}</span> }</td>
                              <td class="num" data-label="Balance" [class.owed]="+(row.owed ?? 0) > 0">{{ +(row.owed ?? 0) > 0 ? money(row.owed) : '—' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </app-section-card>
              }
            }
            @case ('collections') {
              @if (collections(); as c) {
                <app-section-card title="Collections" [subtitle]="scopeLabel() + ' · money received in ' + monthName()">
                  <app-month-nav actions [(month)]="month" />
                  <button type="button" actions class="btn btn-secondary" [disabled]="c.byMethod.length === 0 && buildingRows().length === 0" (click)="exportCollections(c)">Export CSV</button>
                  <h3 class="sub">How it came in</h3>
                  @if (c.byMethod.length === 0) {
                    <p class="muted">No payments confirmed in {{ monthName() }}.</p>
                  } @else {
                    <ul class="methods">
                      @for (m of c.byMethod; track m.method) {
                        <li><span>{{ methodLabel(m.method) }} <span class="muted small">· {{ m.payments }} payment{{ m.payments === 1 ? '' : 's' }}</span></span>
                          <strong class="num">{{ money(m.amount) }}</strong></li>
                      }
                      <li class="total"><span>Total received</span><strong class="num">{{ money(c.total) }}</strong></li>
                    </ul>
                  }
                  @if (buildingRows().length > 0) {
                    <h3 class="sub">Billed against collected, by building</h3>
                    <div class="table-scroll">
                      <table appCardTable class="table">
                        <thead><tr><th>Building</th><th class="num">Billed</th><th class="num">Collected</th><th class="num">Balance</th><th class="num">Rate</th></tr></thead>
                        <tbody>
                          @for (b of buildingRows(); track b.buildingId) {
                            <tr>
                              <td class="card-title"><strong>{{ b.buildingName }}</strong></td>
                              <td class="num" data-label="Billed">{{ money(b.rentExpected) }}</td>
                              <td class="num" data-label="Collected">{{ money(b.rentCollected) }}</td>
                              <td class="num" data-label="Balance">{{ money(b.rentOutstanding) }}</td>
                              <td class="num" data-label="Rate">{{ b.collectionRate === null || b.collectionRate === undefined ? '—' : (+b.collectionRate).toFixed(0) + '%' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    <p class="muted small">Billed and collected count the month's bills; "How it came in" counts money received during the month, whichever month it paid for.</p>
                  }
                </app-section-card>
              }
            }
            @case ('deposits') {
              @if (deposits(); as d) {
                <div class="kpi-grid">
                  <div class="kpi"><span class="kpi__label">Held now</span><span class="kpi__value">{{ money(d.total.held) }}</span>
                    <span class="kpi__note">{{ d.total.openDeposits }} open deposit{{ d.total.openDeposits === 1 ? '' : 's' }}</span></div>
                  <div class="kpi" [class.kpi--bad]="+d.total.outstanding > 0"><span class="kpi__label">Not yet received</span>
                    <span class="kpi__value">{{ money(d.total.outstanding) }}</span><span class="kpi__note">Of {{ money(d.total.expected) }} agreed</span></div>
                  <div class="kpi"><span class="kpi__label">Refunded</span><span class="kpi__value">{{ money(d.total.refunded) }}</span>
                    <span class="kpi__note">Returned to tenants</span></div>
                  <div class="kpi"><span class="kpi__label">Kept</span><span class="kpi__value">{{ money(d.total.deducted) }}</span>
                    <span class="kpi__note">Deducted for damage or rent</span></div>
                </div>
                <app-section-card title="Deposits held" [subtitle]="scopeLabel()">
                  <button type="button" actions class="btn btn-secondary" [disabled]="d.rows.length === 0" (click)="exportDeposits(d)">Export CSV</button>
                  <a actions class="btn btn-secondary" [routerLink]="RoutePaths.rentDeposits">Each tenant's deposit</a>
                  @if (d.rows.length === 0) {
                    <app-empty-state title="No deposits recorded" description="Deposits appear here once one is agreed for a tenant." />
                  } @else {
                    <div class="table-scroll">
                      <table appCardTable class="table">
                        <thead><tr><th>Building</th><th class="num">Agreed</th><th class="num">Received</th><th class="num">Refunded</th><th class="num">Kept</th><th class="num">Held now</th></tr></thead>
                        <tbody>
                          @for (b of d.rows; track b.buildingId) {
                            <tr>
                              <td class="card-title"><div class="cell-stack"><strong>{{ b.buildingName }}</strong><span class="muted">{{ b.openDeposits }} open</span></div></td>
                              <td class="num" data-label="Agreed">{{ money(b.expected) }}</td>
                              <td class="num" data-label="Received">{{ money(b.received) }}</td>
                              <td class="num" data-label="Refunded">{{ money(b.refunded) }}</td>
                              <td class="num" data-label="Kept">{{ money(b.deducted) }}</td>
                              <td class="num" data-label="Held now"><strong>{{ money(b.held) }}</strong></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </app-section-card>
              }
            }
            @case ('ageing') {
              @if (ageing(); as a) {
                <div class="kpi-grid">
                  @for (b of buckets; track b.key) {
                    <div class="kpi" [class.kpi--bad]="b.key !== 'days0to30' && +a.total[b.key] > 0">
                      <span class="kpi__label">{{ b.label }}</span>
                      <span class="kpi__value">{{ +a.total[b.key] > 0 ? money(a.total[b.key]) : 'Nothing' }}</span>
                      <span class="kpi__note">{{ b.note }}</span>
                    </div>
                  }
                </div>
                <app-section-card title="Arrears by age" [subtitle]="scopeLabel() + ' · as of ' + date(a.asOf)">
                  <button type="button" actions class="btn btn-secondary" [disabled]="a.rows.length === 0" (click)="exportAgeing(a)">Export CSV</button>
                  <a actions class="btn btn-secondary" [routerLink]="RoutePaths.rentArrears">Follow up arrears</a>
                  @if (a.rows.length === 0) {
                    <app-empty-state title="Nobody is past due" description="Tenants appear here once a bill passes its due date unpaid." />
                  } @else {
                    <div class="table-scroll">
                      <table appCardTable class="table">
                        <thead><tr><th>Tenant</th><th>Room</th>
                          @for (b of buckets; track b.key) { <th class="num">{{ b.short }}</th> }
                          <th class="num">Total</th></tr></thead>
                        <tbody>
                          @for (row of a.rows; track row.tenantId) {
                            <tr>
                              <td class="card-title"><div class="cell-stack">
                                @if (row.buildingId && row.tenantId) {
                                  <a class="text-link" [routerLink]="tenantLink(row.buildingId, row.tenantId)">{{ row.tenantName }}</a>
                                } @else { <strong>{{ row.tenantName }}</strong> }
                                <span class="muted">{{ row.formerTenant ? 'Moved out · oldest ' : 'Oldest ' }}{{ row.oldestDays }} day{{ row.oldestDays === 1 ? '' : 's' }} late</span></div></td>
                              <td data-label="Room"><div class="cell-stack"><span>{{ row.roomName }}</span>
                                @if (!context.buildingId()) { <span class="muted">{{ row.buildingName }}</span> }</div></td>
                              @for (b of buckets; track b.key) {
                                <td class="num" [attr.data-label]="b.short">{{ +row[b.key] > 0 ? money(row[b.key]) : '—' }}</td>
                              }
                              <td class="num owed" data-label="Total">{{ money(row.total) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    <p class="muted small">Rent, late fees and charges on bills past their due date, placed by how many days late each bill is.</p>
                  }
                </app-section-card>
              }
            }
          }
        }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .tabs { margin-bottom: var(--space-2); }
    .small { font-size: var(--text-xs); }
    .owed { color: var(--danger); font-weight: var(--weight-semibold); }
    .sub { font-size: var(--font-subsection); margin: var(--space-2) 0; }
    .methods { list-style: none; margin: 0 0 var(--space-4); padding: 0; max-width: 32rem; }
    .methods li { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
    .methods .total { border-bottom: 0; border-top: 2px solid var(--border-strong); font-weight: var(--weight-semibold); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentReportsPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly reports = inject(ReportsService);
  private readonly stats = inject(StatsService);
  private readonly toasts = inject(NotificationService);

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'roll', label: 'Rent roll' },
    { key: 'collections', label: 'Collections' },
    { key: 'deposits', label: 'Deposits held' },
    { key: 'ageing', label: 'Arrears by age' }
  ];
  readonly buckets: { key: Bucket; label: string; short: string; note: string }[] = [
    { key: 'days0to30', label: 'Up to 30 days', short: '0–30 days', note: 'Recently due' },
    { key: 'days31to60', label: '31 to 60 days', short: '31–60 days', note: 'A month or more late' },
    { key: 'days61to90', label: '61 to 90 days', short: '61–90 days', note: 'Two months or more late' },
    { key: 'days90plus', label: 'Over 90 days', short: 'Over 90 days', note: 'Hardest to recover' }
  ];
  readonly tab = signal<Tab>('roll');
  readonly month = inject(WorkingMonthService).month;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly roll = signal<RentRoll | null>(null);
  readonly collections = signal<CollectionsByMethod | null>(null);
  readonly buildingRows = signal<BuildingStatsRow[]>([]);
  readonly deposits = signal<DepositsHeld | null>(null);
  readonly ageing = signal<ArrearsAgeing | null>(null);

  readonly monthName = computed(() => monthLabel(this.month()));
  readonly scopeLabel = computed(() => this.context.active().buildingName ?? 'All buildings');

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      this.tab();
      this.month();
      untracked(() => void this.reload());
    });
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    const buildingId = this.context.buildingId();
    this.loading.set(true);
    this.error.set(null);
    try {
      switch (this.tab()) {
        case 'roll':
          this.roll.set(await firstValueFrom(this.reports.rentRoll(agencyId, buildingId)));
          break;
        case 'collections': {
          const month = this.month();
          this.collections.set(await firstValueFrom(this.reports.collections(agencyId, buildingId, `${month}-01`)));
          // Billed against collected comes from the dashboard's figures, for those who may read them.
          this.buildingRows.set(this.context.can('STATS_AGENCY_READ')
            ? await firstValueFrom(this.stats.getAgencyBuildings(agencyId, { from: `${month}-01`, to: monthRange(month).to, buildingId }))
                .then((b) => b.buildings ?? []).catch(() => [])
            : []);
          break;
        }
        case 'deposits':
          this.deposits.set(await firstValueFrom(this.reports.deposits(agencyId, buildingId)));
          break;
        case 'ageing':
          this.ageing.set(await firstValueFrom(this.reports.ageing(agencyId, buildingId)));
          break;
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  exportRoll(r: RentRoll): void {
    downloadCsv(`rent-roll-${r.asOf}`, r.rows, [
      { header: 'Building', value: (row) => row.buildingName },
      { header: 'Floor', value: (row) => row.floorName },
      { header: 'Room', value: (row) => asText(row.roomName) },
      { header: 'Tenant', value: (row) => row.tenantName },
      { header: 'Phone', value: (row) => asText(row.tenantPhone) },
      { header: 'Moved in', value: (row) => row.moveInDate ?? '' },
      { header: 'Lease ends', value: (row) => row.leaseEndDate ?? '' },
      { header: 'Monthly rent (KES)', value: (row) => row.monthlyRent ?? '' },
      { header: 'Deposit agreed (KES)', value: (row) => row.depositExpected ?? '' },
      { header: 'Deposit held (KES)', value: (row) => row.depositHeld ?? '' },
      { header: 'Balance (KES)', value: (row) => row.owed ?? '' }
    ]);
    this.toasts.push('success', `Exported ${r.rows.length} room${r.rows.length === 1 ? '' : 's'}.`);
  }

  exportCollections(c: CollectionsByMethod): void {
    const rows = [
      ...c.byMethod.map((m) => ({ section: 'Received by method', name: this.methodLabel(m.method), count: m.payments, billed: '', amount: m.amount, outstanding: '' })),
      ...this.buildingRows().map((b) => ({ section: 'By building', name: b.buildingName ?? '', count: '', billed: b.rentExpected ?? '', amount: b.rentCollected ?? '', outstanding: b.rentOutstanding ?? '' }))
    ];
    downloadCsv(`collections-${this.month()}`, rows, [
      { header: 'Section', value: (r) => r.section },
      { header: 'Method or building', value: (r) => r.name },
      { header: 'Payments', value: (r) => r.count },
      { header: 'Billed (KES)', value: (r) => r.billed },
      { header: 'Collected (KES)', value: (r) => r.amount },
      { header: 'Balance (KES)', value: (r) => r.outstanding }
    ]);
  }

  exportDeposits(d: DepositsHeld): void {
    downloadCsv('deposits-held', [...d.rows, d.total], [
      { header: 'Building', value: (b) => b.buildingName },
      { header: 'Open deposits', value: (b) => b.openDeposits },
      { header: 'Agreed (KES)', value: (b) => b.expected },
      { header: 'Received (KES)', value: (b) => b.received },
      { header: 'Not yet received (KES)', value: (b) => b.outstanding },
      { header: 'Refunded (KES)', value: (b) => b.refunded },
      { header: 'Kept (KES)', value: (b) => b.deducted },
      { header: 'Held now (KES)', value: (b) => b.held }
    ]);
  }

  exportAgeing(a: ArrearsAgeing): void {
    downloadCsv(`arrears-by-age-${a.asOf}`, [...a.rows, a.total], [
      { header: 'Tenant', value: (r) => r.tenantName },
      { header: 'Phone', value: (r) => asText(r.tenantPhone) },
      { header: 'Building', value: (r) => r.buildingName ?? '' },
      { header: 'Room', value: (r) => asText(r.roomName) },
      { header: 'Moved out', value: (r) => (r.tenantId ? (r.formerTenant ? 'Yes' : 'No') : '') },
      { header: '0-30 days (KES)', value: (r) => r.days0to30 },
      { header: '31-60 days (KES)', value: (r) => r.days31to60 },
      { header: '61-90 days (KES)', value: (r) => r.days61to90 },
      { header: 'Over 90 days (KES)', value: (r) => r.days90plus },
      { header: 'Total (KES)', value: (r) => r.total },
      { header: 'Oldest (days late)', value: (r) => r.oldestDays }
    ]);
    this.toasts.push('success', `Exported ${a.rows.length} tenant${a.rows.length === 1 ? '' : 's'}.`);
  }

  occupancy(r: RentRoll): string {
    return r.totalRooms ? `${Math.round(r.occupiedRooms * 100 / r.totalRooms)}%` : '—';
  }

  tenantLink(buildingId: number, tenantId: number): string | null {
    const agencyId = this.context.agencyId();
    return agencyId === null ? null : RoutePaths.tenantDetail(agencyId, buildingId, tenantId);
  }

  methodLabel(method: string): string {
    return method === 'MPESA' ? 'M-Pesa' : humanizeLabel(method, method);
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  phone(value: string): string {
    return formatPhone(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
