import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { thisMonthIso, todayIso } from '../../../shared/utils/date.util';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { RentService } from '../rent.service';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import {
  RENT_PAYMENT_SORTABLE_FIELDS,
  RentPaymentPreview,
  RentPaymentSearchParams,
  RentPaymentSummary,
  toMonthPath
} from '../models/rent.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type RentPaymentSortField = typeof RENT_PAYMENT_SORTABLE_FIELDS[number];

@Component({
  selector: 'app-rent-payment-list-page',
  standalone: true,
  imports: [
    ContextScopeNoticeComponent,
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="mine() ? 'My rent payments' : 'Rent payments'">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.RENT_PAYMENT_CREATE, Permissions.RENT_PAYMENT_WRITE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
          </app-permission-gate>
        </ng-container>

        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="mine() ? RoutePaths.rentPayments : RoutePaths.myRentPayments">
            {{ mine() ? 'All payments' : 'My payments' }}
          </a>
        </ng-container>

        <app-filter-panel (clear)="clear()" actions [form]="form">
          @if (!mine()) {
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Receipt number</span><input formControlName="receiptNumber"></label>
                <label class="field"><span>Tenant name</span><input formControlName="tenantName"></label>
                <label class="field"><span>Room name</span><input formControlName="roomName"></label>
                <label class="field"><span>Payment month</span><input type="month" formControlName="paymentForMonth"></label>
                <!--
                  Status and method are not filters here: RentPaymentSearchReq
                  carries neither, so the endpoint discarded both and the panel
                  claimed a narrowing it never performed (§28.12). They come back
                  the moment the DTO does.
                -->
                <label class="field"><span>Due from</span><input type="date" formControlName="dueDateFrom"></label>
                <label class="field"><span>Due to</span><input type="date" formControlName="dueDateTo"></label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
                <button type="button" class="btn btn-secondary" [disabled]="!scope()" (click)="toggleOverdueOnly()">
                  {{ overdueOnly() ? 'All payments' : 'Overdue only' }}
                </button>
              </div>
            </form>
          }
        </app-filter-panel>
      </app-section-card>

      @if (!mine()) {
        <app-context-scope-notice noun="payments" />
      }

      @if (loading()) {
        <app-loading-state label="Loading payments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payments().length === 0) {
        <app-empty-state title="No rent payments" description="Payments appear here once recorded." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Tenant</th>
                  <th>Room</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="paymentForMonth"
                      label="Covers"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="amountPaid"
                      label="Amount"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (payment of payments(); track payment.id) {
                  <tr [appRowLink]="detailLink(payment.id)">
                    <td>
                      @if (detailLink(payment.id); as link) {
                        <a class="record-link__primary mono" [routerLink]="link">
                          {{ payment.receiptNumber || ('#' + payment.id) }}
                        </a>
                      } @else {
                        <span class="mono">{{ payment.receiptNumber || ('#' + payment.id) }}</span>
                      }
                    </td>
                    <td>{{ payment.tenantName || '-' }}</td>
                    <td>{{ payment.roomName || payment.roomNumber || '-' }}</td>
                    <td>{{ formatMonth(payment.paymentForMonth) }}</td>
                    <td>{{ payment.amountPaid ?? '-' }}</td>
                    <td>{{ payment.paymentMethod | humanLabel }}</td>
                    <td><app-status-chip [status]="payment.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="payments().length"
            [total]="pagination()?.totalElements ?? payments().length"
            noun="payments"
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
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RentPaymentListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly rentService = inject(RentService);
  private readonly context = inject(ActiveContextService);
  private readonly route = inject(ActivatedRoute);

  readonly scope = this.context.active;

  /** Ordering the table asks the server for; shift-click adds a second key. */
  // A rent record has no payment date of its own (its transactions do), so newest month first.
  readonly sorting = sortState('paymentForMonth', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payments = signal<RentPaymentPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly mine = signal(false);
  readonly overdueOnly = signal(false);


  readonly form = this.formBuilder.group({
    receiptNumber: '',
    tenantName: '',
    roomName: '',
    paymentForMonth: '',
    dueDateFrom: '',
    dueDateTo: '',
    page: 0,
    size: 20,
  });


  ngOnInit(): void {
    this.mine.set(this.route.snapshot.data['mine'] === true);
    void this.reload();
  }


  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.overdueOnly.set(false);
    this.form.reset({
      receiptNumber: '',
      tenantName: '',
      roomName: '',
      paymentForMonth: '',
      dueDateFrom: '',
      dueDateTo: '',
      page: 0,
      size: this.form.getRawValue().size,
    });
    await this.reload();
  }

  async toggleOverdueOnly(): Promise<void> {
    this.overdueOnly.update((value) => !value);
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.reload();
  }


  /** A payment only has a detail route once an agency and building are in scope. */
  detailLink(paymentId: number): string | null {
    const scope = this.scope();
    if (scope.agencyId === null || scope.buildingId === null) {
      return null;
    }

    return this.mine()
      ? RoutePaths.myRentPaymentDetail(scope.agencyId, scope.buildingId, paymentId)
      : RoutePaths.rentPaymentDetail(scope.agencyId, scope.buildingId, paymentId);
  }


  formatMonth(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const raw = this.form.getRawValue();
    const params: RentPaymentSearchParams = {
      ...raw,
      sort: this.sorting.toParams(),
      paymentForMonth: raw.paymentForMonth ? toMonthPath(raw.paymentForMonth) : undefined
    };

    const scope = this.scope();
    const scoped = scope.agencyId !== null && scope.buildingId !== null
      ? { agencyId: scope.agencyId, buildingId: scope.buildingId }
      : null;
    // An agency without a building: that agency's payments, as far as the caller may read.
    // Only a platform reader (RENT_PAYMENT_READ_ALL) gets the unscoped search.
    const agencyOnly = !scoped && scope.agencyId !== null ? scope.agencyId : null;

    try {
      let result;
      if (this.mine()) {
        result = await firstValueFrom(this.rentService.getMyPayments({ page: params.page, size: params.size }));
      } else if (scoped && this.overdueOnly()) {
        result = await firstValueFrom(this.rentService.getOverduePayments(scoped!.agencyId, scoped!.buildingId, params));
      } else if (scoped) {
        result = await firstValueFrom(this.rentService.getPaymentsForBuilding(scoped!.agencyId, scoped!.buildingId, params));
      } else if (agencyOnly !== null) {
        result = await firstValueFrom(this.rentService.getPaymentsForAgency(agencyOnly, params));
      } else {
        result = await firstValueFrom(this.rentService.searchPayments(params));
      }

      this.payments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
