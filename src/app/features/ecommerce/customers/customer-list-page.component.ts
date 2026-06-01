import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { CustomerPreview, CustomerSearchParams } from '../models/ecommerce.models';
import { Pagination } from '../../../core/models/pagination.model';

type CustomerSortField = 'firstName' | 'email' | 'phoneNumber' | 'userUid' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-customer-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Customers" subtitle="Ecommerce customers from the shared users service.">
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <div class="grid-auto filters-grid">
            <label class="field"><span>Name</span><input formControlName="firstName" placeholder="First name"></label>
            <label class="field"><span>Last name</span><input formControlName="lastName" placeholder="Last name"></label>
            <label class="field"><span>Email</span><input formControlName="email" placeholder="Email address"></label>
            <label class="field"><span>Phone</span><input formControlName="phoneNumber" placeholder="Phone number"></label>
            <label class="field"><span>User UID</span><input formControlName="userUid" placeholder="UID"></label>
            <label class="field"><span>National ID</span><input formControlName="nationalId" placeholder="National ID"></label>
          </div>
          <div class="button-row">
            <button type="submit" class="btn btn-primary">Search</button>
            <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
          </div>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading customers..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load customers'" (retry)="reload()" />
      } @else if (customers().length === 0) {
        <app-empty-state title="No customers found" description="Try a different filter or clear the search." />
      } @else {
        <section class="panel table-shell">
          <header class="table-shell__header">
            <p class="muted">Showing {{ customers().length }} of {{ pagination()?.totalElements ?? customers().length }} customers</p>
            <p class="muted">Page {{ (pagination()?.page ?? 0) + 1 }} of {{ pagination()?.totalPages || 1 }}</p>
          </header>

          <div class="table-scroll">
            <table class="table customers-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('firstName')">
                      Customer <span>{{ sortMarker('firstName') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('email')">
                      Contact <span>{{ sortMarker('email') }}</span>
                    </button>
                  </th>
                  <th>User UID</th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('createdAt')">
                      Created <span>{{ sortMarker('createdAt') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (customer of customers(); track customer.id) {
                  <tr>
                    <td>
                      <a class="user-link" [routerLink]="['/users', customer.id]">
                        <span class="avatar" aria-hidden="true">{{ initials(customer) }}</span>
                        <span class="user-link__text">
                          <strong>{{ displayName(customer) }}</strong>
                          <span class="muted">View user details</span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ customer.email }}</span>
                        <span class="muted">{{ customer.phoneNumber }}</span>
                      </div>
                    </td>
                    <td>{{ customer.userUid || '-' }}</td>
                    <td>{{ formatDate(customer.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
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

    .filters-grid {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.6rem;
    }

    .filters .field {
      gap: 0.3rem;
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

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .table-shell__header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .table-shell__header p {
      margin: 0;
      font-size: 0.9rem;
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

    .sort-button {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .sort-button span {
      color: var(--text-muted);
      font-size: 0.75rem;
      line-height: 1;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerListPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly customers = signal<CustomerPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    nationalId: '',
    userUid: '',
    page: 0,
    size: 20,
    sort: 'createdAt',
    direction: 'desc' as SortDirection
  });

  ngOnInit(): void {
    void this.load();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.load(this.form.getRawValue());
  }

  async clear(): Promise<void> {
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      nationalId: '',
      userUid: '',
      page: 0,
      size: this.form.getRawValue().size ?? 20,
      sort: 'createdAt',
      direction: 'desc' as SortDirection
    });
    await this.load(this.form.getRawValue());
  }

  async reload(): Promise<void> {
    await this.load(this.form.getRawValue());
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.load(this.form.getRawValue());
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.load(this.form.getRawValue());
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.load(this.form.getRawValue());
  }

  async sortBy(field: CustomerSortField): Promise<void> {
    const current = this.form.getRawValue();
    const direction = current.sort === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.form.patchValue({ sort: field, direction, page: 0 });
    await this.load(this.form.getRawValue());
  }

  sortMarker(field: CustomerSortField): string {
    const current = this.form.getRawValue();
    return current.sort === field ? (current.direction === 'asc' ? '↑' : '↓') : '';
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
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  private async load(params: CustomerSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.ecommerceService.getCustomers(params));
      this.customers.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(this.extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const backendError = (error as { error?: { message?: string } }).error;
      return backendError?.message ?? 'Request failed';
    }

    return 'Request failed';
  }
}
