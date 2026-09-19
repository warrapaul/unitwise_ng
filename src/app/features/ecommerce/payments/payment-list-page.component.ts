import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../commerce.service';
import { PaymentSearchParams, PaymentSearchResult } from '../models/commerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-payment-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Payments">
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>M-Pesa receipt</span><input formControlName="mpesaReceiptNumber" placeholder="QGH7X..."></label>
              <label class="field"><span>Phone</span><input formControlName="phoneNumber" placeholder="2547..."></label>
              <label class="field">
                <span>Status</span>
                <select formControlName="paymentStatus">
                  <option value="">Any</option>
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
              <label class="field">
                <span>Method</span>
                <select formControlName="paymentMethod">
                  <option value="">Any</option>
                  <option value="MPESA">M-Pesa</option>
                  <option value="PAY_ON_DELIVERY">Pay on delivery</option>
                  <option value="CASH">Cash</option>
                </select>
              </label>
              <label class="field"><span>Min amount</span><input type="number" step="0.01" formControlName="minAmount"></label>
              <label class="field"><span>Max amount</span><input type="number" step="0.01" formControlName="maxAmount"></label>
              <label class="field"><span>Created from</span><input type="datetime-local" formControlName="createdFrom"></label>
              <label class="field"><span>Created to</span><input type="datetime-local" formControlName="createdTo"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
              <button type="button" class="btn btn-secondary" (click)="toggleUnlinkedOnly()">
                {{ unlinkedOnly() ? 'Show all payments' : 'Unlinked payments only' }}
              </button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading payments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (payments().length === 0) {
        <app-empty-state title="No payments found" description="Try a different search or clear the filters." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="mpesaReceiptNumber"
                      label="Receipt"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Order</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="amount"
                      label="Amount"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="phoneNumber"
                      label="Phone"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="status"
                      label="Status"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="completedAt"
                      label="Completed"
                      (sorted)="search()"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (payment of payments(); track payment.id) {
                  <tr [appRowLink]="RoutePaths.paymentDetail(payment.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary mono" [routerLink]="RoutePaths.paymentDetail(payment.id)">
                          {{ payment.mpesaReceiptNumber || ('#' + payment.id) }}
                        </a>
                        <span class="muted">{{ payment.paymentMethod | humanLabel }}</span>
                      </div>
                    </td>
                    <td>
                      @if (payment.orderId) {
                        <a [routerLink]="RoutePaths.ecomOrderDetail(payment.orderId)">{{ payment.orderNumber || payment.orderId }}</a>
                      } @else {
                        <span class="muted">Unlinked</span>
                      }
                    </td>
                    <td>{{ payment.amount ?? '-' }}</td>
                    <td class="mono">{{ payment.phoneNumber || '-' }}</td>
                    <td><app-status-chip [status]="payment.paymentStatus" /></td>
                    <td>{{ formatDate(payment.completedAt) }}</td>
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
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly commerce = inject(CommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('completedAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly payments = signal<PaymentSearchResult[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly unlinkedOnly = signal(false);

  readonly form = this.formBuilder.group({
    mpesaReceiptNumber: '',
    phoneNumber: '',
    paymentStatus: '',
    paymentMethod: '',
    minAmount: [null as number | null],
    maxAmount: [null as number | null],
    createdFrom: '',
    createdTo: '',
    page: 0,
    size: 20,
    sort: 'initiatedAt',
    direction: 'desc' as 'asc' | 'desc'
  });

  ngOnInit(): void {
    void this.reload();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      mpesaReceiptNumber: '',
      phoneNumber: '',
      paymentStatus: '',
      paymentMethod: '',
      minAmount: null,
      maxAmount: null,
      createdFrom: '',
      createdTo: '',
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'initiatedAt',
      direction: 'desc'
    });
    await this.reload();
  }

  async toggleUnlinkedOnly(): Promise<void> {
    this.unlinkedOnly.update((value) => !value);
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


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as PaymentSearchParams;

    try {
      const result = this.unlinkedOnly()
        ? await firstValueFrom(this.commerce.searchEligiblePayments(params))
        : await firstValueFrom(this.commerce.searchPayments(params));
      this.payments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
