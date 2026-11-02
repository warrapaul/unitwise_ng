import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../core/services/active-context.service';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { BillingSummary, SubscriptionStatus } from './billing.models';
import { BillingService } from './billing.service';

/**
 * The active agency's subscription, kept for the whole shell: the banner reads it, and a 402 from
 * any request refreshes it. Only loaded for someone who can see the agency's billing; for everyone
 * else (tenants, shoppers, staff without BILLING_VIEW) it stays empty and nothing shows.
 */
@Injectable({ providedIn: 'root' })
export class BillingStatusService {
  private readonly billing = inject(BillingService);
  private readonly context = inject(ActiveContextService);
  private readonly session = inject(AuthSessionService);

  private readonly summaryState = signal<BillingSummary | null>(null);
  readonly summary = this.summaryState.asReadonly();

  /** What access the agency has right now (the server works it out from the dates). */
  readonly status = computed<SubscriptionStatus | null>(() => this.summaryState()?.subscription.effectiveStatus ?? null);
  /** Read-only: creating and changing things is refused until it is paid or reactivated. */
  readonly readOnly = computed(() => this.status() === 'SUSPENDED' || this.status() === 'CANCELED');

  /** Days left in the trial, rounded up; null outside a trial. */
  readonly trialDaysLeft = computed(() => {
    const sub = this.summaryState()?.subscription;
    if (!sub || sub.effectiveStatus !== 'TRIALING' || !sub.trialEndsAt) {
      return null;
    }
    const ms = new Date(sub.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  });

  constructor() {
    effect(() => {
      const agencyId = this.context.agencyId();
      this.session.userProfile();
      untracked(() => void this.load(agencyId));
    });
  }

  /** Re-reads the subscription — after a 402, or a payment. */
  refresh(): void {
    void this.load(this.context.agencyId());
  }

  private async load(agencyId: number | null): Promise<void> {
    if (agencyId === null || !this.session.hasPermissionInAgency('BILLING_VIEW', agencyId)) {
      this.summaryState.set(null);
      return;
    }
    try {
      this.summaryState.set(await firstValueFrom(this.billing.summary(agencyId)));
    } catch {
      this.summaryState.set(null);
    }
  }
}
