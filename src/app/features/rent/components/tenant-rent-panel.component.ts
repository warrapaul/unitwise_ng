import { saveDownload } from '../../../shared/utils/download.util';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { shortDate } from '../../../shared/utils/format.util';
import { MONEY_LOCALE, formatCurrency, unitLabel } from '../../../shared/utils/format.util';
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
import { AdjustmentDetail, ArrearsUtilityCharge, PaymentReport, PaymentReportStatus, RentPaymentDetail, TenantArrearsDetail } from '../models/rent.models';
import { RentService } from '../rent.service';
import { TenantsService } from '../../tenants/tenants.service';
import { ReportPaymentDialogComponent } from './report-payment-dialog.component';
import { TenantPayDialogComponent } from './tenant-pay-dialog.component';

interface PaymentRow {
  key: string;
  date: string | null;
  month: string;
  /** `YYYY-MM` of the month it paid for, for filtering. */
  monthKey: string | null;
  amount: number | string | null | undefined;
  method: string | null;
  reference: string | null;
  status: string;
  tone: string;
  /** A confirmed payment's transaction, for its receipt. */
  receiptId: number | null;
  /** Set on a payment the tenant reported that is not recorded yet. */
  report: PaymentReport | null;
}

const REPORT_STATUS: Record<PaymentReportStatus, { label: string; tone: string }> = {
  // Waiting on the landlord is not a problem of the tenant's: info, not warning.
  SUBMITTED: { label: 'Awaiting confirmation', tone: 'info' },
  APPROVED: { label: 'Confirmed', tone: 'success' },
  // Something for the tenant to act on — the reason and next step are in the row's details.
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
  imports: [CardTableDirective, DateDisplayDirective, RouterLink, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, HumanLabelPipe, ReportPaymentDialogComponent,
    TenantPayDialogComponent],
  template: `
    @if (view() !== 'payments') {
    <app-section-card class="o-bill" [title]="title()" [subtitle]="subtitle()">
      @if (view() === 'rent') {
        <ng-container actions>
          <!-- A picker for jumping straight to a month; the arrows for stepping one at a time. History lives here, not on Home. -->
          <div class="month-nav" role="group" aria-label="Month">
            <button type="button" class="icon-action" (click)="shift(-1)" [disabled]="isFirstMonth()" aria-label="Previous month" title="Previous month">
              <svg class="flip" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
            </button>
            <label class="month-pick" title="Pick a month">
              <span class="visually-hidden">Month</span>
              <input type="month" [value]="month().slice(0, 7)" [min]="firstMonth()?.slice(0, 7) ?? null" [max]="currentMonth.slice(0, 7)"
                     (change)="pick($any($event.target).value)">
            </label>
            <button type="button" class="icon-action" (click)="shift(1)" [disabled]="isCurrentMonth()" aria-label="Next month" title="Next month">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
            </button>
          </div>
          @if (bill()) {
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="downloading()" (click)="download()">
              {{ downloading() ? 'Preparing...' : 'Download statement' }}
            </button>
          }
        </ng-container>
      }

      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading your bill..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="loadMonth()" />
      } @else if (bill(); as detail) {
       <div class="bill-body">
        <!-- The answer the whole card exists for: what is left, and the way to pay it, together. -->
        <div [class]="'headline headline--' + standing().tone">
          <div class="headline__top">
            <div class="headline__figures">
              <span class="headline__label">{{ isClear() ? 'You’re all paid up' : 'Left to pay' }}</span>
              <strong class="headline__amount">{{ money(detail.totalOutstanding) }}</strong>
              <span class="headline__sum">{{ money(totalCharged()) }} billed · {{ money(detail.amountPaid) }} paid</span>
              <!-- This month is not the whole story when earlier months are still owed. -->
              @if (isCurrentMonth() && earlierOwed() > 0) {
                <span class="headline__earlier">Plus {{ money(earlierOwed()) }} still owed from earlier months.
                  @if (view() === 'home') { <a class="text-link" [routerLink]="RoutePaths.myArrears">See them</a> }</span>
              }
            </div>
            <div class="headline__chips">
              <span [class]="'status-chip status-chip--' + standing().tone">{{ standing().label }}@if (daysOverdue() > 0) { · {{ daysOverdue() }} {{ daysOverdue() === 1 ? 'day' : 'days' }} }</span>
              @if (pendingForMonth() > 0) {
                <span class="status-chip status-chip--info">{{ money(pendingForMonth()) }} awaiting confirmation</span>
              }
            </div>
          </div>
          @if (detail.isProvisional) {
            <p class="headline__note">
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              Not final — readings or changes may still be added.
            </p>
          }
          <!--
            One row of two. With M-Pesa prompts set up: Pay leads. Without: reporting leads, with the
            PayBill or bank details beside it. Any payment can be reported, PayBill included.
          -->
          @if (canReport()) {
            <div class="headline__actions">
              @if (promptAvailable()) {
                <button type="button" class="btn btn-primary" (click)="paying.set(true)">Pay {{ money(suggestedAmount()) }}</button>
                <button type="button" class="btn btn-secondary" (click)="reporting.set(true)">Report a payment</button>
              } @else {
                <button type="button" class="btn btn-secondary" (click)="showHowToPay()">How to pay</button>
                <button type="button" class="btn btn-primary" (click)="reporting.set(true)">Report a payment</button>
              }
            </div>
          }
        </div>

        <table class="table bill">
          <tbody>
            <tr>
              <td><span class="bill__item">Rent</span>@if (dueShort(); as due) { <span class="bill__detail">Due {{ due }}</span> }</td>
              <td class="num">{{ money(detail.baseRent) }}</td>
            </tr>
            @for (charge of detail.charges ?? []; track charge.id ?? charge.name) {
              <tr [class.bill__waived]="isWaived(charge)">
                <td>
                  <span class="bill__item">{{ charge.name }}@if (isWaived(charge)) { <span class="status-chip status-chip--success">Waived</span> }</span>
                  @if (chargeDetail(charge); as line) { <span class="bill__detail">{{ line }}</span> }
                </td>
                <td class="num">
                  @if (charge.isPendingInput) {
                    <span class="muted">Reading not in yet</span>
                  } @else if (isWaived(charge)) {
                    <s>{{ money(charge.amount) }}</s> 0
                  } @else {
                    {{ money(charge.amount) }}
                  }
                </td>
              </tr>
            }
            @if (positive(detail.lateFee)) {
              <tr><td><span class="bill__item">Late fee</span></td><td class="num">{{ money(detail.lateFee) }}</td></tr>
            }
            @if (positive(detail.creditApplied)) {
              <tr><td><span class="bill__item">Credit</span><span class="bill__detail">Overpaid earlier</span></td><td class="num">−{{ money(detail.creditApplied) }}</td></tr>
            }
          </tbody>
          <tfoot>
            <tr><th>Total</th><td class="num"><strong>{{ money(totalCharged()) }}</strong></td></tr>
            <tr><th>Paid</th><td class="num">−{{ money(detail.amountPaid) }}</td></tr>
          </tfoot>
        </table>

        @if (positive(detail.totalWaived)) {
          <p class="hint">{{ money(detail.totalWaived) }} was waived this month.</p>
        }

        <!-- What was paid against this month, so "Paid" above has its receipts. On Rent only. -->
        @if (view() === 'rent' && monthPayments().length > 0) {
          <h3 class="panel-title">Paid this month</h3>
          <ul class="changes">
            @for (tx of monthPayments(); track tx.key) {
              <li>{{ money(tx.amount) }} · {{ date(tx.date) }}@if (tx.method) { · {{ tx.method | humanLabel }} }@if (!tx.confirmed) { · <span class="muted">processing</span> }</li>
            }
          </ul>
        }

        <!-- Why the figure moved, one line each, with the landlord's reason. On Rent only; Home stays short. -->
        @if (view() === 'rent' && (detail.adjustments ?? []).length > 0) {
          <h3 class="panel-title">Changes</h3>
          <ul class="changes">
            @for (change of detail.adjustments ?? []; track change.id) {
              <li>{{ changeLine(change) }}</li>
            }
          </ul>
        }
       </div>
      }
    </app-section-card>
    }

    @if (view() === 'rent' && history().length > 0) {
      <app-section-card class="o-months" title="All months">
        <ul class="months">
          @for (row of history(); track row.month) {
            <li>
              <button type="button" class="months__row" [class.months__row--on]="row.month === month()" (click)="openMonth(row.month)">
                <span class="months__name">{{ row.label }}</span>
                <span class="months__fig">{{ row.left > 0 ? money(row.left) + ' left' : 'Paid' }}</span>
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-chevron" /></svg>
              </button>
            </li>
          }
        </ul>
      </app-section-card>
    }

    @if (view() !== 'rent') {
    <!-- One history of money paid: what the landlord recorded and what the tenant reported, one row each. -->
    <app-section-card class="o-payments" [title]="view() === 'home' ? 'Recent payments' : null">
      @if (view() === 'home' && history2().length > shownPayments().length) {
        <ng-container actions>
          <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.myRentPayments">All payments</a>
        </ng-container>
      }
      @if (view() === 'payments') {
        <!-- Find a payment: by year, by the month it paid for, or by its reference. -->
        <div class="pay-tools">
          @if (years().length > 1) {
            <label class="field"><span>Year</span>
              <select [value]="shownYear()" (change)="pickedYear.set(+$any($event.target).value); pickedMonth.set('')">
                @for (y of years(); track y) { <option [value]="y" [selected]="y === shownYear()">{{ y }}</option> }
              </select></label>
          }
          <label class="field"><span>For month</span>
            <select [value]="pickedMonth()" (change)="pickedMonth.set($any($event.target).value)">
              <option value="">All months</option>
              @for (m of monthsInYear(); track m.key) { <option [value]="m.key" [selected]="m.key === pickedMonth()">{{ m.label }}</option> }
            </select></label>
          <label class="field pay-tools__search"><span>Search</span>
            <input type="search" [value]="query()" (input)="query.set($any($event.target).value)" placeholder="Reference or method"></label>
          <button type="button" class="btn btn-primary pay-tools__report" (click)="reporting.set(true)">Report a payment</button>
        </div>
      }
      @if (paymentsError() && reportsError()) {
        <app-error-state [message]="paymentsError()!" (retry)="loadPayments(); loadReports()" />
      } @else if (history2().length === 0) {
        <p class="muted">No payments yet. They show here once you pay or report one.</p>
      } @else {
        @if (view() === 'payments') {
          <p class="pays__sum"><strong>{{ money(paidInYear()) }}</strong> paid in {{ shownYear() }}</p>
        }
        @if (view() === 'payments') {
          @if (shownPayments().length === 0) {
            <p class="muted">No payments match.</p>
          } @else {
          <!-- A table on a wide screen, a card per payment on a phone. -->
          <div class="table-scroll">
            <table appCardTable class="table table--packed">
              <thead><tr><th>Paid on</th><th>For</th><th class="num">Amount</th><th>Method</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                @for (row of shownPayments(); track row.key) {
                  <tr>
                    <td class="card-title">{{ date(row.date) }}</td>
                    <td>{{ row.month }}</td>
                    <td class="num">{{ money(row.amount) }}</td>
                    <td>{{ row.method | humanLabel }}@if (row.reference) { <span class="muted mono"> · {{ row.reference }}</span> }</td>
                    <td><span [class]="'status-chip status-chip--' + row.tone">{{ row.status }}</span>
                      @if (row.report?.status === 'REJECTED' && row.report?.rejectionReason) { <span class="muted pay__why">{{ row.report!.rejectionReason }}</span> }</td>
                    <td class="row-actions">
                      @if (row.receiptId) {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="receiptId() === row.receiptId" (click)="downloadReceipt(row.receiptId)">Receipt</button>
                      }
                      @if (row.report?.evidenceUrl) { <a class="btn btn-secondary btn-sm" [href]="row.report!.evidenceUrl" target="_blank" rel="noopener">Proof</a> }
                      @if (row.report?.status === 'SUBMITTED') {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="withdrawingId() === row.report!.id" (click)="withdraw(row.report!)">Withdraw</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          }
        } @else {
        <ul class="pays">
          @for (row of shownPayments(); track row.key) {
            <li class="pay">
              <div class="pay__main">
                <strong class="pay__amount">{{ money(row.amount) }}</strong>
                <span class="pay__meta">{{ date(row.date) }} · for {{ row.month }}</span>
                @if (row.method || row.reference) {
                  <span class="pay__meta">{{ row.method | humanLabel }}@if (row.method && row.reference) { · }@if (row.reference) { <span class="mono">{{ row.reference }}</span> }</span>
                }
              </div>
              <div class="pay__side">
              <span [class]="'status-chip status-chip--' + row.tone">{{ row.status }}</span>
              <div class="pay__actions">
                @if (row.receiptId) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="receiptId() === row.receiptId" (click)="downloadReceipt(row.receiptId)">
                    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-download" /></svg>Receipt
                  </button>
                }
                @if (row.report; as report) {
                  @if (report.status === 'REJECTED' || report.evidenceUrl || report.evidenceText) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="toggleOpen(report.id)" [attr.aria-expanded]="openId() === report.id">
                      {{ openId() === report.id ? 'Hide' : 'Details' }}
                    </button>
                  }
                  @if (report.status === 'SUBMITTED') {
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="withdrawingId() === report.id" (click)="withdraw(report)">
                      {{ withdrawingId() === report.id ? 'Withdrawing...' : 'Withdraw' }}
                    </button>
                  }
                }
              </div>
              </div>
              @if (row.report; as report) {
                @if (openId() === report.id) {
                  <div class="pay__more">
                    @if (report.status === 'REJECTED' && report.rejectionReason) {
                      <p class="pay__reason"><strong>Why not accepted:</strong> {{ report.rejectionReason }}</p>
                    }
                    @if (report.evidenceUrl) { <a class="text-link" [href]="report.evidenceUrl" target="_blank" rel="noopener">View proof</a> }
                    @if (report.evidenceText) { <p class="mono sms">{{ report.evidenceText }}</p> }
                  </div>
                }
              }
            </li>
          }
        </ul>
        }
      }
    </app-section-card>
    }

    @if (paying()) {
      <app-tenant-pay-dialog [tenantId]="tenantId()" [month]="month()" [monthName]="title()" [balance]="suggestedAmount()" [phone]="phone()"
                             (paid)="onPaid()" (closed)="paying.set(false)" />
    }
    @if (reporting()) {
      <app-report-payment-dialog [tenantId]="tenantId()" [month]="month()" [amount]="suggestedAmount()" [outstanding]="bill()?.totalOutstanding ?? null"
                                 (reported)="onReported($event)" (closed)="reporting.set(false)" />
    }
  `,
  styles: [`
    :host { display: contents; }
    .o-bill { order: 1; }
    .o-months { order: 2; }
    .o-payments { order: 3; }
    .month-nav { display: flex; align-items: center; gap: var(--space-1); min-width: 0; max-width: 100%; }
    .month-pick { flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; padding: 0 var(--space-2); height: var(--control-sm);
                  border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; }
    .month-pick:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-ring); }
    .month-pick input { border: 0; background: none; padding: 0; height: auto; min-width: 0; width: 8.5rem; max-width: 100%; font: inherit; font-size: var(--text-md); color: var(--text); box-shadow: none; }
    .month-pick input:focus { outline: none; box-shadow: none; }
    .flip { transform: scaleX(-1); }
    /* Neutral while it is simply due; red only once overdue; green once paid in full. */
    .headline { display: grid; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-md);
                background: var(--neutral-tint); border-left: 4px solid var(--text-subtle); }
    .headline--danger { background: var(--danger-tint); border-left-color: var(--danger); }
    .headline--success { background: var(--success-tint); border-left-color: var(--success); }
    .headline__top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
    .headline__figures { display: grid; gap: var(--space-0-5); margin-right: auto; }
    .headline__chips { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    .headline__label { font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--text); }
    .headline__amount { font-size: var(--text-3xl); line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--text); }
    .headline--danger .headline__amount { color: var(--danger); }
    .headline--success .headline__amount { color: var(--success); }
    .headline__sum { font-size: var(--text-md); color: var(--text); font-variant-numeric: tabular-nums; }
    .headline__note { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--text-md); color: var(--text); }
    .headline__note svg { flex: none; width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .headline__actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: var(--space-2); }
    .headline__actions .btn { justify-content: center; white-space: normal; text-align: center; }
    .headline__earlier { font-size: var(--text-md); color: var(--text); }
    /* Filters wrap inside the card at any width; the report button takes a row of its own on a phone. */
    .pay-tools { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); align-items: end; gap: var(--space-2) var(--space-3); margin-bottom: var(--space-2); }
    .pay-tools .field { min-width: 0; }
    .pay-tools .field select, .pay-tools .field input { width: 100%; min-width: 0; }
    @media (min-width: 701px) {
      .pay-tools { display: flex; flex-wrap: wrap; }
      .pay-tools .field { flex: 0 0 10rem; }
      .pay-tools .pay-tools__search { flex: 1 1 14rem; }
    }
    @media (max-width: 700px) { .pay-tools__report { grid-column: 1 / -1; justify-content: center; } }
    .pay__why { display: block; font-size: var(--text-sm); }
    .report-line { font-size: var(--text-md); color: var(--text-muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; vertical-align: top; }
    /* Large text on a phone: an amount may break after "KES" rather than push the card off the screen. */
    @media (max-width: 700px) { .num { white-space: normal; } }
    /* Two columns: what it is (with its workings under it), and what it costs. */
    /* Fixed columns: the table can never make the card wider than the screen, whatever the text size. */
    .bill { width: 100%; table-layout: fixed; }
    .bill td.num, .bill tfoot td { width: 42%; }
    .bill td { padding-block: var(--space-2); }
    .bill__item { display: block; font-weight: var(--weight-semibold); }
    .bill__detail { display: block; font-size: var(--text-sm); color: var(--text-muted); }
    .bill tfoot th { text-align: left; font-weight: var(--weight-semibold); text-transform: none; letter-spacing: 0; font-size: var(--text-md); color: var(--text); }
    .bill tfoot th, .bill tfoot td { border-bottom: 0; padding-block: var(--space-1-5); }
    .bill tfoot tr:first-child th, .bill tfoot tr:first-child td { border-top: 1px solid var(--border); }
    .bill__waived .bill__item { color: var(--text-muted); }
    .bill .status-chip { margin-left: var(--space-1-5); font-size: var(--text-2xs); padding: var(--space-0-5) var(--space-2); }
    .bill-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); min-width: 0; }
    .panel-title { margin: var(--space-1-5) 0 0; font-size: var(--font-section-label); font-weight: var(--weight-semibold); color: var(--text); }
    .changes { display: grid; gap: var(--space-1-5); margin: 0; padding: 0; list-style: none; font-size: var(--text-md); }
    .months { display: grid; margin: 0; padding: 0; list-style: none; }
    .months li + li { border-top: 1px solid var(--border); }
    .months__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); width: 100%; min-height: 2.75rem; padding: var(--space-2) 0;
                   border: 0; background: none; font: inherit; color: var(--text); text-align: left; cursor: pointer; }
    .months__row--on .months__name { font-weight: var(--weight-semibold); color: var(--primary-strong); }
    .months__name { margin-right: auto; min-width: 0; overflow-wrap: anywhere; }
    .months__fig { font-variant-numeric: tabular-nums; color: var(--text-muted); }
    .months__row svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; color: var(--text-muted); }
    .years { display: flex; flex-wrap: wrap; gap: var(--space-1-5); margin-bottom: var(--space-2); }
    .years__chip { min-height: 2.5rem; padding: 0 var(--space-3); border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface);
                   font: inherit; color: var(--text); cursor: pointer; }
    .years__chip--on { border-color: var(--primary); background: var(--surface-2); color: var(--primary-strong); font-weight: var(--weight-semibold); }
    .pays__sum { padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); }
    .pays { display: grid; margin: 0; padding: 0; list-style: none; }
    .pay { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-1-5) var(--space-3); padding: var(--space-3) 0; }
    .pay + .pay { border-top: 1px solid var(--border); }
    .pay__main { display: grid; gap: var(--space-0-5); min-width: 0; }
    .pay__amount { font-variant-numeric: tabular-nums; }
    .pay__meta { font-size: var(--text-sm); color: var(--text-muted); overflow-wrap: anywhere; }
    .pay { align-items: start; }
    .pay__side { display: grid; justify-items: end; gap: var(--space-1-5); }
    .pay__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-1-5); }
    .pay__actions:empty { display: none; }
    .pay__actions svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; margin-right: var(--space-1); }
    .pay__more { grid-column: 1 / -1; display: grid; gap: var(--space-1-5); }
    .pay__reason { padding: var(--space-1-5) var(--space-2-5); border-left: 3px solid var(--danger); background: var(--danger-tint); border-radius: var(--radius-xs); }
    .sms { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--text-sm); }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantRentPanelComponent {
  readonly RoutePaths = RoutePaths;

  readonly tenantId = input.required<number>();
  /** Home: this month and the latest payments. Rent: any month, its changes, the other months. Payments: the whole history. */
  readonly view = input<'home' | 'rent' | 'payments'>('home');
  /** Opens "Report a payment" once the bill is in (Home's shortcut lands here with ?report=1). */
  readonly openReport = input(false);
  private reportOpened = false;

  /** The tenancy's phone: where an M-Pesa prompt goes unless the tenant changes it. */
  readonly phone = input<string | null>(null);
  /** When the tenancy began (`YYYY-MM-DD`): there is no bill to page back to before it. */
  readonly since = input<string | null>(null);
  /** The move-in date, which is also the first month's due date when it falls after the due day. */
  readonly moveInDate = input<string | null>(null);

  private readonly rent = inject(RentService);
  private readonly tenants = inject(TenantsService);
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
  readonly paying = signal(false);
  /** Whether Pay can send an M-Pesa prompt for this tenancy's building. */
  readonly promptAvailable = signal(false);
  /** Payments to the building's number are recorded on their own: nothing to report. */
  readonly matchedAutomatically = signal(false);

  showHowToPay(): void {
    const card = document.getElementById('how-to-pay');
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  readonly openId = signal<number | null>(null);
  readonly year = new Date().getFullYear();

  private readonly paymentMonths = signal<RentPaymentDetail[]>([]);
  readonly paymentsError = signal<string | null>(null);

  /**
   * Money paid, newest first, as one list: what the landlord recorded, and what the tenant reported
   * that is not recorded yet. A confirmed report is the recorded payment, so it is not listed twice.
   */
  readonly history2 = computed((): PaymentRow[] => {
    const recorded: PaymentRow[] = this.paymentMonths().flatMap((month) => (month.transactions ?? [])
      .filter((tx) => tx.status !== 'CANCELLED' && tx.status !== 'REVERSED' && tx.status !== 'FAILED')
      .map((tx) => ({
        key: `tx-${month.id}-${tx.id ?? tx.transactionDate}`,
        date: tx.transactionDate ?? null,
        month: shortMonth(month.paymentForMonth),
        monthKey: month.paymentForMonth?.slice(0, 7) ?? null,
        amount: tx.amount,
        method: tx.paymentMethod ?? null,
        reference: tx.referenceNumber ?? null,
        status: tx.status === 'COMPLETED' ? 'Confirmed' : 'Processing',
        tone: tx.status === 'COMPLETED' ? 'success' : 'info',
        receiptId: tx.status === 'COMPLETED' ? tx.id ?? null : null,
        report: null
      })));
    const reported: PaymentRow[] = this.reports()
      .filter((report) => report.status === 'SUBMITTED' || report.status === 'REJECTED')
      .map((report) => ({
        key: `report-${report.id}`,
        date: report.paidOn ?? null,
        month: shortMonth(report.paymentForMonth),
        monthKey: report.paymentForMonth?.slice(0, 7) ?? null,
        amount: report.amount,
        method: report.paymentMethod ?? null,
        reference: report.referenceNumber ?? null,
        status: REPORT_STATUS[report.status].label,
        tone: REPORT_STATUS[report.status].tone,
        receiptId: null,
        report
      }));
    return [...recorded, ...reported].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  });

  /** Years with payments, newest first; the Payments page shows one at a time. */
  readonly years = computed(() => [...new Set(this.history2().map((row) => Number((row.date ?? '').slice(0, 4))).filter(Boolean))]
    .sort((a, b) => b - a));
  readonly pickedYear = signal<number | null>(null);
  readonly shownYear = computed(() => this.pickedYear() ?? this.years()[0] ?? this.year);

  /** Payments page filters: the month a payment was for, and a reference or method to look for. */
  readonly pickedMonth = signal('');
  readonly query = signal('');

  /** The months paid for in the year shown, newest first, for the month filter. */
  readonly monthsInYear = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.history2()) {
      if ((row.date ?? '').startsWith(String(this.shownYear())) && row.monthKey) {
        seen.set(row.monthKey, row.month);
      }
    }
    return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, label]) => ({ key, label }));
  });

  readonly shownPayments = computed(() => {
    if (this.view() === 'home') {
      return this.history2().slice(0, 3);
    }
    const q = this.query().trim().toLowerCase();
    return this.history2()
      .filter((row) => (row.date ?? '').startsWith(String(this.shownYear())))
      .filter((row) => !this.pickedMonth() || row.monthKey === this.pickedMonth())
      .filter((row) => !q || `${row.reference ?? ''} ${row.method ?? ''} ${row.status}`.toLowerCase().includes(q));
  });

  /** Still owed from months before this one: the dashboard's month is not the whole debt. */
  readonly earlierOwed = computed(() => this.paymentMonths()
    .filter((row) => !!row.paymentForMonth && row.paymentForMonth.slice(0, 7) < this.currentMonth.slice(0, 7))
    .reduce((sum, row) => sum + Math.max(0, num(row.outstanding)), 0));

  /** Confirmed in the year shown: the summary over the Payments page. */
  readonly paidInYear = computed(() => this.history2()
    .filter((row) => row.receiptId !== null && (row.date ?? '').startsWith(String(this.shownYear())))
    .reduce((sum, row) => sum + num(row.amount), 0));

  /** Money received against the month on screen. */
  readonly monthPayments = computed(() => {
    const record = this.paymentMonths().find((row) => row.paymentForMonth?.slice(0, 7) === this.month().slice(0, 7));
    return (record?.transactions ?? [])
      .filter((tx) => tx.status !== 'CANCELLED' && tx.status !== 'REVERSED' && tx.status !== 'FAILED')
      .map((tx) => ({ key: tx.id ?? tx.transactionDate, amount: tx.amount, date: tx.transactionDate ?? null, method: tx.paymentMethod ?? null, confirmed: tx.status === 'COMPLETED' }));
  });

  /** The months billed, newest first, for jumping between statements on Rent. */
  readonly history = computed(() => this.paymentMonths()
    .filter((row) => !!row.paymentForMonth)
    .map((row) => ({ month: `${row.paymentForMonth!.slice(0, 7)}-01`, label: monthLabel(row.paymentForMonth!), left: num(row.outstanding) }))
    .sort((a, b) => b.month.localeCompare(a.month)));

  /** "5 Nov": the due day beside rent, where the room name used to sit. */
  readonly dueShort = computed(() => {
    const due = this.bill()?.dueDate?.slice(0, 10);
    return due ? shortDate(new Date(`${due}T00:00:00`), { day: 'numeric', month: 'short' }) : null;
  });

  readonly withdrawingId = signal<number | null>(null);

  readonly currentMonth = firstOfMonth(new Date());
  readonly isCurrentMonth = computed(() => this.month() >= firstOfMonth(new Date()));
  readonly downloading = signal(false);
  readonly firstMonth = computed(() => this.since() ? `${this.since()!.slice(0, 7)}-01` : null);
  readonly isFirstMonth = computed(() => !!this.firstMonth() && this.month() <= this.firstMonth()!);

  /** The month alone: "This month — October 2026" wrapped onto two lines beside the stepper. */
  readonly title = computed(() => this.bill()?.monthDisplay || monthLabel(this.month()));

  /**
   * The due date, and why it is not the usual day when it falls on the move-in date: the backend
   * moves a first month's due date to the move-in day, which read as contradicting "the 5th of
   * each month" under how to pay.
   */
  readonly subtitle = computed(() => {
    const due = this.bill()?.dueDate?.slice(0, 10);
    const parts = [this.isCurrentMonth() ? 'This month' : null,
      due ? `Due ${displayDate(due)}${due === this.moveInDate()?.slice(0, 10) ? ' (your move-in day)' : ''}` : null];
    return parts.filter(Boolean).join(' · ') || null;
  });

  /** Whole days past the due date, only while the bill says it is overdue. */
  readonly daysOverdue = computed(() => {
    const bill = this.bill();
    if (!bill?.isOverdue || !bill.dueDate) {
      return 0;
    }
    const due = new Date(`${bill.dueDate.slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86_400_000));
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
      if (this.openReport() && this.bill() && !this.reportOpened) {
        this.reportOpened = true;
        untracked(() => this.reporting.set(true));
      }
    });
    effect(() => {
      this.tenantId();
      untracked(() => {
        this.month.set(firstOfMonth(new Date()));
        void this.loadMonth();
        void this.loadReports();
        void this.loadPayments();
        void this.loadPromptAvailability();
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
      const response = await firstValueFrom(this.rent.downloadMyTenancyMonth(this.tenantId(), this.month()));
      saveDownload(response, `${this.isClear() ? 'rent-receipt' : 'rent-statement'}-${this.month().slice(0, 7)}.pdf`);
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }

  readonly receiptId = signal<number | null>(null);

  async downloadReceipt(transactionId: number): Promise<void> {
    this.receiptId.set(transactionId);
    try {
      const response = await firstValueFrom(this.rent.downloadMyPaymentReceipt(this.tenantId(), transactionId));
      saveDownload(response, `rent-receipt-${transactionId}.pdf`);
    } catch (error) {
      // A failed receipt says so and can be tried again — never an empty or unrelated file.
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.receiptId.set(null);
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

  private async loadPromptAvailability(): Promise<void> {
    try {
      const overview = await firstValueFrom(this.tenants.getMyTenancyOverview(this.tenantId()));
      this.promptAvailable.set(!!overview.mpesaPromptAvailable);
      this.matchedAutomatically.set(!!overview.mpesaPaybill && !!overview.paymentMatchedAutomatically);
    } catch {
      this.promptAvailable.set(false);
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
      // Six months covers Home's latest three; two years for the full history and the month list.
      const size = this.view() === 'home' ? 6 : 24;
      const result = await firstValueFrom(this.rent.getMyPayments({ tenantId: this.tenantId(), page: 0, size }));
      this.paymentMonths.set(result.items as RentPaymentDetail[]);
    } catch (error) {
      this.paymentsError.set(extractErrorMessage(error));
    }
  }

  openMonth(month: string): void {
    if (month !== this.month()) {
      this.month.set(month);
      void this.loadMonth();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onPaid(): void {
    void this.loadMonth();
    void this.loadPayments();
  }

  /** "Added KES 800 · Replacement key · 10 Nov": what changed, why, when. */
  changeLine(change: AdjustmentDetail): string {
    const when = change.performedAt ? shortDate(new Date(change.performedAt), { day: 'numeric', month: 'short' }) : null;
    return [this.changeSummary(change), change.reason, when].filter(Boolean).join(' · ');
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
      title: `Withdraw the ${this.money(report.amount)} payment you reported?`,
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

  /** A change in words: "Added KES 201", not "0 → 201". */
  changeSummary(change: AdjustmentDetail): string {
    const before = change.originalAmount === null || change.originalAmount === undefined ? null : num(change.originalAmount);
    const after = change.adjustedAmount === null || change.adjustedAmount === undefined ? null : num(change.adjustedAmount);
    if (after === null) {
      return before === null ? '' : `Was ${this.money(before)}`;
    }
    if (!before) {
      return `Added ${this.money(after)}`;
    }
    if (after === 0) {
      return `Removed — was ${this.money(before)}`;
    }
    return `${this.money(before)} changed to ${this.money(after)}`;
  }

  isWaived(charge: ArrearsUtilityCharge): boolean {
    return charge.status === 'WAIVED';
  }

  /** What a charge is for: the reading behind a metered one, the month it covers if not this one. */
  chargeDetail(charge: ArrearsUtilityCharge): string {
    const parts: string[] = [];
    if (charge.consumption !== null && charge.consumption !== undefined && charge.unitRate) {
      parts.push(`${charge.consumption} ${charge.unit ? unitLabel(charge.unit) : 'units'} × ${this.money(charge.unitRate)}`);
    }
    // Metered use is billed the month after: "October usage", not "for October 2026".
    if (charge.coversMonth && charge.coversMonth.slice(0, 7) !== this.month().slice(0, 7)) {
      const covered = new Date(`${charge.coversMonth.slice(0, 7)}-01T00:00:00`);
      parts.push(Number.isNaN(covered.getTime()) ? `for ${charge.coversMonthDisplay ?? ''}` : `${shortDate(covered, { month: 'long' })} usage`);
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
    return formatCurrency(value);
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
  return Number.isNaN(date.getTime()) ? value : shortDate(date, { month: 'short', year: 'numeric' });
}

function monthLabel(value: string): string {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : shortDate(date, { month: 'long', year: 'numeric' });
}
