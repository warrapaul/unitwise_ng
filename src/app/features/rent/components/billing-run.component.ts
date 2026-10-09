import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { HousingService } from '../../housing/housing.service';
import { BuildingPreview } from '../../housing/models/housing.models';
import { ArrearsMonthRecord } from '../models/rent.models';
import { RentService } from '../rent.service';

/** Where one building stands in this month's billing — the next step is the action offered. */
type Step = 'NO_TENANTS' | 'NOT_BILLED' | 'BILLING' | 'READINGS' | 'TO_CONFIRM' | 'CONFIRMED';

interface BuildingRun {
  building: BuildingPreview;
  record: ArrearsMonthRecord | null;
  step: Step;
  error: string | null;
}

const ARREARS_PAGE = '/admin/rent/arrears';

/**
 * The month's billing, building by building: create the bills, enter the
 * meter readings, confirm. It is the landlord's one recurring job, so it leads
 * the dashboard instead of hiding at the foot of a rooms table.
 *
 * Each row offers only the next step. Creating bills runs here; readings and
 * confirming open the building's month, where the figures being confirmed are
 * on screen.
 */
@Component({
  selector: 'app-billing-run',
  standalone: true,
  imports: [SectionCardComponent, RouterLink, PermissionGateComponent],
  template: `
    <app-section-card title="Billing" [subtitle]="subtitle()">
      @if (loading() && runs().length === 0) {
        <p class="muted">Checking this month's bills…</p>
      } @else if (error()) {
        <p class="error-text">{{ error() }}</p>
      } @else if (runs().length === 0) {
        <div class="empty">
          <p class="muted">No buildings yet — bills are created per building.</p>
          <app-permission-gate [permissions]="['BUILDING_CREATE']">
            <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.buildingCreate">Create a building</a>
          </app-permission-gate>
        </div>
      } @else {
        <ul class="runs">
          @for (run of runs(); track run.building.id) {
            <li class="run" [class.run--done]="run.step === 'CONFIRMED' || run.step === 'NO_TENANTS'">
              <div class="run__name">
                <strong>{{ run.building.name }}</strong>
                <span class="muted">{{ detail(run) }}</span>
              </div>

              <ol class="steps" aria-label="Billing steps">
                <li [class.steps__done]="reached(run, 1)"><span class="steps__n">1</span> Bills</li>
                <li [class.steps__done]="reached(run, 2)"><span class="steps__n">2</span> Readings</li>
                <li [class.steps__done]="reached(run, 3)"><span class="steps__n">3</span> Confirmed</li>
              </ol>

              <div class="run__action">
                @switch (run.step) {
                  @case ('NOT_BILLED') {
                    @if (canWrite()) {
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() === run.building.id" (click)="createBills(run)">
                        {{ busy() === run.building.id ? 'Creating…' : 'Create bills' }}
                      </button>
                    }
                  }
                  @case ('BILLING') {
                    @if (canWrite()) {
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() === run.building.id" (click)="createBills(run)">
                        {{ busy() === run.building.id ? 'Creating…' : 'Create remaining' }}
                      </button>
                    }
                  }
                  @case ('READINGS') {
                    <button type="button" class="btn btn-primary btn-sm" (click)="open(run)">Enter readings</button>
                  }
                  @case ('TO_CONFIRM') {
                    <button type="button" class="btn btn-primary btn-sm" (click)="open(run)">Review &amp; confirm</button>
                  }
                  @case ('CONFIRMED') {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="open(run)">View month</button>
                  }
                }
              </div>
            </li>
          }
        </ul>
      }
    </app-section-card>
  `,
  styles: [`
    .empty { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; }
    .empty p { margin: 0; }
    :host { display: contents; }
    p { margin: 0; }
    .runs { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .run {
      display: grid;
      grid-template-columns: minmax(10rem, 1.2fr) auto minmax(8rem, auto);
      align-items: center;
      gap: 0.5rem 1rem;
      padding: 0.65rem 0.85rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }
    .run--done { opacity: 0.8; }
    .run__name { display: grid; gap: 0.1rem; min-width: 0; }
    .run__name .muted { font-size: 0.82rem; }
    .run__action { justify-self: end; }

    .steps { display: flex; flex-wrap: wrap; gap: 0.3rem 0.9rem; margin: 0; padding: 0; list-style: none; font-size: 0.82rem; color: var(--text-muted); }
    .steps li { display: flex; align-items: center; gap: 0.35rem; }
    .steps__n {
      display: inline-grid; place-items: center; width: 1.2rem; height: 1.2rem; border-radius: 999px;
      border: 1px solid var(--border); background: var(--surface-2); font-size: 0.68rem; font-weight: 700;
    }
    .steps__done { color: var(--text); }
    .steps__done .steps__n { background: var(--primary); border-color: var(--primary); color: var(--surface); }

    @media (max-width: 700px) {
      .run { grid-template-columns: minmax(0, 1fr) auto; }
      .run .steps { grid-column: 1 / -1; grid-row: 2; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingRunComponent {
  readonly RoutePaths = RoutePaths;
  readonly agencyId = input.required<number>();

  private readonly housing = inject(HousingService);
  private readonly rent = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);

  readonly month = currentMonth();
  private readonly monthLabel = new Date(`${this.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  readonly runs = signal<BuildingRun[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);

  readonly canWrite = computed(() => this.context.can('RENT_ARREAR_WRITE'));

  readonly subtitle = computed(() => {
    const runs = this.runs().filter((run) => run.step !== 'NO_TENANTS');
    if (runs.length === 0) {
      return this.monthLabel;
    }
    const done = runs.filter((run) => run.step === 'CONFIRMED').length;
    return `${this.monthLabel} · ${done} of ${runs.length} building${runs.length === 1 ? '' : 's'} confirmed`;
  });

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      untracked(() => void this.load(agencyId));
    });
  }

  /** Steps 1–3 lit up to where the building has got. */
  reached(run: BuildingRun, step: 1 | 2 | 3): boolean {
    const order: Step[] = ['NOT_BILLED', 'BILLING', 'READINGS', 'TO_CONFIRM', 'CONFIRMED'];
    const at = order.indexOf(run.step);
    switch (step) {
      case 1: return at >= order.indexOf('READINGS');
      case 2: return at >= order.indexOf('TO_CONFIRM');
      default: return run.step === 'CONFIRMED';
    }
  }

  detail(run: BuildingRun): string {
    if (run.error) {
      return run.error;
    }
    const record = run.record;
    switch (run.step) {
      case 'NO_TENANTS': return 'No active tenants to bill';
      case 'NOT_BILLED': return 'No bills created yet';
      case 'BILLING': return `${record?.recordsGenerated ?? 0} of ${record?.totalActiveTenants ?? 0} bills created`;
      case 'READINGS': return `${record?.pendingInputCount} meter reading${record?.pendingInputCount === 1 ? '' : 's'} needed`;
      case 'TO_CONFIRM': return 'Bills complete — confirm to finalise the month';
      default: return record?.confirmedByName ? `Confirmed by ${record.confirmedByName}` : 'Confirmed';
    }
  }

  async createBills(run: BuildingRun): Promise<void> {
    this.busy.set(run.building.id);
    try {
      const acknowledgement = await firstValueFrom(this.rent.generateArrears(this.agencyId(), run.building.id, {
        month: this.month,
        reason: 'Created from the dashboard'
      }));
      this.toasts.push('success', acknowledgement.message || `Creating bills for ${run.building.name}.`);
      await this.refresh(run.building);
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(null);
    }
  }

  /** The building's month on Rent payment per room — the switcher follows, so the page opens on it. */
  async open(run: BuildingRun): Promise<void> {
    this.context.syncFromRoute(this.agencyId(), run.building.id, run.building.name);
    await this.router.navigateByUrl(ARREARS_PAGE);
  }

  private async load(agencyId: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const buildings = (await firstValueFrom(this.housing.getBuildingsForAgency(agencyId))).items;
      const runs = await Promise.all(buildings.map((building) => this.runFor(agencyId, building)));
      this.runs.set(runs.sort((a, b) => urgency(a.step) - urgency(b.step) || a.building.name.localeCompare(b.building.name)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async refresh(building: BuildingPreview): Promise<void> {
    const run = await this.runFor(this.agencyId(), building);
    this.runs.update((runs) => runs.map((entry) => entry.building.id === building.id ? run : entry));
  }

  private async runFor(agencyId: number, building: BuildingPreview): Promise<BuildingRun> {
    try {
      const record = await firstValueFrom(this.rent.getArrearsStatus(agencyId, building.id, this.month));
      return { building, record, step: stepOf(record), error: null };
    } catch (error) {
      // No record for the month answers 404: nothing has been billed yet.
      if (toApiError(error).status === 404) {
        return { building, record: null, step: 'NOT_BILLED', error: null };
      }
      return { building, record: null, step: 'NOT_BILLED', error: extractErrorMessage(error) };
    }
  }
}

function stepOf(record: ArrearsMonthRecord): Step {
  if (record.isConfirmed) {
    return 'CONFIRMED';
  }
  const tenants = record.totalActiveTenants ?? 0;
  const generated = record.recordsGenerated ?? 0;
  if (tenants === 0) {
    return 'NO_TENANTS';
  }
  if (generated === 0) {
    return 'NOT_BILLED';
  }
  if (generated < tenants) {
    return 'BILLING';
  }
  return (record.pendingInputCount ?? 0) > 0 ? 'READINGS' : 'TO_CONFIRM';
}

/** Work first: what needs doing sorts above what is done. */
function urgency(step: Step): number {
  return ['NOT_BILLED', 'BILLING', 'READINGS', 'TO_CONFIRM', 'CONFIRMED', 'NO_TENANTS'].indexOf(step);
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
