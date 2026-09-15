import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EcommerceService } from '../ecommerce.service';
import { Pagination } from '../../../core/models/pagination.model';
import { CategoryPreview, CategorySearchParams, CategoryTreeNode } from '../models/ecommerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type CategorySortField = 'name' | 'displayOrder' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-category-list-page',
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
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Categories">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.CATEGORY_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.ecomCategoryCreate">New category</a>
          </app-permission-gate>
        </ng-container>
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Keyword</span><input formControlName="keyword" placeholder="Search categories"></label>
              <label class="field">
                <span>Visibility</span>
                <select formControlName="includeInactive">
                  <option [ngValue]="false">Active only</option>
                  <option [ngValue]="true">Include inactive</option>
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
        <app-loading-state label="Loading categories..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load categories'" (retry)="reload()" />
      } @else {
        <section class="panel table-shell">
          <header class="table-shell__header">
            <p class="muted">Showing {{ categories().length }} of {{ pagination()?.totalElements ?? categories().length }} categories</p>
            <p class="muted">Page {{ (pagination()?.page ?? 0) + 1 }} of {{ pagination()?.totalPages || 1 }}</p>
          </header>

          @if (categories().length === 0) {
            <app-empty-state title="No categories found" description="Try a different keyword or include inactive categories." />
          } @else {
            <div class="table-scroll">
              <table class="table categories-table">
                <thead>
                  <tr>
                    <th>
                      <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Category"
                      (sorted)="search()"
                    />
                    </th>
                    <th>Parent</th>
                    <th>Active</th>
                    <th>
                      <app-sort-header
                      [state]="sorting"
                      field="displayOrder"
                      label="Order"
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
                  @for (category of categories(); track category.id) {
                    <tr [appRowLink]="['/ecommerce/categories', category.id]">
                      <td>
                        <a class="record-link" [routerLink]="['/ecommerce/categories', category.id]">
                          <span class="record-link__text">
                            <span class="record-link__primary">{{ category.name }}</span>
                            <span class="record-link__secondary">{{ category.slug || 'No slug' }}</span>
                          </span>
                        </a>
                      </td>
                      <td>{{ category.parentName || '-' }}</td>
                      <td>
                        <app-status-chip [status]="category.isActive ? 'ACTIVE' : 'INACTIVE'" />
                      </td>
                      <td>{{ category.displayOrder ?? '-' }}</td>
                      <td>{{ formatDate(category.createdAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
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

      @if (hierarchy().length) {
        <app-section-card title="Hierarchy">
          <div class="tree">
            @for (node of hierarchy(); track node.id) {
              <article class="panel tree-node">
                <div class="tree-node__head">
                  <strong>{{ node.name }}</strong>
                  <span class="muted">{{ node.slug || '-' }}</span>
                </div>
                @if (node.subCategories?.length) {
                  <div class="tag-row">
                    @for (child of node.subCategories || []; track child.id) {
                      <a class="pill" [routerLink]="['/ecommerce/categories', child.id]">{{ child.name }}</a>
                    }
                  </div>
                }
              </article>
            }
          </div>
        </app-section-card>
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

    .categories-table th,
    .categories-table td {
      white-space: nowrap;
      vertical-align: top;
    }

    .categories-table td:first-child,
    .categories-table th:first-child {
      white-space: normal;
      min-width: 220px;
    }

    .tree {
      display: grid;
      gap: 0.75rem;
    }

    .tree-node {
      padding: 1rem;
    }

    .tree-node__head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerceService = inject(EcommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly categories = signal<CategoryPreview[]>([]);
  readonly hierarchy = signal<CategoryTreeNode[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly pageSizeOptions = [10, 20, 50];

  readonly form = this.formBuilder.group({
    keyword: '',
    includeInactive: false,
    page: 0,
    size: 20,
  });

  ngOnInit(): void {
    void this.load();
    void this.loadHierarchy();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async clear(): Promise<void> {
    this.form.reset({
      keyword: '',
      includeInactive: false,
      page: 0,
      size: this.form.getRawValue().size ?? 20,
    });
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
  }

  async reload(): Promise<void> {
    await this.load({ ...this.form.getRawValue(),
        sort: this.sorting.toParams() });
    await this.loadHierarchy();
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

  private async load(params: CategorySearchParams = this.form.getRawValue()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = params.keyword?.trim()
        ? await firstValueFrom(this.ecommerceService.searchCategories({ ...params, keyword: params.keyword.trim() }))
        : await firstValueFrom(this.ecommerceService.getCategories(params));

      this.categories.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadHierarchy(): Promise<void> {
    try {
      this.hierarchy.set(await firstValueFrom(this.ecommerceService.getCategoryHierarchy(this.form.getRawValue().includeInactive)));
    } catch {
      this.hierarchy.set([]);
    }
  }

}
