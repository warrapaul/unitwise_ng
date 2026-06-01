import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { AddressesService } from '../addresses.service';
import { AddressPreview, AddressSearchParams } from '../models/address.models';
import { RoutePaths } from '../../../core/routes/route-paths';

type AddressSortField = 'city' | 'county' | 'subCounty' | 'ward' | 'postalCode' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-address-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Addresses" subtitle="Manage city, county, sub-county, ward, and postal address records.">
        <ng-container actions>
          <app-permission-gate [permissions]="['ADDRESS_CREATE']">
            <a class="btn btn-primary" [routerLink]="RoutePaths.addressCreate">Add address</a>
          </app-permission-gate>
        </ng-container>

        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <div class="grid-auto filters-grid">
            <label class="field"><span>City</span><input formControlName="city" placeholder="City"></label>
            <label class="field"><span>County</span><input formControlName="county" placeholder="County"></label>
            <label class="field"><span>Sub-county</span><input formControlName="subCounty" placeholder="Sub-county"></label>
            <label class="field"><span>Ward</span><input formControlName="ward" placeholder="Ward"></label>
            <label class="field"><span>Postal code</span><input formControlName="postalCode" placeholder="Postal code"></label>
          </div>
          <div class="button-row">
            <button type="submit" class="btn btn-primary">Search</button>
            <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
          </div>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading addresses..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load addresses'" (retry)="reload()" />
      } @else if (addresses().length === 0) {
        <app-empty-state title="No addresses found" description="Try a different search or create a new address." />
      } @else {
        <section class="panel table-shell">
          <header class="table-shell__header">
            <div class="table-shell__summary">
              <p class="muted">Showing {{ addresses().length }} of {{ pagination()?.totalElements ?? addresses().length }} addresses</p>
              <p class="muted">Page {{ (pagination()?.page ?? 0) + 1 }} of {{ pagination()?.totalPages || 1 }}</p>
            </div>
            <app-permission-gate [permissions]="['ADDRESS_CREATE']">
              <a class="btn btn-primary" [routerLink]="RoutePaths.addressCreate">Add address</a>
            </app-permission-gate>
          </header>

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('city')">
                      City <span>{{ sortMarker('city') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('county')">
                      County <span>{{ sortMarker('county') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('ward')">
                      Ward <span>{{ sortMarker('ward') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('postalCode')">
                      Postal <span>{{ sortMarker('postalCode') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('createdAt')">
                      Created <span>{{ sortMarker('createdAt') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (address of addresses(); track address.id) {
                  <tr>
                    <td>
                      <a class="record-link" [routerLink]="[RoutePaths.addressDetail(address.id)]">
                        <span class="record-link__text">
                          <span class="record-link__primary">{{ address.subCounty || address.ward || 'Address #' + address.id }}</span>
                          <span class="record-link__secondary">{{ formatAddressSummary(address) }}</span>
                        </span>
                      </a>
                    </td>
                    <td>{{ address.city || '-' }}</td>
                    <td>{{ address.county || '-' }}</td>
                    <td>{{ address.ward || '-' }}</td>
                    <td>{{ address.postalCode || '-' }}</td>
                    <td>{{ formatDate(address.createdAt) }}</td>
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
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.65rem;
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
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .table-shell__summary {
      display: grid;
      gap: 0.25rem;
    }

    .table-shell__header p {
      margin: 0;
      font-size: 0.9rem;
    }

    .table-scroll {
      overflow: auto;
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
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddressListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly addressesService = inject(AddressesService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly addresses = signal<AddressPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.fb.group({
    city: '',
    county: '',
    subCounty: '',
    ward: '',
    postalCode: '',
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
      city: '',
      county: '',
      subCounty: '',
      ward: '',
      postalCode: '',
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

  async sortBy(field: AddressSortField): Promise<void> {
    const current = this.form.getRawValue();
    const direction = current.sort === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.form.patchValue({ sort: field, direction, page: 0 });
    await this.load(this.form.getRawValue());
  }

  sortMarker(field: AddressSortField): string {
    const current = this.form.getRawValue();
    return current.sort === field ? (current.direction === 'asc' ? '↑' : '↓') : '';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  formatAddressSummary(address: AddressPreview): string {
    return [address.city, address.county, address.subCounty]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join(' • ') || '-';
  }

  private async load(params: AddressSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.addressesService.getAddresses(params));
      this.addresses.set(result.items);
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
