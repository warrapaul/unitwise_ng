import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { shortDate } from '../../../shared/utils/format.util';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { syncBuildingFilterToContext } from '../../../shared/utils/building-filter.util';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { formatCurrency, roomTitle } from '../../../shared/utils/format.util';
import {
  PortfolioOverduePayment,
  PortfolioOverdueSearchParams,
  ReminderResult
} from '../models/rent.models';
import { DatePipe } from '@angular/common';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { NotificationService } from '../../../core/services/notification.service';
import { RecordPaymentDialogComponent } from '../components/record-payment-dialog.component';
import { ReminderDialogComponent } from '../components/reminder-dialog.component';
import { RentService } from '../rent.service';


/** Everything one tenant owes; a page of bills arrives one row per month. */
interface OverdueGroup {
  tenantId: number;
  tenantName: string;
  formerTenant: boolean;
  bills: PortfolioOverduePayment[];
  oldest: PortfolioOverduePayment;
  total: number;
  lastRemindedAt: string | null;
  reminderCount: number;
}

@Component({
  selector: 'app-portfolio-overdue-page',
  standalone: true,
  imports: [PhoneMenuComponent, CardTableDirective, 
    ContextGuardComponent,
    ContextScopeNoticeComponent,
    EntityPickerComponent,
    RoomPickerComponent,
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    LoadingStateComponent,
    PaginationComponent,
    SectionCardComponent,
    DatePipe,
    PermissionGateComponent,
    RecordPaymentDialogComponent,
    ReminderDialogComponent
  ],
  template: `
    <section class="stack">
      <h1 class="sr-only">Arrears &amp; reports</h1>
      <app-context-guard [requireBuilding]="false" [requireAnyBuilding]="true" action="to see who is behind on rent">
      <app-section-card title="Arrears & reports">
        <app-filter-panel actions [form]="form" (clear)="clear()" [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Overdue as of</span>
                <input type="date" formControlName="asOf">
              </label>
              @if (canChooseBuilding()) {
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
              }
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
              </label>
              <!-- A room is picked inside its building, so only once one is chosen. -->
              @if (context.agencyId() !== null && (form.controls.buildingId.value ?? context.buildingId()) !== null) {
                <label class="field">
                  <span>Room</span>
                  <app-room-picker
                    formControlName="roomId"
                    [agencyId]="context.agencyId()"
                    [buildingId]="form.controls.buildingId.value ?? context.buildingId()"
                  />
                </label>
              }
              <label class="field">
                <span>Search</span>
                <input formControlName="search" placeholder="Name or phone">
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-context-scope-notice noun="overdue payments" />

      @if (loading()) {
        <app-loading-state label="Loading overdue payments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payments().length === 0) {
        <app-empty-state
          title="No overdue payments"
          description="Everyone is paid up to this date. Bills that pass their due date appear here."
          actionLabel="See all rent bills"
          [actionLink]="RoutePaths.rentPayments"
        />
      } @else {
        <section class="panel table-shell">
          <div class="arrears-bar">
            <p class="arrears-total">
              <strong>{{ money(totalOwed()) }}</strong> owed by {{ groups().length }} {{ groups().length === 1 ? 'tenant' : 'tenants' }}
              · oldest {{ oldestDays() }} {{ oldestDays() === 1 ? 'day' : 'days' }}
            </p>
            <div class="arrears-tools">
              <label class="sr-only" for="arrears-sort">Sort by</label>
              <select id="arrears-sort" class="control-select" [value]="sort()" (change)="sort.set($any($event.target).value)">
                <option value="amount">Most owed first</option>
                <option value="days">Longest late first</option>
              </select>
              <button type="button" class="btn btn-secondary btn-sm" (click)="exportCsv()">Export</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="print()">Print</button>
            </div>
          </div>
          @if (selected().length > 0) {
            <div class="bulk">
              <span>{{ selected().length }} selected</span>
              <button type="button" class="btn btn-secondary btn-sm" (click)="reminding.set(selectedPayments())">Send reminders</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="selected.set([])">Clear</button>
            </div>
          }
          <div class="table-scroll">
            <table appCardTable class="table overdue-table">
              <thead>
                <tr>
                  <th class="check-col" data-card-label="Select">
                    <input type="checkbox" aria-label="Select all" [checked]="allSelected()" (change)="toggleAll($event)">
                  </th>
                  <th>Tenant</th>
                  <th>Location</th>
                  <th>Months</th>
                  <th class="num">Balance</th>
                  <th class="num">Late by</th>
                  <th>Reminded</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (group of groups(); track group.tenantId) {
                  <tr>
                    <td class="check-col">
                      <input type="checkbox" [attr.aria-label]="'Select ' + group.tenantName"
                             [checked]="isSelected(group)" (change)="toggle(group)">
                    </td>
                    <td class="card-title">
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="tenantLink(group.oldest)">{{ group.tenantName }}</a>
                        @if (group.formerTenant) { <span class="status-chip status-chip--neutral">Former tenant</span> }
                        @if (group.oldest.tenantPhone) {
                          <app-phone-menu [phone]="group.oldest.tenantPhone" />
                        }
                      </div>
                    </td>
                    <td>
                      <!-- The room identifies a debt on the ground; context the operator already has is left out. -->
                      <div class="cell-stack">
                        <span>{{ roomLabel(group.oldest) }}</span>
                        @if (locationDetail(group.oldest); as detail) {
                          <span class="muted">{{ detail }}</span>
                        }
                      </div>
                    </td>
                    <td>
                      <details class="months">
                        <summary>{{ group.bills.length }} {{ group.bills.length === 1 ? 'month' : 'months' }} · from {{ displayMonth(group.oldest.paymentForMonth) }}</summary>
                        <ul>
                          @for (bill of group.bills; track bill.paymentId) {
                            <li>
                              <a class="text-link" [routerLink]="detailLink(bill)">{{ displayMonth(bill.paymentForMonth) }}</a>
                              <span>{{ money(bill.totalOutstanding) }}</span>
                              <span class="muted">{{ bill.daysOverdue }} {{ bill.daysOverdue === 1 ? 'day' : 'days' }}</span>
                              <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_CREATE]">
                                <button type="button" class="btn btn-primary btn-sm" (click)="paying.set(bill)">Record payment</button>
                              </app-permission-gate>
                            </li>
                          }
                        </ul>
                      </details>
                    </td>
                    <td class="num"><strong>{{ money(group.total) }}</strong></td>
                    <td class="num">{{ group.oldest.daysOverdue }} {{ group.oldest.daysOverdue === 1 ? 'day' : 'days' }}</td>
                    <td class="muted">
                      @if (group.lastRemindedAt) {
                        {{ group.lastRemindedAt | date: 'd MMM y' }} · {{ group.reminderCount }}×
                      } @else {
                        Never
                      }
                    </td>
                    <td class="actions-col">
                      <div class="overdue-actions">
                        <button type="button" class="btn btn-secondary btn-sm" (click)="reminding.set([group.oldest])">Remind</button>
                        <!-- Oldest first: that is the bill a payment should settle. The main action ends the row. -->
                        <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_CREATE]">
                          <button type="button" class="btn btn-primary btn-sm" (click)="paying.set(group.oldest)">Record payment</button>
                        </app-permission-gate>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="payments().length"
            [total]="pagination()!.totalElements"
            noun="overdue payments"
            [pagination]="pagination()!"
            [size]="pagination()!.size"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
      </app-context-guard>
    </section>

    @if (paying(); as payment) {
      <app-record-payment-dialog
        [agencyId]="payment.agencyId"
        [buildingId]="payment.buildingId"
        [tenantId]="payment.tenantId"
        [tenantName]="payment.tenantName"
        [month]="payment.paymentForMonth"
        [amount]="payment.totalOutstanding"
        (recorded)="paid()"
        (closed)="paying.set(null)"
      />
    }

    @if (reminding(); as list) {
      <app-reminder-dialog [payments]="list" (sent)="reminded($event)" (closed)="reminding.set(null)" />
    }
  `,
  styles: [`
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    /* Totals and sort stay in view down a long list. */
    .arrears-bar { position: sticky; top: 0; z-index: 5; background: var(--surface); border-radius: var(--radius-lg); }
    /* Tucks under the app bar, whose height changes with the switcher, so nothing shows above it. */
    @media (max-width: 980px) { .arrears-bar { top: 3rem; } }
    /* On a card the tick moves to the corner, leaving the first line to the tenant. */
    @media (max-width: 640px) {
      .num { text-align: start; }
      .overdue-table.table--cards tbody tr { position: relative; }
      .overdue-table.table--cards tbody tr > td.check-col { position: absolute; top: var(--space-3); right: var(--space-3); width: auto; }
      .overdue-table.table--cards tbody tr > td.check-col::before { content: none; }
      .overdue-table.table--cards tbody tr > td.card-title { padding-right: var(--space-6); }
    }
    .arrears-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4); }
    .arrears-total { margin: 0; }
    .arrears-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .cell-stack .status-chip { justify-self: start; }
    .months summary { cursor: pointer; }
    .months ul { display: grid; gap: var(--space-2); margin: var(--space-2) 0 0; padding: 0; list-style: none; }
    .months li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); }
    .months li app-permission-gate { margin-left: auto; }
    @media print {
      .arrears-tools, .check-col, .actions-col, .bulk { display: none; }
    }
    .table-shell { display: grid; gap: var(--space-3); padding: var(--space-4); }
    .bulk { display: flex; align-items: center; gap: var(--space-2-5); flex-wrap: wrap; font-weight: var(--weight-semibold); }
    .check-col { width: 1%; }
    .actions-col { width: 1%; white-space: nowrap; }
    /* Side by side at a comfortable size — stacked, they were small targets on top of each other. */
    .overdue-actions { display: flex; flex-wrap: nowrap; gap: var(--space-2); justify-content: flex-end; }
    .overdue-actions .btn { min-height: 2.25rem; white-space: nowrap; }
    .phone { display: inline-flex; align-items: center; gap: var(--space-1-5); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PortfolioOverduePageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  readonly context = inject(ActiveContextService);
  readonly pickers = inject(EntityPickerRegistry);

  readonly canChooseBuilding = computed(() =>
    this.context.canChooseBuilding(PermissionConstants.RENT_PAYMENT_READ_ALL));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payments = signal<PortfolioOverduePayment[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly Permissions = PermissionConstants;
  private readonly toasts = inject(NotificationService);
  readonly paying = signal<PortfolioOverduePayment | null>(null);

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }
  readonly reminding = signal<PortfolioOverduePayment[] | null>(null);
  /** Tenants ticked for a bulk reminder, by tenant id. */
  readonly selected = signal<number[]>([]);
  readonly sort = signal<'amount' | 'days'>('amount');

  /** One line per tenant: the same person three times said three debts, not one debt three months old. */
  readonly groups = computed<OverdueGroup[]>(() => {
    const byTenant = new Map<number, PortfolioOverduePayment[]>();
    for (const payment of this.payments()) {
      byTenant.set(payment.tenantId, [...(byTenant.get(payment.tenantId) ?? []), payment]);
    }
    const groups = [...byTenant.entries()].map(([tenantId, list]) => {
      const bills = [...list].sort((a, b) => a.paymentForMonth.localeCompare(b.paymentForMonth));
      const reminded = bills.map((bill) => bill.lastRemindedAt).filter(Boolean).sort() as string[];
      return {
        tenantId,
        tenantName: bills[0].tenantName,
        formerTenant: bills.some((bill) => bill.formerTenant),
        bills,
        oldest: bills[0],
        total: bills.reduce((sum, bill) => sum + Number(bill.totalOutstanding ?? 0), 0),
        lastRemindedAt: reminded.at(-1) ?? null,
        reminderCount: bills.reduce((sum, bill) => sum + (bill.reminderCount ?? 0), 0)
      };
    });
    return this.sort() === 'amount'
      ? groups.sort((a, b) => b.total - a.total)
      : groups.sort((a, b) => b.oldest.daysOverdue - a.oldest.daysOverdue);
  });

  readonly totalOwed = computed(() => this.groups().reduce((sum, group) => sum + group.total, 0));
  readonly oldestDays = computed(() => Math.max(0, ...this.groups().map((group) => group.oldest.daysOverdue)));

  readonly allSelected = computed(() =>
    this.groups().length > 0 && this.groups().every((group) => this.selected().includes(group.tenantId)));

  /** One reminder each: the server sends one per bill, so a tenant's oldest stands for the whole debt. */
  selectedPayments(): PortfolioOverduePayment[] {
    return this.groups().filter((group) => this.selected().includes(group.tenantId)).map((group) => group.oldest);
  }

  isSelected(group: OverdueGroup): boolean {
    return this.selected().includes(group.tenantId);
  }

  toggle(group: OverdueGroup): void {
    this.selected.update((ids) => ids.includes(group.tenantId)
      ? ids.filter((id) => id !== group.tenantId)
      : [...ids, group.tenantId]);
  }

  toggleAll(event: Event): void {
    this.selected.set((event.target as HTMLInputElement).checked ? this.groups().map((group) => group.tenantId) : []);
  }

  print(): void {
    // Print the month breakdown too, not just the rows that happened to be open.
    document.querySelectorAll<HTMLDetailsElement>('details.months').forEach((row) => { row.open = true; });
    window.print();
  }

  /** The bills on screen, one row each, for a spreadsheet. */
  exportCsv(): void {
    // A leading = + - @ would run as a formula when the file is opened.
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
    const header = ['Tenant', 'Phone', 'Building', 'Room', 'Month', 'Balance', 'Days late', 'Former tenant'];
    const rows = this.groups().flatMap((group) => group.bills.map((bill) => [
      bill.tenantName, bill.tenantPhone, bill.buildingName, bill.roomName, bill.paymentForMonth.slice(0, 7),
      bill.totalOutstanding, bill.daysOverdue, group.formerTenant ? 'Yes' : 'No'
    ]));
    const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `arrears-${this.form.getRawValue().asOf}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  tenantLink(payment: PortfolioOverduePayment): string {
    return RoutePaths.tenantDetail(payment.agencyId, payment.buildingId, payment.tenantId);
  }

  /** Building, then agency — each only when the context has not already fixed it. */
  locationDetail(payment: PortfolioOverduePayment): string {
    const parts: string[] = [];
    if (this.context.buildingId() === null) {
      parts.push(payment.buildingName);
    }
    if (this.context.agencies().length > 1 && this.context.agencyId() === null) {
      parts.push(payment.agencyName);
    }
    return parts.filter(Boolean).join(' · ');
  }

  paid(): void {
    this.toasts.push('success', `Payment recorded for ${this.paying()?.tenantName ?? 'the tenant'}.`);
    this.paying.set(null);
    void this.reload();
  }

  /** Rows show the new reminder stamp at once; skipped ones are explained in the dialog. */
  reminded(results: ReminderResult[]): void {
    const sent = results.filter((result) => result.sent);
    this.payments.update((rows) => rows.map((row) => {
      const result = sent.find((entry) => entry.paymentId === row.paymentId);
      return result ? { ...row, lastRemindedAt: result.lastRemindedAt, reminderCount: result.reminderCount } : row;
    }));
    if (sent.length > 0) {
      this.toasts.push('success', `${sent.length} reminder${sent.length === 1 ? '' : 's'} sent.`);
    }
    this.selected.set([]);
  }

  readonly form = this.formBuilder.group({
    asOf: this.today(),
    buildingId: [null as number | null],
    tenantId: [null as number | null],
    roomId: [null as number | null],
    search: '',
    page: 0,
    size: 100
  });

  constructor() {
    // The page's building filter is the shared context: a building picked here carries to the next page.
    syncBuildingFilterToContext(this.form.controls.buildingId);
    // A new "as of" date is a new question: answer it without a Search press.
    this.form.controls.asOf.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.patchValue({ page: 0 }, { emitEvent: false });
      void this.reload();
    });

    // Starts on the building in context and follows the switcher (§30.5);
    // the server still intersects whatever is asked with what the caller may read.
    effect(() => {
      const buildingId = this.context.buildingId();
      this.context.agencyId();
      // A room belongs to one building; switching building leaves it meaningless.
      this.form.patchValue({ buildingId, roomId: null, page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      asOf: this.today(),
      buildingId: this.context.buildingId(),
      tenantId: null,
      roomId: null,
      search: '',
      page: 0,
      size: this.form.controls.size.value
    });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const page = this.pagination()?.page ?? 0;
    if (page > 0) {
      this.form.patchValue({ page: page - 1 });
      await this.reload();
    }
  }

  async nextPage(): Promise<void> {
    const current = this.pagination();
    if (current && !current.isLast) {
      this.form.patchValue({ page: current.page + 1 });
      await this.reload();
    }
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ page: 0, size });
    await this.reload();
  }

  detailLink(payment: PortfolioOverduePayment): string {
    return RoutePaths.rentPaymentDetail(payment.agencyId, payment.buildingId, payment.paymentId);
  }

  roomLabel(payment: PortfolioOverduePayment): string {
    return roomTitle(payment.roomName || payment.roomNumber);
  }

  displayDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : shortDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  displayMonth(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : shortDate(date, { month: 'short', year: 'numeric' });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const value = this.form.getRawValue();
      const params: PortfolioOverdueSearchParams = {
        asOf: value.asOf,
        agencyId: this.context.agencyId() ?? undefined,
        buildingId: value.buildingId ?? undefined,
        tenantId: value.tenantId ?? undefined,
        roomId: value.roomId ?? undefined,
        search: value.search || undefined,
        page: value.page,
        size: value.size
      };
      const result = await firstValueFrom(this.rentService.getPortfolioOverduePayments(params));
      this.payments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private today(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
