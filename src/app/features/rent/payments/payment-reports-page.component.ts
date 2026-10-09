import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { PaymentReport, PaymentReportStatus } from '../models/rent.models';
import { RentService } from '../rent.service';

const STATUS_LABELS: Record<PaymentReportStatus, string> = {
  SUBMITTED: 'Waiting for you',
  APPROVED: 'Confirmed',
  REJECTED: 'Not accepted',
  WITHDRAWN: 'Withdrawn'
};

/**
 * Payments tenants say they made, waiting for the landlord.
 *
 * Each row carries everything needed to check it against the statement — the
 * amount, the reference, the receipt or the pasted SMS — so it is decided where
 * it is read. Confirming records it as a payment (to a corrected month or
 * amount if the money differs from the claim); refusing needs a reason, which
 * the tenant sees.
 */
@Component({
  selector: 'app-payment-reports-page',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, SectionCardComponent, ContextGuardComponent, LoadingStateComponent,
    ErrorStateComponent, EmptyStateComponent, PaginationComponent, DialogComponent, ErrorCardComponent,
    FieldErrorComponent, FormFeedbackDirective, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-section-card title="Payments to confirm"
                        subtitle="Payments tenants reported. Nothing counts toward a balance until you confirm it.">
        <ng-container actions>
          <label class="field field--inline">
            <span class="visually-hidden">Show</span>
            <select [value]="status()" (change)="setStatus($event)">
              <option value="SUBMITTED">Waiting for you</option>
              <option value="APPROVED">Confirmed</option>
              <option value="REJECTED">Not accepted</option>
              <option value="">All</option>
            </select>
          </label>
        </ng-container>

        <app-context-guard [requireBuilding]="false" [requireAnyBuilding]="true" requirePermission="RENT_PAYMENT_READ">
          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading reported payments..." />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (reports().length === 0) {
            <app-empty-state [title]="status() === 'SUBMITTED' ? 'Nothing waiting' : 'No reported payments'"
                             [description]="status() === 'SUBMITTED' ? 'When a tenant reports a payment it appears here for you to confirm.' : 'Nothing matches that filter.'" />
          } @else {
            <ul class="reports">
              @for (report of reports(); track report.id) {
                <li class="report">
                  <div class="report__main">
                    <div class="report__who">
                      <a class="record-link__primary" [routerLink]="tenantLink(report)">{{ report.tenantName }}</a>
                      <span class="muted">{{ report.roomName }}@if (report.buildingName) { · {{ report.buildingName }} }</span>
                    </div>
                    <div class="report__money">
                      <strong>KES {{ money(report.amount) }}</strong>
                      <span class="muted">for {{ monthLabel(report.paymentForMonth) }}</span>
                    </div>
                  </div>

                  <dl class="facts">
                    <div><dt>Method</dt><dd>{{ report.paymentMethod | humanLabel }}</dd></div>
                    <div><dt>Reference</dt><dd class="mono">{{ report.referenceNumber || '-' }}</dd></div>
                    <div><dt>Paid on</dt><dd>{{ date(report.paidOn) }}</dd></div>
                    <div><dt>Reported</dt><dd>{{ dateTime(report.submittedAt) }}</dd></div>
                  </dl>

                  @if (report.note) { <p class="report__note">“{{ report.note }}”</p> }

                  @if (report.evidenceUrl || report.evidenceText) {
                    <div class="proof">
                      @if (report.evidenceUrl) {
                        @if (isImage(report)) {
                          <a [href]="report.evidenceUrl" target="_blank" rel="noopener" title="Open the receipt">
                            <img [src]="report.evidenceUrl" alt="Receipt the tenant uploaded">
                          </a>
                        } @else {
                          <a class="btn btn-secondary btn-sm" [href]="report.evidenceUrl" target="_blank" rel="noopener">Open receipt</a>
                        }
                      }
                      @if (report.evidenceText) {
                        <p class="mono sms">{{ report.evidenceText }}</p>
                      }
                    </div>
                  }

                  <div class="report__foot">
                    @if (report.status === 'SUBMITTED') {
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busyId() === report.id" (click)="startApprove(report)">Confirm</button>
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === report.id" (click)="reject(report)">Not received</button>
                    } @else {
                      <span class="status-chip" [class.status-chip--success]="report.status === 'APPROVED'"
                            [class.status-chip--danger]="report.status === 'REJECTED'"
                            [class.status-chip--neutral]="report.status === 'WITHDRAWN'">{{ statusLabel(report.status) }}</span>
                      @if (report.reviewedByName) { <span class="muted">by {{ report.reviewedByName }} · {{ dateTime(report.reviewedAt) }}</span> }
                      @if (report.rejectionReason) { <span class="muted">— {{ report.rejectionReason }}</span> }
                    }
                  </div>
                </li>
              }
            </ul>

            @if (pagination(); as page) {
              <app-pagination [pagination]="page" [size]="20" [sizes]="[20]" [shown]="reports().length"
                              [total]="page.totalElements" noun="reported payments"
                              (previous)="go(page.page - 1)" (next)="go(page.page + 1)" />
            }
          }
        </app-context-guard>
      </app-section-card>
    </section>

    @if (approving(); as report) {
      <app-dialog title="Confirm payment" [subtitle]="report.tenantName + ' · KES ' + money(report.amount)" (closed)="approving.set(null)">
        <form id="approve-report" class="stack" [formGroup]="approveForm" appFormFeedback (ngSubmit)="approve(report)">
          <p class="muted">Recorded as a payment once you confirm. Change the amount or month only if what arrived differs from the report.</p>
          <div class="field-pair">
            <label class="field">
              <span>Amount received</span>
              <span class="input-prefix"><span class="input-prefix__unit">KES</span>
                <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="amount"></span>
              <app-field-error [control]="approveForm.controls.amount" label="Amount" />
            </label>
            <label class="field">
              <span>For the month of</span>
              <input type="month" formControlName="month">
            </label>
          </div>
          <label class="field">
            <span>Note <span class="muted">(optional)</span></span>
            <input formControlName="note">
          </label>
          @if (approveError(); as apiError) {
            <app-error-card title="Not confirmed" [message]="apiError.message" [details]="apiError.details" />
          }
        </form>
        <div dialog-actions>
          <button type="submit" form="approve-report" class="btn btn-primary" [disabled]="busyId() === report.id">
            {{ busyId() === report.id ? 'Confirming...' : 'Confirm payment' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="approving.set(null)">Cancel</button>
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    .field--inline select { min-width: 10rem; }
    .reports { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
    .report { display: grid; gap: 0.6rem; padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
    .report__main { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1rem; }
    .report__who, .report__money { display: grid; gap: 0.1rem; }
    .report__money { text-align: right; }
    .report__money strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr)); gap: 0.4rem 1rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; min-width: 0; }
    .facts dt { font-size: 0.74rem; color: var(--text-muted); }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .report__note { font-style: italic; }
    .proof { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.75rem; }
    .proof img { max-width: 12rem; max-height: 10rem; object-fit: contain; border-radius: 10px; border: 1px solid var(--border); }
    .sms { flex: 1 1 16rem; margin: 0; padding: 0.5rem 0.65rem; border-radius: 10px; background: var(--surface-2);
           white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.82rem; }
    .report__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; justify-content: flex-end; }
    p { margin: 0; }
    @media (max-width: 30rem) { .report__money { text-align: left; } .report__foot { justify-content: stretch; } .report__foot .btn { flex: 1; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentReportsPageComponent {
  private readonly rent = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly status = signal<PaymentReportStatus | ''>('SUBMITTED');
  readonly reports = signal<PaymentReport[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);
  private readonly page = signal(0);

  readonly approving = signal<PaymentReport | null>(null);
  readonly approveError = signal<ApiError | null>(null);
  readonly approveForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    month: ['', [Validators.required]],
    note: ''
  });

  readonly agencyId = computed(() => this.context.agencyId());

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      untracked(() => {
        this.page.set(0);
        void this.reload();
      });
    });
  }

  setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as PaymentReportStatus | '');
    this.page.set(0);
    void this.reload();
  }

  go(page: number): void {
    this.page.set(Math.max(0, page));
    void this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.rent.getPaymentReports(agencyId, {
        // The building in context narrows it; with none, every building the operator may read.
        buildingId: this.context.buildingId() ?? undefined,
        status: this.status(),
        page: this.page(),
        size: 20
      }));
      this.reports.set(result.items);
      this.pagination.set(result.pagination ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  startApprove(report: PaymentReport): void {
    this.approveError.set(null);
    this.approveForm.reset({ amount: Number(report.amount), month: report.paymentForMonth.slice(0, 7), note: '' });
    this.approving.set(report);
  }

  async approve(report: PaymentReport): Promise<void> {
    if (this.approveForm.invalid) {
      this.approveForm.markAllAsTouched();
      return;
    }
    const value = this.approveForm.getRawValue();
    const amount = Number(value.amount);
    this.busyId.set(report.id);
    this.approveError.set(null);
    try {
      const updated = await firstValueFrom(this.rent.approvePaymentReport(report, {
        // Only what was changed: the rest stays as the tenant reported it.
        amount: amount !== Number(report.amount) ? amount : null,
        paymentForMonth: value.month !== report.paymentForMonth.slice(0, 7) ? value.month : null,
        note: value.note.trim() || null
      }));
      this.approving.set(null);
      this.replace(updated);
      this.notifications.push('success', `KES ${this.money(updated.amount)} recorded for ${report.tenantName}.`);
    } catch (error) {
      this.approveError.set(toApiError(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async reject(report: PaymentReport): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: `Not received — KES ${this.money(report.amount)} from ${report.tenantName}?`,
      message: 'The tenant sees your reason and can report it again with better proof.',
      confirmLabel: 'Send',
      destructive: true,
      reason: { label: 'Why', required: true, placeholder: 'e.g. No payment with that code reached our account', maxLength: 1000 }
    });
    if (reason === null) {
      return;
    }
    this.busyId.set(report.id);
    try {
      this.replace(await firstValueFrom(this.rent.rejectPaymentReport(report, reason)));
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  /** A decided report leaves the "waiting" queue; elsewhere it updates in place. */
  private replace(updated: PaymentReport): void {
    this.reports.update((reports) => this.status() === 'SUBMITTED'
      ? reports.filter((item) => item.id !== updated.id)
      : reports.map((item) => item.id === updated.id ? updated : item));
  }

  tenantLink(report: PaymentReport): string {
    return RoutePaths.tenantDetail(report.agencyId, report.buildingId, report.tenantId);
  }

  isImage(report: PaymentReport): boolean {
    return !!report.evidenceMimeType?.startsWith('image/') && report.evidenceMimeType !== 'image/heic';
  }

  statusLabel(status: PaymentReportStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  money(value: number | string | null | undefined): string {
    const parsed = Number(value ?? 0);
    return (Number.isFinite(parsed) ? parsed : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }

  dateTime(value: string | null | undefined): string {
    return value ? displayDateTime(value) : '-';
  }

  monthLabel(value: string): string {
    const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}
