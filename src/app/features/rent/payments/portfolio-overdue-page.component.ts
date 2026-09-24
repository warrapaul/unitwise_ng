import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import {
  PortfolioOverduePayment,
  PortfolioOverdueSearchParams
} from '../models/rent.models';
import { RentService } from '../rent.service';

@Component({
  selector: 'app-portfolio-overdue-page',
  standalone: true,
  imports: [
    ContextScopeNoticeComponent,
    EntityPickerComponent,
    RoomPickerComponent,
    ReactiveFormsModule,
    RouterLink,
    EmptyStateComponent,
    ErrorStateComponent,
    FilterPanelComponent,
    FormFeedbackDirective,
    LoadingStateComponent,
    PaginationComponent,
    SectionCardComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Overdue portfolio">
        <app-filter-panel actions [form]="form" (clear)="clear()" [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Overdue as of</span>
                <input type="date" formControlName="asOf">
              </label>
              @if (canChooseBuilding()) {
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
              }
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
              </label>
              <!-- A room is picked inside its building, so only once one is chosen. -->
              @if (context.agencyId() !== null && (form.controls.buildingId.value ?? context.buildingId()) !== null) {
                <label class="field">
                  <span>Room</span>
                  <app-room-picker
                    formControlName="roomId"
                    [agencyId]="context.agencyId()"
                    [buildingId]="form.controls.buildingId.value ?? context.buildingId()"
                  />
                </label>
              }
              <label class="field">
                <span>Search</span>
                <input formControlName="search" placeholder="Name or phone">
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-context-scope-notice noun="overdue payments" />

      @if (loading()) {
        <app-loading-state label="Loading overdue payments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payments().length === 0) {
        <app-empty-state
          title="No overdue payments"
          description="There are no unpaid payments past the selected reference date in your accessible portfolio."
        />
      } @else {
        <section class="panel table-shell">
          <p class="muted table-note">
            Every row is dynamically overdue as of {{ displayDate(form.controls.asOf.value) }}.
            Status is the recorded payment workflow status.
          </p>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Location</th>
                  <th>Covers</th>
                  <th>Due</th>
                  <th>Outstanding</th>
                  <th>Late by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (payment of payments(); track payment.paymentId) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="detailLink(payment)">{{ payment.tenantName }}</a>
                        <span class="muted">{{ payment.tenantPhone }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ payment.agencyName }}</span>
                        <span class="muted">{{ payment.buildingName }} · {{ roomLabel(payment) }}</span>
                      </div>
                    </td>
                    <td>{{ displayMonth(payment.paymentForMonth) }}</td>
                    <td>{{ displayDate(payment.dueDate) }}</td>
                    <td>{{ payment.totalOutstanding }}</td>
                    <td>{{ payment.daysOverdue }} {{ payment.daysOverdue === 1 ? 'day' : 'days' }}</td>
                    <td><app-status-chip [status]="payment.paymentStatus" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="payments().length"
            [total]="pagination()!.totalElements"
            noun="overdue payments"
            [pagination]="pagination()!"
            [size]="pagination()!.size"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .table-shell { display: grid; gap: 0.75rem; padding: 1rem; }
    .table-note { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PortfolioOverduePageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  readonly context = inject(ActiveContextService);
  readonly pickers = inject(EntityPickerRegistry);

  readonly canChooseBuilding = computed(() =>
    this.context.canChooseBuilding(PermissionConstants.RENT_PAYMENT_READ_ALL));

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payments = signal<PortfolioOverduePayment[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly form = this.formBuilder.group({
    asOf: this.today(),
    buildingId: [null as number | null],
    tenantId: [null as number | null],
    roomId: [null as number | null],
    search: '',
    page: 0,
    size: 20
  });

  constructor() {
    // Starts on the building in context and follows the switcher (§30.5);
    // the server still intersects whatever is asked with what the caller may read.
    effect(() => {
      const buildingId = this.context.buildingId();
      this.context.agencyId();
      // A room belongs to one building; switching building leaves it meaningless.
      this.form.patchValue({ buildingId, roomId: null, page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      asOf: this.today(),
      buildingId: this.context.buildingId(),
      tenantId: null,
      roomId: null,
      search: '',
      page: 0,
      size: this.form.controls.size.value
    });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const page = this.pagination()?.page ?? 0;
    if (page > 0) {
      this.form.patchValue({ page: page - 1 });
      await this.reload();
    }
  }

  async nextPage(): Promise<void> {
    const current = this.pagination();
    if (current && !current.isLast) {
      this.form.patchValue({ page: current.page + 1 });
      await this.reload();
    }
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ page: 0, size });
    await this.reload();
  }

  detailLink(payment: PortfolioOverduePayment): string {
    return RoutePaths.rentPaymentDetail(payment.agencyId, payment.buildingId, payment.paymentId);
  }

  roomLabel(payment: PortfolioOverduePayment): string {
    return payment.roomName || `Room ${payment.roomNumber}`;
  }

  displayDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  displayMonth(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const value = this.form.getRawValue();
      const params: PortfolioOverdueSearchParams = {
        asOf: value.asOf,
        agencyId: this.context.agencyId() ?? undefined,
        buildingId: value.buildingId ?? undefined,
        tenantId: value.tenantId ?? undefined,
        roomId: value.roomId ?? undefined,
        search: value.search || undefined,
        page: value.page,
        size: value.size
      };
      const result = await firstValueFrom(this.rentService.getPortfolioOverduePayments(params));
      this.payments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private today(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
