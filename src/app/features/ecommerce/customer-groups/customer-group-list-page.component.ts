import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { CatalogAdminService } from '../catalog-admin.service';
import { CustomerGroup } from '../models/catalog.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type CustomerGroupSortField = 'name' | 'createdAt';

/** Below this, a table is chrome without a question (§28.7). */
const COMPACT_THRESHOLD = 5;

@Component({
  selector: 'app-customer-group-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    FilterPanelComponent,
    FormFeedbackDirective,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Customer groups">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.CUSTOMER_GROUP_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.customerGroupCreate">New group</a>
          </app-permission-gate>
        </ng-container>

        <!--
          Type is the only criterion this endpoint takes; sort and page are the
          rest of what it honours. Nothing here is filtered in the browser.
        -->
        @if (showFilters()) {
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field">
                <span>Type</span>
                <select formControlName="type">
                  <option value="">Any</option>
                  <option value="PRODUCT">Product groups</option>
                  <option value="CUSTOMER">Customer groups</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
        }
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading customer groups..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (groups().length === 0) {
        <app-empty-state title="No customer groups yet" description="Create a group to target pricing and discounts." />
      } @else if (compact()) {
        <div class="record-grid">
          @for (group of groups(); track group.id) {
            <article class="record-card">
              <header class="record-card__head">
                <a class="record-card__title" [routerLink]="RoutePaths.customerGroupDetail(group.id)">{{ group.name }}</a>
                <app-status-chip [status]="group.isActive ? 'ACTIVE' : 'INACTIVE'" />
              </header>

              <p class="muted">{{ group.description || 'No description' }}</p>

              <dl class="record-card__facts">
                <div><dt>Members</dt><dd>{{ group.memberCount ?? 0 }}</dd></div>
                <div>
                  <dt>Discount</dt>
                  <dd>{{ group.discountPercentage !== null && group.discountPercentage !== undefined ? group.discountPercentage + '%' : '-' }}</dd>
                </div>
              </dl>

              <div class="button-row">
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.customerGroupDetail(group.id)">Open</a>
              </div>
            </article>
          }
        </div>
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
                      label="Group"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Members</th>
                  <th>Default discount</th>
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
                @for (group of groups(); track group.id) {
                  <tr [appRowLink]="RoutePaths.customerGroupDetail(group.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.customerGroupDetail(group.id)">{{ group.name }}</a>
                        <span class="muted">{{ group.description || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ group.memberCount ?? 0 }}</td>
                    <td>{{ group.discountPercentage !== null && group.discountPercentage !== undefined ? group.discountPercentage + '%' : '-' }}</td>
                    <td>
                      <app-status-chip [status]="group.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td>{{ formatDate(group.createdAt) }}</td>
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
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerGroupListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly groups = signal<CustomerGroup[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly page = signal(0);
  readonly size = signal(20);

  /**
   * The size of the set, from the first unfiltered read — not the current result,
   * which would swap the table out mid-search (§28.7).
   */
  private readonly baselineTotal = signal<number | null>(null);

  readonly compact = computed(() => {
    const total = this.baselineTotal();
    return total !== null && total <= COMPACT_THRESHOLD;
  });

  /** Held back until the size is known, so nothing appears and then withdraws. */
  readonly showFilters = computed(() => this.baselineTotal() !== null && !this.compact());

  readonly form = this.formBuilder.group({
    type: '',
  });

  async search(): Promise<void> {
    this.page.set(0);
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({ type: '' });
    this.page.set(0);
    await this.reload();
  }


  ngOnInit(): void {
    void this.reload();
  }

  async previousPage(): Promise<void> {
    if (this.page() <= 0) {
      return;
    }

    this.page.update((value) => value - 1);
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.page.set(pagination.page + 1);
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.size.set(size);
    this.page.set(0);
    await this.reload();
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.catalogAdmin.getCustomerGroups({
        ...this.form.getRawValue(),
        sort: this.sorting.toParams(),
        page: this.page(),
        size: this.size()
      }));
      this.groups.set(result.items);
      this.pagination.set(result.pagination);

      if (!this.form.getRawValue().type) {
        this.baselineTotal.set(result.pagination?.totalElements ?? result.items.length);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
