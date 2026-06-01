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
import { Pagination } from '../../../core/models/pagination.model';
import { StorePreview, StoreSearchParams } from '../models/ecommerce.models';

type StoreSortField = 'name' | 'code' | 'city' | 'county' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-store-list-page',
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
      <app-section-card title="Stores" subtitle="Browse pickup locations and branch details.">
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <div class="grid-auto filters-grid">
            <label class="field"><span>Name</span><input formControlName="name" placeholder="Store name"></label>
            <label class="field"><span>Code</span><input formControlName="code" placeholder="Store code"></label>
            <label class="field"><span>City</span><input formControlName="city" placeholder="City"></label>
            <label class="field"><span>County</span><input formControlName="county" placeholder="County"></label>
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
            <p class="muted">Showing {{ stores().length }} of {{ pagination()?.totalElements ?? stores().length }} stores</p>
            <p class="muted">Page {{ (pagination()?.page ?? 0) + 1 }} of {{ pagination()?.totalPages || 1 }}</p>
          </header>

          <div class="table-scroll">
            <table class="table stores-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('name')">
                      Store <span>{{ sortMarker('name') }}</span>
                    </button>
                  </th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('createdAt')">
                      Created <span>{{ sortMarker('createdAt') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (store of stores(); track store.id) {
                  <tr>
                    <td>
                      <a class="entity-link" [routerLink]="['/ecommerce/stores', store.id]">
                        <span class="entity-link__text">
                          <strong>{{ store.name }}</strong>
                          <span class="muted">{{ store.code }}</span>
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
                      <span class="status-pill" [class.status-pill--active]="store.isActive">
                        {{ store.isActive ? 'Active' : 'Inactive' }}
                      </span>
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

    .entity-link {
      display: flex;
      align-items: center;
      color: inherit;
    }

    .entity-link__text {
      display: grid;
      gap: 0.15rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StoreListPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly stores = signal<StorePreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    name: '',
    code: '',
    city: '',
    county: '',
    isActive: '',
    page: 0,
    size: 20,
    sort: 'name',
    direction: 'asc' as SortDirection
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
      name: '',
      code: '',
      city: '',
      county: '',
      isActive: '',
      page: 0,
      size: this.form.getRawValue().size ?? 20,
      sort: 'name',
      direction: 'asc' as SortDirection
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

  async sortBy(field: StoreSortField): Promise<void> {
    const current = this.form.getRawValue();
    const direction = current.sort === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.form.patchValue({ sort: field, direction, page: 0 });
    await this.load(this.form.getRawValue());
  }

  sortMarker(field: StoreSortField): string {
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
