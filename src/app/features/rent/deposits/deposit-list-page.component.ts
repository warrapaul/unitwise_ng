import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { DepositStatus, TenantDeposit } from '../models/rent.models';
import { RentService } from '../rent.service';

type View = 'open' | 'refund' | 'settled';

const VIEWS: Record<View, { label: string; status?: DepositStatus[]; awaitingRefund?: boolean }> = {
  open: { label: 'Held', status: ['PENDING', 'HELD', 'PARTIALLY_REFUNDED'] },
  refund: { label: 'Awaiting refund', awaitingRefund: true },
  settled: { label: 'Settled', status: ['REFUNDED', 'FORFEITED'] }
};

/**
 * The building's deposits. "Awaiting refund" is the one that needs action:
 * money still held for a tenant who has left. A row opens the tenant, where the
 * deposit is received and refunded.
 */
@Component({
  selector: 'app-deposit-list-page',
  standalone: true,
  imports: [
    RouterLink,
    SectionCardComponent,
    ContextGuardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    PaginationComponent,
    RowLinkDirective,
    HumanLabelPipe
  ],
  template: `
    <section class="stack">
      <app-section-card title="Deposits">
        <div class="views" role="group" aria-label="Show">
          @for (view of views; track view) {
            <button type="button" class="btn btn-secondary btn-sm" [class.views__active]="active() === view"
                    [attr.aria-pressed]="active() === view" (click)="show(view)">{{ labels[view].label }}</button>
          }
        </div>

        <app-context-guard [requireBuilding]="true" requirePermission="RENT_PAYMENT_READ">
          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading deposits..." />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (deposits().length === 0) {
            <p class="muted">None.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Room</th><th>Tenant</th><th>Agreed</th><th>Held</th><th>Refunded · kept</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (deposit of deposits(); track deposit.id) {
                    <tr [appRowLink]="tenantLink(deposit)">
                      <td><strong>{{ deposit.roomName || '-' }}</strong></td>
                      <td><a class="record-link__primary" [routerLink]="tenantLink(deposit)">{{ deposit.tenantName || 'Tenant' }}</a></td>
                      <td>{{ deposit.expectedAmount ?? '-' }}</td>
                      <td><strong>{{ deposit.heldAmount ?? 0 }}</strong></td>
                      <td>{{ deposit.amountRefunded ?? 0 }} · {{ deposit.amountDeducted ?? 0 }}</td>
                      <td>
                        <span class="status-chip status-chip--neutral">{{ deposit.status | humanLabel }}</span>
                        @if (deposit.awaitingRefund) {
                          <span class="status-chip status-chip--danger">Awaiting refund</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-context-guard>
      </app-section-card>

      @if (pagination(); as page) {
        <app-pagination [pagination]="page" [size]="page.size" [shown]="deposits().length" [total]="page.totalElements"
                        noun="deposits" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
      }
    </section>
  `,
  styles: [`
    .views { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .views__active { border-color: var(--primary); color: var(--primary-strong); }
    td .status-chip + .status-chip { margin-left: 0.3rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepositListPageComponent {
  private readonly rent = inject(RentService);
  private readonly context = inject(ActiveContextService);

  readonly views: View[] = ['open', 'refund', 'settled'];
  readonly labels = VIEWS;

  readonly active = signal<View>('open');
  readonly deposits = signal<TenantDeposit[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly page = signal({ page: 0, size: 20 });

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      untracked(() => void this.reload());
    });
  }

  tenantLink(deposit: TenantDeposit): string {
    return RoutePaths.tenantDetail(deposit.agencyId ?? this.context.agencyId() ?? '', deposit.buildingId ?? this.context.buildingId() ?? '', deposit.tenantId);
  }

  async show(view: View): Promise<void> {
    this.active.set(view);
    this.page.update((page) => ({ ...page, page: 0 }));
    await this.reload();
  }

  async go(page: number): Promise<void> {
    this.page.update((current) => ({ ...current, page: Math.max(0, page) }));
    await this.reload();
  }

  async resize(size: number): Promise<void> {
    this.page.set({ page: 0, size });
    await this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    const buildingId = this.context.buildingId();
    if (agencyId === null || buildingId === null) {
      return;
    }

    const view = VIEWS[this.active()];
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.rent.getDeposits(agencyId, buildingId, {
        status: view.status,
        awaitingRefund: view.awaitingRefund,
        ...this.page()
      }));
      this.deposits.set(result.items);
      this.pagination.set(result.pagination ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
