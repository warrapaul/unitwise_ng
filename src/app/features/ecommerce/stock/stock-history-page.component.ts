import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../ecommerce.service';
import { StockMovement } from '../models/ecommerce.models';

/** Every stock change in the shop — sales, returns, restocks, write-offs — newest first. */
@Component({
  selector: 'app-stock-history-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, EmptyStateComponent, EntityPickerComponent, ErrorStateComponent,
    LoadingStateComponent, PaginationComponent, SectionCardComponent, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-section-card title="Stock history" subtitle="Sales and returns come from orders; restocks, write-offs and corrections from staff.">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomStock">Stock levels</a>
        </ng-container>
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <label class="field field--product">
            <span>Product</span>
            <app-entity-picker [config]="pickers.product" formControlName="productId" placeholder="Every product" />
          </label>
          <label class="field">
            <span>Why</span>
            <select formControlName="reason">
              <option value="">Any</option>
              @for (r of reasons; track r) { <option [value]="r">{{ r | humanLabel }}</option> }
            </select>
          </label>
          <label class="field"><span>From</span><input type="date" formControlName="from"></label>
          <label class="field"><span>To</span><input type="date" formControlName="to"></label>
          <div class="button-row">
            <button type="submit" class="btn btn-primary">Search</button>
            <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
          </div>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading stock history..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (movements().length === 0) {
        <app-empty-state title="No stock changes" description="Nothing matches these filters." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>When</th><th>Product</th><th>Why</th><th class="num">Change</th><th class="num">After</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                @for (m of movements(); track m.id) {
                  <tr>
                    <td class="nowrap">{{ when(m.createdAt) }}</td>
                    <td><a [routerLink]="RoutePaths.ecomProductStock(m.productId)">{{ m.productName || 'Product ' + m.productId }}</a></td>
                    <td>{{ m.reason | humanLabel }}</td>
                    <td class="num" [class.in]="m.quantityChange > 0" [class.out]="m.quantityChange < 0">{{ m.quantityChange > 0 ? '+' : '' }}{{ m.quantityChange }}</td>
                    <td class="num">{{ m.quantityAfter }}</td>
                    <td>
                      @if (m.orderId) { <a [routerLink]="RoutePaths.ecomOrderDetail(m.orderId)">Order</a> }
                      @else { {{ m.createdByName || '-' }} }
                    </td>
                    <td class="muted">{{ m.note || '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        @if (pagination(); as page) {
          <app-pagination [shown]="movements().length" [total]="page.totalElements" noun="changes" [pagination]="page"
                          [size]="size" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
        }
      }
    </section>
  `,
  styles: [`
    .filters { display: flex; flex-wrap: wrap; gap: var(--space-2-5); align-items: flex-end; }
    .filters .field { flex: 0 1 11rem; }
    .filters .field--product { flex: 1 1 16rem; max-width: 22rem; }
    .table-shell { padding: var(--space-4); }
    .table-scroll { overflow: auto; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    .in { color: var(--success); font-weight: var(--weight-bold); }
    .out { color: var(--danger); font-weight: var(--weight-bold); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StockHistoryPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly pickers = inject(EntityPickerRegistry);
  readonly reasons = ['SALE', 'RETURN', 'RESTOCK', 'ADJUSTMENT', 'WRITE_OFF'];

  private readonly ecommerce = inject(EcommerceService);
  readonly form = inject(NonNullableFormBuilder).group({ productId: null as number | null, reason: '', from: '', to: '' });

  readonly movements = signal<StockMovement[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private page = 0;
  size = 25;

  ngOnInit(): void {
    void this.load();
  }

  search(): void {
    this.page = 0;
    void this.load();
  }

  clear(): void {
    this.form.reset({ productId: null, reason: '', from: '', to: '' });
    this.search();
  }

  go(page: number): void {
    this.page = Math.max(0, page);
    void this.load();
  }

  resize(size: number): void {
    this.size = size;
    this.search();
  }

  async load(): Promise<void> {
    const f = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.ecommerce.getAllStockMovements({
        productId: f.productId || undefined,
        reason: f.reason || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        page: this.page,
        size: this.size
      }));
      this.movements.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  when(value?: string | null): string {
    return value ? displayDateTime(value) : '-';
  }
}
