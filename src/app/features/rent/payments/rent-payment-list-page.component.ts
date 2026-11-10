import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { shortDate } from '../../../shared/utils/format.util';
import { MONEY_LOCALE, formatCurrency } from '../../../shared/utils/format.util';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { SummaryStripComponent, SummaryTile } from '../../../shared/components/summary-strip/summary-strip.component';
import { StatsService } from '../../stats/stats.service';
import { RentCollectionStats } from '../../stats/models/stats.models';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { thisMonthIso, todayIso } from '../../../shared/utils/date.util';
import { NgTemplateOutlet } from '@angular/common';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import {
  RENT_PAYMENT_SORTABLE_FIELDS,
  RentPaymentPreview,
  RentPaymentSearchParams,
  RentPaymentStatus,
  RentPaymentSummary,
  toMonthPath
} from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RENT_STATUS_LABELS } from '../../../shared/constants/status-badges';

type RentPaymentSortField = typeof RENT_PAYMENT_SORTABLE_FIELDS[number];


type StatusChip = 'overdue' | 'partial' | 'notDue' | 'paid';

@Component({
  selector: 'app-rent-payment-list-page',
  standalone: true,
  imports: [DateDisplayDirective, CardTableDirective, 
    SummaryStripComponent,
    EntityPickerComponent,
    RoomPickerComponent,
    NgTemplateOutlet,
    ContextGuardComponent,
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <h1 class="sr-only">All payments</h1>
      <!-- A tenant's own payments need no agency; staff need a building to exist first. -->
      @if (mine()) {
        <ng-container *ngTemplateOutlet="page" />
      } @else {
        <app-context-guard [requireBuilding]="false" [requireAnyBuilding]="true" action="to record and follow rent">
          <ng-container *ngTemplateOutlet="page" />
        </app-context-guard>
      }
      <ng-template #page>
      <!-- This month at a glance: each status filters the table to this month's bills in it. -->
      @if (!mine()) {
        <app-summary-strip label="This month's rent" [hideZero]="true" [tiles]="summary()" [active]="summaryKey()" (picked)="filterByStatus($event)" />
      }
      <app-section-card [title]="mine() ? 'My rent bills' : 'Rent bills'">
        <!--
          No "My payments" switch here: a tenant's own payments live under /me,
          and an agency operator has none of their own to look at.
        -->
        @if (!mine()) {
          <ng-container actions>
            <div class="action-bar">
              <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_CREATE, Permissions.RENT_PAYMENT_WRITE]">
                <a class="btn btn-primary record-action" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
              </app-permission-gate>
            </div>
          </ng-container>
        }

        <app-filter-panel (clear)="clear()" actions [form]="form">
          @if (!mine()) {
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Receipt number</span><input formControlName="receiptNumber"></label>
                <!-- Rooms belong to a building: offered once one is chosen. -->
                @if (scope().agencyId !== null && scope().buildingId !== null) {
                  <label class="field">
                    <span>Room</span>
                    <app-room-picker formControlName="roomId" [agencyId]="scope().agencyId" [buildingId]="scope().buildingId" />
                  </label>
                }
                <label class="field"><span>Payment month</span><input type="month" formControlName="paymentForMonth"></label>
                <label class="field"><span>Due from</span><input type="date" formControlName="dueDateFrom"></label>
                <label class="field"><span>Due to</span><input type="date" formControlName="dueDateTo"></label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-text" (click)="clear()">Clear</button>
              </div>
            </form>
          }
        </app-filter-panel>

        @if (!mine()) {
          <!-- Any number at once; none on means every status. -->
          <ul class="filter-chips" aria-label="Filter by status">
            @for (chip of statusChips; track chip.key) {
              <li>
                <button type="button" class="filter-chip" [attr.aria-pressed]="statusFilter().includes(chip.key)" (click)="toggleStatus(chip.key)">
                  @if (statusFilter().includes(chip.key)) { <span aria-hidden="true">✓</span> }{{ chip.label }}
                </button>
              </li>
            }
          </ul>
          <div class="list-tools">
            <!-- Picked, not typed: a name typed slightly differently found nothing. -->
            <label class="field">
              <span class="sr-only">Tenant</span>
              <app-entity-picker [config]="pickers.tenant" [formControl]="form.controls.tenantId" placeholder="Any tenant" />
            </label>
            <label class="sr-only" for="bills-group">Group by</label>
            <select id="bills-group" class="control-select" [value]="groupBy()" (change)="groupBy.set($any($event.target).value)">
              <option value="none">No grouping</option>
              <option value="month">Group by month</option>
              <option value="status">Group by status</option>
            </select>
          </div>
        }
      </app-section-card>

      @if (!mine()) {
      }

      @if (loading()) {
        <app-loading-state label="Loading payments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payments().length === 0) {
        <app-empty-state title="No rent bills" description="Nothing matches right now. Bills appear here each month once they are created."
                         [actionLabel]="mine() ? null : 'Record a payment'" [actionLink]="mine() ? null : RoutePaths.rentPaymentCreate" />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table appCardTable class="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Tenant</th>
                  <th>Room</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="paymentForMonth"
                      label="Covers"
                      (sorted)="search()"
                    />
                  </th>
                  <th class="num">Billed</th>
                  <th class="num">
                    <app-sort-header
                      [state]="sorting"
                      field="amountPaid"
                      label="Paid"
                      (sorted)="search()"
                    />
                  </th>
                  <th class="num">Balance</th>
                  <th>Method</th>
                  <th>Last paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (group of groups(); track group.key) {
                @if (group.label) {
                  <tr class="group-row">
                    <td colspan="10"><strong>{{ group.label }}</strong> · {{ group.items.length }} {{ group.items.length === 1 ? 'bill' : 'bills' }}@if (group.owing > 0) { · {{ money(group.owing) }} balance }</td>
                  </tr>
                }
                @for (payment of group.items; track payment.id) {
                  <tr [appRowLink]="detailLink(payment.id)">
                    <td class="card-skip">
                      @if (detailLink(payment.id); as link) {
                        <a class="record-link__primary mono" [routerLink]="link">
                          {{ payment.receiptNumber || ('#' + payment.id) }}
                        </a>
                      } @else {
                        <span class="mono">{{ payment.receiptNumber || ('#' + payment.id) }}</span>
                      }
                    </td>
                    <td class="card-skip">{{ payment.tenantName || '-' }}</td>
                    <td class="card-skip">{{ payment.roomName || payment.roomNumber || '-' }}</td>
                    <td class="card-skip">{{ formatMonth(payment.paymentForMonth) }}</td>
                    <!--
                      The monthly run opens a record for every tenant before any
                      money arrives, so a month with no transaction yet reads 0
                      and has no method or date. Say so rather than show a
                      zero receipt.
                    -->
                    <td class="num card-skip">{{ money(payment.totalDue) }}</td>
                    @if (hasPayment(payment)) {
                      <td class="num card-skip">{{ money(payment.amountPaid) }}</td>
                      <td class="num card-skip" [class.owing]="amount(payment.outstanding) > 0" [class.overdue]="payment.status === 'OVERDUE'">{{ money(payment.outstanding) }}</td>
                      <td class="card-skip">{{ payment.paymentMethod | humanLabel }}</td>
                      <td class="card-skip">{{ formatDate(payment.paymentDate) }}</td>
                    } @else {
                      <td class="muted num card-skip">Nothing paid</td>
                      <td class="num card-skip" [class.owing]="amount(payment.outstanding) > 0" [class.overdue]="payment.status === 'OVERDUE'">{{ money(payment.outstanding) }}</td>
                      <td class="muted card-skip">-</td>
                      <td class="muted card-skip">-</td>
                    }
                    <td class="card-status"><app-status-chip [status]="payment.status" [labels]="RENT_STATUS_LABELS" /><span class="row-go" aria-hidden="true">›</span></td>
                    <!-- The phone card: who, which room and month, and where the money stands — no labels. -->
                    <td class="card-only card-title pay-card">
                      @if (detailLink(payment.id); as link) {
                        <a class="record-link__primary" [routerLink]="link">{{ payment.tenantName || 'Tenant' }}</a>
                      } @else {
                        <span class="record-link__primary">{{ payment.tenantName || 'Tenant' }}</span>
                      }
                      <span class="muted pay-card__where">{{ cardPlace(payment) }}</span>
                      <span class="pay-card__money" [class.overdue]="payment.status === 'OVERDUE'">{{ cardMoney(payment) }}</span>
                      @if (cardPaid(payment); as paid) { <span class="muted pay-card__where">{{ paid }}</span> }
                      @if (hasPayment(payment) && payment.paymentMethod) {
                        <span class="muted pay-card__where">Method: {{ payment.paymentMethod | humanLabel }}</span>
                      }
                    </td>
                  </tr>
                }
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <div class="load-more">
            <span class="muted">Showing {{ payments().length }} of {{ pagination()?.totalElements ?? payments().length }}</span>
            @if (!pagination()!.isLast) {
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="loadingMore()" (click)="loadMore()">{{ loadingMore() ? 'Loading...' : 'Load more' }}</button>
            }
          </div>
        }
      }
      </ng-template>
    </section>
  `,
  styles: [`
    .filter-chips { margin-bottom: var(--space-2); }
    .load-more { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); }
    .row-go { margin-left: var(--space-2); color: var(--text-subtle); }
    .list-tools { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .list-tools .field { flex: 1 1 14rem; min-width: 0; margin: 0; }
    .group-row td { background: var(--surface-2); }
    .pay-card { display: grid; gap: var(--space-0-5); }
    .pay-card__where { font-size: var(--font-description); }
    .pay-card__money { font-size: var(--font-description); font-weight: var(--weight-semibold); }
    .pay-card__money.overdue { color: var(--danger); }
    form {
      display: grid;
      gap: var(--space-5);
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .table-shell {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }

    .num {
      text-align: end;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .owing {
      font-weight: var(--weight-bold);
    }

    /* Red is kept for money past its due date. */
    .overdue {
      color: var(--danger);
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentPaymentListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly route = inject(ActivatedRoute);

  readonly scope = this.context.active;

  readonly RENT_STATUS_LABELS = RENT_STATUS_LABELS;

  /** Ordering the table asks the server for; shift-click adds a second key. */
  // A rent record has no payment date of its own (its transactions do), so newest month first.
  readonly sorting = sortState('paymentForMonth', 'desc');

  readonly groupBy = signal<'none' | 'month' | 'status'>('none');

  /** The bills on this page, cut by month or status in the order they arrived. */
  readonly groups = computed(() => {
    const by = this.groupBy();
    const rows = this.payments();
    if (by === 'none') {
      return [{ key: 'all', label: null as string | null, items: rows, owing: 0 }];
    }
    const groups = new Map<string, { key: string; label: string | null; items: RentPaymentPreview[]; owing: number }>();
    for (const payment of rows) {
      const key = (by === 'month' ? payment.paymentForMonth?.slice(0, 7) : payment.status) ?? 'none';
      const label = by === 'month' ? this.formatMonth(payment.paymentForMonth) : RENT_STATUS_LABELS[key] ?? humanizeLabel(key);
      const group = groups.get(key) ?? { key, label, items: [], owing: 0 };
      group.items.push(payment);
      group.owing += Math.max(this.amount(payment.outstanding), 0);
      groups.set(key, group);
    }
    return [...groups.values()];
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payments = signal<RentPaymentPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly mine = signal(false);
  readonly statusChips: readonly { key: StatusChip; label: string; statuses: readonly string[] }[] = [
    { key: 'overdue', label: 'Overdue', statuses: ['OVERDUE'] },
    { key: 'partial', label: 'Part paid', statuses: ['PARTIAL'] },
    { key: 'notDue', label: 'Not yet due', statuses: ['PENDING'] },
    { key: 'paid', label: 'Paid', statuses: ['COMPLETED', 'OVERPAID'] }
  ];
  readonly statusFilter = signal<StatusChip[]>([]);
  readonly loadingMore = signal(false);

  /** The next page under the rows already here, so the place in the list is kept. */
  async loadMore(): Promise<void> {
    this.form.patchValue({ page: (this.pagination()?.page ?? 0) + 1 }, { emitEvent: false });
    this.loadingMore.set(true);
    await this.reload();
    this.loadingMore.set(false);
  }

  toggleStatus(key: StatusChip): void {
    this.statusFilter.update((on) => on.includes(key) ? on.filter((other) => other !== key) : [...on, key]);
    this.summaryKey.set(null);
    this.form.patchValue({ page: 0 }, { emitEvent: false });
    void this.reload();
  }


  readonly form = this.formBuilder.group({
    receiptNumber: '',
    tenantId: null as number | null,
    roomId: null as number | null,
    paymentForMonth: '',
    dueDateFrom: '',
    dueDateTo: '',
    page: 0,
    size: 20,
  });


  /** Out in the open rather than behind Filters, so a pick applies at once. */
  private readonly tenantPicked = this.form.controls.tenantId.valueChanges
    .pipe(distinctUntilChanged(), takeUntilDestroyed())
    .subscribe(() => {
      this.form.patchValue({ page: 0 }, { emitEvent: false });
      void this.reload();
    });

  ngOnInit(): void {
    this.mine.set(this.route.snapshot.data['mine'] === true);
    void this.reload();
  }

  private readonly stats = inject(StatsService);
  private readonly monthStats = signal<RentCollectionStats | null>(null);
  readonly thisMonth = thisMonthIso();

  /** This month's bills by where they stand, from the same figures as the dashboard. */
  readonly summary = computed<SummaryTile[]>(() => {
    const r = this.monthStats();
    if (!r) {
      return [];
    }
    const n = (metric: { value?: number | string | null } | null | undefined) => Number(metric?.value ?? 0) || 0;
    return [
      { key: 'COMPLETED', label: 'Paid in full', value: n(r.tenantsPaid), filter: true },
      { key: 'PARTIAL', label: 'Part paid', value: n(r.tenantsPartiallyPaid), filter: true, act: true },
      { key: 'OVERDUE', label: 'Overdue', value: n(r.tenantsOverdue), filter: true, act: true },
      { key: 'PENDING', label: 'Not yet due', value: n(r.tenantsPending), filter: true },
      { key: 'to-confirm', label: 'Payments to confirm', value: n(r.paymentsToConfirm), route: RoutePaths.paymentReports, act: true }
    ];
  });

  /** The tile pressed: a status filter on this month. */
  readonly summaryKey = signal<string | null>(null);

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.context.agencyId(), this.context.buildingId()];
      untracked(() => void this.loadSummary(agencyId, buildingId));
    });
  }

  private async loadSummary(agencyId: number | null, buildingId: number | null): Promise<void> {
    if (agencyId === null) {
      this.monthStats.set(null);
      return;
    }
    try {
      this.monthStats.set(await firstValueFrom(this.stats.getAgencyRent(agencyId, { buildingId })));
    } catch {
      // Counts need dashboard figures; without them the list still works.
      this.monthStats.set(null);
    }
  }

  /** A summary tile: this month's bills in that status, or back to every payment. */
  async filterByStatus(status: string | null): Promise<void> {
    this.summaryKey.set(status);
    const chip = this.statusChips.find((candidate) => candidate.statuses.includes(status ?? ''));
    this.statusFilter.set(chip ? [chip.key] : []);
    this.form.patchValue({ paymentForMonth: status ? this.thisMonth : '', page: 0 });
    await this.reload();
  }


  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.statusFilter.set([]);
    this.summaryKey.set(null);
    // Silent: this method reloads once itself, below.
    this.form.controls.tenantId.setValue(null, { emitEvent: false });
    this.form.reset({
      receiptNumber: '',
      tenantId: null,
      roomId: null,
      paymentForMonth: '',
      dueDateFrom: '',
      dueDateTo: '',
      page: 0,
      size: this.form.getRawValue().size,
    }, { emitEvent: false });
    await this.reload();
  }


  /** A payment only has a detail route once an agency and building are in scope. */
  detailLink(paymentId: number): string | null {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return null;
    }

    return this.mine()
      ? RoutePaths.myRentPaymentDetail(scope.agencyId, scope.buildingId, paymentId)
      : RoutePaths.rentPaymentDetail(scope.agencyId, scope.buildingId, paymentId);
  }


  /** "Room 101 · Dec 2026", with the receipt number once there is one; never the database id. */
  cardPlace(payment: { roomName?: string | null; roomNumber?: number | string | null; paymentForMonth?: string | null; receiptNumber?: string | null; id: number }): string {
    const room = payment.roomName || payment.roomNumber;
    return [room ? `Room ${room}` : null, this.formatMonth(payment.paymentForMonth), payment.receiptNumber].filter(Boolean).join(' · ');
  }

  /** "Balance KES 6,200", "Paid KES 6,200 · 3 Oct". The Pending chip says nothing is paid. */
  cardMoney(payment: any): string {
    const owing = this.amount(payment.outstanding);
    const paid = this.amount(payment.amountPaid);
    const when = payment.paymentDate ? this.formatDate(payment.paymentDate).replace(/ \d{4}$/, '') : null;
    if (owing <= 0) {
      return [`Paid ${this.money(payment.amountPaid ?? payment.totalDue)}`, when].filter(Boolean).join(' · ');
    }
    return `Balance ${this.money(payment.outstanding)}`;
  }

  /** The second line of a part-paid bill, so the card never wraps mid-sentence. */
  cardPaid(payment: RentPaymentPreview): string | null {
    if (this.amount(payment.outstanding) <= 0 || this.amount(payment.amountPaid) <= 0) {
      return null;
    }
    const when = payment.paymentDate ? this.formatDate(payment.paymentDate).replace(/ \d{4}$/, '') : null;
    return `${this.money(payment.amountPaid)} paid${when ? ' ' + when : ''}`;
  }

  /** False for a month the monthly run opened but no money has reached yet. */
  hasPayment(payment: RentPaymentPreview): boolean {
    return !!payment.paymentDate || Number(payment.amountPaid ?? 0) > 0;
  }

  amount(value: number | string | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Whole shillings; a missing figure (an older server) shows as a dash, not 0. */
  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : shortDate(date, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatMonth(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : shortDate(date, { year: 'numeric', month: 'short' });
  }

  async reload(): Promise<void> {
    const appending = this.loadingMore();
    this.loading.set(!appending);
    this.error.set(null);

    const raw = this.form.getRawValue();
    const params: RentPaymentSearchParams = {
      ...raw,
      tenantId: raw.tenantId ?? undefined,
      roomId: raw.roomId ?? undefined,
      sort: this.sorting.toParams(),
      paymentForMonth: raw.paymentForMonth ? toMonthPath(raw.paymentForMonth) : undefined,
      statuses: this.statusChips.filter((chip) => this.statusFilter().includes(chip.key)).flatMap((chip) => [...chip.statuses])
    };

    const scope = this.scope();
    const scoped = scope.agencyId !== null && scope.buildingId !== null
      ? { agencyId: scope.agencyId, buildingId: scope.buildingId }
      : null;
    // An agency without a building: that agency's payments, as far as the caller may read.
    // Only a platform reader (RENT_PAYMENT_READ_ALL) gets the unscoped search.
    const agencyOnly = !scoped && scope.agencyId !== null ? scope.agencyId : null;

    try {
      let result;
      if (this.mine()) {
        // One tenancy's history when the dashboard links here for it — a person may hold several.
        const tenantId = Number(this.route.snapshot.queryParamMap.get('tenantId')) || undefined;
        result = await firstValueFrom(this.rentService.getMyPayments({ page: params.page, size: params.size, tenantId }));
      } else if (scoped) {
        result = await firstValueFrom(this.rentService.getPaymentsForBuilding(scoped!.agencyId, scoped!.buildingId, params));
      } else if (agencyOnly !== null) {
        result = await firstValueFrom(this.rentService.getPaymentsForAgency(agencyOnly, params));
      } else {
        result = await firstValueFrom(this.rentService.searchPayments(params));
      }

      this.payments.set(appending ? [...this.payments(), ...result.items] : result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
