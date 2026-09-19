import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { AddressesService } from '../addresses.service';
import { AddressPreview, AddressSearchParams } from '../models/address.models';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';

type AddressSortField = 'city' | 'county' | 'subCounty' | 'ward' | 'postalCode' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-address-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    EntityPickerComponent,
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
      <app-section-card title="Addresses">
        <ng-container actions>
          <app-permission-gate [permissions]="['ADDRESS_CREATE']">
            <a class="btn btn-primary" [routerLink]="RoutePaths.addressCreate">Add address</a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>City</span>
                <app-entity-picker [config]="pickers.city" formControlName="cityId" placeholder="Any city" />
              </label>
              <label class="field"><span>County</span>
                <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="Any county" />
              </label>
              <label class="field"><span>Sub-county</span><input formControlName="subCounty" placeholder="Sub-county"></label>
              <label class="field"><span>Ward</span><input formControlName="ward" placeholder="Ward"></label>
              <label class="field"><span>Postal code</span><input formControlName="postalCode" placeholder="Postal code"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
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
                    <app-sort-header
                      [state]="sorting"
                      field="city"
                      label="City"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="county"
                      label="County"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="ward"
                      label="Ward"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="postalCode"
                      label="Postal"
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
                @for (address of addresses(); track address.id) {
                  <tr [appRowLink]="[RoutePaths.addressDetail(address.id)]">
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
            [shown]="addresses().length"
            [total]="pagination()?.totalElements ?? addresses().length"
            noun="addresses"
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
      gap: 0.4rem;
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
  readonly pickers = inject(EntityPickerRegistry);
  private readonly addressesService = inject(AddressesService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly addresses = signal<AddressPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.fb.group({
    cityId: [null as number | null],
    countyId: [null as number | null],
    subCounty: '',
    ward: '',
    postalCode: '',
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
      cityId: null,
      countyId: null,
      subCounty: '',
      ward: '',
      postalCode: '',
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
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
