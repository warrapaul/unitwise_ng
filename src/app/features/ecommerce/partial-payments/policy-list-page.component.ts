import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { CommerceService } from '../commerce.service';
import { PartialPaymentPolicy } from '../models/commerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { UnitPipe } from '../../../shared/pipes/unit.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type PolicySortField = 'name' | 'createdAt';

/** Below this, a table is chrome without a question (§28.7). */
const COMPACT_THRESHOLD = 5;

@Component({
  selector: 'app-partial-payment-policy-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    UnitPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Partial payment policies">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.PARTIAL_PAYMENT_POLICY_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.partialPaymentPolicyCreate">New policy</a>
          </app-permission-gate>
        </ng-container>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading policies..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (policies().length === 0) {
        <app-empty-state title="No policies yet" description="Create a policy to let customers pay a deposit up front." />
      } @else if (compact()) {
        <div class="record-grid">
          @for (policy of policies(); track policy.id) {
            <article class="record-card">
              <header class="record-card__head">
                <span class="record-card__title">{{ policy.name }}</span>
                <app-status-chip [status]="policy.isActive ? 'ACTIVE' : 'INACTIVE'" />
              </header>

              <p class="muted">{{ policy.description || 'No description' }}</p>

              <dl class="record-card__facts">
                <div><dt>Down payment</dt><dd>{{ policy.minDownPaymentPercent ?? '-' }}%</dd></div>
                <div><dt>Balance due</dt><dd>{{ policy.balanceDueDays | unit: 'days' }}</dd></div>
              </dl>

              <p class="muted">
                {{ policy.customerGroupName || 'All customers' }} · {{ policy.productGroupName || 'All products' }}
              </p>

              <app-permission-gate [permissions]="[Permissions.PARTIAL_PAYMENT_POLICY_UPDATE]">
                <div class="button-row">
                  <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.partialPaymentPolicyEdit(policy.id)">Edit</a>
                </div>
              </app-permission-gate>
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
                      label="Policy"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>Applies to</th>
                  <th>Min down payment</th>
                  <th>Balance due</th>
                  <th>Status</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (policy of policies(); track policy.id) {
                  <tr [appRowLink]="RoutePaths.partialPaymentPolicyEdit(policy.id)">
                    <td>
                      <div class="cell-stack">
                        <strong>{{ policy.name }}</strong>
                        <span class="muted">{{ policy.description || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ policy.customerGroupName || 'All customers' }}</span>
                        <span class="muted">{{ policy.productGroupName || 'All products' }}</span>
                      </div>
                    </td>
                    <td>{{ policy.minDownPaymentPercent ?? '-' }}%</td>
                    <td>{{ policy.balanceDueDays | unit: 'days' }}</td>
                    <td>
                      <app-status-chip [status]="policy.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td class="actions-col">
                      <app-permission-gate [permissions]="[Permissions.PARTIAL_PAYMENT_POLICY_UPDATE]">
                        <a
                          class="icon-action"
                          aria-label="Edit policy"
                          title="Edit policy"
                          [routerLink]="RoutePaths.partialPaymentPolicyEdit(policy.id)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></a>
                      </app-permission-gate>
                    </td>
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

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PartialPaymentPolicyListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly commerce = inject(CommerceService);

  /*
   * This endpoint takes no criteria — only a page and a sort — so the page offers
   * exactly that rather than a filter panel whose fields the API would discard.
   * Give it search params and the panel follows.
   */


  /** Ordering the table asks the server for; shift-click adds a second key. */
  /**
   * The size of the set, from the first read. This endpoint takes no criteria,
   * so every read is unfiltered and the count always describes the set (§28.7).
   */
  private readonly baselineTotal = signal<number | null>(null);

  readonly compact = computed(() => {
    const total = this.baselineTotal();
    return total !== null && total <= COMPACT_THRESHOLD;
  });

  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly policies = signal<PartialPaymentPolicy[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly page = signal(0);
  readonly size = signal(20);

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

  /** A new ordering starts at the first page, like any other query change. */
  async applySort(): Promise<void> {
    this.page.set(0);
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.commerce.getPartialPaymentPolicies({
        sort: this.sorting.toParams(),
        page: this.page(),
        size: this.size()
      }));
      this.policies.set(result.items);
      this.pagination.set(result.pagination);
      this.baselineTotal.set(result.pagination?.totalElements ?? result.items.length);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
