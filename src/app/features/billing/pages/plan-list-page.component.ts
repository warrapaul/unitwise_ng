import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { MoreMenuComponent } from '../../../shared/components/more-menu/more-menu.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { BillingCatalog, BillingPlan, describePrice, featureLabel, limitLine } from '../billing.models';
import { BillingService } from '../billing.service';

/**
 * The platform's plans, in the order landlords see them: what each charges, how many agencies are
 * on it (what an edit reaches), its caps in one wording, its features, and whether landlords can
 * pick it. Price edits reach new agencies only; features and limits reach everyone on the plan.
 */
@Component({
  selector: 'app-plan-list-page',
  standalone: true,
  imports: [SectionCardComponent, RouterLink, LoadingStateComponent, ErrorStateComponent, MoreMenuComponent],
  template: `
    <section class="stack">
      <app-section-card title="Plans" subtitle="What agencies can be on">
        <ng-container actions>
          <a class="btn btn-primary" [routerLink]="RoutePaths.billingPlanNew">New plan</a>
        </ng-container>

        <div class="alert alert-info" role="note">
          <strong>Price edits apply to new agencies only.</strong> Agencies already on a plan keep the price they joined at.
          Feature and limit edits apply to everyone on the plan at once.
        </div>

        @if (loading()) {
          <app-loading-state label="Loading plans…" />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else {
          <div class="toolbar">
            <label class="field field--inline">
              <span class="visually-hidden">Search plans</span>
              <input type="search" placeholder="Search plans" [value]="query()" (input)="query.set($any($event.target).value)">
            </label>
            <label class="field field--inline">
              <span class="visually-hidden">Show</span>
              <select [value]="show()" (change)="show.set($any($event.target).value)">
                <option value="all">All plans</option>
                <option value="offered">Offered to landlords</option>
                <option value="hidden">Hidden or retired</option>
              </select>
            </label>
          </div>

          <ul class="plans">
            @for (plan of shown(); track plan.id) {
              <li class="plan">
                <a class="plan__link" [routerLink]="RoutePaths.billingPlanEdit(plan.id)">
                  <span class="plan__head">
                    <strong class="plan__name">{{ plan.name }}</strong>
                    <span class="plan__chips">
                      @if (plan.active === false) {
                        <span class="status-chip status-chip--neutral">Retired</span>
                      } @else if (plan.publicPlan) {
                        <span class="status-chip status-chip--success">Offered</span>
                      } @else {
                        <span class="status-chip status-chip--info">Hidden</span>
                      }
                    </span>
                  </span>
                  <span class="plan__price">{{ price(plan) }}</span>
                  <span class="plan__meta">
                    <span>{{ agencies(plan) }}</span>
                    <span>{{ plan.trialDays ? plan.trialDays + '-day trial' : 'No trial' }}</span>
                  </span>
                  <span class="plan__limits">{{ limits(plan) }}</span>
                  @if ((plan.features ?? []).length > 0) {
                    <span class="plan__features">
                      @for (code of plan.features ?? []; track code) { <span class="tag">{{ feature(code) }}</span> }
                    </span>
                  } @else {
                    <span class="muted">No features</span>
                  }
                  <span class="plan__chevron" aria-hidden="true">›</span>
                </a>
                <app-more-menu [label]="'⋯'" class="plan__menu">
                  <button type="button" (click)="edit(plan)">Edit</button>
                  <button type="button" (click)="duplicate(plan)">Duplicate</button>
                </app-more-menu>
              </li>
            } @empty {
              <li class="muted">{{ plans().length === 0 ? 'No plans yet.' : 'No plans match.' }}</li>
            }
          </ul>
          <p class="muted small">Landlords see offered plans in this order. Change a plan's place with “Order in the plan list” on its page.</p>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    .toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .toolbar .field { flex: 1 1 12rem; }
    .plans { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
    .plan { position: relative; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
    .plan__link { display: grid; gap: var(--space-1-5); padding: var(--space-3) 3rem var(--space-3) var(--space-4); color: inherit; text-decoration: none; }
    .plan__link:hover, .plan__link:focus-visible { background: var(--primary-tint); border-radius: inherit; }
    .plan__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding-right: 2rem; }
    .plan__name { font-size: var(--font-subsection); }
    .plan__price { font-weight: var(--weight-semibold); }
    .plan__meta { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); color: var(--text-muted); }
    .plan__limits { color: var(--text-muted); }
    .plan__features { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    .tag { padding: var(--space-0-5) var(--space-2); border-radius: var(--radius-pill); background: var(--surface-2); }
    .plan__chevron { position: absolute; right: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: var(--text-xl); }
    .plan__menu { position: absolute; top: var(--space-2); right: var(--space-2); }
    .small { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlanListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly billing = inject(BillingService);
  private readonly router = inject(Router);

  readonly plans = signal<BillingPlan[]>([]);
  readonly counts = signal<Record<number, number>>({});
  readonly catalog = signal<BillingCatalog | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly query = signal('');
  readonly show = signal<'all' | 'offered' | 'hidden'>('all');

  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.plans().filter((plan) =>
      (!q || plan.name.toLowerCase().includes(q) || plan.code.toLowerCase().includes(q))
      && (this.show() === 'all'
        || (this.show() === 'offered' ? plan.active !== false && !!plan.publicPlan : plan.active === false || !plan.publicPlan)));
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [plans, counts, catalog] = await Promise.all([
        firstValueFrom(this.billing.plans()),
        firstValueFrom(this.billing.planAgencyCounts()).catch(() => ({} as Record<number, number>)),
        firstValueFrom(this.billing.catalog()).catch(() => null)
      ]);
      this.plans.set([...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id));
      this.counts.set(counts);
      this.catalog.set(catalog);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  edit(plan: BillingPlan): void {
    void this.router.navigateByUrl(RoutePaths.billingPlanEdit(plan.id));
  }

  /** A new plan starting from this one's settings: the quickest way to a variant. */
  duplicate(plan: BillingPlan): void {
    void this.router.navigate([RoutePaths.billingPlanNew], { queryParams: { from: plan.id } });
  }

  agencies(plan: BillingPlan): string {
    const count = this.counts()[plan.id] ?? 0;
    return count === 0 ? 'No agencies' : `${count} ${count === 1 ? 'agency' : 'agencies'}`;
  }

  price(plan: BillingPlan): string {
    return describePrice(plan);
  }

  feature(code: string): string {
    return featureLabel(code);
  }

  /** Every cap the platform knows, the same way on every plan: "Up to 20 rooms · Unlimited admins". */
  limits(plan: BillingPlan): string {
    const keys = this.catalog()?.limits ?? Object.keys(plan.limits ?? {});
    return keys.map((key) => limitLine(key, plan.limits?.[key] ?? null)).join(' · ') || 'Unlimited';
  }
}
