import { displayDate } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { EcommerceService } from '../ecommerce.service';
import { CustomerPreview, CustomerSearchParams, EcomCustomerPreview, EcomCustomerSearchParams, EcomCustomerSource, EcomCustomerStatus } from '../models/ecommerce.models';
import { RoutePaths } from '../../../core/routes/route-paths';
import { Pagination } from '../../../core/models/pagination.model';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

type CustomerSortField = 'firstName' | 'email' | 'phoneNumber' | 'userUid' | 'createdAt';
type SortDirection = 'asc' | 'desc';

type EcomUserSegment = 'customers' | 'riders' | 'storeManagers';

const SOURCE_LABELS: Record<EcomCustomerSource, string> = {
  SELF_SERVICE: 'Signed up',
  PHONE_ORDER: 'Phone order',
  ADMIN_CREATED: 'Staff',
  RIDER_CREATED: 'Rider'
};

@Component({
  selector: 'app-customer-list-page',
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
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="segmentTitle()">
        <ng-container actions>
          @if (segment() === 'customers') {
            <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.ecomCustomerCreate">Find or add customer</a>
          }
          <div class="scope-tabs">
            <button type="button" class="btn btn-secondary btn-sm" [class.active]="segment() === 'customers'" (click)="setSegment('customers')">
              Customers
            </button>
            <app-permission-gate [permissions]="[Permissions.ECOM_RIDER_READ]">
              <button type="button" class="btn btn-secondary btn-sm" [class.active]="segment() === 'riders'" (click)="setSegment('riders')">
                Riders
              </button>
            </app-permission-gate>
            <app-permission-gate [permissions]="[Permissions.ECOM_STORE_MANAGER_READ]">
              <button type="button" class="btn btn-secondary btn-sm" [class.active]="segment() === 'storeManagers'" (click)="setSegment('storeManagers')">
                Store managers
              </button>
            </app-permission-gate>
          </div>
        </ng-container>
        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="firstName" placeholder="First name"></label>
              <label class="field"><span>Last name</span><input formControlName="lastName" placeholder="Last name"></label>
              <label class="field"><span>Email</span><input formControlName="email" placeholder="Email address"></label>
              <label class="field"><span>Phone</span><input formControlName="phoneNumber" placeholder="Phone number"></label>
              <!-- No ID numbers: an ecommerce desk has no use for them (and the customer list no longer carries them). -->
              @if (segment() === 'customers') {
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Any</option>
                    <option value="ACTIVE">Active</option>
                    <option value="BLOCKED">Blocked</option>
                  </select>
                </label>
                <label class="field">
                  <span>How they joined</span>
                  <select formControlName="source">
                    <option value="">Any</option>
                    <option value="SELF_SERVICE">Signed up</option>
                    <option value="PHONE_ORDER">Phone order</option>
                    <option value="ADMIN_CREATED">Added by staff</option>
                    <option value="RIDER_CREATED">Added by a rider</option>
                  </select>
                </label>
              }
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading customers..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load customers'" (retry)="reload()" />
      } @else if (segment() === 'customers' && ecomCustomers().length === 0) {
        <app-empty-state title="No customers found" description="Try a different filter or clear the search." />
      } @else if (segment() === 'customers') {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table table--packed customers-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Last order</th>
                  <th>Joined by</th>
                  <th><app-sort-header [state]="sorting" field="createdAt" label="Since" (sorted)="search()" /></th>
                </tr>
              </thead>
              <tbody>
                @for (customer of ecomCustomers(); track customer.id) {
                  <tr [appRowLink]="RoutePaths.ecomCustomerDetail(customer.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.ecomCustomerDetail(customer.id)">{{ customerName(customer) }}</a>
                        @if (!customer.claimed) { <span class="muted">Not claimed yet</span> }
                      </div>
                    </td>
                    <td class="mono">{{ customer.phoneNumber || '-' }}</td>
                    <td>
                      <span class="status-chip" [class.status-chip--success]="customer.status === 'ACTIVE'"
                            [class.status-chip--danger]="customer.status === 'BLOCKED'">{{ customer.status === 'BLOCKED' ? 'Blocked' : 'Active' }}</span>
                    </td>
                    <td>{{ customer.orderCount }}</td>
                    <td>{{ formatDate(customer.lastOrderAt) }}</td>
                    <td>{{ sourceLabel(customer.source) }}</td>
                    <td>{{ formatDate(customer.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination [shown]="ecomCustomers().length" [total]="pagination()?.totalElements ?? ecomCustomers().length"
                          noun="customers" [pagination]="pagination()!" [size]="pagination()?.size || 20"
                          [sizes]="pageSizeOptions" (previous)="previousPage()" (next)="nextPage()"
                          (sizeChange)="changePageSize($event)" />
        }
      } @else if (customers().length === 0) {
        <app-empty-state [title]="'No ' + segmentTitle().toLowerCase() + ' found'" description="Try a different filter or clear the search." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table customers-table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="firstName"
                      label="Customer"
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
                      field="email"
                      label="Email"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="createdAt"
                      label="Created"
                      (sorted)="search()"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (customer of customers(); track customer.id) {
                  <tr [appRowLink]="['/admin/users', customer.id]">
                    <td>
                      <a class="record-link" [routerLink]="['/admin/users', customer.id]">
                        <span class="avatar" aria-hidden="true">{{ initials(customer) }}</span>
                        <span class="record-link__text">
                          <span class="record-link__primary">{{ displayName(customer) }}</span>
                          <span class="record-link__secondary">View user details</span>
                        </span>
                      </a>
                    </td>
                    <td class="mono">{{ customer.phoneNumber || '-' }}</td>
                    <td class="wrap-anywhere">{{ customer.email || '-' }}</td>
                    <td>{{ formatDate(customer.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="customers().length"
            [total]="pagination()?.totalElements ?? customers().length"
            noun="customers"
            [pagination]="pagination()!"
            [size]="pagination()?.size || 20"
            [sizes]="pageSizeOptions"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .filters {
      display: grid;
      gap: 0.75rem;
    }


    .filters .field {
      gap: 0.4rem;
    }

    .filters .field span {
      font-size: 0.82rem;
    }

    .filters .field input {
      min-height: 2.7rem;
      padding-block: 0.65rem;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .scope-tabs {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .scope-tabs .active {
      border-color: var(--primary);
      color: var(--primary-strong);
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }



    .table-scroll {
      overflow: auto;
    }

    .customers-table th,
    .customers-table td {
      white-space: nowrap;
      vertical-align: top;
    }

    .customers-table td:first-child,
    .customers-table th:first-child {
      white-space: normal;
      min-width: 230px;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerListPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;
  readonly segment = signal<EcomUserSegment>('customers');
  readonly segmentTitle = computed(() =>
    this.segment() === 'riders' ? 'Riders' : this.segment() === 'storeManagers' ? 'Store managers' : 'Customers'
  );

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly customers = signal<CustomerPreview[]>([]);
  readonly ecomCustomers = signal<EcomCustomerPreview[]>([]);
  readonly RoutePaths = RoutePaths;
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    status: '' as EcomCustomerStatus | '',
    source: '' as EcomCustomerSource | '',
    page: 0,
    size: 20,
  });

  ngOnInit(): void {
    void this.load();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async clear(): Promise<void> {
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      status: '',
      source: '',
      page: 0,
      size: this.form.getRawValue().size ?? 20,
    });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async reload(): Promise<void> {
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }


  customerName(customer: EcomCustomerPreview): string {
    return [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.phoneNumber || `Customer #${customer.id}`;
  }

  sourceLabel(source: EcomCustomerSource): string {
    return SOURCE_LABELS[source] ?? source;
  }

  displayName(customer: CustomerPreview): string {
    return [customer.firstName, customer.middleName, customer.lastName].filter(Boolean).join(' ') || customer.email;
  }

  initials(customer: CustomerPreview): string {
    return [customer.firstName, customer.lastName]
      .filter(Boolean)
      .map((value) => value[0]?.toUpperCase())
      .join('')
      .slice(0, 2) || 'CU';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }

  async setSegment(segment: EcomUserSegment): Promise<void> {
    this.segment.set(segment);
    this.form.patchValue({ page: 0 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  private async load(params: CustomerSearchParams & EcomCustomerSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      if (this.segment() === 'customers') {
        const result = await firstValueFrom(this.ecommerceService.searchEcomCustomers(params));
        this.ecomCustomers.set(result.items);
        this.pagination.set(result.pagination);
        return;
      }
      const { status: _status, source: _source, ...userParams } = params;
      const result = this.segment() === 'riders'
        ? await firstValueFrom(this.ecommerceService.getRiders(userParams))
        : await firstValueFrom(this.ecommerceService.getStoreManagers(userParams));
      this.customers.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
