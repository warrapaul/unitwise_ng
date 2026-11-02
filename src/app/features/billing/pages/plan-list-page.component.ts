import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { BillingPlan, describePrice, featureLabel, limitLabel, PRICING_MODE_LABELS } from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * The platform's plans: what each charges (one of the pricing modes, in words), its features and
 * caps, and whether landlords can see it. Editing a plan never reprices agencies already on it —
 * each subscription keeps the price it was given.
 */
@Component({
  selector: 'app-plan-list-page',
  standalone: true,
  imports: [RouterLink, RowLinkDirective, SectionCardComponent, LoadingStateComponent, ErrorStateComponent],
  template: `
    <section class="stack">
      <app-section-card title="Plans" subtitle="Editing a plan never changes what agencies already on it pay: each keeps its own copy of the price.">
        <a actions class="btn btn-primary btn-sm" [routerLink]="RoutePaths.billingPlanNew">New plan</a>
        @if (loading()) {
          <app-loading-state label="Loading plans..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else {
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Plan</th><th>Price</th><th>Features</th><th>Limits</th><th>Trial</th><th>Shown to landlords</th><th>Status</th></tr></thead>
              <tbody>
                @for (plan of plans(); track plan.id) {
                  <tr [appRowLink]="RoutePaths.billingPlanEdit(plan.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.billingPlanEdit(plan.id)">{{ plan.name }}</a>
                        <span class="muted mono">{{ plan.code }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ price(plan) }}</span>
                        <span class="muted">{{ modeLabel(plan) }}</span>
                      </div>
                    </td>
                    <td>{{ features(plan) }}</td>
                    <td>{{ limits(plan) }}</td>
                    <td>{{ plan.trialDays ? plan.trialDays + ' days' : '—' }}</td>
                    <td>{{ plan.publicPlan ? 'Yes' : 'No' }}</td>
                    <td><span [class]="'status-chip status-chip--' + (plan.active === false ? 'neutral' : 'success')">{{ plan.active === false ? 'Inactive' : 'Active' }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="muted">No plans yet.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlanListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly billing = inject(BillingService);

  readonly plans = signal<BillingPlan[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const plans = await firstValueFrom(this.billing.plans());
      this.plans.set([...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  price(plan: BillingPlan): string {
    return describePrice(plan);
  }

  modeLabel(plan: BillingPlan): string {
    return plan.pricingMode ? PRICING_MODE_LABELS[plan.pricingMode] : '';
  }

  features(plan: BillingPlan): string {
    const list = plan.features ?? [];
    return list.length === 0 ? '—' : list.map(featureLabel).join(', ');
  }

  limits(plan: BillingPlan): string {
    const entries = Object.entries(plan.limits ?? {});
    return entries.length === 0 ? 'Unlimited' : entries.map(([key, value]) => `${limitLabel(key)} ${value}`).join(' · ');
  }
}
