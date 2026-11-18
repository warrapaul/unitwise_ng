import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { BillingOverview, SUBSCRIPTION_STATUS_LABELS, SubscriptionStatus, kes } from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * The platform's subscription business for the super admin: what it earns a month, what came in,
 * who owes and whose trial is ending, and what waits for a decision — each a way into the agency
 * or the queue it belongs to.
 */
@Component({
  selector: 'app-billing-overview-page',
  standalone: true,
  imports: [RouterLink, SectionCardComponent, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="stack">
      <header class="page-head">
        <div class="page-head__title">
          <h1>Billing overview</h1>
          <p>Every agency on the platform</p>
        </div>
      </header>

      @if (loading() && !data()) {
        <app-loading-state label="Loading the overview…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (data(); as d) {
        <div class="kpi-grid">
          <div class="kpi"><span class="kpi__label">Monthly recurring revenue</span><span class="kpi__value">{{ money(d.mrr) }}</span>
            <span class="kpi__note">Paying agencies at this month's rooms</span></div>
          <div class="kpi"><span class="kpi__label">Received this month</span><span class="kpi__value">{{ money(d.receivedThisMonth) }}</span></div>
          <div class="kpi" [class.kpi--bad]="+d.outstanding > 0"><span class="kpi__label">Unpaid on invoices</span><span class="kpi__value">{{ money(d.outstanding) }}</span></div>
          <a class="kpi" [class.kpi--warn]="waiting() > 0" [routerLink]="RoutePaths.billingRequests">
            <span class="kpi__label">Waiting for you ›</span><span class="kpi__value">{{ waiting() }}</span>
            <span class="kpi__note">{{ d.paymentReportsWaiting }} payments · {{ d.planRequestsWaiting }} plan requests</span></a>
        </div>

        <app-section-card title="Agencies by status">
          <ul class="statuses">
            @for (status of statuses; track status) {
              <li><span [class]="'status-chip status-chip--' + tone(status)">{{ label(status) }}</span><strong>{{ d.agenciesByStatus[status] ?? 0 }}</strong></li>
            }
          </ul>
          @if (d.unmatchedPayments > 0) {
            <p class="note"><a [routerLink]="RoutePaths.billingUnmatched">{{ d.unmatchedPayments }} payment{{ d.unmatchedPayments === 1 ? '' : 's' }} named no agency we know — place {{ d.unmatchedPayments === 1 ? 'it' : 'them' }} ›</a></p>
          }
        </app-section-card>

        <div class="cols">
          <app-section-card title="Overdue" [subtitle]="d.overdue.length ? 'Oldest first' : ''">
            @if (d.overdue.length === 0) {
              <p class="muted">Nobody is overdue.</p>
            } @else {
              <ul class="rows">
                @for (a of d.overdue; track a.agencyId) {
                  <li><a class="row" [routerLink]="RoutePaths.billingAgency(a.agencyId)">
                    <span class="row__main"><strong>{{ a.agencyName }}</strong><span class="muted">{{ a.planName }} · overdue since {{ date(a.overdueSince) }}</span></span>
                    <span class="row__side"><strong class="owing">{{ money(a.outstanding) }}</strong><span [class]="'status-chip status-chip--' + tone(a.effectiveStatus)">{{ label(a.effectiveStatus) }}</span></span>
                    <span class="row__chevron" aria-hidden="true">›</span>
                  </a></li>
                }
              </ul>
            }
          </app-section-card>

          <app-section-card title="Trials" subtitle="Ending in the next 14 days, or ended without a plan">
            @if (d.trials.length === 0) {
              <p class="muted">No trials ending soon.</p>
            } @else {
              <ul class="rows">
                @for (a of d.trials; track a.agencyId) {
                  <li><a class="row" [routerLink]="RoutePaths.billingAgency(a.agencyId)">
                    <span class="row__main"><strong>{{ a.agencyName }}</strong>
                      <span class="muted">{{ a.effectiveStatus === 'SUSPENDED' ? 'Ended' : 'Ends' }} {{ date(a.trialEndsAt) }}</span></span>
                    <span class="row__side"><span [class]="'status-chip status-chip--' + (a.effectiveStatus === 'SUSPENDED' ? 'danger' : 'info')">{{ a.effectiveStatus === 'SUSPENDED' ? 'Trial ended' : 'Free trial' }}</span></span>
                    <span class="row__chevron" aria-hidden="true">›</span>
                  </a></li>
                }
              </ul>
            }
          </app-section-card>
        </div>
      }
    </section>
  `,
  styles: [`
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr)); gap: var(--space-4); align-items: start; }
    .cols > * { min-width: 0; }
    .statuses { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin: 0; padding: 0; list-style: none; }
    .statuses li { display: flex; align-items: center; gap: var(--space-2); }
    .note { margin: var(--space-3) 0 0; }
    .rows { display: grid; margin: 0; padding: 0; list-style: none; }
    .rows > li + li { border-top: 1px solid var(--border); }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-height: 3.5rem; padding: var(--space-2-5) var(--space-1); color: inherit; text-decoration: none; }
    .row:hover, .row:focus-visible { background: var(--primary-tint); }
    .row__main { display: grid; gap: var(--space-0-5); flex: 1 1 12rem; min-width: 0; }
    .row__side { display: flex; align-items: center; gap: var(--space-2); }
    .row__chevron { color: var(--text-muted); font-size: var(--text-lg); }
    .owing { color: var(--danger); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingOverviewPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly statuses: SubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'SUSPENDED', 'CANCELED'];
  private readonly billing = inject(BillingService);

  readonly data = signal<BillingOverview | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly waiting = computed(() => (this.data()?.paymentReportsWaiting ?? 0) + (this.data()?.planRequestsWaiting ?? 0));

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await firstValueFrom(this.billing.overview()));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  label(status: SubscriptionStatus): string {
    return SUBSCRIPTION_STATUS_LABELS[status];
  }

  tone(status: SubscriptionStatus): string {
    return { ACTIVE: 'success', TRIALING: 'info', PAST_DUE: 'warning', SUSPENDED: 'danger', CANCELED: 'neutral' }[status];
  }

  money(value: number | string | null | undefined): string {
    return kes(value);
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
