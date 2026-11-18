import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { RENT_STATUS_LABELS } from '../../../shared/constants/status-badges';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { formatCurrency } from '../../../shared/utils/format.util';
import { displayDate } from '../../../shared/utils/display-date.util';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { RoutePaths } from '../../../core/routes/route-paths';
import { NotificationService } from '../../../core/services/notification.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { RentPaymentDetail } from '../models/rent.models';
import { RentService } from '../rent.service';
import { RecordPaymentDialogComponent } from './record-payment-dialog.component';

const PAGE_SIZE = 12;
/** A month in one of these has nothing left to collect. */
const SETTLED = new Set(['COMPLETED', 'OVERPAID', 'REFUNDED']);

/**
 * A tenant's rent, month by month, where the tenant is: what is owed now, what
 * each month came to and how it was paid, and a way to take a payment against
 * the month it is for.
 *
 * One record per month — the monthly run opens it before any money arrives —
 * so an unpaid month is a row with a balance, not a missing row.
 */
@Component({
  selector: 'app-tenant-rent-payments',
  standalone: true,
  imports: [LoadingStateComponent, ErrorStateComponent, CardTableDirective, MoneyPipe, DatePipe, RouterLink, SectionCardComponent, PermissionGateComponent, StatusChipComponent, HumanLabelPipe,
    RowLinkDirective, RecordPaymentDialogComponent],
  template: `
    <app-section-card title="Rent">
      <ng-container actions>
        <!-- Every payment, with its receipt: the months below show only the latest on each. -->
        <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPayments" [queryParams]="{ tenantId: tenantId() }">Payment history</a>
      </ng-container>
      @if (loading() && records().length === 0) {
        <app-loading-state [compact]="true" label="Loading rent…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (records().length === 0) {
        <p class="muted">No rent billed to this tenant yet.</p>
      } @else {
        <!-- One line for where they stand; each month's detail is in the list. -->
        @if (unpaid().length > 0) {
          <div class="owed" role="status">
            <span><strong>{{ owed() | money }} due</strong>{{ owedDetail() }}</span>
          </div>
        } @else {
          <p class="owed owed--clear" role="status">Up to date: nothing owed.</p>
        }

        <div class="table-scroll">
          <!--
            On a phone, a card per month: month and status on top, what is still owed with a
            paid-so-far bar, the last payment, and Pay — instead of six labelled fields.
          -->
          <table appCardTable class="table payments">
            <thead>
              <tr>
                <th>Month</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Status</th><th>Last payment</th>
                <th><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (record of records(); track record.id) {
                <tr [appRowLink]="RoutePaths.rentPaymentDetail(agencyId(), buildingId(), record.id)">
                  <td>
                    <div class="cell-stack">
                      <a class="record-link__primary" [routerLink]="RoutePaths.rentPaymentDetail(agencyId(), buildingId(), record.id)">
                        {{ record.paymentForMonth ? (record.paymentForMonth | date: 'MMM y') : '-' }}
                      </a>
                      @if (record.dueDate) { <span class="muted">due {{ record.dueDate | date: 'd MMM y' }}</span> }
                    </div>
                  </td>
                  <td class="card-skip">{{ due(record) | money }}</td>
                  <td class="card-skip">{{ (record.amountPaid ?? 0) | money }}</td>
                  <td class="card-skip" [class.balance--owed]="balance(record) > 0">{{ balance(record) | money }}</td>
                  <td class="status-cell"><app-status-chip [status]="record.status" [labels]="RENT_STATUS_LABELS" /></td>
                  <td class="card-skip">
                    @if (record.paymentDate) {
                      {{ record.paymentDate | date: 'd MMM y' }}<span class="muted"> · {{ record.paymentMethod | humanLabel }}</span>
                    } @else {
                      <span class="muted">Nothing paid</span>
                    }
                  </td>
                  <td class="row-action">
                    @if (balance(record) > 0) {
                      <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
                        <button type="button" class="btn btn-primary btn-sm" (click)="$event.stopPropagation(); paying.set(record)">Record payment</button>
                      </app-permission-gate>
                    }
                  </td>
                  <!-- One line: what is left, and what has been paid. The banner above sums the months. -->
                  <td class="card-only month-summary">{{ summaryLine(record) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (hasMore()) {
          <button type="button" class="btn btn-secondary btn-sm more" [disabled]="loading()" (click)="loadMore()">
            {{ loading() ? 'Loading…' : 'Earlier months' }}
          </button>
        }
      }
    </app-section-card>

    @if (paying(); as record) {
      <app-record-payment-dialog [agencyId]="agencyId()" [buildingId]="buildingId()" [tenantId]="tenantId()"
                                 [tenantName]="tenantName()" [month]="monthOf(record)" [amount]="balance(record)"
                                 (recorded)="recorded()" (closed)="paying.set(null)" />
    }
  `,
  styles: [`
    :host { display: contents; }
    p { margin: 0; }
    .owed {
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      flex-wrap: wrap;
      padding: var(--space-2-5) var(--space-3);
      border: 1px solid var(--warning-border);
      border-radius: var(--radius-lg);
      background: var(--warning-tint);
    }
    .balance--owed { font-weight: var(--weight-bold); }
    .row-action { text-align: right; white-space: nowrap; }
    .month-summary { font-size: var(--font-description); color: var(--text-muted); }
    @media (max-width: 640px) {
      /* Month on the left, its status on the right of the same line. */
      .payments.table--cards tbody tr > td:first-child { grid-column: 1; }
      .payments.table--cards tbody tr > td.status-cell { grid-column: 2; grid-row: 1; justify-self: end; align-self: start; }
      .payments.table--cards tbody tr > td.status-cell::before { content: none; }
      /* The summary and Pay share the second line. */
      .payments.table--cards tbody tr > td.month-summary { grid-column: 1; grid-row: 2; align-self: center; }
      .payments.table--cards tbody tr > td.row-action { grid-column: 2; grid-row: 2; order: 0; }
    }
    .more { justify-self: start; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantRentPaymentsComponent {
  readonly RENT_STATUS_LABELS = RENT_STATUS_LABELS;
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();
  readonly tenantName = input('Tenant');
  /** Bumped by the host after it records a payment of its own, so this list catches up. */
  readonly refresh = input(0);

  readonly RoutePaths = RoutePaths;

  private readonly rent = inject(RentService);
  private readonly toasts = inject(NotificationService);

  readonly records = signal<RentPaymentDetail[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly paying = signal<RentPaymentDetail | null>(null);
  private page = 0;

  readonly unpaid = computed(() => this.records().filter((record) => this.balance(record) > 0));
  readonly owed = computed(() => round(this.unpaid().reduce((sum, record) => sum + this.balance(record), 0)));
  readonly overdue = computed(() => this.unpaid().filter((record) => record.status === 'OVERDUE').length);

  /** " over 3 months, overdue since Sep 2026." — built here, so the punctuation sits right. */
  readonly owedDetail = computed(() => {
    const months = this.unpaid().length;
    const oldest = this.oldestOverdue();
    return `${months > 1 ? ` over ${months} months` : ''}${oldest ? `, overdue since ${oldest}` : ''}.`;
  });

  /** "Sep 2026": the month the oldest overdue balance is for. */
  readonly oldestOverdue = computed(() => {
    const months = this.unpaid().filter((record) => record.status === 'OVERDUE' && record.paymentForMonth)
      .map((record) => record.paymentForMonth!).sort();
    return months.length ? displayDate(months[0]).replace(/^\d+ /, '') : null;
  });

  constructor() {
    effect(() => {
      this.agencyId();
      this.buildingId();
      this.tenantId();
      this.refresh();
      untracked(() => void this.reload());
    });
  }

  /** What the month asks for: the rent plus any late fee. Utilities are billed on their own lines. */
  due(record: RentPaymentDetail): number {
    return round(Number(record.expectedAmount ?? 0) + Number(record.lateFee ?? 0));
  }

  /** "Balance KES 6,000", "Balance KES 2,000 · KES 4,000 paid 3 Oct · Method: M-Pesa", "Paid in full · 3 Oct · Method: M-Pesa". */
  summaryLine(record: RentPaymentDetail): string {
    const paid = Number(record.amountPaid ?? 0);
    const when = record.paymentDate ? displayDate(record.paymentDate).replace(/ \d{4}$/, '') : null;
    const method = paid > 0 && record.paymentMethod ? ` · Method: ${humanizeLabel(record.paymentMethod, record.paymentMethod)}` : '';
    if (this.balance(record) <= 0) {
      return `Paid in full${when ? ' · ' + when : ''}${method}`;
    }
    const owing = `Balance ${formatCurrency(this.balance(record))}`;
    return paid > 0 ? `${owing} · ${formatCurrency(paid)} paid${when ? ' ' + when : ''}${method}` : owing;
  }

  balance(record: RentPaymentDetail): number {
    if (SETTLED.has(record.status ?? '')) {
      return 0;
    }
    // Credit from last month's overpayment pays this month as surely as money received.
    return Math.max(0, round(this.due(record) - Number(record.amountPaid ?? 0) - Number(record.creditApplied ?? 0)));
  }

  /** `YYYY-MM`, what the payment dialog takes. */
  monthOf(record: RentPaymentDetail): string {
    return (record.paymentForMonth ?? '').slice(0, 7);
  }

  recorded(): void {
    this.paying.set(null);
    this.toasts.push('success', 'Payment recorded.');
    void this.reload();
  }

  async reload(): Promise<void> {
    this.page = 0;
    await this.fetch(false);
  }

  async loadMore(): Promise<void> {
    this.page += 1;
    await this.fetch(true);
  }

  private async fetch(append: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.rent.getPaymentsForBuilding(this.agencyId(), this.buildingId(), {
        tenantId: this.tenantId(),
        sort: ['paymentForMonth,desc'],
        page: this.page,
        size: PAGE_SIZE
      }));
      // The building search answers full records; the list type is the preview it extends.
      const items = result.items as RentPaymentDetail[];
      this.records.update((current) => append ? [...current, ...items] : items);
      this.hasMore.set(!!result.pagination && !result.pagination.isLast);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
