import { isoDate, todayIso } from '../../../shared/utils/date.util';
import { asText, downloadCsv } from '../../../shared/utils/csv-export.util';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { CopyButtonComponent } from '../../../shared/components/copy-button/copy-button.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { shortDate } from '../../../shared/utils/format.util';
import { HousingService } from '../../housing/housing.service';
import { BillingStatusService } from '../billing-status.service';
import {
  BillingInvoice,
  BillingPayment,
  BillingPlan,
  BillingSummary,
  describePrice,
  FEATURE_DESCRIPTIONS,
  featureLabel,
  kes,
  LimitUsage,
  limitLabel,
  limitLine,
  PAYMENT_METHOD_LABELS,
  PaymentReport,
  periodLabel,
  PLAN_REQUEST_STATUS_LABELS,
  PLAN_REQUEST_STATUS_TONES,
  PlanOption,
  PlanRequest,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES
} from '../billing.models';
import { BillingService } from '../billing.service';
import { BillingPayDialogComponent } from '../components/billing-pay-dialog.component';
import { RecordPaymentDialogComponent } from '../components/record-billing-payment-dialog.component';
import { ReportBillingPaymentDialogComponent } from '../components/report-billing-payment-dialog.component';
import { SubscriptionAdminComponent } from '../components/subscription-admin.component';

type Tab = 'overview' | 'plans' | 'invoices' | 'payments' | 'manage';

/**
 * An agency's billing, as its admins read it, in four tabs: where the account stands (plan, next
 * invoice, usage, this month so far, how to pay), the plans it can switch to, its invoices, and its
 * payments. Changing plan needs no one's approval: up applies today, down on the 1st (see
 * PlanSwitchService on the server). The super admin reaches any agency's by id and gets a Manage
 * tab with the subscription controls.
 */
@Component({
  selector: 'app-agency-billing-page',
  standalone: true,
  imports: [RouterLink, ContextGuardComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, DialogComponent,
    PermissionGateComponent, CopyButtonComponent, BillingPayDialogComponent, ReportBillingPaymentDialogComponent, SubscriptionAdminComponent,
    RecordPaymentDialogComponent],
  template: `
    <app-context-guard [requireBuilding]="false" [agencyId]="routeAgencyId() ?? null" action="to see billing">
      <section class="stack">
        <header class="page-head">
          <div class="page-head__title">
            <h1>Billing &amp; plan</h1>
            <p>{{ agencyName() }}</p>
          </div>
        </header>

        @if (loading() && !summary()) {
          <app-loading-state label="Loading billing…" />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (summary(); as s) {
          <div class="tabs" role="tablist" aria-label="Billing">
            @for (t of tabs(); track t.key) {
              <button type="button" role="tab" class="tabs__tab" [class.tabs__tab--active]="tab() === t.key" [attr.aria-selected]="tab() === t.key"
                      (click)="setTab(t.key)">
                {{ t.label }}@if (t.count) { <span class="tabs__badge">{{ t.count }}</span> }
              </button>
            }
          </div>

          @switch (tab()) {
            @case ('overview') {
              <!-- Where the account stands, and the one thing to do about it. -->
              @if (alert(s); as a) {
                <div [class]="'alert alert-' + a.tone" role="status">{{ a.text }}</div>
              }
              <section class="panel hero" aria-labelledby="plan-name">
                <div class="hero__head">
                  <div>
                    <p class="eyebrow">Your plan</p>
                    <h2 id="plan-name">{{ s.subscription.planName }}</h2>
                  </div>
                  <span [class]="'status-chip status-chip--' + tone(s)">{{ statusLabel(s) }}</span>
                </div>
                @if (currentOption(); as current) {
                  <p class="hero__price">{{ money(current.monthlyAtCurrentRooms) }} <span class="muted">a month at your {{ current.billableRooms }} room{{ current.billableRooms === 1 ? '' : 's' }}</span></p>
                }
                <ul class="facts">
                  <li><span class="facts__label">{{ nextLabel(s) }}</span><strong>{{ nextValue(s) }}</strong></li>
                  <li>
                    <span class="facts__label">Unpaid</span>
                    @if (+s.outstandingBalance > 0) {
                      <strong class="owing">{{ money(s.outstandingBalance) }}@if (oldestUnpaid(); as o) { · due {{ date(o.dueDate) }} }</strong>
                    } @else {
                      <strong>No unpaid invoices</strong>
                    }
                  </li>
                  @if (+s.creditBalance > 0) {
                    <li><span class="facts__label">Credit</span><strong>{{ money(s.creditBalance) }} <span class="muted">pays your next invoice</span></strong></li>
                  }
                  @if (s.subscription.scheduledPlanName) {
                    <li><span class="facts__label">Booked</span>
                      <strong>Moving to {{ s.subscription.scheduledPlanName }} on {{ date(s.subscription.scheduledFrom) }}</strong>
                      @if (canPay()) { <button type="button" class="text-link" (click)="cancelScheduled()">Call off</button> }
                    </li>
                  }
                  @if (pendingPlan(); as pending) {
                    <li><span class="facts__label">Asked for</span>
                      <strong>{{ pending.planName }} · waiting for us since {{ date(pending.createdAt) }}</strong>
                      @if (canPay()) { <button type="button" class="text-link" (click)="withdrawPlan(pending.id)">Withdraw</button> }
                    </li>
                  }
                </ul>
                @if (canPay()) {
                  <div class="hero__actions">
                    @if (oldestUnpaid(); as invoice) {
                      <button type="button" class="btn btn-primary" (click)="paying.set({ invoice })">Pay {{ money(invoice.balance) }}</button>
                      <button type="button" class="btn btn-secondary" (click)="paying.set({ invoice: null })">Pay ahead</button>
                    } @else {
                      <button type="button" class="btn btn-primary" (click)="paying.set({ invoice: null })">Pay ahead</button>
                    }
                    <button type="button" class="btn btn-secondary" (click)="setTab('plans')">Change plan</button>
                  </div>
                }
              </section>

              <div class="cols">
                <!-- What the plan allows and what is used against it. A missing cap is unlimited. -->
                <app-section-card title="Usage" subtitle="At a limit you keep everything you have; adding more needs a bigger plan.">
                  <ul class="usage">
                    @for (limit of s.limits; track limit.key) {
                      <li>
                        <div class="usage__head">
                          <span>{{ limitText(limit.key) }}</span>
                          <strong>{{ limit.used }} <span class="muted">{{ limit.limit != null ? 'of ' + limit.limit : '· no limit' }}</span></strong>
                        </div>
                        @if (limit.limit != null) {
                          <div class="meter" [class.meter--near]="level(limit) === 'near'" [class.meter--full]="level(limit) === 'full'"
                               role="progressbar" [attr.aria-label]="limitText(limit.key)" aria-valuemin="0" [attr.aria-valuemax]="limit.limit"
                               [attr.aria-valuenow]="limit.used" [attr.aria-valuetext]="limit.used + ' of ' + limit.limit">
                            <span [style.width.%]="share(limit.used, limit.limit)"></span>
                          </div>
                          @if (level(limit) === 'full') {
                            <p class="usage__note usage__note--full">Full — you can't add more {{ limitText(limit.key).toLowerCase() }}. <button type="button" class="text-link" (click)="setTab('plans')">See bigger plans</button></p>
                          } @else if (level(limit) === 'near') {
                            <p class="usage__note usage__note--near">Nearly full: {{ limit.limit - limit.used }} left. <button type="button" class="text-link" (click)="setTab('plans')">See plans</button></p>
                          }
                        }
                        @if (limit.key === 'ROOMS' && s.subscription.includedRooms > 0 && +s.subscription.extraRoomPrice > 0) {
                          <p class="usage__note">Your plan fee covers {{ s.subscription.includedRooms }} rooms; each one beyond is {{ money(s.subscription.extraRoomPrice) }} a month.</p>
                        }
                      </li>
                    } @empty {
                      <li class="muted">No limits on your plan.</li>
                    }
                  </ul>
                  <h3 class="subhead">Included in {{ s.subscription.planName }}</h3>
                  <ul class="features">
                    @for (code of s.features; track code) {
                      <li><span class="tick" aria-hidden="true">✓</span><span><strong>{{ feature(code) }}</strong>@if (featureHint(code); as hint) { <br><span class="muted">{{ hint }}</span> }</span></li>
                    } @empty { <li class="muted">No features listed.</li> }
                  </ul>
                </app-section-card>

                <div class="stack">
                  <!-- The month as it would be invoiced if it ended today. -->
                  @if (s.currentMonthEstimate; as e) {
                    <app-section-card title="This month so far" [subtitle]="period(e.periodStart, e.periodEnd) + ' · invoiced on ' + date(nextInvoiceOn(e.periodEnd))">
                      <div class="table-scroll">
                        <table class="table estimate">
                          <thead><tr><th scope="col">Item</th><th scope="col" class="num">Amount</th></tr></thead>
                          <tbody>
                            @for (line of e.lines; track $index) {
                              <tr>
                                <td><span class="line__name">{{ line.description }}</span><br><span class="muted">{{ line.quantity }} × {{ money(line.unitPrice) }}</span></td>
                                <td class="num">{{ money(line.amount) }}</td>
                              </tr>
                            } @empty {
                              <tr><td class="muted" colspan="2">Nothing to charge.</td></tr>
                            }
                            @if (unusedIncluded(s, e.billableRooms); as unused) {
                              <tr><td class="muted" colspan="2">{{ e.billableRooms }} of {{ s.subscription.includedRooms }} included rooms used · {{ unused }} unused</td></tr>
                            }
                            <tr><td>VAT ({{ vatPercent(s) }}%)</td><td class="num">{{ money(vat(s, e.total)) }}</td></tr>
                          </tbody>
                          <tfoot><tr><th scope="row">Estimated total</th><td class="num"><strong>{{ money(+e.total + vat(s, e.total)) }}</strong></td></tr></tfoot>
                        </table>
                      </div>
                      <p class="info"><span class="info__icon" aria-hidden="true">ⓘ</span><span>Every room that exists at any time in the month is billed — {{ e.billableRooms }} so far. The invoice comes after the month ends.</span></p>
                    </app-section-card>
                  }

                  <!-- What to type in M-Pesa to pay without a prompt. -->
                  @if (s.paybillNumber || s.paybillAccount) {
                    <app-section-card title="Pay by M-Pesa {{ s.buyGoods ? 'till' : 'paybill' }}">
                      <ul class="copy-list">
                        @if (s.paybillNumber) {
                          <li><span class="copy-list__label">{{ s.buyGoods ? 'Till number' : 'Business number' }}</span><span class="mono copy-list__value">{{ s.paybillNumber }}</span>
                            <app-copy-button [value]="s.paybillNumber" [label]="s.buyGoods ? 'Copy till number' : 'Copy business number'" /></li>
                        }
                        @if (!s.buyGoods && s.paybillAccount) {
                          <li><span class="copy-list__label">Account number</span><span class="mono copy-list__value">{{ s.paybillAccount }}</span>
                            <app-copy-button [value]="s.paybillAccount" label="Copy account number" /></li>
                        }
                      </ul>
                      @if (!s.buyGoods) { <p class="muted small">This account keeps the money as credit. To pay one invoice, use its number as the account instead.</p> }
                    </app-section-card>
                  }
                </div>
              </div>
            }

            @case ('plans') {
              <app-section-card title="Plans" [subtitle]="plansSubtitle()">
                @if (options().length === 0) {
                  <p class="muted">No plans are available right now. Contact us for a custom plan.</p>
                } @else {
                  <ul class="plans">
                    @for (option of options(); track option.plan.id) {
                      <li class="plan" [class.plan--current]="option.current">
                        <div class="plan__head">
                          <h3>{{ option.plan.name }}</h3>
                          @if (option.current) { <span class="status-chip status-chip--success">Your plan</span> }
                        </div>
                        <p class="plan__price">{{ money(option.monthlyAtCurrentRooms) }} <span>a month</span></p>
                        <p class="muted small">At your {{ option.billableRooms }} rooms · {{ describe(option.plan) }}</p>
                        @if (!option.current && +option.difference !== 0) {
                          <p class="plan__diff" [class.plan__diff--up]="+option.difference > 0">{{ +option.difference > 0 ? '+' : '−' }}{{ money(abs(option.difference)) }} a month compared with now</p>
                        }
                        @if (option.plan.description) { <p class="small">{{ option.plan.description }}</p> }
                        <div class="plan__lists">
                          <ul class="plan__limits">
                            @for (key of limitKeys(); track key) { <li>{{ limitWords(key, option.plan) }}</li> }
                          </ul>
                          <ul class="plan__features">
                            @for (code of option.plan.features ?? []; track code) { <li><span class="tick" aria-hidden="true">✓</span> {{ feature(code) }}</li> }
                          </ul>
                        </div>
                        @if (!option.current) {
                          @if (option.blockedReason) {
                            <p class="plan__blocked">{{ option.blockedReason }}</p>
                          } @else {
                            <p class="small">{{ timingText(option) }}</p>
                          }
                          @if (canPay()) {
                            <button type="button" [class]="'btn ' + (+option.difference > 0 ? 'btn-primary' : 'btn-secondary')"
                                    [disabled]="!!option.blockedReason || pendingPlan()?.planId === option.plan.id || s.subscription.scheduledPlanId === option.plan.id"
                                    (click)="choose(option)">
                              {{ buttonText(option, s) }}
                            </button>
                          }
                        }
                      </li>
                    }
                  </ul>
                }
              </app-section-card>
            }

            @case ('invoices') {
              <app-section-card title="Invoices" subtitle="One a month, after the month ends.">
                @if (invoices().length > 0) {
                  <button type="button" actions class="btn btn-secondary btn-sm" (click)="exportInvoices()">Export CSV</button>
                }
                @if (invoiceYears().length > 1) {
                  <label class="field field--inline year" card-tools>
                    <span class="visually-hidden">Year</span>
                    <select (change)="invoiceYear.set($any($event.target).value)">
                      @for (year of invoiceYears(); track year) { <option [value]="year" [selected]="year === (invoiceYear() || invoiceYears()[0])">{{ year }}</option> }
                    </select>
                  </label>
                }
                @if (shownInvoices().length === 0) {
                  <p class="muted">No invoices yet. Your first comes after your first paid month ends.</p>
                } @else {
                  <ul class="rows">
                    @for (invoice of shownInvoices(); track invoice.id) {
                      <li>
                        <a class="row" [routerLink]="RoutePaths.billingInvoice(agencyId()!, invoice.id)">
                          <span class="row__main">
                            <strong>Invoice {{ invoice.invoiceNumber }} · {{ monthOf(invoice.periodStart) }}</strong>
                            <span class="muted" [class.owing]="invoice.overdue">{{ invoiceWhen(invoice) }}</span>
                          </span>
                          <span class="row__side">
                            <strong>{{ money(invoice.total) }}</strong>
                            <span [class]="'status-chip status-chip--' + invoiceTone(invoice)">{{ invoiceStatus(invoice) }}</span>
                          </span>
                          <span class="row__chevron" aria-hidden="true">›</span>
                        </a>
                      </li>
                    }
                  </ul>
                }
              </app-section-card>
            }

            @case ('payments') {
              <app-section-card title="Payments" subtitle="Money we received from you, and payments you told us about.">
                <div actions class="button-row">
                  @if (payments().length > 0) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="exportPayments()">Export CSV</button>
                  }
                  @if (canPay()) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="reporting.set(true)">Report a payment</button>
                  }
                  <app-permission-gate [permissions]="['BILLING_PAYMENT_RECORD']">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="recording.set(true)">Record a payment</button>
                  </app-permission-gate>
                </div>

                @if (openReports().length > 0) {
                  <h3 class="subhead">You told us about</h3>
                  <ul class="rows">
                    @for (r of openReports(); track r.id) {
                      <li class="row row--static">
                        <span class="row__main">
                          <strong>{{ date(r.paidAt) }} · {{ money(r.amount) }}</strong>
                          <span class="muted"><span class="mono">{{ r.reference }}</span> · {{ r.invoiceNumber ? 'for ' + r.invoiceNumber : 'as credit' }}
                            @if (r.alreadyReceived && r.status === 'SUBMITTED') { · we have it, confirming now }</span>
                          @if (r.decisionNote) { <span class="muted">{{ r.decisionNote }}</span> }
                        </span>
                        <span class="row__side">
                          <span [class]="'status-chip status-chip--' + reportTones[r.status]">{{ reportLabels[r.status] }}</span>
                          @if (r.status === 'SUBMITTED') {
                            @if (canRecord()) {
                              <span class="button-row">
                                <button type="button" class="btn btn-primary btn-sm" (click)="approveReport(r.id)">Confirm</button>
                                <button type="button" class="btn btn-secondary btn-sm" (click)="rejectReport(r.id)">Not received</button>
                              </span>
                            } @else if (canPay()) {
                              <button type="button" class="text-link" (click)="withdrawReport(r.id)">Withdraw</button>
                            }
                          }
                        </span>
                      </li>
                    }
                  </ul>
                  <h3 class="subhead">Received</h3>
                }

                @if (payments().length === 0) {
                  <p class="muted">No payments yet.</p>
                } @else {
                  <ul class="rows">
                    @for (payment of payments(); track payment.id) {
                      <li class="row row--static">
                        <span class="row__main">
                          <strong>{{ date(payment.paidAt || payment.createdAt) }} · <span [class.owing]="+payment.amount < 0">{{ money(payment.amount) }}</span></strong>
                          <span class="muted">{{ methodLabel(payment) }} · {{ paymentFor(payment) }}</span>
                          @if (payment.providerReference) {
                            <span class="ref"><span class="mono">{{ payment.providerReference }}</span> <app-copy-button [value]="payment.providerReference" label="Copy reference" /></span>
                          }
                        </span>
                        <span class="row__side">
                          <span [class]="'status-chip status-chip--' + paymentTone(payment)">{{ paymentStatus(payment) }}</span>
                          @if (canReverse(payment)) {
                            <app-permission-gate [permissions]="['BILLING_PAYMENT_RECORD']">
                              <button type="button" class="btn btn-secondary btn-sm" (click)="reverse(payment)">Reverse</button>
                            </app-permission-gate>
                          }
                        </span>
                      </li>
                    }
                  </ul>
                }
              </app-section-card>
            }

            @case ('manage') {
              @if (planRequests().length > 0) {
                <app-section-card title="Plan requests">
                  <ul class="rows">
                    @for (r of planRequests(); track r.id) {
                      <li class="row row--static">
                        <span class="row__main">
                          <strong>{{ r.fromPlanName || '—' }} → {{ r.planName }}</strong>
                          <span class="muted">{{ date(r.createdAt) }}@if (r.requestedByName) { · {{ r.requestedByName }} }</span>
                          @if (r.note) { <span class="muted">“{{ r.note }}”</span> }
                        </span>
                        <span class="row__side">
                          @if (r.status === 'PENDING') {
                            <span class="button-row">
                              <button type="button" class="btn btn-primary btn-sm" (click)="approvePlan(r.id, r.planName)">Approve</button>
                              <button type="button" class="btn btn-secondary btn-sm" (click)="declinePlan(r.id)">Decline</button>
                            </span>
                          } @else {
                            <span [class]="'status-chip status-chip--' + planTones[r.status]">{{ planLabels[r.status] }}</span>
                          }
                        </span>
                      </li>
                    }
                  </ul>
                </app-section-card>
              }
              <!--
                The platform's side: plan and price, status, overrides, invoicing now. An @if, not a
                permission gate: projected content is created even when the gate hides it, and this
                panel loads super-admin-only data as soon as it exists.
              -->
              <app-subscription-admin [agencyId]="agencyId()!" [summary]="s" (changed)="reload()" />
            }
          }
        }
      </section>
    </app-context-guard>

    @if (confirming(); as option) {
      <app-dialog [title]="'Switch to ' + option.plan.name + '?'" [subtitle]="money(option.monthlyAtCurrentRooms) + ' a month at your ' + option.billableRooms + ' rooms'"
                  width="32rem" (closed)="confirming.set(null)">
        <div class="stack">
          <ul class="summary">
            <li><span class="facts__label">Price</span>
              <strong>{{ money(option.monthlyAtCurrentRooms) }} a month</strong>
              @if (+option.difference !== 0) { <span class="muted">({{ +option.difference > 0 ? '+' : '−' }}{{ money(abs(option.difference)) }} compared with now)</span> }
            </li>
            <li><span class="facts__label">When</span><strong>{{ timingText(option) }}</strong></li>
            @if (option.thisMonthEstimate != null) {
              <li><span class="facts__label">This month</span><strong>About {{ money(option.thisMonthEstimate) }}</strong>
                <span class="muted">each plan charged for its days, invoiced after the month ends</span></li>
            }
          </ul>
          @if (option.featuresGained.length > 0) {
            <div><h3 class="subhead">You get</h3><ul class="plain">@for (code of option.featuresGained; track code) { <li>✓ {{ feature(code) }}</li> }</ul></div>
          }
          @if (option.featuresLost.length > 0) {
            <div class="alert alert-warning"><strong>You lose</strong>
              <ul class="plain">@for (code of option.featuresLost; track code) { <li>{{ feature(code) }}</li> }</ul>
            </div>
          }
          @if (switchError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
        </div>
        <div dialog-actions class="dialog-actions">
          <button type="button" class="btn btn-primary" [disabled]="switching()" (click)="confirmSwitch(option)">
            {{ switching() ? 'Switching…' : 'Switch to ' + option.plan.name }}
          </button>
          <button type="button" class="text-link" (click)="confirming.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }

    @if (paying(); as state) {
      <app-billing-pay-dialog [agencyId]="agencyId()!" [invoice]="state.invoice"
                              [credit]="summary()?.creditBalance ?? null" [nextInvoice]="summary()?.currentMonthEstimate?.total ?? null"
                              [payNumber]="summary()?.paybillNumber ?? null" [accountCode]="summary()?.paybillAccount ?? null" [buyGoods]="!!summary()?.buyGoods"
                              (paid)="reload()" (closed)="paying.set(null)" />
    }
    @if (reporting()) {
      <app-report-billing-payment-dialog [agencyId]="agencyId()!" [invoices]="invoices()"
                                         (reported)="reporting.set(false); reported()" (closed)="reporting.set(false)" />
    }
    @if (recording()) {
      <app-record-billing-payment-dialog [agencyId]="agencyId()!" [invoices]="invoices()"
                                         (recorded)="recording.set(false); reload()" (closed)="recording.set(false)" />
    }
  `,
  styles: [`
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: var(--space-4); align-items: start; }
    .cols > * { min-width: 0; }
    .tabs { overflow-x: auto; scrollbar-width: none; }
    .tabs__tab { flex: 0 0 auto; min-height: 2.75rem; white-space: nowrap; }
    @media (max-width: 40rem) { .tabs { gap: 0; } .tabs__tab { flex: 1 1 auto; padding-inline: var(--space-2); } }
    .hero { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
    .hero__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); }
    .hero__head h2 { margin: 0; font-size: var(--font-page-title); }
    .eyebrow { margin: 0; color: var(--text-muted); }
    .hero__price { margin: 0; font-size: var(--text-xl); font-weight: var(--weight-bold); }
    .hero__price .muted { font-size: var(--text-md); font-weight: var(--weight-regular); }
    .facts, .summary { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .facts li, .summary li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); }
    .facts__label { flex: 0 0 7rem; color: var(--text-muted); }
    .hero__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .usage { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
    .usage li { display: grid; gap: var(--space-1-5); }
    .usage__head { display: flex; justify-content: space-between; gap: var(--space-2); }
    .usage__note { margin: 0; color: var(--text-muted); }
    .usage__note--near { color: var(--warning); font-weight: var(--weight-semibold); }
    .usage__note--full { color: var(--danger); font-weight: var(--weight-semibold); }
    /* A track that can be seen: the border colour, not the surface. */
    .meter { height: 0.6rem; border-radius: var(--radius-pill); background: var(--border-strong); overflow: hidden; }
    .meter > span { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--primary); }
    .meter--near > span { background: var(--warning); }
    .meter--full > span { background: var(--danger); }
    .subhead { margin: var(--space-3) 0 var(--space-1); font-size: var(--font-section-label); font-weight: var(--weight-semibold); color: var(--text); }
    .features { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .features li { display: grid; grid-template-columns: 1.25rem minmax(0, 1fr); gap: var(--space-1); }
    .tick { color: var(--success); font-weight: var(--weight-bold); }
    .estimate { width: 100%; }
    .estimate td, .estimate th { vertical-align: top; }
    .line__name { font-weight: var(--weight-semibold); }
    .info { display: flex; gap: var(--space-2); margin: var(--space-3) 0 0; padding: var(--space-2-5) var(--space-3); border-radius: var(--radius-sm); background: var(--primary-tint); }
    .info__icon { font-weight: var(--weight-bold); color: var(--primary-strong); }
    .copy-list { display: grid; margin: 0; padding: 0; list-style: none; }
    .copy-list li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
    .copy-list li:last-child { border-bottom: 0; }
    .copy-list__label { flex: 0 0 9rem; color: var(--text-muted); }
    .copy-list__value { font-weight: var(--weight-bold); font-size: var(--text-lg); }
    .copy-list app-copy-button { margin-left: auto; }
    .small { margin: 0; }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }
    .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .plan { display: grid; gap: var(--space-2); align-content: start; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
    .plan--current { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    .plan .btn { justify-self: stretch; }
    .plan__head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
    .plan__head h3 { margin: 0; font-size: var(--font-subsection); }
    .plan__price { margin: 0; font-size: var(--text-xl); font-weight: var(--weight-bold); }
    .plan__price span { font-size: var(--text-md); font-weight: var(--weight-regular); color: var(--text-muted); }
    .plan__diff { margin: 0; font-weight: var(--weight-semibold); color: var(--success); }
    .plan__diff--up { color: var(--text); }
    .plan__lists { display: grid; gap: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--border); }
    .plan__limits, .plan__features, .plain { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
    .plan__blocked { margin: 0; padding: var(--space-2) var(--space-2-5); border-radius: var(--radius-sm); background: var(--warning-tint); color: var(--text); }
    .year select { min-width: 7rem; }
    .rows { display: grid; margin: 0; padding: 0; list-style: none; }
    .rows > li { border-bottom: 1px solid var(--border); }
    .rows > li:last-child { border-bottom: 0; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-height: 3.5rem; padding: var(--space-2-5) var(--space-1); color: inherit; text-decoration: none; }
    a.row:hover, a.row:focus-visible { background: var(--primary-tint); }
    .row__main { display: grid; gap: var(--space-0-5); flex: 1 1 14rem; min-width: 0; }
    .row__side { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-2); margin-left: auto; }
    .row__chevron { color: var(--text-muted); font-size: var(--text-lg); }
    .ref { display: inline-flex; align-items: center; gap: var(--space-2); }
    .dialog-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
    .text-link { min-height: 2.75rem; padding: 0 var(--space-1); border: 0; background: none; font: inherit; font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: underline; cursor: pointer; }
    @media (max-width: 40rem) {
      .hero__actions .btn { flex: 1 1 100%; }
      .facts__label { flex-basis: 100%; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgencyBillingPageComponent {
  readonly RoutePaths = RoutePaths;

  /** From the route for the super admin; absent, the active agency. */
  readonly agencyIdParam = input<string | undefined>(undefined, { alias: 'agencyId' });
  readonly routeAgencyId = computed(() => this.agencyIdParam() ? Number(this.agencyIdParam()) : null);

  private readonly billing = inject(BillingService);
  private readonly context = inject(ActiveContextService);
  private readonly status = inject(BillingStatusService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);
  private readonly housing = inject(HousingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly agencyId = computed(() => this.routeAgencyId() ?? this.context.agencyId());
  readonly canManage = computed(() => this.context.can('BILLING_SUBSCRIPTION_MANAGE'));
  readonly canRecord = computed(() => this.context.can('BILLING_PAYMENT_RECORD'));
  readonly canPay = computed(() => this.context.can('BILLING_PAY'));
  readonly reportLabels = REPORT_STATUS_LABELS;
  readonly reportTones = REPORT_STATUS_TONES;
  readonly planLabels = PLAN_REQUEST_STATUS_LABELS;
  readonly planTones = PLAN_REQUEST_STATUS_TONES;

  readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'overview');
  readonly reporting = signal(false);
  readonly recording = signal(false);
  readonly paying = signal<{ invoice: BillingInvoice | null } | null>(null);
  readonly confirming = signal<PlanOption | null>(null);
  readonly switching = signal(false);
  readonly switchError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<BillingSummary | null>(null);
  readonly invoices = signal<BillingInvoice[]>([]);
  readonly payments = signal<BillingPayment[]>([]);
  readonly reports = signal<PaymentReport[]>([]);
  readonly planRequests = signal<PlanRequest[]>([]);
  readonly options = signal<PlanOption[]>([]);
  readonly invoiceYear = signal<string>('');

  readonly pendingPlan = computed(() => this.planRequests().find((r) => r.status === 'PENDING') ?? null);
  readonly currentOption = computed(() => this.options().find((option) => option.current) ?? null);
  /** Reports still open or turned down; a confirmed one is already in the payments below it. */
  readonly openReports = computed(() => this.reports().filter((r) => r.status === 'SUBMITTED' || r.status === 'REJECTED'));

  readonly tabs = computed(() => {
    const unpaid = this.invoices().filter((invoice) => invoice.status === 'ISSUED' && Number(invoice.balance) > 0).length;
    const waiting = this.reports().filter((r) => r.status === 'SUBMITTED').length;
    const list: { key: Tab; label: string; count: number }[] = [
      { key: 'overview', label: 'Overview', count: 0 },
      { key: 'plans', label: 'Plans', count: 0 },
      { key: 'invoices', label: 'Invoices', count: unpaid },
      { key: 'payments', label: 'Payments', count: waiting }
    ];
    if (this.canManage()) {
      list.push({ key: 'manage', label: 'Manage', count: this.planRequests().filter((r) => r.status === 'PENDING').length });
    }
    return list;
  });

  /** Another agency's (the super admin's view) is looked up; the active one is already known. */
  private readonly otherAgencyName = signal<string | null>(null);
  readonly agencyName = computed(() => this.routeAgencyId() && this.routeAgencyId() !== this.context.agencyId()
    ? (this.otherAgencyName() ?? '') : (this.context.active().agencyName ?? ''));

  /** The oldest invoice still owing: what "Pay" pays. */
  readonly oldestUnpaid = computed(() => [...this.invoices()]
    .filter((invoice) => invoice.status === 'ISSUED' && Number(invoice.balance) > 0)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))[0] ?? null);

  readonly invoiceYears = computed(() => [...new Set(this.invoices().map((invoice) => invoice.periodStart.slice(0, 4)))].sort().reverse());
  readonly shownInvoices = computed(() => {
    const year = this.invoiceYear() || this.invoiceYears()[0];
    return this.invoices().filter((invoice) => !year || invoice.periodStart.startsWith(year));
  });

  readonly limitKeys = computed(() => (this.summary()?.limits ?? []).map((limit) => limit.key));
  readonly plansSubtitle = computed(() => {
    const option = this.currentOption();
    return option ? `Priced at your ${option.billableRooms} rooms this month. Going up starts today; going down starts on the 1st.` : '';
  });

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      untracked(() => void this.load(agencyId));
    });
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  reload(): void {
    void this.load(this.agencyId());
    this.status.refresh();
  }

  private async load(agencyId: number | null): Promise<void> {
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    if (agencyId !== this.context.agencyId()) {
      firstValueFrom(this.housing.getAgency(agencyId)).then((agency) => this.otherAgencyName.set(agency.name ?? null)).catch(() => undefined);
    }
    try {
      const [summary, invoices, payments, reports, planRequests, options] = await Promise.all([
        firstValueFrom(this.billing.summary(agencyId)),
        firstValueFrom(this.billing.invoices(agencyId)).catch(() => [] as BillingInvoice[]),
        firstValueFrom(this.billing.payments(agencyId)).catch(() => [] as BillingPayment[]),
        firstValueFrom(this.billing.agencyReports(agencyId)).catch(() => [] as PaymentReport[]),
        firstValueFrom(this.billing.agencyPlanRequests(agencyId)).catch(() => [] as PlanRequest[]),
        firstValueFrom(this.billing.planOptions(agencyId)).catch(() => [] as PlanOption[])
      ]);
      this.reports.set(reports);
      this.planRequests.set(planRequests);
      this.options.set(options);
      this.summary.set(summary);
      this.invoices.set([...invoices].sort((a, b) => b.periodStart.localeCompare(a.periodStart)));
      this.payments.set([...payments].sort((a, b) => (b.paidAt || b.createdAt || '').localeCompare(a.paidAt || a.createdAt || '')));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  // ── Changing plan ──────────────────────────────────────────────────────────

  async choose(option: PlanOption): Promise<void> {
    if (option.requiresRequest) {
      await this.requestPlan(option);
      return;
    }
    this.switchError.set(null);
    this.confirming.set(option);
  }

  async confirmSwitch(option: PlanOption): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId === null || this.switching()) {
      return;
    }
    this.switching.set(true);
    this.switchError.set(null);
    try {
      await firstValueFrom(this.billing.switchPlan(agencyId, option.plan.id));
      this.confirming.set(null);
      this.toasts.push('success', option.timing === 'NEXT_MONTH'
        ? `Booked: ${option.plan.name} from ${this.date(option.effectiveOn)}.`
        : `Plan changed to ${option.plan.name} · from ${this.date(option.effectiveOn)}.`);
      this.setTab('overview');
      this.reload();
    } catch (error) {
      this.switchError.set(toApiError(error).message);
    } finally {
      this.switching.set(false);
    }
  }

  /** An agreed price: the platform makes the change, so it is asked for. */
  private async requestPlan(option: PlanOption): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId === null) {
      return;
    }
    const lost = option.featuresLost.length ? ` You would lose ${option.featuresLost.map(featureLabel).join(', ')}.` : '';
    const note = await this.confirm.askForReason({
      title: `Ask to move to ${option.plan.name}?`,
      message: `Your current price was agreed with us, so we make this change for you. On ${option.plan.name} you would pay ${this.money(option.monthlyAtCurrentRooms)} a month at your ${option.billableRooms} rooms.${lost} We reply within one working day.`,
      confirmLabel: 'Send request',
      reason: { label: 'Note for us', required: false, maxLength: 500 }
    });
    if (note === null) {
      return;
    }
    await this.call(() => this.billing.requestPlan(agencyId, option.plan.id, note.trim() || null),
      `Request sent. It shows on Overview as waiting until we reply.`);
  }

  async cancelScheduled(): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId !== null && await this.confirm.ask({ title: 'Call off the plan change?', message: 'You stay on your current plan.', confirmLabel: 'Call it off' })) {
      await this.call(() => this.billing.cancelScheduledSwitch(agencyId), 'Plan change called off.');
    }
  }

  async withdrawPlan(requestId: number): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId !== null) {
      await this.call(() => this.billing.withdrawPlanRequest(agencyId, requestId), 'Request withdrawn.');
    }
  }

  timingText(option: PlanOption): string {
    switch (option.timing) {
      case 'NEXT_MONTH': return `Starts ${this.date(option.effectiveOn)}. You keep your current plan until then.`;
      case 'AFTER_TRIAL': return `Starts now. Free until ${this.date(option.billingStartsOn)}; billing starts then.`;
      default: return `Starts today, ${this.date(option.effectiveOn)}.`;
    }
  }

  buttonText(option: PlanOption, s: BillingSummary): string {
    if (s.subscription.scheduledPlanId === option.plan.id) return `Booked for ${this.date(s.subscription.scheduledFrom)}`;
    if (this.pendingPlan()?.planId === option.plan.id) return 'Asked for';
    if (option.requiresRequest) return `Ask to move to ${option.plan.name}`;
    return `Switch to ${option.plan.name}`;
  }

  limitWords(key: string, plan: BillingPlan): string {
    return limitLine(key, plan.limits?.[key] ?? null);
  }

  // ── Payments reported and recorded ─────────────────────────────────────────

  reported(): void {
    this.toasts.push('success', 'Payment reported. We will confirm it and let you know.');
    this.reload();
  }

  async withdrawReport(reportId: number): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId !== null) {
      await this.call(() => this.billing.withdrawReport(agencyId, reportId), 'Report withdrawn.');
    }
  }

  async approveReport(reportId: number): Promise<void> {
    const report = this.reports().find((r) => r.id === reportId);
    if (!report || !await this.confirm.ask({
      title: `Confirm ${this.money(report.amount)} (${report.reference})?`,
      message: report.alreadyReceived
        ? 'This payment already reached the platform; confirming links the report to it — nothing is counted twice.'
        : 'Check it against your M-Pesa or bank statement first. Confirming records it as a payment on this agency.',
      confirmLabel: 'Confirm payment'
    })) {
      return;
    }
    await this.call(() => this.billing.approveReport(reportId), 'Payment confirmed.');
  }

  async rejectReport(reportId: number): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Not received?',
      message: 'The agency sees the reason.',
      confirmLabel: 'Mark not received',
      destructive: true,
      reason: { label: 'Why', required: true, maxLength: 500 }
    });
    if (reason !== null) {
      await this.call(() => this.billing.rejectReport(reportId, reason), 'Report marked not received.');
    }
  }

  async approvePlan(requestId: number, planName: string): Promise<void> {
    if (await this.confirm.ask({ title: `Move them to ${planName}?`, message: 'At the plan\'s own price. Set a custom price in Manage subscription afterwards if needed.', confirmLabel: 'Approve' })) {
      await this.call(() => this.billing.approvePlanRequest(requestId, null), 'Plan changed.');
    }
  }

  async declinePlan(requestId: number): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Decline this request?', confirmLabel: 'Decline', destructive: true,
      reason: { label: 'Why (the agency sees this)', required: true, maxLength: 500 }
    });
    if (reason !== null) {
      await this.call(() => this.billing.declinePlanRequest(requestId, reason), 'Request declined.');
    }
  }

  async reverse(payment: BillingPayment): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId === null) {
      return;
    }
    const reason = await this.confirm.askForReason({
      title: `Reverse ${this.money(payment.amount)}?`,
      message: 'A reversal is a new negative entry; the payment itself is kept. Invoices it paid become unpaid again unless credit covers them.',
      confirmLabel: 'Reverse payment',
      destructive: true,
      reason: { label: 'Why', required: true, maxLength: 500 }
    });
    if (reason !== null) {
      await this.call(() => this.billing.reversePayment(agencyId, payment.id, reason), 'Payment reversed.');
    }
  }

  private async call(work: () => import('rxjs').Observable<unknown>, done: string): Promise<void> {
    try {
      await firstValueFrom(work());
      this.toasts.push('success', done);
      this.reload();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  canReverse(payment: BillingPayment): boolean {
    const reversed = this.payments().some((other) => other.reversalOfId === payment.id);
    return payment.status === 'COMPLETED' && Number(payment.amount) > 0 && !payment.reversalOfId && !reversed;
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  exportInvoices(): void {
    downloadCsv('unitwise-invoices', this.invoices(), [
      { header: 'Invoice', value: (i) => asText(i.invoiceNumber) },
      { header: 'Month', value: (i) => i.periodStart.slice(0, 7) },
      { header: 'Rooms billed', value: (i) => i.billableRooms },
      { header: 'Subtotal (KES)', value: (i) => i.subtotal },
      { header: 'VAT (KES)', value: (i) => i.taxTotal },
      { header: 'Total (KES)', value: (i) => i.total },
      { header: 'Paid (KES)', value: (i) => i.amountPaid },
      { header: 'Balance (KES)', value: (i) => i.balance },
      { header: 'Issued', value: (i) => i.issuedAt?.slice(0, 10) },
      { header: 'Due', value: (i) => i.dueDate },
      { header: 'Paid on', value: (i) => i.paidAt?.slice(0, 10) },
      { header: 'Status', value: (i) => this.invoiceStatus(i) }
    ]);
  }

  exportPayments(): void {
    downloadCsv('unitwise-payments', this.payments(), [
      { header: 'Date', value: (p) => (p.paidAt || p.createdAt || '').slice(0, 10) },
      { header: 'Amount (KES)', value: (p) => p.amount },
      { header: 'Method', value: (p) => this.methodLabel(p) },
      { header: 'Reference', value: (p) => asText(p.providerReference) },
      { header: 'For', value: (p) => this.paymentFor(p) },
      { header: 'Status', value: (p) => this.paymentStatus(p) }
    ]);
  }

  // ── Words ──────────────────────────────────────────────────────────────────

  /** A state that needs acting on, said once above everything else. */
  alert(s: BillingSummary): { tone: 'warning' | 'error' | 'info'; text: string } | null {
    const sub = s.subscription;
    switch (sub.effectiveStatus) {
      case 'PAST_DUE': return { tone: 'warning', text: `Payment overdue since ${this.date(sub.paymentOverdueSince)}. Pay within ${sub.graceDays ?? 0} days of that to keep adding and changing things.` };
      case 'SUSPENDED': return sub.status === 'TRIALING'
        ? { tone: 'error', text: 'Your free trial has ended. Choose a plan to keep adding and changing things — everything you have is kept.' }
        : { tone: 'error', text: 'Your account is on hold: you can see everything but not add or change. Pay the overdue invoices to lift it.' };
      case 'CANCELED': return { tone: 'error', text: 'Your subscription is canceled. Contact us to start it again.' };
      case 'TRIALING': {
        const days = sub.trialEndsAt ? Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;
        return days !== null && days <= 7 ? { tone: 'info', text: `Your free trial ends in ${days} day${days === 1 ? '' : 's'}, on ${this.date(sub.trialEndsAt)}. Choose a plan to carry on without a break.` } : null;
      }
      default: return null;
    }
  }

  nextLabel(s: BillingSummary): string {
    const sub = s.subscription;
    if (sub.effectiveStatus === 'TRIALING') return 'Trial ends';
    if (sub.billingStartsOn && sub.billingStartsOn > todayIso()) return 'Free until';
    return 'Next invoice';
  }

  nextValue(s: BillingSummary): string {
    const sub = s.subscription;
    if (sub.effectiveStatus === 'TRIALING') return this.date(sub.trialEndsAt);
    if (sub.billingStartsOn && sub.billingStartsOn > todayIso()) return `${this.date(sub.billingStartsOn)} — billing starts then`;
    const e = s.currentMonthEstimate;
    if (!e) return '—';
    return `${this.date(this.nextInvoiceOn(e.periodEnd))} · about ${this.money(+e.total + this.vat(s, e.total))}`;
  }

  /** The day after the period ends: the invoice is issued early that morning. */
  nextInvoiceOn(periodEnd: string): string {
    const day = new Date(`${periodEnd.slice(0, 10)}T00:00:00`);
    day.setDate(day.getDate() + 1);
    return isoDate(day);
  }

  unusedIncluded(s: BillingSummary, rooms: number): number {
    const included = s.subscription.includedRooms ?? 0;
    return included > 0 && rooms < included ? included - rooms : 0;
  }

  vatPercent(s: BillingSummary): string {
    return String(Math.round((Number(s.vatRate) || 0) * 10000) / 100);
  }

  vat(s: BillingSummary, total: number | string): number {
    return Math.round((Number(total) || 0) * (Number(s.vatRate) || 0) * 100) / 100;
  }

  level(limit: LimitUsage): 'ok' | 'near' | 'full' {
    if (limit.limit == null || limit.limit <= 0) return limit.limit === 0 && limit.used > 0 ? 'full' : 'ok';
    const ratio = limit.used / limit.limit;
    return ratio >= 1 ? 'full' : ratio >= 0.8 ? 'near' : 'ok';
  }

  invoiceWhen(invoice: BillingInvoice): string {
    if (invoice.status === 'VOID') return `Voided ${this.date(invoice.voidedAt)}`;
    if (invoice.status === 'PAID') return `Paid on ${this.date(invoice.paidAt)}`;
    return `${invoice.overdue ? 'Was due' : 'Due'} ${this.date(invoice.dueDate)} · ${this.money(invoice.balance)} to pay`;
  }

  invoiceStatus(invoice: BillingInvoice): string {
    if (invoice.status === 'VOID') return 'Void';
    if (invoice.status === 'PAID') return 'Paid';
    if (invoice.overdue) return 'Overdue';
    return Number(invoice.amountPaid) > 0 ? 'Part paid' : 'Unpaid';
  }

  invoiceTone(invoice: BillingInvoice): string {
    if (invoice.status === 'VOID') return 'neutral';
    if (invoice.status === 'PAID') return 'success';
    return invoice.overdue ? 'danger' : 'warning';
  }

  paymentStatus(payment: BillingPayment): string {
    if (Number(payment.amount) < 0) return 'Reversed';
    return { PENDING: 'Waiting for M-Pesa', COMPLETED: 'Received', FAILED: 'Failed', UNMATCHED: 'Not placed yet' }[payment.status];
  }

  paymentTone(payment: BillingPayment): string {
    if (Number(payment.amount) < 0) return 'neutral';
    return { PENDING: 'warning', COMPLETED: 'success', FAILED: 'danger', UNMATCHED: 'warning' }[payment.status];
  }

  paymentFor(payment: BillingPayment): string {
    if (Number(payment.amount) < 0) return 'reversal';
    return payment.invoiceNumber ? `for invoice ${payment.invoiceNumber}` : 'kept as credit';
  }

  methodLabel(payment: BillingPayment): string {
    return PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
  }

  price(s: BillingSummary): string {
    return describePrice(s.subscription);
  }

  describe(plan: BillingPlan): string {
    return describePrice(plan);
  }

  tone(s: BillingSummary): string {
    return SUBSCRIPTION_STATUS_TONES[s.subscription.effectiveStatus];
  }

  statusLabel(s: BillingSummary): string {
    const sub = s.subscription;
    if (sub.status === 'TRIALING' && sub.effectiveStatus === 'SUSPENDED') return 'Trial ended';
    if (sub.effectiveStatus === 'ACTIVE' && sub.billingStartsOn && sub.billingStartsOn > todayIso()) return 'Free trial';
    return SUBSCRIPTION_STATUS_LABELS[sub.effectiveStatus];
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  featureHint(code: string): string | null {
    return FEATURE_DESCRIPTIONS[code] ?? null;
  }

  limitText(key: string): string {
    return limitLabel(key);
  }

  share(used: number, limit: number): number {
    return limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  }

  abs(value: number | string): number {
    return Math.abs(Number(value) || 0);
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }

  period(start: string, end: string): string {
    return periodLabel(start, end);
  }

  monthOf(value: string): string {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : shortDate(date, { month: 'long', year: 'numeric' });
  }
}
