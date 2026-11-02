import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { displayDate } from '../../../shared/utils/display-date.util';
import { BillingStatusService } from '../billing-status.service';
import { kes } from '../billing.models';

/**
 * One line across the top of every page when the agency's subscription needs the landlord:
 * a trial about to end, a payment overdue, read-only after suspension or cancellation. Silent
 * when all is well, and for anyone who cannot see the agency's billing.
 */
@Component({
  selector: 'app-billing-banner',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (message(); as m) {
      <div class="banner" [class]="'banner banner--' + m.tone" role="status">
        <span><strong>{{ m.title }}</strong> {{ m.text }}</span>
        <a class="btn btn-sm" [class.btn-primary]="m.tone !== 'info'" [class.btn-secondary]="m.tone === 'info'" [routerLink]="RoutePaths.billing">{{ m.action }}</a>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .banner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4);
              padding: var(--space-2-5) var(--space-4); border-radius: var(--radius-sm); border-left: 4px solid; font-size: var(--font-dense); }
    .banner--info { border-color: var(--primary); background: var(--primary-tint); }
    .banner--warning { border-color: var(--warning); background: var(--warning-tint); }
    .banner--danger { border-color: var(--danger); background: var(--danger-tint); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingBannerComponent {
  readonly RoutePaths = RoutePaths;
  private readonly status = inject(BillingStatusService);

  readonly message = computed(() => {
    const summary = this.status.summary();
    const sub = summary?.subscription;
    if (!sub) {
      return null;
    }
    const owing = Number(summary!.outstandingBalance) > 0 ? ` ${kes(summary!.outstandingBalance)} is outstanding.` : '';
    switch (sub.effectiveStatus) {
      case 'TRIALING': {
        // Only near the end: a banner on every page for a month teaches people to ignore banners.
        const days = this.status.trialDaysLeft();
        return days !== null && days <= 7
          ? { tone: 'info', title: days === 0 ? 'Your free trial ends today.' : `Your free trial ends in ${days} day${days === 1 ? '' : 's'}.`,
              text: 'Choose a plan to keep adding tenants, rooms and leases.', action: 'Choose a plan' }
          : null;
      }
      case 'PAST_DUE':
        return { tone: 'warning', title: 'Payment overdue.',
                 text: `${owing} Pay before the grace period ends to avoid read-only mode.`, action: 'Pay now' };
      case 'SUSPENDED':
        return { tone: 'danger', title: 'Your account is read-only.',
                 text: `${owing} You can view everything and tenants can still pay rent, but new tenants, rooms and leases are paused until it is paid.`, action: 'Pay to restore' };
      case 'CANCELED':
        return { tone: 'danger', title: 'Your subscription is canceled.',
                 text: `Your data is kept and readable${sub.canceledAt ? ' (since ' + displayDate(sub.canceledAt) + ')' : ''}. Contact us to reactivate.`, action: 'View billing' };
      default:
        return null;
    }
  });
}
