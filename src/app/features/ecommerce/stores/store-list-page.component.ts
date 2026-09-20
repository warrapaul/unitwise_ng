import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { StorePreview, StoreSearchParams } from '../models/ecommerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type StoreSortField = 'name' | 'code' | 'city' | 'county' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-store-list-page',
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
    RowLinkDirective,
    FilterPanelComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Stores">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.STORE_WRITE]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.ecomStoreCreate">Add store</a>
            </app-permission-gate>
        </ng-container>
        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name" placeholder="Store name"></label>
              <label class="field"><span>Code</span><input formControlName="code" placeholder="Store code"></label>
              <label class="field"><span>City</span>
                <app-entity-picker [config]="pickers.city" formControlName="cityId" placeholder="Any city" />
              </label>
              <label class="field"><span>County</span>
                <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="Any county" />
              </label>
              <label class="field">
                <span>Status</span>
                <select formControlName="isActive">
                  <option value="">Any</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading stores..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load stores'" (retry)="reload()" />
      } @else if (stores().length === 0) {
        <app-empty-state title="No stores found" description="Try a different search or clear the filters." />
      } @else {
        <section class="panel table-shell">
          <header class="table-shell__header">
            <app-permission-gate [permissions]="[Permissions.STORE_WRITE]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.ecomStoreCreate">Add store</a>
            </app-permission-gate>
          </header>

          <div class="table-scroll">
            <table class="table stores-table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Store"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Status</th>
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
                @for (store of stores(); track store.id) {
                  <tr [appRowLink]="['/ecommerce/stores', store.id]">
                    <td>
                      <a class="record-link" [routerLink]="['/ecommerce/stores', store.id]">
                        <span class="record-link__text">
                          <span class="record-link__primary">{{ store.name }}</span>
                          <span class="record-link__secondary">{{ store.code }}</span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ joinParts([store.town, store.city]) }}</span>
                        <span class="muted">{{ store.county || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ store.contactPhone || '-' }}</span>
                        <span class="muted">{{ store.operatingHours || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <app-status-chip [status]="store.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td>{{ formatDate(store.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="stores().length"
            [total]="pagination()?.totalElements ?? stores().length"
            noun="stores"
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

    .filters .field input,
    .filters .field select {
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

    .stores-table th,
    .stores-table td {
      white-space: nowrap;
      vertical-align: top;
    }

    .stores-table td:first-child,
    .stores-table th:first-child {
      white-space: normal;
      min-width: 220px;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StoreListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  private readonly formBuilder = inject(NonNullableFormBuilder);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly ecommerceService = inject(EcommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly stores = signal<StorePreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    name: '',
    code: '',
    cityId: [null as number | null],
    countyId: [null as number | null],
    isActive: '',
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
      name: '',
      code: '',
      cityId: null,
      countyId: null,
      isActive: '',
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

  joinParts(values: Array<string | null | undefined>, separator = ', '): string {
    return values.filter((value): value is string => Boolean(value)).join(separator) || '-';
  }

  private async load(params: StoreSearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.ecommerceService.getStores(params));
      this.stores.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

}
