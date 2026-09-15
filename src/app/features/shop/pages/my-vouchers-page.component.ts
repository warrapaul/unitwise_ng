import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { CommerceService } from '../../ecommerce/commerce.service';
import { Voucher } from '../../ecommerce/models/commerce.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-my-vouchers-page',
  standalone: true,
  imports: [
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="My vouchers">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.myOrders">My orders</a>
        </ng-container>

        <p class="hint">Enter a code at checkout to apply it to your order.</p>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading your vouchers..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (vouchers().length === 0) {
        <app-empty-state title="No vouchers available" description="Vouchers you can use will appear here." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Code</th><th>Discount</th><th>Minimum spend</th><th>Valid until</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (voucher of vouchers(); track voucher.id) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong class="mono">{{ voucher.code }}</strong>
                        <span class="muted">{{ voucher.name }}</span>
                      </div>
                    </td>
                    <td>{{ discountLabel(voucher) }}</td>
                    <td>{{ voucher.minOrderAmount ?? '-' }}</td>
                    <td>{{ formatDate(voucher.validUntil) }}</td>
                    <td><app-status-chip [status]="voucher.status" /></td>
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
export class MyVouchersPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  private readonly commerce = inject(CommerceService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly vouchers = signal<Voucher[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly page = signal(0);
  readonly size = signal(20);

  ngOnInit(): void {
    void this.reload();
  }

  discountLabel(voucher: Voucher): string {
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

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await firstValueFrom(this.commerce.getMyVouchers({ page: this.page(), size: this.size() }));
      this.vouchers.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
