import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../ecommerce.service';
import { StockMovement } from '../models/ecommerce.models';

/** Every stock change for one product, searchable by reason, variant and date. */
@Component({
  selector: 'app-product-stock-page',
  standalone: true,
  imports: [ReactiveFormsModule, BackLinkComponent, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent,
    PaginationComponent, SectionCardComponent, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.ecomProductDetail(id())" label="Back to product" />
      <app-section-card [title]="'Stock history' + (productName() ? ' · ' + productName() : '')"
                        subtitle="Sales and returns come from orders; restocks, write-offs and corrections from staff.">
        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <label class="field">
            <span>Why</span>
            <select formControlName="reason">
              <option value="">Any</option>
              @for (r of reasons; track r) { <option [value]="r">{{ r | humanLabel }}</option> }
            </select>
          </label>
          @if (variants().length > 0) {
            <label class="field">
              <span>Variant</span>
              <select formControlName="variantId">
                <option value="">Any</option>
                @for (v of variants(); track v.id) { <option [value]="v.id">{{ v.label }}</option> }
              </select>
            </label>
          }
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
              <thead><tr><th>When</th><th>Why</th><th class="num">Change</th><th class="num">After</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                @for (m of movements(); track m.id) {
                  <tr>
                    <td>{{ when(m.createdAt) }}</td>
                    <td>{{ m.reason | humanLabel }}</td>
                    <td class="num" [class.in]="m.quantityChange > 0" [class.out]="m.quantityChange < 0">{{ m.quantityChange > 0 ? '+' : '' }}{{ m.quantityChange }}</td>
                    <td class="num">{{ m.quantityAfter }}</td>
                    <td>{{ m.createdByName || (m.orderId ? 'Order' : '-') }}</td>
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
    .filters { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end; }
    .filters .field { flex: 0 1 11rem; }
    .table-shell { padding: 1rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .in { color: var(--success); font-weight: 700; }
    .out { color: var(--danger); font-weight: 700; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductStockPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly id = input.required<string>();
  readonly reasons = ['SALE', 'RETURN', 'RESTOCK', 'ADJUSTMENT', 'WRITE_OFF'];

  private readonly ecommerce = inject(EcommerceService);
  readonly form = inject(NonNullableFormBuilder).group({ reason: '', variantId: '', from: '', to: '' });

  readonly movements = signal<StockMovement[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly variants = signal<{ id: number; label: string }[]>([]);
  readonly productName = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private page = 0;
  size = 25;

  ngOnInit(): void {
    void this.loadProduct();
    void this.load();
  }

  private async loadProduct(): Promise<void> {
    try {
      const product = await firstValueFrom(this.ecommerce.getProduct(Number(this.id())));
      this.productName.set(product.name);
      this.variants.set((product.variants ?? []).filter((v) => v.id != null).map((v) => ({
        id: v.id as number,
        label: [v.color, v.size, v.sku].filter(Boolean).join(' / ') || `Variant ${v.id}`
      })));
    } catch {
      // The history still loads without the name.
    }
  }

  search(): void {
    this.page = 0;
    void this.load();
  }

  clear(): void {
    this.form.reset({ reason: '', variantId: '', from: '', to: '' });
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
      const result = await firstValueFrom(this.ecommerce.getStockMovements(Number(this.id()), this.page, this.size, {
        reason: f.reason || undefined,
        variantId: f.variantId ? Number(f.variantId) : undefined,
        from: f.from || undefined,
        to: f.to || undefined
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
