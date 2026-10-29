import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { BuildingStatsRow } from '../../stats/models/stats.models';
import { formatMoney, formatPercent, monthKey } from '../../../shared/utils/format.util';
import { ArrearsMonthRecord } from '../models/rent.models';
import { RentService } from '../rent.service';
import { BillingStep, BillingStepComponent, stepOf } from './billing-step.component';

type StepState = 'done' | 'current' | 'todo';

interface CycleStep {
  title: string;
  detail: string;
  state: StepState;
  route: string;
}

/**
 * One building's month as the five steps it always goes through: bills created, readings and
 * adjustments, review and confirm, payments, balances. The landlord sees where the month stands
 * and what comes next, and every step links to the page where it is done. The next action itself
 * is the billing step cell, so creating and confirming work the same way everywhere.
 *
 * Money figures come from the stats row (the same calculation as the dashboard); without one, the
 * money steps say only where to look.
 */
@Component({
  selector: 'app-billing-cycle',
  standalone: true,
  imports: [RouterLink, BillingStepComponent],
  template: `
    <div class="cycle">
      <ol class="cycle__steps">
        @for (step of steps(); track step.title; let i = $index) {
          <li class="cycle__step" [class]="'cycle__step cycle__step--' + step.state">
            <a [routerLink]="step.route" (click)="focusBuilding()">
              <span class="cycle__num" aria-hidden="true">{{ step.state === 'done' ? '✓' : i + 1 }}</span>
              <span class="cycle__text">
                <span class="cycle__title">{{ step.title }}</span>
                <span class="cycle__detail">{{ step.detail }}</span>
              </span>
            </a>
          </li>
        }
      </ol>
      <!-- Once confirmed there is no billing step left: what remains is money still owed, or nothing. -->
      @if (step() === 'CONFIRMED') {
        @if (owing() > 0) {
          <a class="cycle__next cycle__next--link" [routerLink]="RoutePaths.rentPortfolioOverdue" (click)="focusBuilding()">
            Next: collect {{ money(owing()) }} still owing in {{ row()?.roomsWithBalance ?? 0 }} room{{ row()?.roomsWithBalance === 1 ? '' : 's' }} ›
          </a>
        } @else if (row()) {
          <p class="cycle__next muted">Billed, confirmed and paid up. Nothing left for this month.</p>
        }
      } @else {
        <div class="cycle__next">
          <span class="muted">Next:</span>
          <app-billing-step [agencyId]="agencyId()" [buildingId]="buildingId()" [buildingName]="buildingName()"
                            [billingDay]="row()?.billingDay ?? null" [month]="month()" [carried]="row()?.deferredMeterReadings ?? 0" />
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .cycle { display: grid; gap: var(--space-3); }
    .cycle__steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
    @media (max-width: 900px) { .cycle__steps { grid-template-columns: minmax(0, 1fr); } }
    .cycle__step a { display: flex; gap: var(--space-2); height: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
                     border-radius: var(--radius-sm); background: var(--surface); color: inherit; text-decoration: none; }
    .cycle__step a:hover, .cycle__step a:focus-visible { border-color: var(--border-strong); }
    .cycle__step--current a { border-color: var(--primary); background: var(--primary-tint); }
    .cycle__num { display: inline-grid; place-items: center; flex: 0 0 1.5rem; height: 1.5rem; border-radius: 999px;
                  background: var(--surface-2); font-size: var(--text-xs); font-weight: 700; }
    .cycle__step--done .cycle__num { background: var(--success-tint); color: var(--success); }
    .cycle__step--current .cycle__num { background: var(--primary); color: var(--on-accent); }
    .cycle__text { display: grid; gap: 0.1rem; min-width: 0; }
    .cycle__title { font-weight: 600; font-size: var(--text-sm); }
    .cycle__detail { font-size: var(--text-xs); color: var(--text-muted); overflow-wrap: anywhere; }
    .cycle__next { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--text-sm); }
    .cycle__next--link { font-weight: 600; color: var(--primary-strong); text-decoration: none; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingCycleComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly buildingName = input<string | null>(null);
  /** `YYYY-MM`; this month when not given. */
  readonly month = input<string | null>(null);
  /** The building's stats row for the month, for the money steps. */
  readonly row = input<BuildingStatsRow | null>(null);
  readonly currency = input('KES');

  private readonly rent = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly record = signal<ArrearsMonthRecord | null>(null);
  private readonly forMonth = computed(() => this.month() || monthKey());

  readonly step = computed<BillingStep>(() => stepOf(this.record()));
  readonly owing = computed(() => Number(this.row()?.rentOutstanding ?? 0));
  readonly RoutePaths = RoutePaths;

  readonly steps = computed<CycleStep[]>(() => {
    const step = this.step();
    const record = this.record();
    const row = this.row();
    const order: BillingStep[] = ['NOT_BILLED', 'BILLING', 'READINGS', 'TO_CONFIRM', 'CONFIRMED'];
    // Where the month is: 0 = bills, 1 = readings, 2 = confirm, 3 = confirmed (money steps are live).
    const at = step === 'NO_TENANTS' ? -1 : Math.max(0, order.indexOf(step) - 1);
    const state = (index: number): StepState => at < 0 ? 'todo' : index < at ? 'done' : index === at ? 'current' : 'todo';
    const pending = record?.pendingInputCount ?? 0;
    const carried = row?.deferredMeterReadings ?? 0;
    const owing = Number(row?.rentOutstanding ?? 0);
    const withBalance = row?.roomsWithBalance ?? 0;

    return [
      {
        title: 'Generate bills',
        detail: step === 'NO_TENANTS' ? 'No tenants to bill'
          : step === 'NOT_BILLED' ? (row?.billingDay ? `Created on the ${row.billingDay}${suffix(row.billingDay)}` : 'Not billed yet')
          : `${record?.recordsGenerated ?? 0} of ${record?.totalActiveTenants ?? 0} rooms billed`,
        state: state(0),
        route: RoutePaths.rentArrears
      },
      {
        title: 'Readings & adjustments',
        detail: pending > 0 ? `${pending} reading${pending === 1 ? '' : 's'} to enter`
          : carried > 0 ? `${carried} carried to next month`
          : at >= 1 ? 'All entered' : 'After bills are created',
        state: state(1),
        route: pending > 0 ? RoutePaths.rentMeterReadings : RoutePaths.rentAdjustments
      },
      {
        title: 'Review & confirm',
        detail: step === 'CONFIRMED' ? 'Confirmed' : step === 'TO_CONFIRM' ? 'Ready to confirm' : 'Once readings are in',
        state: state(2),
        route: RoutePaths.rentArrears
      },
      {
        title: 'Payments',
        detail: row ? `${formatMoney(row.rentCollected, this.currency())} of ${formatMoney(row.rentExpected)} · ${formatPercent(row.collectionRate)}`
          : 'Record and confirm',
        // Money arrives whenever tenants pay; the step is live once bills exist.
        state: step === 'CONFIRMED' ? (owing > 0 ? 'current' : 'done') : at >= 1 ? 'current' : 'todo',
        route: RoutePaths.rentPayments
      },
      {
        title: 'Balances',
        detail: row ? (owing > 0 ? `${formatMoney(owing, this.currency())} owing · ${withBalance} room${withBalance === 1 ? '' : 's'}` : 'Nothing owing')
          : 'Who still owes',
        state: step === 'CONFIRMED' && owing <= 0 ? 'done' : 'todo',
        route: RoutePaths.rentPortfolioOverdue
      }
    ];
  });

  constructor() {
    effect(() => {
      const [agencyId, buildingId, month] = [this.agencyId(), this.buildingId(), this.forMonth()];
      untracked(() => void this.load(agencyId, buildingId, month));
    });
  }

  private async load(agencyId: number, buildingId: number, month: string): Promise<void> {
    try {
      this.record.set(await firstValueFrom(this.rent.getArrearsStatus(agencyId, buildingId, month)));
    } catch {
      // No record for the month answers 404: nothing has been billed yet.
      this.record.set(null);
    }
  }

  money(value: number): string {
    return formatMoney(value, this.currency());
  }

  /** The rent pages follow the context, so a step opens on this building. */
  focusBuilding(): void {
    this.context.syncFromRoute(this.agencyId(), this.buildingId(), this.buildingName());
  }
}

function suffix(day: number): string {
  return day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
}
