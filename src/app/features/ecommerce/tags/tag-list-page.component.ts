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
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { CatalogAdminService } from '../catalog-admin.service';
import { ProductTag } from '../models/catalog.models';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-tag-list-page',
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
      <app-section-card title="Product tags">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.TAG_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.ecomTagCreate">New tag</a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel actions [form]="searchForm" (clear)=\"clearFilters()\">
          <form class="filters" [formGroup]="searchForm" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Keyword</span><input formControlName="keyword" placeholder="Tag name or slug"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clearSearch()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading tags..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (tags().length === 0) {
        <app-empty-state title="No tags yet" description="Create a tag to group products for merchandising." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Name"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="slug"
                      label="Slug"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                @for (tag of tags(); track tag.id) {
                  <tr [appRowLink]="RoutePaths.ecomTagDetail(tag.id)">
                    <td>
                      <a class="record-link__primary" [routerLink]="RoutePaths.ecomTagDetail(tag.id)">{{ tag.name }}</a>
                    </td>
                    <td class="mono">{{ tag.slug || '-' }}</td>
                    <td>{{ tag.description || '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
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

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TagListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly catalogAdmin = inject(CatalogAdminService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tags = signal<ProductTag[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly searchForm = this.formBuilder.group({
    keyword: '',
    page: 0,
    size: 20
  });

  ngOnInit(): void {
    void this.reload();
  }


  /** The counterpart of the filter count: what turns it back to zero. */
  async clearFilters(): Promise<void> {
    this.searchForm.reset({ keyword: '', page: 0, size: this.searchForm.getRawValue().size });
    await this.search();
  }

  async search(): Promise<void> {
    this.searchForm.patchValue({ page: 0 });
    await this.reload();
  }

  async clearSearch(): Promise<void> {
    this.searchForm.patchValue({ keyword: '', page: 0 });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.searchForm.patchValue({ page: current - 1 });
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.searchForm.patchValue({ page: pagination.page + 1 });
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.searchForm.patchValue({ size, page: 0 });
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const { keyword, page, size } = this.searchForm.getRawValue();

    try {
      const result = keyword.trim()
        ? await firstValueFrom(this.catalogAdmin.searchTags({ keyword: keyword.trim(), page, size, sort: this.sorting.toParams() }))
        : await firstValueFrom(this.catalogAdmin.getTags({ page, size, sort: this.sorting.toParams() }));
      this.tags.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
