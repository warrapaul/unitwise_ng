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
      <!--
        The next step, said and offered: one sentence on where the month stands and the button that
        moves it on. A muted "Next:" with a link beside it was easy to miss on a page of figures.
      -->
      @if (nextLine(); as line) {
        <div class="next" [class.next--done]="line.done">
          <p class="next__text"><strong>{{ line.title }}</strong> {{ line.detail }}</p>
          <div class="next__actions">
            @if (step() === 'CONFIRMED') {
              @if (owing() > 0) {
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentPortfolioOverdue" (click)="focusBuilding()">See who owes</a>
                <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.rentPaymentCreate" (click)="focusBuilding()">Record payment</a>
              }
            } @else if (step() !== 'NO_TENANTS') {
              @if (step() === 'READINGS' || step() === 'TO_CONFIRM') {
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.rentAdjustments" (click)="focusBuilding()">Rent adjustments</a>
              }
              <app-billing-step [agencyId]="agencyId()" [buildingId]="buildingId()" [buildingName]="buildingName()"
                                [billingDay]="row()?.billingDay ?? null" [month]="month()" [carried]="row()?.deferredMeterReadings ?? 0"
                                [primary]="true" [actionOnly]="true" />
            }
          </div>
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
                  background: var(--surface-2); font-size: var(--text-xs); font-weight: var(--weight-bold); }
    .cycle__step--done .cycle__num { background: var(--success-tint); color: var(--success); }
    .cycle__step--current .cycle__num { background: var(--primary); color: var(--on-accent); }
    .cycle__text { display: grid; gap: var(--space-0-5); min-width: 0; }
    .cycle__title { font-weight: var(--weight-semibold); font-size: var(--text-sm); }
    .cycle__detail { font-size: var(--text-xs); color: var(--text-muted); overflow-wrap: anywhere; }
    .next { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3);
            padding: var(--space-3) var(--space-4); border: 1px solid var(--primary); border-radius: var(--radius-sm); background: var(--primary-tint); }
    .next--done { border-color: var(--success-border); background: var(--success-tint); }
    .next__text { margin: 0; font-size: var(--font-dense); }
    .next__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-left: auto; }
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

  /** Where the month stands and what the button below does, in a sentence. */
  readonly nextLine = computed<{ title: string; detail: string; done?: boolean } | null>(() => {
    const record = this.record();
    const pending = record?.pendingInputCount ?? 0;
    const rooms = this.row()?.roomsWithBalance ?? 0;
    switch (this.step()) {
      case 'NO_TENANTS':
        return { title: 'No tenants to bill.', detail: 'Bills start once a tenant moves in.' };
      case 'NOT_BILLED':
        return { title: 'Bills are not created yet.', detail: this.row()?.billingDay
          ? `They are created automatically on the ${this.row()!.billingDay}${suffix(this.row()!.billingDay!)}, or create them now.`
          : 'Create them to start the month.' };
      case 'BILLING':
        return { title: `${record?.recordsGenerated ?? 0} of ${record?.totalActiveTenants ?? 0} rooms billed.`, detail: 'Finish billing the rest.' };
      case 'READINGS':
        return { title: `${pending} meter reading${pending === 1 ? '' : 's'} to enter.`,
                 detail: 'Enter them (or adjust a charge), then review and confirm.' };
      case 'TO_CONFIRM':
        return { title: 'Bills are ready.', detail: 'Review the amounts and confirm — tenants are then told what to pay.' };
      case 'CONFIRMED':
        return this.owing() > 0
          ? { title: `Confirmed. ${this.money(this.owing())} still owing`, detail: `in ${rooms} room${rooms === 1 ? '' : 's'}.` }
          : this.row() ? { title: 'Billed, confirmed and paid up.', detail: 'Nothing left for this month.', done: true } : null;
    }
  });

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
