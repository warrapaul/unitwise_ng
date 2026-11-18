import { RoomTitlePipe } from '../../../shared/pipes/room-title.pipe';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MoreMenuComponent } from '../../../shared/components/more-menu/more-menu.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { asText, downloadCsv, fetchAllPages } from '../../../shared/utils/csv-export.util';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { formatCurrency, monthLabel, monthRange } from '../../../shared/utils/format.util';
import { WorkingMonthService } from '../../../core/services/working-month.service';
import { MonthNavComponent } from '../../../shared/components/month-nav/month-nav.component';
import { ExpenseDialogComponent } from '../components/expense-dialog.component';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_PAYMENT_METHODS, Expense, ExpenseCategory, ExpenseSearchParams, ExpenseSummary } from '../expenses.models';
import { ExpensesService } from '../expenses.service';

/**
 * Money spent on the buildings: what it went on, what it cost and the receipt. Opens on this month
 * for the building in context (or every building), with the total and the biggest categories first.
 */
@Component({
  selector: 'app-expense-list-page',
  standalone: true,
  imports: [RoomTitlePipe, ReactiveFormsModule, RouterLink, CardTableDirective, FormFeedbackDirective, ContextGuardComponent,
    EmptyStateComponent, ErrorStateComponent, FilterPanelComponent, LoadingStateComponent, MoreMenuComponent, PaginationComponent,
    PermissionGateComponent, SectionCardComponent, ExpenseDialogComponent, MonthNavComponent],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" requirePermission="EXPENSE_READ">
        @if (summary(); as s) {
          <div class="kpi-grid" aria-label="Spent in this period">
            <div class="kpi">
              <span class="kpi__label">Spent</span>
              <span class="kpi__value">{{ money(s.total) }}</span>
              <span class="kpi__note">{{ periodLabel() }}</span>
            </div>
            @for (row of s.byCategory.slice(0, 3); track row.category) {
              <button type="button" class="kpi kpi--button" [class.kpi--active]="form.controls.category.value === row.category"
                      (click)="pickCategory(row.category)">
                <span class="kpi__label">{{ label(row.category) }}</span>
                <span class="kpi__value">{{ money(row.total) }}</span>
                <span class="kpi__note">{{ share(row.total, s.total) }} of the total</span>
              </button>
            }
          </div>
        }

        <app-section-card title="Expenses" [subtitle]="context.buildingId() ? context.active().buildingName : 'All buildings'">
          <button type="button" actions class="btn btn-secondary" [disabled]="exporting() || items().length === 0" (click)="exportCsv()">
            {{ exporting() ? 'Exporting…' : 'Export CSV' }}
          </button>
          <app-permission-gate actions [permissions]="['EXPENSE_WRITE']">
            <button type="button" class="btn btn-primary" (click)="editing.set({ expense: null })">Record expense</button>
          </app-permission-gate>
          <app-filter-panel actions [form]="form" (clear)="clear()">
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="applySearch()">
              <div class="grid-auto filters-grid">
                <div class="field"><span>Month</span><app-month-nav [(month)]="month" /></div>
                <label class="field">
                  <span>Category</span>
                  <select formControlName="category">
                    <option value="">Any category</option>
                    @for (option of categories; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
                  </select>
                </label>
                <label class="field"><span>Description, payee or reference</span><input formControlName="search"></label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-text" (click)="clear()">Clear</button>
              </div>
            </form>
          </app-filter-panel>

          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading expenses…" />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (items().length === 0) {
            <app-empty-state title="No expenses" [description]="'Nothing recorded for ' + periodLabel() + '. Record repairs, caretaker pay, water and other costs to see what each building really earns.'" />
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table">
                <thead>
                  <tr><th>Date</th><th>What</th><th>Where</th><th>Category</th><th class="num">Amount</th><th><span class="visually-hidden">Receipt</span></th><th><span class="visually-hidden">Actions</span></th></tr>
                </thead>
                <tbody>
                  @for (expense of items(); track expense.id) {
                    <tr>
                      <td>{{ date(expense.expenseDate) }}</td>
                      <td class="card-title">
                        <div class="cell-stack">
                          <strong>{{ expense.description }}</strong>
                          @if (expense.payee) { <span class="muted">Paid to {{ expense.payee }}</span> }
                          @if (expense.paidBy === 'OWNER' && context.managesForOwners()) { <span class="muted">Paid by the owner directly</span> }
                          @if (expense.maintenanceRequestId && expense.maintenanceRequestLabel) {
                            <a class="text-link" [routerLink]="repairLink(expense)">{{ expense.maintenanceRequestLabel }}</a>
                          }
                        </div>
                      </td>
                      <td>{{ expense.buildingName }}@if (expense.roomName) { · {{ expense.roomName | roomTitle }} }</td>
                      <td>{{ label(expense.category) }}</td>
                      <td class="num"><strong>{{ money(expense.amount) }}</strong></td>
                      <td>
                        @if (expense.receiptUrl) {
                          <a class="text-link" [href]="expense.receiptUrl" target="_blank" rel="noopener">Receipt</a>
                        } @else {
                          <span class="muted">No receipt</span>
                        }
                      </td>
                      <td class="row-action">
                        <app-permission-gate [permissions]="['EXPENSE_WRITE']">
                          <app-more-menu [label]="'⋯'">
                            <button type="button" (click)="editing.set({ expense })">Edit</button>
                            <button type="button" (click)="remove(expense)">Delete</button>
                          </app-more-menu>
                        </app-permission-gate>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (pagination(); as page) {
              <app-pagination [pagination]="page" [size]="page.size" [shown]="items().length" [total]="page.totalElements"
                              noun="expenses" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
            }
          }
        </app-section-card>
      </app-context-guard>
    </section>

    @if (editing(); as state) {
      <app-expense-dialog [agencyId]="context.agencyId()!" [buildingId]="context.buildingId()" [expense]="state.expense"
                          (saved)="saved(state.expense)" (closed)="editing.set(null)" />
    }
  `,
  styles: [`
    .kpi--button { font: inherit; text-align: start; cursor: pointer; }
    .row-action { width: 1%; text-align: right; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseListPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  private readonly expenses = inject(ExpensesService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly categories = EXPENSE_CATEGORIES;
  /** The month shown; shared with the other money pages. */
  readonly month = inject(WorkingMonthService).month;

  readonly form = this.fb.group({
    category: '' as ExpenseCategory | '',
    search: ''
  });

  readonly items = signal<Expense[]>([]);
  readonly summary = signal<ExpenseSummary | null>(null);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly exporting = signal(false);
  readonly editing = signal<{ expense: Expense | null } | null>(null);
  private readonly page = signal({ page: 0, size: 20 });
  private readonly applied = signal(this.form.getRawValue());

  readonly periodLabel = computed(() => monthLabel(this.month()));

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      this.month();
      untracked(() => {
        this.page.update((p) => ({ ...p, page: 0 }));
        void this.reload();
      });
    });
  }

  private params(): ExpenseSearchParams {
    const v = this.applied();
    const { from, to } = monthRange(this.month());
    return {
      buildingId: this.context.buildingId(),
      category: v.category || null,
      from,
      to,
      search: v.search.trim() || null
    };
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = this.params();
      const [list, summary] = await Promise.all([
        firstValueFrom(this.expenses.search(agencyId, { ...params, ...this.page() })),
        firstValueFrom(this.expenses.summary(agencyId, { ...params, category: null }))
      ]);
      this.items.set(list.items);
      this.pagination.set(list.pagination ?? null);
      this.summary.set(summary);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  applySearch(): void {
    this.applied.set(this.form.getRawValue());
    this.page.update((p) => ({ ...p, page: 0 }));
    void this.reload();
  }

  clear(): void {
    this.form.reset({ category: '', search: '' });
    this.applySearch();
  }

  pickCategory(category: ExpenseCategory): void {
    this.form.controls.category.setValue(this.form.controls.category.value === category ? '' : category);
    this.applySearch();
  }

  go(page: number): void {
    this.page.update((p) => ({ ...p, page: Math.max(0, page) }));
    void this.reload();
  }

  resize(size: number): void {
    this.page.set({ page: 0, size });
    void this.reload();
  }

  saved(previous: Expense | null): void {
    this.editing.set(null);
    this.toasts.push('success', previous ? 'Expense updated.' : 'Expense recorded.');
    void this.reload();
  }

  async remove(expense: Expense): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null || !await this.confirm.ask({
      title: `Delete this expense of ${this.money(expense.amount)}?`,
      message: `${expense.description} — it stops counting towards ${expense.buildingName}'s costs. The record stays in the audit trail.`,
      confirmLabel: 'Delete expense',
      destructive: true
    })) {
      return;
    }
    try {
      await firstValueFrom(this.expenses.delete(agencyId, expense.buildingId, expense.id));
      this.toasts.push('success', 'Expense deleted.');
      void this.reload();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  async exportCsv(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.exporting.set(true);
    try {
      const { rows, truncated } = await fetchAllPages((page, size) => firstValueFrom(this.expenses.search(agencyId, { ...this.params(), page, size })));
      const methods = Object.fromEntries(EXPENSE_PAYMENT_METHODS.map((m) => [m.value, m.label]));
      downloadCsv(`expenses-${this.month()}`, rows, [
        { header: 'Date', value: (e) => e.expenseDate },
        { header: 'Building', value: (e) => e.buildingName },
        { header: 'Room', value: (e) => asText(e.roomName) },
        { header: 'Category', value: (e) => this.label(e.category) },
        { header: 'Description', value: (e) => e.description },
        { header: 'Paid to', value: (e) => e.payee },
        { header: 'Amount (KES)', value: (e) => e.amount },
        { header: 'Payment method', value: (e) => e.paymentMethod ? methods[e.paymentMethod] : '' },
        ...(this.context.managesForOwners() ? [{ header: 'Whose money', value: (e: Expense) => e.paidBy === 'OWNER' ? 'Owner directly' : 'Agency' }] : []),
        { header: 'Reference', value: (e) => asText(e.reference) },
        { header: 'Repair', value: (e) => e.maintenanceRequestLabel },
        { header: 'Receipt attached', value: (e) => !!e.receiptUrl },
        { header: 'Recorded by', value: (e) => e.recordedByName }
      ]);
      this.toasts.push(truncated ? 'warning' : 'success', truncated
        ? `Exported the first ${rows.length.toLocaleString('en-KE')} expenses. Narrow the dates to export the rest.`
        : `Exported ${rows.length.toLocaleString('en-KE')} expense${rows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.exporting.set(false);
    }
  }

  repairLink(expense: Expense): string | null {
    return expense.maintenanceRequestId ? RoutePaths.maintenanceDetail(expense.agencyId, expense.buildingId, expense.maintenanceRequestId) : null;
  }

  label(category: ExpenseCategory): string {
    return EXPENSE_CATEGORY_LABELS[category] ?? category;
  }

  share(part: number | string, total: number | string): string {
    const t = Number(total) || 0;
    return t > 0 ? `${Math.round((Number(part) / t) * 100)}%` : '0%';
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  date(value: string): string {
    return displayDate(value);
  }
}
