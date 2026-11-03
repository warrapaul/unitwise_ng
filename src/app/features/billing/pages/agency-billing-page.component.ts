import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HousingService } from '../../housing/housing.service';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { BillingStatusService } from '../billing-status.service';
import {
  BillingInvoice,
  BillingPayment,
  BillingSummary,
  describePrice,
  featureLabel,
  limitLabel,
  PAYMENT_METHOD_LABELS,
  PRICING_MODE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES, kes,
  BillingPlan,
  PaymentReport,
  PlanRequest,
  PLAN_REQUEST_STATUS_LABELS,
  PLAN_REQUEST_STATUS_TONES,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TONES
} from '../billing.models';
import { BillingService } from '../billing.service';
import { BillingPayDialogComponent } from '../components/billing-pay-dialog.component';
import { SubscriptionAdminComponent } from '../components/subscription-admin.component';
import { RecordPaymentDialogComponent } from '../components/record-billing-payment-dialog.component';
import { ReportBillingPaymentDialogComponent } from '../components/report-billing-payment-dialog.component';

/**
 * An agency's billing, as its admins read it: the plan and what it costs, what the month is
 * coming to, what is used against the plan's caps, the invoices and payments, and paying. The
 * super admin reaches any agency's by id and gets the management panel below it.
 */
@Component({
  selector: 'app-agency-billing-page',
  standalone: true,
  imports: [CardTableDirective, RouterLink, RowLinkDirective, ContextGuardComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent,
    PermissionGateComponent, BillingPayDialogComponent, ReportBillingPaymentDialogComponent, SubscriptionAdminComponent, RecordPaymentDialogComponent],
  template: `
    <app-context-guard [requireBuilding]="false" [agencyId]="routeAgencyId() ?? null" action="to see billing">
      <section class="stack">
        <header class="page-head">
          <div class="page-head__title">
            <h1>Billing &amp; plan</h1>
            <p>{{ agencyName() }}</p>
          </div>
          @if (summary(); as s) {
            <app-permission-gate [permissions]="['BILLING_PAY']">
              <!-- Paid but it has not shown up: tell the platform, like a tenant reporting rent. -->
              <button type="button" class="btn btn-secondary btn-sm" (click)="reporting.set(true)">Report a payment</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="paying.set({ invoice: null })">Pay ahead</button>
              @if (oldestUnpaid(); as invoice) {
                <button type="button" class="btn btn-primary btn-sm" (click)="paying.set({ invoice })">Pay {{ money(invoice.balance) }}</button>
              }
            </app-permission-gate>
          }
        </header>

        @if (loading() && !summary()) {
          <app-loading-state label="Loading billing..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (summary(); as s) {
          <!-- Where the account stands, in one row. -->
          <div class="kpi-grid">
            <div class="kpi">
              <span class="kpi__label">Plan</span>
              <span class="kpi__value kpi__value--text">{{ s.subscription.planName }}</span>
              <span class="kpi__note">{{ price(s) }}@if (s.subscription.priceSource === 'CUSTOM') { · custom price }</span>
            </div>
            <div class="kpi">
              <span class="kpi__label">Status</span>
              <span class="kpi__value kpi__value--text"><span [class]="'status-chip status-chip--' + tone(s)">{{ statusLabel(s) }}</span></span>
              <span class="kpi__note">{{ statusNote(s) }}</span>
            </div>
            <div class="kpi">
              <span class="kpi__label">This month so far</span>
              <span class="kpi__value">{{ money(s.currentMonthEstimate?.total) }}</span>
              <span class="kpi__note">{{ s.currentMonthEstimate?.billableRooms ?? 0 }} billable room{{ s.currentMonthEstimate?.billableRooms === 1 ? '' : 's' }} · invoiced after the month ends</span>
            </div>
            <div class="kpi" [class.kpi--bad]="+s.outstandingBalance > 0">
              <span class="kpi__label">Outstanding</span>
              <span class="kpi__value">{{ money(s.outstandingBalance) }}</span>
              <span class="kpi__note">Unpaid on issued invoices</span>
            </div>
            <div class="kpi" [class.kpi--good]="+s.creditBalance > 0">
              <span class="kpi__label">Credit</span>
              <span class="kpi__value">{{ money(s.creditBalance) }}</span>
              <span class="kpi__note">Pays your next invoice</span>
            </div>
          </div>

          <div class="cols">
            <!-- What the plan allows and what is used against it. A missing cap is unlimited. -->
            <app-section-card title="Usage">
              <ul class="usage">
                @for (limit of s.limits; track limit.key) {
                  <li>
                    <div class="usage__head">
                      <span>{{ limitText(limit.key) }}</span>
                      <strong>{{ limit.used }}{{ limit.limit != null ? ' of ' + limit.limit : '' }}</strong>
                    </div>
                    @if (limit.limit != null) {
                      <div class="progress progress--thin" [class.progress--full]="limit.used >= limit.limit" aria-hidden="true">
                        <span [style.width.%]="share(limit.used, limit.limit)"></span>
                      </div>
                      @if (limit.used >= limit.limit) { <small class="warn">At the plan's limit — adding more needs a bigger plan.</small> }
                    } @else {
                      <small class="muted">No limit on your plan</small>
                    }
                  </li>
                } @empty {
                  <li class="muted">No limits on your plan.</li>
                }
              </ul>
              <h3 class="subhead">Included</h3>
              <ul class="features">
                @for (code of s.features; track code) { <li>✓ {{ feature(code) }}</li> } @empty { <li class="muted">No features listed.</li> }
              </ul>
            </app-section-card>

            <!-- The month as it would be invoiced if it ended today. -->
            <app-section-card title="This month's estimate">
              @if (s.currentMonthEstimate; as e) {
                <p class="muted small">{{ date(e.periodStart) }} – {{ date(e.periodEnd) }}. Rooms that existed at any time in the month are billed.</p>
                <table class="table table--packed">
                  <tbody>
                    @for (line of e.lines; track $index) {
                      <tr><td>{{ line.description }}</td><td class="num muted">{{ line.quantity }} × {{ money(line.unitPrice) }}</td><td class="num">{{ money(line.amount) }}</td></tr>
                    } @empty {
                      <tr><td class="muted" colspan="3">Nothing to charge.</td></tr>
                    }
                  </tbody>
                  <tfoot><tr><th colspan="2">Estimated total (before tax)</th><td class="num"><strong>{{ money(e.total) }}</strong></td></tr></tfoot>
                </table>
              }
              @if (s.paybillAccount) {
                <p class="pay-note">To pay ahead by paybill, use account <strong class="mono">{{ s.paybillAccount }}</strong>. To pay an invoice, use its number.</p>
              }
            </app-section-card>
          </div>

          <!--
            Changing plan: the landlord picks from the public plans and asks; the platform approves at
            the plan's price. The platform admin changes plans directly in Manage subscription below.
          -->
          @if (!canManage()) {
            <app-permission-gate [permissions]="['BILLING_PAY']">
              <app-section-card title="Change plan">
                @if (pendingPlan(); as pending) {
                  <p class="pending">
                    <span class="status-chip status-chip--warning">Waiting for approval</span>
                    You asked to move to <strong>{{ pending.planName }}</strong> on {{ date(pending.createdAt) }}.
                    <button type="button" class="text-button" (click)="withdrawPlan(pending.id)">Withdraw</button>
                  </p>
                }
                @if (otherPlans().length === 0) {
                  <p class="muted">No other plans are available right now. Contact us for a custom plan.</p>
                } @else {
                  <ul class="plans">
                    @for (plan of otherPlans(); track plan.id) {
                      <li class="plan">
                        <div class="plan__head"><strong>{{ plan.name }}</strong><span class="plan__price">{{ describe(plan) }}</span></div>
                        @if (plan.description) { <p class="muted small">{{ plan.description }}</p> }
                        <p class="small">{{ planFacts(plan) }}</p>
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="pendingPlan()?.planId === plan.id" (click)="requestPlan(plan.id, plan.name)">
                          {{ pendingPlan()?.planId === plan.id ? 'Requested' : 'Request this plan' }}
                        </button>
                      </li>
                    }
                  </ul>
                }
              </app-section-card>
            </app-permission-gate>
          }

          <!-- Payments the agency reported: waiting, confirmed or not accepted. The platform admin decides here too. -->
          @if (reports().length > 0) {
            <app-section-card title="Reported payments">
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Reported</th><th>Reference</th><th>For</th><th class="num">Amount</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    @for (r of reports(); track r.id) {
                      <tr>
                        <td>{{ date(r.createdAt) }}<br><span class="muted small">{{ r.reportedByName || '' }}</span></td>
                        <td class="mono">{{ r.reference }}@if (r.alreadyReceived && r.status === 'SUBMITTED') { <br><span class="status-chip status-chip--success">✓ Received</span> }</td>
                        <td>{{ r.invoiceNumber || 'Account' }}</td>
                        <td class="num">{{ money(r.amount) }}</td>
                        <td>
                          <span [class]="'status-chip status-chip--' + reportTones[r.status]">{{ reportLabels[r.status] }}</span>
                          @if (r.decisionNote) { <br><span class="muted small">{{ r.decisionNote }}</span> }
                        </td>
                        <td class="row-action">
                          @if (r.status === 'SUBMITTED') {
                            @if (canRecord()) {
                              <button type="button" class="btn btn-primary btn-sm" (click)="approveReport(r.id)">Confirm</button>
                              <button type="button" class="btn btn-secondary btn-sm" (click)="rejectReport(r.id)">Reject</button>
                            } @else {
                              <button type="button" class="btn btn-secondary btn-sm" (click)="withdrawReport(r.id)">Withdraw</button>
                            }
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </app-section-card>
          }

          @if (canManage() && planRequests().length > 0) {
            <app-section-card title="Plan requests">
              <ul class="requests">
                @for (r of planRequests(); track r.id) {
                  <li>
                    <span><strong>{{ r.fromPlanName || '—' }} → {{ r.planName }}</strong> · {{ date(r.createdAt) }}@if (r.requestedByName) { · {{ r.requestedByName }} }
                      @if (r.note) { <br><span class="muted small">“{{ r.note }}”</span> }</span>
                    @if (r.status === 'PENDING') {
                      <span class="button-row">
                        <button type="button" class="btn btn-primary btn-sm" (click)="approvePlan(r.id, r.planName)">Approve</button>
                        <button type="button" class="btn btn-secondary btn-sm" (click)="declinePlan(r.id)">Decline</button>
                      </span>
                    } @else {
                      <span [class]="'status-chip status-chip--' + planTones[r.status]">{{ planLabels[r.status] }}</span>
                    }
                  </li>
                }
              </ul>
            </app-section-card>
          }

          <app-section-card title="Invoices">
            @if (invoices().length === 0) {
              <p class="muted">No invoices yet. Each month is invoiced after it ends.</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Invoice</th><th>Month</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Due</th><th>Status</th></tr></thead>
                  <tbody>
                    @for (invoice of invoices(); track invoice.id) {
                      <tr [appRowLink]="RoutePaths.billingInvoice(agencyId()!, invoice.id)">
                        <td><a class="record-link__primary mono" [routerLink]="RoutePaths.billingInvoice(agencyId()!, invoice.id)">{{ invoice.invoiceNumber }}</a></td>
                        <td>{{ monthOf(invoice.periodStart) }}</td>
                        <td class="num">{{ money(invoice.total) }}</td>
                        <td class="num">{{ money(invoice.amountPaid) }}</td>
                        <td class="num" [class.owing]="+invoice.balance > 0 && invoice.status !== 'VOID'">{{ money(invoice.balance) }}</td>
                        <td>{{ date(invoice.dueDate) }}</td>
                        <td><span [class]="'status-chip status-chip--' + invoiceTone(invoice)">{{ invoiceStatus(invoice) }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <app-section-card title="Payments">
            <app-permission-gate actions [permissions]="['BILLING_PAYMENT_RECORD']">
              <button type="button" class="btn btn-secondary btn-sm" (click)="recording.set(true)">Record a payment</button>
            </app-permission-gate>
            @if (payments().length === 0) {
              <p class="muted">No payments yet.</p>
            } @else {
              <div class="table-scroll">
                <table appCardTable class="table">
                  <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>For</th><th class="num">Amount</th><th>Status</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
                  <tbody>
                    @for (payment of payments(); track payment.id) {
                      <tr>
                        <td>{{ date(payment.paidAt || payment.createdAt) }}</td>
                        <td>{{ methodLabel(payment) }}</td>
                        <td class="mono">{{ payment.providerReference || '—' }}</td>
                        <td>{{ payment.invoiceNumber || (+payment.amount < 0 ? 'Reversal' : 'Account credit') }}</td>
                        <td class="num" [class.owing]="+payment.amount < 0">{{ money(payment.amount) }}</td>
                        <td><span [class]="'status-chip status-chip--' + paymentTone(payment)">{{ paymentStatus(payment) }}</span></td>
                        <td class="row-action">
                          @if (canReverse(payment)) {
                            <app-permission-gate [permissions]="['BILLING_PAYMENT_RECORD']">
                              <button type="button" class="btn btn-secondary btn-sm" (click)="reverse(payment)">Reverse</button>
                            </app-permission-gate>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-section-card>

          <!--
            The platform's side: plan and price, status, overrides, invoicing now. An @if, not a
            permission gate: projected content is created even when the gate hides it, and this
            panel loads super-admin-only data as soon as it exists.
          -->
          @if (canManage()) {
            <app-subscription-admin [agencyId]="agencyId()!" [summary]="s" (changed)="reload()" />
          }
        }
      </section>
    </app-context-guard>

    @if (paying(); as state) {
      <app-billing-pay-dialog [agencyId]="agencyId()!" [invoice]="state.invoice" (paid)="reload()" (closed)="paying.set(null)" />
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
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: var(--space-4); }
    .cols > * { min-width: 0; }
    .kpi__value--text { font-size: var(--font-subsection); }
    .usage { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .usage li { display: grid; gap: var(--space-1); }
    .usage__head { display: flex; justify-content: space-between; gap: var(--space-2); }
    .progress--full > span { background: var(--warning); }
    .warn { color: var(--warning); font-weight: var(--weight-semibold); }
    .subhead { margin: var(--space-2) 0 0; font-size: var(--font-section-label); font-weight: var(--weight-semibold); color: var(--text); }
    .features { display: flex; flex-wrap: wrap; gap: var(--space-1-5) var(--space-4); margin: 0; padding: 0; list-style: none; font-size: var(--font-dense); }
    .pay-note { margin: var(--space-2) 0 0; font-size: var(--font-description); }
    .small { margin: 0; font-size: var(--font-description); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }
    .row-action { text-align: right; white-space: nowrap; }
    .pending { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: 0; }
    .plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .plan { display: grid; gap: var(--space-1-5); align-content: start; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .plan .btn { justify-self: start; }
    .plan__head { display: grid; gap: var(--space-0-5); }
    .plan__price { font-size: var(--font-description); color: var(--primary-strong); font-weight: var(--weight-semibold); }
    .requests { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    .requests li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); }
    .text-button { padding: 0; border: 0; background: none; font: inherit; font-weight: var(--weight-semibold); color: var(--primary-strong); text-decoration: underline; cursor: pointer; }
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

  readonly agencyId = computed(() => this.routeAgencyId() ?? this.context.agencyId());
  readonly canManage = computed(() => this.context.can('BILLING_SUBSCRIPTION_MANAGE'));
  readonly canRecord = computed(() => this.context.can('BILLING_PAYMENT_RECORD'));
  readonly reportLabels = REPORT_STATUS_LABELS;
  readonly reportTones = REPORT_STATUS_TONES;
  readonly planLabels = PLAN_REQUEST_STATUS_LABELS;
  readonly planTones = PLAN_REQUEST_STATUS_TONES;
  readonly reporting = signal(false);
  readonly reports = signal<PaymentReport[]>([]);
  readonly planRequests = signal<PlanRequest[]>([]);
  readonly availablePlans = signal<BillingPlan[]>([]);
  readonly pendingPlan = computed(() => this.planRequests().find((r) => r.status === 'PENDING') ?? null);
  /** Public plans other than the one the agency is on. */
  readonly otherPlans = computed(() => this.availablePlans()
    .filter((plan) => plan.active !== false && plan.publicPlan !== false && plan.id !== this.summary()?.subscription.planId));
  /** Another agency's (the super admin's view) is looked up; the active one is already known. */
  private readonly otherAgencyName = signal<string | null>(null);
  readonly agencyName = computed(() => this.routeAgencyId() && this.routeAgencyId() !== this.context.agencyId()
    ? (this.otherAgencyName() ?? '') : (this.context.active().agencyName ?? ''));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<BillingSummary | null>(null);
  readonly invoices = signal<BillingInvoice[]>([]);
  readonly payments = signal<BillingPayment[]>([]);
  readonly paying = signal<{ invoice: BillingInvoice | null } | null>(null);
  readonly recording = signal(false);

  /** The oldest invoice still owing: what "Pay" pays. */
  readonly oldestUnpaid = computed(() => [...this.invoices()]
    .filter((invoice) => invoice.status === 'ISSUED' && Number(invoice.balance) > 0)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))[0] ?? null);

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      untracked(() => void this.load(agencyId));
    });
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
      const [summary, invoices, payments, reports, planRequests, plans] = await Promise.all([
        firstValueFrom(this.billing.summary(agencyId)),
        firstValueFrom(this.billing.invoices(agencyId)).catch(() => [] as BillingInvoice[]),
        firstValueFrom(this.billing.payments(agencyId)).catch(() => [] as BillingPayment[]),
        firstValueFrom(this.billing.agencyReports(agencyId)).catch(() => [] as PaymentReport[]),
        firstValueFrom(this.billing.agencyPlanRequests(agencyId)).catch(() => [] as PlanRequest[]),
        firstValueFrom(this.billing.plans()).catch(() => [] as BillingPlan[])
      ]);
      this.reports.set(reports);
      this.planRequests.set(planRequests);
      this.availablePlans.set([...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      this.summary.set(summary);
      this.invoices.set([...invoices].sort((a, b) => b.periodStart.localeCompare(a.periodStart)));
      this.payments.set([...payments].sort((a, b) => (b.paidAt || b.createdAt || '').localeCompare(a.paidAt || a.createdAt || '')));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  reported(): void {
    this.toasts.push('success', 'Payment reported. We will confirm it and let you know.');
    this.reload();
  }

  async requestPlan(planId: number, planName: string): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId === null) {
      return;
    }
    const note = await this.confirm.askForReason({
      title: `Move to ${planName}?`,
      message: 'We will review the request and switch your plan; the new price applies from that month\'s invoice.',
      confirmLabel: 'Send request',
      reason: { label: 'Note (optional)', required: false, maxLength: 500, placeholder: 'e.g. We are adding a second building' }
    });
    if (note === null) {
      return;
    }
    await this.call(() => this.billing.requestPlan(agencyId, planId, note.trim() || null), 'Request sent. We will let you know.');
  }

  async withdrawPlan(requestId: number): Promise<void> {
    const agencyId = this.agencyId();
    if (agencyId !== null) {
      await this.call(() => this.billing.withdrawPlanRequest(agencyId, requestId), 'Request withdrawn.');
    }
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
      title: 'Reject this report?',
      message: 'The agency sees the reason.',
      confirmLabel: 'Reject',
      destructive: true,
      reason: { label: 'Why', required: true, maxLength: 500, placeholder: 'e.g. No such payment on our statement' }
    });
    if (reason !== null) {
      await this.call(() => this.billing.rejectReport(reportId, reason), 'Report rejected.');
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

  private async call(work: () => import('rxjs').Observable<unknown>, done: string): Promise<void> {
    try {
      await firstValueFrom(work());
      this.toasts.push('success', done);
      this.reload();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  describe(plan: BillingPlan): string {
    return describePrice(plan);
  }

  /** "Up to 30 rooms · 1 building · M-Pesa rent collection, Chat with tenants" */
  planFacts(plan: BillingPlan): string {
    const limits = Object.entries(plan.limits ?? {}).map(([key, value]) => `${limitLabel(key)}: ${value}`);
    const features = (plan.features ?? []).map(featureLabel);
    return [limits.length ? limits.join(' · ') : 'No limits', features.join(', ')].filter(Boolean).join(' — ');
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
    if (reason === null) {
      return;
    }
    try {
      await firstValueFrom(this.billing.reversePayment(agencyId, payment.id, reason));
      this.toasts.push('success', 'Payment reversed.');
      this.reload();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  canReverse(payment: BillingPayment): boolean {
    const reversed = this.payments().some((other) => other.reversalOfId === payment.id);
    return payment.status === 'COMPLETED' && Number(payment.amount) > 0 && !payment.reversalOfId && !reversed;
  }

  price(s: BillingSummary): string {
    return describePrice(s.subscription);
  }

  tone(s: BillingSummary): string {
    return SUBSCRIPTION_STATUS_TONES[s.subscription.effectiveStatus];
  }

  statusLabel(s: BillingSummary): string {
    return SUBSCRIPTION_STATUS_LABELS[s.subscription.effectiveStatus];
  }

  /** The one date that matters for the status: when the trial ends, since when overdue, … */
  statusNote(s: BillingSummary): string {
    const sub = s.subscription;
    switch (sub.effectiveStatus) {
      case 'TRIALING': return sub.trialEndsAt ? `Trial ends ${this.date(sub.trialEndsAt)}` : 'Free trial';
      case 'PAST_DUE': return sub.paymentOverdueSince
        ? `Overdue since ${this.date(sub.paymentOverdueSince)} · ${sub.graceDays ?? 0} days' grace` : 'Payment overdue';
      case 'SUSPENDED': return 'Read-only until paid';
      case 'CANCELED': return sub.canceledAt ? `Canceled ${this.date(sub.canceledAt)}` : 'Read-only';
      default: return `${PRICING_MODE_LABELS[sub.pricingMode] ?? ''}${sub.billedThrough ? ' · invoiced to ' + this.date(sub.billedThrough) : ''}`;
    }
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
    return { PENDING: 'Waiting for M-Pesa', COMPLETED: 'Received', FAILED: 'Failed', UNMATCHED: 'Unmatched' }[payment.status];
  }

  paymentTone(payment: BillingPayment): string {
    return { PENDING: 'warning', COMPLETED: 'success', FAILED: 'danger', UNMATCHED: 'warning' }[payment.status];
  }

  methodLabel(payment: BillingPayment): string {
    return PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  limitText(key: string): string {
    return limitLabel(key);
  }

  share(used: number, limit: number): number {
    return limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '—';
  }

  monthOf(value: string): string {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}
