import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { toApiError } from '../../../shared/utils/error-message.util';
import { ArrearsMonthRecord } from '../models/rent.models';
import { RentService } from '../rent.service';

export type BillingStep = 'NO_TENANTS' | 'NOT_BILLED' | 'BILLING' | 'READINGS' | 'TO_CONFIRM' | 'CONFIRMED';

const ARREARS_PAGE = '/admin/rent/arrears';

/**
 * One building's billing this month, as a table cell: where it stands and the one
 * next step. Bills are created automatically on the building's billing day, so the
 * usual steps are entering meter readings and confirming; "Create now" only runs
 * the automatic step early.
 */
@Component({
  selector: 'app-billing-step',
  standalone: true,
  template: `
    @switch (step()) {
      @case ('NO_TENANTS') { <span class="muted">No tenants</span> }
      @case ('NOT_BILLED') {
        <span class="cell">
          <span class="muted">{{ billingDay() ? 'Bills on the ' + ordinal(billingDay()!) : 'Not billed yet' }}</span>
          @if (canWrite()) {
            <button type="button" class="link" [disabled]="busy()" (click)="$event.stopPropagation(); createBills()">
              {{ busy() ? 'Creating...' : 'Create now' }}
            </button>
          }
        </span>
      }
      @case ('BILLING') {
        <span class="cell">
          <span class="status-chip status-chip--neutral">{{ record()?.recordsGenerated ?? 0 }}/{{ record()?.totalActiveTenants ?? 0 }} billed</span>
          @if (canWrite()) {
            <button type="button" class="link" [disabled]="busy()" (click)="$event.stopPropagation(); createBills()">Finish</button>
          }
        </span>
      }
      @case ('READINGS') {
        <span class="cell">
          <span class="status-chip status-chip--warning">{{ record()?.pendingInputCount }} reading{{ record()?.pendingInputCount === 1 ? '' : 's' }} due</span>
          <button type="button" class="link" (click)="$event.stopPropagation(); open()">Enter readings</button>
        </span>
      }
      @case ('TO_CONFIRM') {
        <span class="cell">
          <span class="status-chip status-chip--info">Ready</span>
          <button type="button" class="link" (click)="$event.stopPropagation(); open()">Review and confirm</button>
        </span>
      }
      @default { <span class="status-chip status-chip--success">Confirmed</span> }
    }
  `,
  styles: [`
    .cell { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.2rem 0.5rem; }
    .link { padding: 0; border: 0; background: none; font: inherit; font-size: 0.84rem; font-weight: 600; color: var(--primary-strong);
            cursor: pointer; text-decoration: underline; white-space: nowrap; }
    .link:disabled { opacity: 0.6; cursor: default; }
    .status-chip { white-space: nowrap; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillingStepComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly buildingName = input<string | null>(null);
  readonly billingDay = input<number | null>(null);
  /** `YYYY-MM`; the current month when not given. */
  readonly month = input<string | null>(null);
  /** Where this building stands, so the page can sum them up. */
  readonly stepChange = output<BillingStep>();

  private readonly rent = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);

  private readonly forMonth = computed(() => this.month() || currentMonth());
  readonly record = signal<ArrearsMonthRecord | null>(null);
  readonly busy = signal(false);
  readonly canWrite = computed(() => this.context.can('RENT_ARREAR_WRITE'));
  readonly step = computed<BillingStep>(() => stepOf(this.record()));

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.agencyId(), this.buildingId()];
      this.forMonth();
      untracked(() => void this.load(agencyId, buildingId));
    });
    effect(() => this.stepChange.emit(this.step()));
  }

  private async load(agencyId: number, buildingId: number): Promise<void> {
    try {
      this.record.set(await firstValueFrom(this.rent.getArrearsStatus(agencyId, buildingId, this.forMonth())));
    } catch {
      // No record for the month answers 404: nothing has been billed yet.
      this.record.set(null);
    }
  }

  async createBills(): Promise<void> {
    this.busy.set(true);
    try {
      const ack = await firstValueFrom(this.rent.generateArrears(this.agencyId(), this.buildingId(), {
        month: this.forMonth(),
        reason: 'Created early from the dashboard'
      }));
      this.toasts.push('success', ack.message || `Creating bills for ${this.buildingName() ?? 'the building'}.`);
      await this.load(this.agencyId(), this.buildingId());
    } catch (error) {
      this.toasts.push('error', toApiError(error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /** The building's month on the rent page — the switcher follows, so it opens on this building. */
  async open(): Promise<void> {
    this.context.syncFromRoute(this.agencyId(), this.buildingId(), this.buildingName());
    await this.router.navigateByUrl(ARREARS_PAGE);
  }

  ordinal(day: number): string {
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    return `${day}${suffix}`;
  }
}

function stepOf(record: ArrearsMonthRecord | null): BillingStep {
  if (!record) {
    return 'NOT_BILLED';
  }
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

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
