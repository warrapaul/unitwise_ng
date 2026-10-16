import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RouterLink } from '@angular/router';
import { RoutePaths } from '../../../core/routes/route-paths';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { displayDateTime } from '../../../shared/utils/display-date.util';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../ecommerce.service';
import { StockMovement } from '../models/ecommerce.models';

/**
 * Stock in and out by an amount — a delivery of 12, two broken — never by retyping the count, and
 * every change listed with who made it: orders' sales and returns as well as these.
 */
@Component({
  selector: 'app-product-stock',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SectionCardComponent, PermissionGateComponent, HumanLabelPipe],
  template: `
    <app-section-card title="Stock" subtitle="Changes by amount, with the reason. Sales and returns are recorded by orders.">
      <a actions class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.ecomProductStock(productId())">View all</a>
      <app-permission-gate [permissions]="['PRODUCT_UPDATE']">
        <form class="adjust" [formGroup]="form" (ngSubmit)="adjust()">
          @if (variants().length > 0) {
            <label class="field">
              <span>Variant</span>
              <select formControlName="variantId">
                @for (v of variants(); track v.id) { <option [value]="v.id">{{ v.label }}</option> }
              </select>
            </label>
          }
          <label class="field">
            <span>Reason</span>
            <select formControlName="reason">
              <option value="RESTOCK">Restock (in)</option>
              <option value="WRITE_OFF">Write-off (out)</option>
              <option value="ADJUSTMENT">Count correction (either way)</option>
            </select>
          </label>
          <label class="field">
            <span>Units</span>
            <input type="number" formControlName="units" min="1" step="1">
          </label>
          @if (form.controls.reason.value === 'ADJUSTMENT') {
            <label class="field">
              <span>Direction</span>
              <select formControlName="direction"><option value="1">Add</option><option value="-1">Remove</option></select>
            </label>
          }
          <label class="field field--wide"><span>Note <span class="muted">(optional)</span></span><input formControlName="note" placeholder="e.g. Delivery from supplier, invoice 2231"></label>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Record' }}</button>
        </form>
        @if (saveError(); as message) { <p class="error-text" role="alert">{{ message }}</p> }
      </app-permission-gate>

      @if (loadError(); as message) {
        <p class="error-text">{{ message }}</p>
      } @else if (movements().length === 0) {
        <p class="muted">No stock changes recorded yet.</p>
      } @else {
        <!-- The latest few, in a capped area; the full history is on its own page. -->
        <div class="table-scroll recent">
          <table class="table table--packed">
            <thead><tr><th>When</th><th>Why</th><th class="num">Change</th><th class="num">After</th><th>By / note</th></tr></thead>
            <tbody>
              @for (m of movements(); track m.id) {
                <tr>
                  <td>{{ when(m.createdAt) }}</td>
                  <td>{{ m.reason | humanLabel }}</td>
                  <td class="num" [class.in]="m.quantityChange > 0" [class.out]="m.quantityChange < 0">{{ m.quantityChange > 0 ? '+' : '' }}{{ m.quantityChange }}</td>
                  <td class="num">{{ m.quantityAfter }}</td>
                  <td>{{ m.createdByName || (m.orderId ? 'Order' : '-') }}@if (m.note) { <span class="muted"> · {{ m.note }}</span> }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (more()) {
          <a class="more" [routerLink]="RoutePaths.ecomProductStock(productId())">See the full stock history →</a>
        }
      }
    </app-section-card>
  `,
  styles: [`
    .adjust { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end; margin-bottom: 1rem; }
    .adjust .field { flex: 0 1 11rem; }
    .adjust .field--wide { flex: 1 1 16rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .recent { max-height: 18rem; overflow-y: auto; }
    .more { display: inline-block; margin-top: 0.5rem; font-weight: 600; }
    .in { color: var(--success); font-weight: 700; }
    .out { color: var(--danger); font-weight: 700; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductStockComponent {
  readonly productId = input.required<number>();
  readonly variants = input<{ id: number; label: string }[]>([]);
  /** After a change, so the page can show the new count. */
  readonly changed = output<void>();

  private readonly ecommerce = inject(EcommerceService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly RoutePaths = RoutePaths;
  readonly movements = signal<StockMovement[]>([]);
  /** Whether there is more than the latest few shown here. */
  readonly more = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly form = this.fb.group({
    variantId: '',
    reason: 'RESTOCK',
    units: [null as number | null, [Validators.required, Validators.min(1)]],
    direction: '1',
    note: ''
  });

  constructor() {
    effect(() => {
      const id = this.productId();
      const first = this.variants()[0];
      untracked(() => {
        if (first && !this.form.controls.variantId.value) {
          this.form.controls.variantId.setValue(String(first.id));
        }
        void this.load(id);
      });
    });
  }

  private async load(productId: number): Promise<void> {
    try {
      const page = await firstValueFrom(this.ecommerce.getStockMovements(productId, 0, 10));
      this.movements.set(page.items);
      this.more.set(!(page.pagination?.isLast ?? true));
      this.loadError.set(null);
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    }
  }

  async adjust(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Enter how many units.');
      return;
    }
    const v = this.form.getRawValue();
    const sign = v.reason === 'RESTOCK' ? 1 : v.reason === 'WRITE_OFF' ? -1 : Number(v.direction);
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await firstValueFrom(this.ecommerce.adjustStock(this.productId(), {
        variantId: v.variantId ? Number(v.variantId) : null,
        change: sign * Number(v.units),
        reason: v.reason,
        note: v.note.trim() || null
      }));
      this.form.patchValue({ units: null, note: '' });
      await this.load(this.productId());
      this.changed.emit();
    } catch (error) {
      this.saveError.set(toApiError(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  when(value?: string | null): string {
    return value ? displayDateTime(value) : '-';
  }
}
