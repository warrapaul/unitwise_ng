import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { RoutePaths } from '../../../core/routes/route-paths';
import { NotificationService } from '../../../core/services/notification.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { RentPaymentDetail } from '../models/rent.models';
import { RentService } from '../rent.service';
import { RecordPaymentDialogComponent } from './record-payment-dialog.component';

const PAGE_SIZE = 12;
/** A month in one of these has nothing left to collect. */
const SETTLED = new Set(['COMPLETED', 'OVERPAID', 'REFUNDED']);

/**
 * A tenant's rent, month by month, where the tenant is: what is owed now, what
 * each month came to and how it was paid, and a way to take a payment against
 * the month it is for.
 *
 * One record per month — the monthly run opens it before any money arrives —
 * so an unpaid month is a row with a balance, not a missing row.
 */
@Component({
  selector: 'app-tenant-rent-payments',
  standalone: true,
  imports: [DatePipe, RouterLink, SectionCardComponent, PermissionGateComponent, StatusChipComponent, HumanLabelPipe,
    RowLinkDirective, RecordPaymentDialogComponent],
  template: `
    <app-section-card title="Rent payments" [subtitle]="summary()">
      @if (loading() && records().length === 0) {
        <p class="muted">Loading…</p>
      } @else if (error()) {
        <p class="error-text">{{ error() }}</p>
      } @else if (records().length === 0) {
        <p class="muted">No rent billed to this tenant yet.</p>
      } @else {
        @if (unpaid().length > 0) {
          <div class="owed" role="status">
            <span><strong>{{ owed() }}</strong> outstanding across {{ unpaid().length }} month{{ unpaid().length === 1 ? '' : 's' }}</span>
            @if (overdue() > 0) { <span class="status-chip status-chip--danger">{{ overdue() }} overdue</span> }
          </div>
        }

        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Month</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th>Last payment</th>
                <th><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (record of records(); track record.id) {
                <tr [appRowLink]="RoutePaths.rentPaymentDetail(agencyId(), buildingId(), record.id)">
                  <td>
                    <div class="cell-stack">
                      <a class="record-link__primary" [routerLink]="RoutePaths.rentPaymentDetail(agencyId(), buildingId(), record.id)">
                        {{ record.paymentForMonth ? (record.paymentForMonth | date: 'MMM y') : '-' }}
                      </a>
                      @if (record.dueDate) { <span class="muted">due {{ record.dueDate | date: 'd MMM' }}</span> }
                    </div>
                  </td>
                  <td>{{ due(record) }}</td>
                  <td>{{ record.amountPaid ?? 0 }}</td>
                  <td [class.balance--owed]="balance(record) > 0">{{ balance(record) }}</td>
                  <td><app-status-chip [status]="record.status" /></td>
                  <td>
                    @if (record.paymentDate) {
                      {{ record.paymentDate | date: 'd MMM y' }}<span class="muted"> · {{ record.paymentMethod | humanLabel }}</span>
                    } @else {
                      <span class="muted">Nothing paid</span>
                    }
                  </td>
                  <td class="row-action">
                    @if (balance(record) > 0) {
                      <app-permission-gate [permissions]="['RENT_PAYMENT_CREATE']">
                        <button type="button" class="btn btn-primary btn-sm" (click)="$event.stopPropagation(); paying.set(record)">Pay</button>
                      </app-permission-gate>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (hasMore()) {
          <button type="button" class="btn btn-secondary btn-sm more" [disabled]="loading()" (click)="loadMore()">
            {{ loading() ? 'Loading…' : 'Earlier months' }}
          </button>
        }
      }
    </app-section-card>

    @if (paying(); as record) {
      <app-record-payment-dialog [agencyId]="agencyId()" [buildingId]="buildingId()" [tenantId]="tenantId()"
                                 [tenantName]="tenantName()" [month]="monthOf(record)" [amount]="balance(record)"
                                 (recorded)="recorded()" (closed)="paying.set(null)" />
    }
  `,
  styles: [`
    :host { display: contents; }
    p { margin: 0; }
    .owed {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
      padding: 0.6rem 0.85rem;
      border: 1px solid var(--warning-border, var(--border));
      border-radius: var(--radius-lg);
      background: var(--warning-tint, var(--surface-2));
    }
    .balance--owed { font-weight: 700; }
    .row-action { text-align: right; white-space: nowrap; }
    .more { justify-self: start; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantRentPaymentsComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly tenantId = input.required<number>();
  readonly tenantName = input('Tenant');
  /** Bumped by the host after it records a payment of its own, so this list catches up. */
  readonly refresh = input(0);

  readonly RoutePaths = RoutePaths;

  private readonly rent = inject(RentService);
  private readonly toasts = inject(NotificationService);

  readonly records = signal<RentPaymentDetail[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly paying = signal<RentPaymentDetail | null>(null);
  private page = 0;

  readonly unpaid = computed(() => this.records().filter((record) => this.balance(record) > 0));
  readonly owed = computed(() => round(this.unpaid().reduce((sum, record) => sum + this.balance(record), 0)));
  readonly overdue = computed(() => this.unpaid().filter((record) => record.status === 'OVERDUE').length);

  readonly summary = computed(() => {
    const count = this.records().length;
    return count === 0 ? null : `${count}${this.hasMore() ? '+' : ''} month${count === 1 ? '' : 's'} billed`;
  });

  constructor() {
    effect(() => {
      this.agencyId();
      this.buildingId();
      this.tenantId();
      this.refresh();
      untracked(() => void this.reload());
    });
  }

  /** What the month asks for: the rent plus any late fee. Utilities are billed on their own lines. */
  due(record: RentPaymentDetail): number {
    return round(Number(record.expectedAmount ?? 0) + Number(record.lateFee ?? 0));
  }

  balance(record: RentPaymentDetail): number {
    if (SETTLED.has(record.status ?? '')) {
      return 0;
    }
    return Math.max(0, round(this.due(record) - Number(record.amountPaid ?? 0)));
  }

  /** `YYYY-MM`, what the payment dialog takes. */
  monthOf(record: RentPaymentDetail): string {
    return (record.paymentForMonth ?? '').slice(0, 7);
  }

  recorded(): void {
    this.paying.set(null);
    this.toasts.push('success', 'Payment recorded.');
    void this.reload();
  }

  async reload(): Promise<void> {
    this.page = 0;
    await this.fetch(false);
  }

  async loadMore(): Promise<void> {
    this.page += 1;
    await this.fetch(true);
  }

  private async fetch(append: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.rent.getPaymentsForBuilding(this.agencyId(), this.buildingId(), {
        tenantId: this.tenantId(),
        sort: ['paymentForMonth,desc'],
        page: this.page,
        size: PAGE_SIZE
      }));
      // The building search answers full records; the list type is the preview it extends.
      const items = result.items as RentPaymentDetail[];
      this.records.update((current) => append ? [...current, ...items] : items);
      this.hasMore.set(!!result.pagination && !result.pagination.isLast);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
