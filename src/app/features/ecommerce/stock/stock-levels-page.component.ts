import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../ecommerce.service';
import { ProductPreview } from '../models/ecommerce.models';

/**
 * What is on the shelf: every product's stock, narrowed to low or out of stock
 * when looking for what to reorder. A product's own page has the adjust form
 * and its full history.
 */
@Component({
  selector: 'app-stock-levels-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent,
    PaginationComponent, SectionCardComponent, StatusChipComponent],
  template: `
    <section class="stack">
      <app-section-card title="Stock levels" subtitle="Filter to low or out of stock to see what needs restocking. Open a product to restock or correct it.">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomStockHistory">Stock history</a>
        </ng-container>
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <label class="field"><span>Product</span><input formControlName="name" placeholder="Name"></label>
          <label class="field"><span>SKU</span><input formControlName="sku" class="slug" placeholder="SKU"></label>
          <label class="field">
            <span>Stock</span>
            <select formControlName="stockStatus" (change)="search()">
              <option value="">Any</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
              <option value="LOW_STOCK">Low stock</option>
              <option value="IN_STOCK">In stock</option>
              <option value="BACKORDER">Backorder</option>
            </select>
          </label>
          <button type="submit" class="btn btn-secondary">Search</button>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading stock..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (products().length === 0) {
        <app-empty-state title="Nothing here" description="No product matches these filters." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Product</th><th>SKU</th><th class="num">Available</th><th>Stock</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                @for (p of products(); track p.id) {
                  <tr>
                    <td><a class="record-link__primary" [routerLink]="RoutePaths.ecomProductDetail(p.id)">{{ p.name }}</a></td>
                    <td class="mono">{{ p.sku || '-' }}</td>
                    <td class="num" [class.out]="(p.availableQuantity ?? 0) <= 0">{{ p.availableQuantity ?? 0 }}</td>
                    <td><app-status-chip [status]="p.stockStatus" /></td>
                    <td class="actions">
                      <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomProductDetail(p.id)">Restock</a>
                      <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomProductStock(p.id)">History</a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        @if (pagination(); as page) {
          <app-pagination [shown]="products().length" [total]="page.totalElements" noun="products" [pagination]="page"
                          [size]="size" (previous)="go(page.page - 1)" (next)="go(page.page + 1)" (sizeChange)="resize($event)" />
        }
      }
    </section>
  `,
  styles: [`
    .filters { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end; }
    .filters .field { flex: 0 1 13rem; }
    .table-shell { padding: 1rem; }
    .table-scroll { overflow: auto; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .out { color: var(--danger); font-weight: 700; }
    .actions { text-align: right; white-space: nowrap; }
    .actions .btn + .btn { margin-left: 0.35rem; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StockLevelsPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly ecommerce = inject(EcommerceService);
  readonly form = inject(NonNullableFormBuilder).group({ name: '', sku: '', stockStatus: '' });

  readonly products = signal<ProductPreview[]>([]);
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
      const result = await firstValueFrom(this.ecommerce.getProducts({
        name: f.name.trim() || undefined,
        sku: f.sku.trim() || undefined,
        stockStatus: f.stockStatus || undefined,
        page: this.page,
        size: this.size,
        sort: 'name,asc'
      }));
      this.products.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
