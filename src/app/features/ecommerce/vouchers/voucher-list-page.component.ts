import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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
import { Voucher } from '../models/commerce.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type VoucherSortField = 'code' | 'validFrom' | 'createdAt';

@Component({
  selector: 'app-voucher-list-page',
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
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Vouchers">
        <ng-container actions>
          <app-permission-gate [permissions]="[Permissions.VOUCHER_CREATE]">
            <a class="btn btn-primary" [routerLink]="RoutePaths.voucherCreate">New voucher</a>
          </app-permission-gate>
        </ng-container>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading vouchers..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (vouchers().length === 0) {
        <app-empty-state title="No vouchers yet" description="Create a voucher to run a promotion." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="code"
                      label="Code"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>Discount</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="validFrom"
                      label="Validity"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>Usage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (voucher of vouchers(); track voucher.id) {
                  <tr [appRowLink]="RoutePaths.voucherDetail(voucher.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary mono" [routerLink]="RoutePaths.voucherDetail(voucher.id)">{{ voucher.code }}</a>
                        <span class="muted">{{ voucher.name }}</span>
                      </div>
                    </td>
                    <td>{{ formatDiscount(voucher) }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ formatDate(voucher.validFrom) }}</span>
                        <span class="muted">to {{ formatDate(voucher.validUntil) }}</span>
                      </div>
                    </td>
                    <td>{{ voucher.usageCount ?? 0 }}{{ voucher.maxUses ? ' / ' + voucher.maxUses : '' }}</td>
                    <td>
                      <app-status-chip [status]="voucher.status" />
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VoucherListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly commerce = inject(CommerceService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly vouchers = signal<Voucher[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  /*
   * This endpoint takes no criteria — only a page and a sort — so the page offers
   * exactly that rather than a filter panel whose fields the API would discard.
   * Give it search params and the panel follows.
   */


  readonly page = signal(0);
  readonly size = signal(20);

  ngOnInit(): void {
    void this.reload();
  }

  formatDiscount(voucher: Voucher): string {
    if (voucher.discountType === 'PERCENTAGE') {
      return `${voucher.discountValue}%`;
    }

    return String(voucher.discountValue ?? '-');
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
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
      const result = await firstValueFrom(this.commerce.getVouchers({
        sort: this.sorting.toParams(),
        page: this.page(),
        size: this.size()
      }));
      this.vouchers.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
