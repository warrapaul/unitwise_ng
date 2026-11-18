import { saveDownload } from '../../../shared/utils/download.util';
import { shortDate } from '../../../shared/utils/format.util';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { RecordPaymentDialogComponent } from '../components/record-billing-payment-dialog.component';
import { ReportBillingPaymentDialogComponent } from '../components/report-billing-payment-dialog.component';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { NotificationService } from '../../../core/services/notification.service';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { BillingStatusService } from '../billing-status.service';
import { BillingInvoice, PAYMENT_METHOD_LABELS, kes } from '../billing.models';
import { BillingService } from '../billing.service';
import { BillingPayDialogComponent } from '../components/billing-pay-dialog.component';

/**
 * One invoice: the month, each line with its tax, the totals, and which payments paid it (and
 * how much of each). Paying is one button; the paybill account is the invoice number. The super
 * admin can void it, optionally issuing a fresh one for the same month at the current price.
 */
@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  imports: [CardTableDirective, RecordPaymentDialogComponent, ReportBillingPaymentDialogComponent, BackLinkComponent, SectionCardComponent, LoadingStateComponent, ErrorStateComponent, PermissionGateComponent, BillingPayDialogComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.billingAgency(agencyId())" label="Billing" [title]="invoice()?.invoiceNumber || null" />
      @if (loading() && !invoice()) {
        <app-loading-state label="Loading the invoice…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (invoice(); as inv) {
        <app-section-card [title]="'Invoice ' + inv.invoiceNumber" [subtitle]="monthOf(inv.periodStart) + ' · ' + date(inv.periodStart) + ' – ' + date(inv.periodEnd)">
          <ng-container actions>
            <span [class]="'status-chip status-chip--' + tone()">{{ statusLabel() }}</span>
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="downloading()" (click)="downloadPdf()">{{ downloading() ? 'Preparing…' : 'PDF' }}</button>
            @if (inv.status === 'ISSUED' && +inv.balance > 0) {
              @if (canRecord()) {
                <!-- Money that came another way: the platform admin marks it paid, with the reference. -->
                <button type="button" class="btn btn-primary btn-sm" (click)="marking.set(true)">Mark as paid</button>
              } @else {
                <app-permission-gate [permissions]="['BILLING_PAY']">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="reporting.set(true)">I already paid</button>
                  <button type="button" class="btn btn-primary btn-sm" (click)="paying.set(true)">Pay {{ money(inv.balance) }}</button>
                </app-permission-gate>
              }
            }
          </ng-container>

          <dl class="facts">
            <div><dt>Issued</dt><dd>{{ date(inv.issuedAt) }}</dd></div>
            <div><dt>Due</dt><dd [class.owing]="inv.overdue">{{ date(inv.dueDate) }}</dd></div>
            @if (inv.paidAt) { <div><dt>Paid</dt><dd>{{ date(inv.paidAt) }}</dd></div> }
            <div><dt>Plan</dt><dd>{{ inv.planCode || '—' }}</dd></div>
            <div><dt>Billable rooms</dt><dd>{{ inv.billableRooms ?? '—' }}</dd></div>
            <div><dt>Paybill account</dt><dd class="mono">{{ inv.invoiceNumber }}</dd></div>
          </dl>
          @if (inv.status === 'VOID') {
            <p class="alert alert-warning">Voided {{ date(inv.voidedAt) }}{{ inv.voidReason ? ': ' + inv.voidReason : '' }}. It is kept and numbered, but never counted.</p>
          }

          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th class="num">Tax</th></tr></thead>
              <tbody>
                @for (line of inv.lines ?? []; track line.lineNo) {
                  <tr>
                    <td>{{ line.lineNo }}</td>
                    <td>{{ line.description }}</td>
                    <td class="num">{{ line.quantity }}</td>
                    <td class="num">{{ money(line.unitPrice) }}</td>
                    <td class="num">{{ money(line.amount) }}</td>
                    <td class="num muted">{{ money(line.taxAmount) }}@if (line.taxCode) { <span class="small"> · {{ line.taxCode }}</span> }</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr><th colspan="4">Subtotal</th><td class="num" colspan="2">{{ money(inv.subtotal) }}</td></tr>
                <tr><th colspan="4">Tax</th><td class="num" colspan="2">{{ money(inv.taxTotal) }}</td></tr>
                <tr><th colspan="4">Total</th><td class="num" colspan="2"><strong>{{ money(inv.total) }}</strong></td></tr>
                <tr><th colspan="4">Paid</th><td class="num" colspan="2">{{ money(inv.amountPaid) }}</td></tr>
                <tr class="balance"><th colspan="4">Balance</th><td class="num" colspan="2" [class.owing]="+inv.balance > 0 && inv.status !== 'VOID'"><strong>{{ money(inv.balance) }}</strong></td></tr>
              </tfoot>
            </table>
          </div>
        </app-section-card>

        <app-section-card title="Payments applied">
          @if ((inv.payments ?? []).length === 0) {
            <p class="muted">Nothing paid on this invoice yet. Pay by M-Pesa prompt, or by paybill with account <strong class="mono">{{ inv.invoiceNumber }}</strong>.</p>
          } @else {
            <div class="table-scroll">
              <table appCardTable class="table table--packed">
                <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Payment</th><th class="num">On this invoice</th></tr></thead>
                <tbody>
                  @for (p of inv.payments ?? []; track p.id) {
                    <tr>
                      <td>{{ dateTime(p.paidAt || p.createdAt) }}</td>
                      <td>{{ methodLabels[p.method] || p.method }}</td>
                      <td class="mono">{{ p.providerReference || '—' }}</td>
                      <td class="num">{{ money(p.amount) }}</td>
                      <td class="num"><strong>{{ money(p.appliedAmount) }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>

        @if (inv.status !== 'VOID') {
          <app-permission-gate [permissions]="['BILLING_SUBSCRIPTION_MANAGE']">
            <app-section-card title="Correct this invoice">
              <p class="muted small">Voiding keeps the invoice and its number. Money paid on it goes back to the agency's credit; a reissued invoice is paid from that credit.</p>
              <div class="button-row">
                <button type="button" class="btn btn-secondary btn-sm" (click)="voidInvoice(true)">Void and reissue at the current price</button>
                <button type="button" class="btn btn-danger btn-sm" (click)="voidInvoice(false)">Void</button>
              </div>
            </app-section-card>
          </app-permission-gate>
        }
      }
    </section>

    @if (marking() && invoice(); as inv) {
      <app-record-billing-payment-dialog [agencyId]="agencyId()" [forInvoice]="inv"
                                         (recorded)="marking.set(false); load(); status.refresh()" (closed)="marking.set(false)" />
    }
    @if (reporting() && invoice(); as inv) {
      <app-report-billing-payment-dialog [agencyId]="agencyId()" [invoices]="[inv]"
                                         (reported)="reporting.set(false); reported()" (closed)="reporting.set(false)" />
    }
    @if (paying() && invoice(); as inv) {
      <app-billing-pay-dialog [agencyId]="agencyId()" [invoice]="inv" (paid)="load(); status.refresh()" (closed)="paying.set(false)" />
    }
  `,
  styles: [`
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: var(--space-2) var(--space-4); margin: 0; }
    .facts div { display: grid; gap: var(--space-0-5); }
    .facts dt { font-size: var(--font-label); color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: var(--weight-semibold); }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }
    .small { font-size: var(--font-description); }
    p.small { margin: 0; }
    tfoot th, tfoot td { text-transform: none; letter-spacing: 0; font-size: var(--font-dense); }
    .balance th, .balance td { border-top: 1px solid var(--border-strong); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InvoiceDetailPageComponent {
  readonly RoutePaths = RoutePaths;
  readonly methodLabels = PAYMENT_METHOD_LABELS;

  readonly agencyIdParam = input.required<string>({ alias: 'agencyId' });
  readonly invoiceIdParam = input.required<string>({ alias: 'invoiceId' });
  readonly agencyId = computed(() => Number(this.agencyIdParam()));
  private readonly invoiceId = computed(() => Number(this.invoiceIdParam()));

  private readonly billing = inject(BillingService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);
  readonly downloading = signal(false);

  async downloadPdf(): Promise<void> {
    this.downloading.set(true);
    try {
      saveDownload(await firstValueFrom(this.billing.invoicePdf(this.agencyId(), this.invoiceId())), `invoice-${this.invoiceId()}.pdf`);
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }
  private readonly router = inject(Router);
  readonly status = inject(BillingStatusService);

  readonly invoice = signal<BillingInvoice | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly paying = signal(false);
  readonly marking = signal(false);
  readonly reporting = signal(false);
  readonly canRecord = computed(() => this.context.can('BILLING_PAYMENT_RECORD'));
  private readonly context = inject(ActiveContextService);

  reported(): void {
    this.toasts.push('success', 'Payment reported. We will confirm it and let you know.');
  }

  readonly statusLabel = computed(() => {
    const inv = this.invoice();
    if (!inv) return '';
    if (inv.status === 'VOID') return 'Void';
    if (inv.status === 'PAID') return 'Paid';
    if (inv.overdue) return 'Overdue';
    return Number(inv.amountPaid) > 0 ? 'Part paid' : 'Unpaid';
  });

  readonly tone = computed(() => {
    const inv = this.invoice();
    return !inv ? 'neutral' : inv.status === 'VOID' ? 'neutral' : inv.status === 'PAID' ? 'success' : inv.overdue ? 'danger' : 'warning';
  });

  constructor() {
    effect(() => {
      this.invoiceId();
      untracked(() => void this.load());
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.invoice.set(await firstValueFrom(this.billing.invoice(this.agencyId(), this.invoiceId())));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async voidInvoice(reissue: boolean): Promise<void> {
    const inv = this.invoice();
    if (!inv) {
      return;
    }
    const reason = await this.confirm.askForReason({
      title: reissue ? `Void ${inv.invoiceNumber} and issue a new one?` : `Void ${inv.invoiceNumber}?`,
      message: reissue ? 'A fresh invoice for the same month is issued at the subscription\'s current price.' : 'The month will not be invoiced again unless you reissue it.',
      confirmLabel: reissue ? 'Void and reissue' : 'Void invoice',
      destructive: true,
      reason: { label: 'Why', required: true, maxLength: 255 }
    });
    if (reason === null) {
      return;
    }
    try {
      const result = await firstValueFrom(this.billing.voidInvoice(this.agencyId(), inv.id, reason, reissue));
      this.toasts.push('success', reissue ? 'Voided and reissued.' : 'Invoice voided.');
      this.status.refresh();
      // Reissued: the new invoice is the one to look at.
      if (result.id !== inv.id) {
        await this.router.navigateByUrl(RoutePaths.billingInvoice(this.agencyId(), result.id));
      } else {
        await this.load();
      }
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    }
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }

  dateTime(value: string | null | undefined): string {
    return value ? displayDateTime(value) : '—';
  }

  monthOf(value: string): string {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : shortDate(date, { month: 'long', year: 'numeric' });
  }
}
