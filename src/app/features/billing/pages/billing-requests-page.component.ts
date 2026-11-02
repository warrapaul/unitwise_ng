import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate, displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { kes, PaymentReport, PlanRequest } from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * The platform's inbox for billing: payments agencies say they made (check each against the
 * statement, then confirm or reject) and plan changes they asked for (approve at the plan's price,
 * or decline). Oldest first, so nobody waits longest.
 */
@Component({
  selector: 'app-billing-requests-page',
  standalone: true,
  imports: [RouterLink, SectionCardComponent, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading requests..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else {
        @if (canRecord()) {
          <app-section-card title="Reported payments" [subtitle]="reports().length + ' waiting'">
            @if (reports().length === 0) {
              <p class="muted">Nothing to check.</p>
            } @else {
              <ul class="items">
                @for (r of reports(); track r.id) {
                  <li class="item">
                    <div class="item__main">
                      <div class="item__head">
                        <a class="record-link__primary" [routerLink]="RoutePaths.billingAgency(r.agencyId)">{{ r.agencyName || 'Agency #' + r.agencyId }}</a>
                        <strong>{{ money(r.amount) }}</strong>
                      </div>
                      <span class="muted small">
                        <span class="mono">{{ r.reference }}</span> · {{ r.method }} · paid {{ date(r.paidAt) }} · for {{ r.invoiceNumber || 'the account' }}
                        · reported {{ when(r.createdAt) }}{{ r.reportedByName ? ' by ' + r.reportedByName : '' }}
                      </span>
                      @if (r.alreadyReceived) { <span class="status-chip status-chip--success">✓ This reference already reached the platform — confirming links it</span> }
                      @if (r.message) { <blockquote class="message">{{ r.message }}</blockquote> }
                      @if (r.note) { <span class="small">“{{ r.note }}”</span> }
                    </div>
                    <div class="item__actions">
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="approve(r)">Confirm</button>
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="reject(r)">Reject</button>
                    </div>
                  </li>
                }
              </ul>
            }
          </app-section-card>
        }

        @if (canManage()) {
          <app-section-card title="Plan requests" [subtitle]="planRequests().length + ' waiting'">
            @if (planRequests().length === 0) {
              <p class="muted">No plan changes waiting.</p>
            } @else {
              <ul class="items">
                @for (r of planRequests(); track r.id) {
                  <li class="item">
                    <div class="item__main">
                      <div class="item__head">
                        <a class="record-link__primary" [routerLink]="RoutePaths.billingAgency(r.agencyId)">{{ r.agencyName || 'Agency #' + r.agencyId }}</a>
                        <strong>{{ r.fromPlanName || '—' }} → {{ r.planName }}</strong>
                      </div>
                      <span class="muted small">Asked {{ when(r.createdAt) }}{{ r.requestedByName ? ' by ' + r.requestedByName : '' }}</span>
                      @if (r.note) { <span class="small">“{{ r.note }}”</span> }
                    </div>
                    <div class="item__actions">
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="approvePlan(r)">Approve</button>
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="declinePlan(r)">Decline</button>
                    </div>
                  </li>
                }
              </ul>
            }
          </app-section-card>
        }
      }
    </section>
  `,
  styles: [`
    .items { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .item { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .item__main { display: grid; gap: var(--space-1); min-width: 0; flex: 1 1 20rem; }
    .item__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); }
    .item__actions { display: flex; align-items: flex-start; gap: var(--space-2); }
    .small { font-size: var(--font-description); }
    .message { margin: 0; padding: var(--space-2) var(--space-3); border-left: 3px solid var(--border-strong); background: var(--surface-2);
               font-size: var(--font-description); white-space: pre-line; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingRequestsPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly billing = inject(BillingService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(NotificationService);
  private readonly context = inject(ActiveContextService);

  readonly canRecord = computed(() => this.context.can('BILLING_PAYMENT_RECORD'));
  readonly canManage = computed(() => this.context.can('BILLING_SUBSCRIPTION_MANAGE'));
  readonly reports = signal<PaymentReport[]>([]);
  readonly planRequests = signal<PlanRequest[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [reports, planRequests] = await Promise.all([
        this.canRecord() ? firstValueFrom(this.billing.paymentReports('SUBMITTED')) : Promise.resolve([] as PaymentReport[]),
        this.canManage() ? firstValueFrom(this.billing.planRequests('PENDING')) : Promise.resolve([] as PlanRequest[])
      ]);
      this.reports.set(reports);
      this.planRequests.set(planRequests);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async approve(r: PaymentReport): Promise<void> {
    if (await this.confirm.ask({
      title: `Confirm ${this.money(r.amount)} from ${r.agencyName || 'this agency'}?`,
      message: r.alreadyReceived ? 'It already reached the platform; this links the report to that payment.'
        : `Check ${r.reference} against your statement first. Confirming records it on their account.`,
      confirmLabel: 'Confirm payment'
    })) {
      await this.run(() => this.billing.approveReport(r.id), 'Payment confirmed.');
    }
  }

  async reject(r: PaymentReport): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Reject this report?', message: 'The agency sees the reason.', confirmLabel: 'Reject', destructive: true,
      reason: { label: 'Why', required: true, maxLength: 500, placeholder: 'e.g. No such payment on our statement' }
    });
    if (reason !== null) {
      await this.run(() => this.billing.rejectReport(r.id, reason), 'Report rejected.');
    }
  }

  async approvePlan(r: PlanRequest): Promise<void> {
    if (await this.confirm.ask({ title: `Move ${r.agencyName || 'them'} to ${r.planName}?`,
      message: "At the plan's own price. A custom price is set on their subscription afterwards if needed.", confirmLabel: 'Approve' })) {
      await this.run(() => this.billing.approvePlanRequest(r.id, null), 'Plan changed.');
    }
  }

  async declinePlan(r: PlanRequest): Promise<void> {
    const reason = await this.confirm.askForReason({
      title: 'Decline this request?', confirmLabel: 'Decline', destructive: true,
      reason: { label: 'Why (the agency sees this)', required: true, maxLength: 500 }
    });
    if (reason !== null) {
      await this.run(() => this.billing.declinePlanRequest(r.id, reason), 'Request declined.');
    }
  }

  private async run(work: () => Observable<unknown>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(work());
      this.toasts.push('success', done);
      await this.load();
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '—';
  }

  when(value: string | null | undefined): string {
    return value ? displayDateTime(value) : '—';
  }
}
