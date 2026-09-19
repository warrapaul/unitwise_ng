import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { CatalogAdminService } from '../catalog-admin.service';
import { ProductDiscount } from '../models/catalog.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-product-discount-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    EntityPickerComponent,
    ErrorCardComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="editing() ? 'Edit discount' : 'New discount'">
        <ng-container actions>
          <div class="action-bar">
            @if (editing()) {
              <button type="button" class="btn btn-secondary" (click)="cancelEdit()">Cancel edit</button>
            }
            <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomProductDetail(id())">Back to product</a>
          </div>
        </ng-container>

        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <div class="grid-auto">
            <label class="field">
              <span>Name</span>
              <input formControlName="name" placeholder="Launch offer">
              @if (form.controls.name.invalid && form.controls.name.touched) {
                <small class="error-text">Name is required.</small>
              }
            </label>

            <label class="field">
              <span>Discount type</span>
              <select formControlName="discountType">
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED_AMOUNT">Fixed amount</option>
              </select>
            </label>

            <label class="field">
              <span>Discount value</span>
              <input type="number" step="0.01" min="0" formControlName="discountValue">
              @if (form.controls.discountValue.invalid && form.controls.discountValue.touched) {
                <small class="error-text">Value is required and cannot be negative.</small>
              }
            </label>

            <label class="field"><span>Starts</span><input type="datetime-local" formControlName="startDate"></label>
            <label class="field"><span>Ends</span><input type="datetime-local" formControlName="endDate"></label>
            <label class="field"><span>Min quantity</span><input type="number" min="1" formControlName="minQuantity"></label>
            <label class="field"><span>Max quantity</span><input type="number" min="1" formControlName="maxQuantity"></label>
            <label class="field">
              <span>Customer group ID</span>
              <app-entity-picker [config]="pickers.customerGroup" formControlName="customerGroupId" placeholder="All customers" />
              <small class="hint">Leave empty to apply to all customers.</small>
            </label>
            <label class="field"><span>Usage limit</span><input type="number" min="1" formControlName="usageLimit"></label>
          </div>

          <label class="field field--wide">
            <span>Description</span>
            <textarea formControlName="description" rows="2"></textarea>
          </label>

          <label class="checkbox-field">
            <input type="checkbox" formControlName="isActive">
            <span>Active</span>
          </label>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Discount already exists' : 'Unable to save discount'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (editing() ? 'Save discount' : 'Create discount') }}
            </button>
          </div>
        </form>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading discounts..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (discounts().length === 0) {
        <app-empty-state title="No discounts" description="Create a discount to run a promotion on this product." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Discount</th><th>Value</th><th>Window</th><th>Usage</th><th>Status</th><th class="actions-col">Actions</th></tr>
              </thead>
              <tbody>
                @for (discount of discounts(); track discount.id) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ discount.name }}</strong>
                        <span class="muted">{{ discount.description || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ discount.discountType === 'PERCENTAGE' ? discount.discountValue + '%' : discount.discountValue }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ formatDate(discount.startDate) }}</span>
                        <span class="muted">to {{ formatDate(discount.endDate) }}</span>
                      </div>
                    </td>
                    <td>{{ discount.usageCount ?? 0 }}{{ discount.usageLimit ? ' / ' + discount.usageLimit : '' }}</td>
                    <td>
                      <div class="chip-row">
                        <app-status-chip [status]="discount.isActive ? 'ACTIVE' : 'INACTIVE'" />
                        @if (discount.isActive && !discount.isValid) {
                          <span class="status-chip status-chip--warning">Outside window</span>
                        }
                      </div>
                    </td>
                    <td class="actions-col">
                      <div class="row-actions">
                        <button
                          type="button"
                          class="icon-action"
                          aria-label="Edit discount"
                          title="Edit discount"
                          (click)="startEdit(discount)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          [disabled]="busyId() === discount.id"
                          (click)="toggle(discount)"
                        >
                          {{ discount.isActive ? 'Disable' : 'Enable' }}
                        </button>
                        <button
                          type="button"
                          class="icon-action icon-action--danger"
                          aria-label="Delete discount"
                          title="Delete discount"
                          [disabled]="busyId() === discount.id"
                          (click)="remove(discount)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                      </div>
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
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductDiscountPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  private readonly confirm = inject(ConfirmService);
  readonly pickers = inject(EntityPickerRegistry);

  readonly id = input.required<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly catalogAdmin = inject(CatalogAdminService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly discounts = signal<ProductDiscount[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly page = signal(0);
  readonly size = signal(20);

  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly editing = signal<ProductDiscount | null>(null);
  readonly busyId = signal<number | null>(null);

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: [null as number | null, [Validators.required, Validators.min(0)]],
    startDate: '',
    endDate: '',
    minQuantity: [null as number | null],
    maxQuantity: [null as number | null],
    customerGroupId: [null as number | null],
    usageLimit: [null as number | null],
    isActive: true
  });

  ngOnInit(): void {
    void this.reload();
  }

  startEdit(discount: ProductDiscount): void {
    this.editing.set(discount);
    this.saveError.set(null);
    this.form.patchValue({
      name: discount.name,
      description: discount.description ?? '',
      discountType: discount.discountType,
      discountValue: Number(discount.discountValue ?? 0),
      startDate: this.toLocalInput(discount.startDate),
      endDate: this.toLocalInput(discount.endDate),
      minQuantity: discount.minQuantity ?? null,
      maxQuantity: discount.maxQuantity ?? null,
      customerGroupId: discount.customerGroupId ?? null,
      usageLimit: discount.usageLimit ?? null,
      isActive: discount.isActive ?? true
    });
  }

  async cancelEdit(): Promise<void> {
    this.editing.set(null);
    this.saveError.set(null);
    this.form.reset({
      name: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: null,
      startDate: '',
      endDate: '',
      minQuantity: null,
      maxQuantity: null,
      customerGroupId: null,
      usageLimit: null,
      isActive: true
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const value = this.form.getRawValue();
    const request = {
      name: value.name,
      description: value.description || null,
      discountType: value.discountType,
      discountValue: value.discountValue!,
      startDate: value.startDate || null,
      endDate: value.endDate || null,
      minQuantity: value.minQuantity,
      maxQuantity: value.maxQuantity,
      customerGroupId: value.customerGroupId,
      usageLimit: value.usageLimit,
      isActive: value.isActive
    };

    try {
      const editing = this.editing();
      if (editing) {
        const updated = await firstValueFrom(this.catalogAdmin.updateProductDiscount(Number(this.id()), editing.id, request));
        this.discounts.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await firstValueFrom(this.catalogAdmin.createProductDiscount(Number(this.id()), request));
        this.discounts.update((items) => [created, ...items]);
      }

      this.cancelEdit();
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(discount: ProductDiscount): Promise<void> {
    this.busyId.set(discount.id);
    this.error.set(null);

    try {
      const updated = await firstValueFrom(this.catalogAdmin.toggleProductDiscount(Number(this.id()), discount.id));
      this.discounts.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(discount: ProductDiscount): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete the discount "${discount.name}"?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.busyId.set(discount.id);
    this.error.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.deleteProductDiscount(Number(this.id()), discount.id));
      this.discounts.update((items) => items.filter((item) => item.id !== discount.id));
      if (this.editing()?.id === discount.id) {
        this.cancelEdit();
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
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
      const result = await firstValueFrom(
        this.catalogAdmin.getProductDiscounts(Number(this.id()), { page: this.page(), size: this.size() })
      );
      this.discounts.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private toLocalInput(value?: string | null): string {
    if (!value) {
      return '';
    }

    return value.replace(' ', 'T').slice(0, 16);
  }
}
