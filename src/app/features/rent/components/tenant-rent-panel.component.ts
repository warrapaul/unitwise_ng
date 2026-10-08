import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { ArrearsUtilityCharge, PaymentReport, PaymentReportStatus, RentPaymentDetail, TenantArrearsDetail } from '../models/rent.models';
import { RentService } from '../rent.service';
import { ReportPaymentDialogComponent } from './report-payment-dialog.component';

const REPORT_STATUS: Record<PaymentReportStatus, { label: string; tone: string }> = {
  // Waiting on the landlord is not a problem of the tenant's: info, not warning.
  SUBMITTED: { label: 'Awaiting confirmation', tone: 'info' },
  APPROVED: { label: 'Confirmed', tone: 'success' },
  REJECTED: { label: 'Not accepted', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' }
};

/**
 * A tenancy's rent, for the tenant: what this month costs and why, what is
 * paid, what is left, and a way to report a payment.
 *
 * The breakdown is the bill as the landlord built it — rent, each charge,
 * anything waived (struck through, not hidden), late fees, credit, and every
 * change made to the bill with the reason given. A tenant who can see why the
 * figure is what it is does not have to call to ask.
 *
 * Reported payments are listed with where they stand; until the landlord
 * confirms one it does not reduce the balance, and the panel says so.
 */
@Component({
  selector: 'app-tenant-rent-panel',
  standalone: true,
  imports: [RouterLink, SectionCardComponent, LoadingStateComponent, ErrorStateComponent,
    HumanLabelPipe, ReportPaymentDialogComponent],
  template: `
    <app-section-card [title]="title()" [subtitle]="subtitle()">
      <ng-container actions>
        <!-- A picker for jumping straight to a month; the arrows for stepping one at a time. -->
        <div class="month-nav" role="group" aria-label="Month">
          <button type="button" class="icon-action" (click)="shift(-1)" [disabled]="isFirstMonth()" aria-label="Previous month" title="Previous month">
            <svg class="flip" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
          </button>
          <label class="month-pick" title="Pick a month">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
              <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
            <span class="visually-hidden">Month</span>
            <input type="month" [value]="month().slice(0, 7)" [min]="firstMonth()?.slice(0, 7) ?? null" [max]="currentMonth.slice(0, 7)"
                   (change)="pick($any($event.target).value)">
          </label>
          <button type="button" class="icon-action" (click)="shift(1)" [disabled]="isCurrentMonth()" aria-label="Next month" title="Next month">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
          </button>
        </div>
        <!-- Nothing to report against a month that is settled; the backend refuses it too. -->
        @if (canReport()) {
          <button type="button" class="btn btn-primary btn-sm" (click)="reporting.set(true)">Report a payment</button>
        }
        @if (bill()) {
          <!-- Any billed month: a receipt once paid in full, a statement of the balance before then. -->
          <button type="button" class="btn btn-secondary btn-sm" [disabled]="downloading()" (click)="download()">
            {{ downloading() ? 'Preparing...' : isClear() ? 'Download receipt' : 'Download statement' }}
          </button>
        }
      </ng-container>

      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading your bill..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="loadMonth()" />
      } @else if (bill(); as detail) {
       <div class="bill-body">
        <!-- What matters first: what is left, and whether anything is waiting on the landlord. -->
        <!-- The answer the whole card exists for, set apart from the workings below it. -->
        <div [class]="'headline headline--' + standing().tone">
          <div>
            <span class="headline__label">{{ isClear() ? 'Paid in full' : 'Left to pay' }}</span>
            <strong class="headline__amount">KES {{ money(detail.totalOutstanding) }}</strong>
            <span class="headline__sum">KES {{ money(totalCharged()) }} billed · KES {{ money(detail.amountPaid) }} paid</span>
          </div>
          <span [class]="'status-chip status-chip--' + standing().tone">{{ standing().label }}</span>
          @if (pendingForMonth() > 0) {
            <span class="status-chip status-chip--info">KES {{ money(pendingForMonth()) }} awaiting confirmation</span>
          }
        </div>

        @if (detail.isProvisional) {
          <p class="hint">Not final yet — your landlord may still enter meter readings or make changes before confirming this month.</p>
        }

        <div class="table-scroll">
          <table class="table bill">
            <thead><tr><th>Item</th><th>Details</th><th class="num">Amount (KES)</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Rent</strong></td>
                <td class="muted">{{ detail.roomName || '' }}</td>
                <td class="num">{{ money(detail.baseRent) }}</td>
              </tr>
              @for (charge of detail.charges ?? []; track charge.id ?? charge.name) {
                <tr [class.bill__waived]="isWaived(charge)">
                  <td>
                    {{ charge.name }}
                    @if (isWaived(charge)) { <span class="status-chip status-chip--success">Waived</span> }
                  </td>
                  <td class="muted">{{ chargeDetail(charge) }}</td>
                  <td class="num">
                    @if (charge.isPendingInput) {
                      <span class="muted">Reading not entered</span>
                    } @else if (isWaived(charge)) {
                      <s>{{ money(charge.amount) }}</s> 0
                    } @else {
                      {{ money(charge.amount) }}
                    }
                  </td>
                </tr>
              }
              @if (positive(detail.lateFee)) {
                <tr><td>Late fee</td><td class="muted">Paid after the due date</td><td class="num">{{ money(detail.lateFee) }}</td></tr>
              }
              @if (positive(detail.creditApplied)) {
                <tr><td>Credit</td><td class="muted">Overpaid earlier, carried into this month</td><td class="num">−{{ money(detail.creditApplied) }}</td></tr>
              }
            </tbody>
            <tfoot>
              <tr><th colspan="2">Total for {{ detail.monthDisplay }}</th><td class="num"><strong>{{ money(totalCharged()) }}</strong></td></tr>
              <tr><th colspan="2">Paid (confirmed by your landlord)</th><td class="num">−{{ money(detail.amountPaid) }}</td></tr>
              <tr class="bill__left"><th colspan="2">Left to pay</th><td class="num"><strong>{{ money(detail.totalOutstanding) }}</strong></td></tr>
            </tfoot>
          </table>
        </div>

        @if (positive(detail.totalWaived)) {
          <p class="hint">KES {{ money(detail.totalWaived) }} was waived this month.</p>
        }

        <!-- Every change to the bill, with the landlord's reason: the figure explains itself. -->
        @if ((detail.adjustments ?? []).length > 0) {
          <h3 class="panel-title">Changes to your bill</h3>
          <ul class="changes">
            @for (change of detail.adjustments ?? []; track change.id) {
              <li>
                <div class="changes__head">
                  <strong>{{ change.adjustmentTypeLabel || (change.adjustmentType | humanLabel) }}</strong>
                  @if (change.originalAmount !== null && change.originalAmount !== undefined) {
                    <span><s class="muted">{{ money(change.originalAmount) }}</s> → {{ money(change.adjustedAmount) }}</span>
                  } @else if (change.adjustedAmount !== null && change.adjustedAmount !== undefined) {
                    <span>{{ money(change.adjustedAmount) }}</span>
                  }
                </div>
                @if (change.reason) { <p>{{ change.reason }}</p> }
                <small class="muted">{{ date(change.performedAt) }}@if (change.performedByName) { · {{ change.performedByName }} }</small>
              </li>
            }
          </ul>
        }
       </div>
      }
    </app-section-card>

    <!-- Both payment lists stacked beside the bill: one grid item, so the tall bill leaves no hole beside it. -->
    <div class="side">
    <!-- What the landlord has recorded as received: the latest few, the rest one tap away. -->
    <app-section-card title="My rent payments" subtitle="Payments your landlord has recorded.">
      <ng-container actions>
        <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myRentPayments" [queryParams]="{ tenantId: tenantId() }">View all</a>
      </ng-container>
      @if (paymentsError()) {
        <app-error-state [message]="paymentsError()!" (retry)="loadPayments()" />
      } @else if (payments().length === 0) {
        <p class="muted">No payments recorded yet.</p>
      } @else {
        <div class="table-scroll">
          <table class="table table--packed">
            <thead><tr><th>Paid on</th><th>For</th><th class="num">Amount (KES)</th><th>Method</th></tr></thead>
            <tbody>
              @for (row of payments(); track row.key) {
                <tr>
                  <td>{{ date(row.date) }}</td>
                  <td>{{ row.month }}</td>
                  <td class="num">{{ money(row.amount) }}</td>
                  <td>
                    <div class="cell-stack">
                      <span>{{ row.method | humanLabel }}</span>
                      @if (row.reference) { <span class="muted mono">{{ row.reference }}</span> }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </app-section-card>

    <app-section-card title="Payments you reported" subtitle="They count once your landlord confirms them.">
      @if (reportsError()) {
        <app-error-state [message]="reportsError()!" (retry)="loadReports()" />
      } @else if (reports().length === 0) {
        <p class="muted">Nothing reported yet. Paid by M-Pesa, bank or cash? Use “Report a payment” with the receipt or the confirmation message.</p>
      } @else {
        <div class="table-scroll">
          <table class="table table--packed reports">
            <thead>
              <tr><th>Paid on</th><th>For</th><th class="num">Amount (KES)</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
              @for (report of shownReports(); track report.id) {
                <tr>
                  <td>{{ date(report.paidOn) }}</td>
                  <td>{{ shortMonth(report.paymentForMonth) }}</td>
                  <td class="num">{{ money(report.amount) }}</td>
                  <td><span [class]="'status-chip status-chip--' + status(report).tone">{{ status(report).label }}</span></td>
                  <td class="row-actions">
                    <!-- Method, reference, proof and any reason: one tap, so the row stays one fact per column. -->
                    <button type="button" class="proof" (click)="toggleOpen(report.id)" [attr.aria-expanded]="openId() === report.id">
                      {{ openId() === report.id ? 'Hide' : 'Details' }}
                    </button>
                    @if (report.status === 'SUBMITTED') {
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="withdrawingId() === report.id" (click)="withdraw(report)">
                        {{ withdrawingId() === report.id ? 'Withdrawing...' : 'Withdraw' }}
                      </button>
                    }
                  </td>
                </tr>
                @if (openId() === report.id) {
                  <tr class="reports__more">
                    <td colspan="5">
                      <dl class="more">
                        <div><dt>Method</dt><dd>{{ report.paymentMethod | humanLabel }}</dd></div>
                        <div><dt>Reference</dt><dd class="mono">{{ report.referenceNumber || '-' }}</dd></div>
                        @if (report.evidenceUrl) {
                          <div><dt>Proof</dt><dd><a class="proof" [href]="report.evidenceUrl" target="_blank" rel="noopener">View receipt</a></dd></div>
                        }
                      </dl>
                      @if (report.status === 'REJECTED' && report.rejectionReason) {
                        <p class="reports__reason"><strong>Why not accepted:</strong> {{ report.rejectionReason }}</p>
                      }
                      @if (report.evidenceText) { <p class="mono sms">{{ report.evidenceText }}</p> }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (reports().length > shownReports().length) {
          <button type="button" class="btn btn-secondary btn-sm show-all" (click)="allReports.set(true)">Show all {{ reports().length }}</button>
        }
      }
    </app-section-card>

    </div>

    @if (reporting()) {
      <app-report-payment-dialog [tenantId]="tenantId()" [month]="month()" [amount]="suggestedAmount()"
                                 (reported)="onReported($event)" (closed)="reporting.set(false)" />
    }
  `,
  styles: [`
    :host { display: contents; }
    .month-nav { display: flex; align-items: center; gap: 0.25rem; }
    .month-pick { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0 0.5rem; height: var(--control-sm);
                  border: 1px solid var(--border); border-radius: 10px; background: var(--surface); cursor: pointer; }
    .month-pick:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-ring); }
    .month-pick svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.8; color: var(--text-muted); flex: none; }
    .month-pick input { border: 0; background: none; padding: 0; height: auto; min-width: 0; width: 8.5rem; font: inherit; font-size: 0.88rem; color: var(--text); box-shadow: none; }
    .month-pick input:focus { outline: none; box-shadow: none; }
    .flip { transform: scaleX(-1); }
    /* Neutral while it is simply due; red only once overdue; green once paid in full. */
    .headline { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.9rem; padding: 0.9rem 1rem;
                border-radius: 14px; background: var(--neutral-tint); border-left: 4px solid var(--text-subtle); }
    .headline--danger { background: var(--danger-tint); border-left-color: var(--danger); }
    .headline--success { background: var(--success-tint); border-left-color: var(--success); }
    .headline > div { display: grid; gap: 0.1rem; margin-right: auto; }
    .headline__label { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .headline__amount { font-size: 1.85rem; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--text); }
    .headline--danger .headline__amount { color: var(--danger); }
    .headline--success .headline__amount { color: var(--success); }
    .headline__sum { font-size: 0.82rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bill tfoot th { text-align: left; font-weight: 600; text-transform: none; letter-spacing: 0; font-size: 0.88rem; color: var(--text); }
    .bill tfoot th, .bill tfoot td { border-bottom: 0; padding-block: 0.4rem; }
    .bill__left th, .bill__left td { border-top: 1px solid var(--border); }
    .bill__waived td:first-child { color: var(--text-muted); }
    .bill .status-chip { margin-left: 0.4rem; font-size: 0.7rem; padding: 0.1rem 0.45rem; }
    .wide { grid-column: 1 / -1; }
    .bill-body { display: grid; gap: 0.85rem; }
    .panel-title { margin: 0.4rem 0 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .changes { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .changes li { display: grid; gap: 0.25rem; padding: 0.6rem 0.8rem; border: 1px solid var(--border); border-radius: 12px; }
    .changes__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.75rem; }
    .row-actions { white-space: nowrap; text-align: right; }
    .show-all { justify-self: start; margin-top: 0.6rem; }
    .proof { padding: 0; border: 0; background: none; font: inherit; font-size: 0.88rem; font-weight: 600; color: var(--primary-strong); cursor: pointer; }
    .proof:hover { text-decoration: underline; }
    .side { display: grid; gap: 1rem; align-content: start; min-width: 0; }
    .row-actions .proof { margin-right: 0.6rem; }
    .more { display: flex; flex-wrap: wrap; gap: 0.4rem 1.5rem; margin: 0 0 0.4rem; }
    .more div { display: grid; gap: 0.05rem; }
    .more dt { font-size: 0.74rem; color: var(--text-muted); }
    .more dd { margin: 0; font-weight: 600; }
    .reports .status-chip { font-size: 0.72rem; white-space: nowrap; }
    .reports__more td { background: var(--surface-2); }
    .reports__reason { padding: 0.4rem 0.6rem; border-left: 3px solid var(--danger); background: var(--danger-tint); border-radius: 6px; margin-bottom: 0.4rem; }
    .sms { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.82rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantRentPanelComponent {
  readonly RoutePaths = RoutePaths;

  readonly tenantId = input.required<number>();
  /** When the tenancy began (`YYYY-MM-DD`): there is no bill to page back to before it. */
  readonly since = input<string | null>(null);

  private readonly rent = inject(RentService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);

  /** First of the month shown, `YYYY-MM-01`. */
  readonly month = signal(firstOfMonth(new Date()));
  readonly bill = signal<TenantArrearsDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly reports = signal<PaymentReport[]>([]);
  readonly reportsError = signal<string | null>(null);
  readonly reporting = signal(false);
  readonly allReports = signal(false);
  readonly openId = signal<number | null>(null);

  /** The latest few unless asked for all: a long list buried the payments card beside it. */
  readonly shownReports = computed(() => this.allReports() ? this.reports() : this.reports().slice(0, 6));

  private readonly paymentMonths = signal<RentPaymentDetail[]>([]);
  readonly paymentsError = signal<string | null>(null);

  /** The latest recorded transactions, newest first — what was received, not the month totals. */
  readonly payments = computed(() => this.paymentMonths()
    .flatMap((month) => (month.transactions ?? [])
      .filter((tx) => tx.status !== 'CANCELLED' && tx.status !== 'REVERSED' && tx.status !== 'FAILED')
      .map((tx) => ({
        key: `${month.id}-${tx.id ?? tx.transactionDate}`,
        date: tx.transactionDate ?? null,
        month: shortMonth(month.paymentForMonth),
        amount: tx.amount,
        method: tx.paymentMethod ?? null,
        reference: tx.referenceNumber ?? null
      })))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 6));
  readonly withdrawingId = signal<number | null>(null);

  readonly currentMonth = firstOfMonth(new Date());
  readonly isCurrentMonth = computed(() => this.month() >= firstOfMonth(new Date()));
  readonly downloading = signal(false);
  readonly firstMonth = computed(() => this.since() ? `${this.since()!.slice(0, 7)}-01` : null);
  readonly isFirstMonth = computed(() => !!this.firstMonth() && this.month() <= this.firstMonth()!);

  readonly title = computed(() => {
    const label = this.bill()?.monthDisplay || monthLabel(this.month());
    return this.isCurrentMonth() ? `This month — ${label}` : label;
  });

  readonly subtitle = computed(() => {
    const due = this.bill()?.dueDate;
    return due ? `Due ${displayDate(due)}` : null;
  });

  readonly totalCharged = computed(() => {
    const bill = this.bill();
    if (!bill) {
      return 0;
    }
    return num(bill.baseRent) + num(bill.totalCharges) + num(bill.lateFee) - num(bill.creditApplied);
  });

  readonly isClear = computed(() => num(this.bill()?.totalOutstanding) <= 0);

  /**
   * Where the month stands, from the tenant's side. The record's own status follows rent
   * alone (it said "Completed" with charges still owed), so it is not shown here.
   */
  readonly standing = computed((): { label: string; tone: 'success' | 'danger' | 'info' | 'neutral' } => {
    const bill = this.bill();
    if (this.isClear()) {
      return { label: 'Paid in full', tone: 'success' };
    }
    if (bill?.isOverdue) {
      return { label: 'Overdue', tone: 'danger' };
    }
    return num(bill?.amountPaid) > 0 ? { label: 'Part paid', tone: 'info' } : { label: 'Not paid yet', tone: 'neutral' };
  });

  /** A month is open to reports until it is paid in full — and only once its bill has loaded. */
  readonly canReport = computed(() => !!this.bill() && !this.isClear());

  /** Reported for the month on screen and not yet decided. */
  readonly pendingForMonth = computed(() => this.reports()
    .filter((report) => report.status === 'SUBMITTED' && report.paymentForMonth?.slice(0, 7) === this.month().slice(0, 7))
    .reduce((sum, report) => sum + num(report.amount), 0));

  /** What is left after what is already waiting on the landlord — the likely next instalment. */
  readonly suggestedAmount = computed(() => Math.max(0, num(this.bill()?.totalOutstanding) - this.pendingForMonth()) || null);

  constructor() {
    effect(() => {
      this.tenantId();
      untracked(() => {
        this.month.set(firstOfMonth(new Date()));
        void this.loadMonth();
        void this.loadReports();
        void this.loadPayments();
      });
    });
  }

  shift(by: number): void {
    const [year, month] = this.month().split('-').map(Number);
    const next = firstOfMonth(new Date(year, month - 1 + by, 1));
    if (next > firstOfMonth(new Date()) || (this.firstMonth() && next < this.firstMonth()!)) {
      return;
    }
    this.month.set(next);
    void this.loadMonth();
  }

  /** From the picker (`YYYY-MM`), held to the tenancy's months. */
  pick(value: string): void {
    if (!value) {
      return;
    }
    const first = this.firstMonth();
    let next = `${value}-01`;
    next = next > this.currentMonth ? this.currentMonth : first && next < first ? first : next;
    if (next !== this.month()) {
      this.month.set(next);
      void this.loadMonth();
    }
  }

  async download(): Promise<void> {
    this.downloading.set(true);
    try {
      const blob = await firstValueFrom(this.rent.downloadMyTenancyMonth(this.tenantId(), this.month()));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.isClear() ? 'rent-receipt' : 'rent-statement'}-${this.month().slice(0, 7)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }

  async loadMonth(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.bill.set(await firstValueFrom(this.rent.getMyTenancyMonth(this.tenantId(), this.month())));
    } catch (error) {
      this.bill.set(null);
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async loadReports(): Promise<void> {
    this.reportsError.set(null);
    try {
      this.reports.set(await firstValueFrom(this.rent.getMyPaymentReports(this.tenantId())));
    } catch (error) {
      this.reportsError.set(extractErrorMessage(error));
    }
  }

  async loadPayments(): Promise<void> {
    this.paymentsError.set(null);
    try {
      // Six months of records is at least six payments for anyone paying monthly.
      const result = await firstValueFrom(this.rent.getMyPayments({ tenantId: this.tenantId(), page: 0, size: 6 }));
      this.paymentMonths.set(result.items as RentPaymentDetail[]);
    } catch (error) {
      this.paymentsError.set(extractErrorMessage(error));
    }
  }

  toggleOpen(id: number): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  onReported(report: PaymentReport): void {
    this.reporting.set(false);
    this.reports.update((reports) => [report, ...reports]);
    this.notifications.push('success', 'Sent — your landlord will confirm the payment.');
  }

  async withdraw(report: PaymentReport): Promise<void> {
    if (!await this.confirm.ask({
      title: `Withdraw the KES ${this.money(report.amount)} payment you reported?`,
      message: 'Your landlord will no longer see it. You can report it again later.',
      confirmLabel: 'Withdraw'
    })) {
      return;
    }
    this.withdrawingId.set(report.id);
    try {
      const updated = await firstValueFrom(this.rent.withdrawPaymentReport(this.tenantId(), report.id));
      this.reports.update((reports) => reports.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.withdrawingId.set(null);
    }
  }

  status(report: PaymentReport): { label: string; tone: string } {
    return REPORT_STATUS[report.status] ?? { label: report.status, tone: 'neutral' };
  }

  isWaived(charge: ArrearsUtilityCharge): boolean {
    return charge.status === 'WAIVED';
  }

  /** What a charge is for: the reading behind a metered one, the month it covers if not this one. */
  chargeDetail(charge: ArrearsUtilityCharge): string {
    const parts: string[] = [];
    if (charge.consumption !== null && charge.consumption !== undefined && charge.unitRate) {
      parts.push(`${charge.consumption} ${charge.unit || 'units'} × ${this.money(charge.unitRate)}`);
    }
    if (charge.coversMonthDisplay && charge.coversMonth?.slice(0, 7) !== this.month().slice(0, 7)) {
      parts.push(`for ${charge.coversMonthDisplay}`);
    }
    if (charge.status === 'PARTIALLY_PAID' || charge.status === 'PAID') {
      parts.push(charge.statusLabel || '');
    }
    return parts.filter(Boolean).join(' · ') || charge.description || '';
  }

  positive(value: number | string | null | undefined): boolean {
    return num(value) > 0;
  }

  money(value: number | string | null | undefined): string {
    return num(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '';
  }

  shortMonth(value: string | null | undefined): string {
    return shortMonth(value);
  }
}

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstOfMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function shortMonth(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function monthLabel(value: string): string {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
