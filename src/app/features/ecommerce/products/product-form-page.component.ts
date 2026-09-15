import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { EcommerceService } from '../ecommerce.service';
import { CatalogAdminService } from '../catalog-admin.service';
import { CategoryPreview } from '../models/ecommerce.models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';
import { ProductTag } from '../models/catalog.models';

@Component({
  selector: 'app-product-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    ErrorCardComponent,
    SectionCardComponent,
    SearchableSelectComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      @if (loading()) {
        <app-loading-state label="Loading product..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit product' : 'New product'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field">
                <span>SKU</span>
                <input formControlName="sku">
                @if (form.controls.sku.invalid && form.controls.sku.touched) {
                  <small class="error-text">SKU is required.</small>
                }
                @if (skuTaken()) {
                  <small class="error-text">This SKU is already used by another product.</small>
                }
              </label>

              <label class="field"><span>UPC</span><input formControlName="upc"></label>

              <label class="field">
                <span>Slug</span>
                <input formControlName="slug">
                <small class="hint">Leave empty to derive it from the name.</small>
              </label>

              <label class="field">
                <span>Category</span>
                <app-searchable-select
                  formControlName="categoryId"
                  [options]="categoryOptions()"
                  [required]="true"
                  placeholder="Select a category"
                  searchPlaceholder="Search categories…"
                />
                @if (form.controls.categoryId.invalid && form.controls.categoryId.touched) {
                  <small class="error-text">A category is required.</small>
                }
              </label>

              <label class="field">
                <span>Subcategory</span>
                <app-searchable-select
                  formControlName="subCategoryId"
                  [options]="categoryOptions()"
                  placeholder="None"
                  searchPlaceholder="Search categories…"
                />
              </label>

              <label class="field">
                <span>Price</span>
                <input type="number" step="0.01" min="0" formControlName="price">
                @if (form.controls.price.invalid && form.controls.price.touched) {
                  <small class="error-text">Price is required and cannot be negative.</small>
                }
              </label>

              <label class="field">
                <span>Compare-at price</span>
                <input type="number" step="0.01" min="0" formControlName="compareAtPrice">
              </label>

              <label class="field">
                <span>Cost price</span>
                <input type="number" step="0.01" min="0" formControlName="costPrice">
              </label>

              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>

              <label class="field"><span>Min order qty</span><input type="number" min="1" formControlName="minOrderQuantity"></label>
              <label class="field"><span>Max order qty</span><input type="number" min="1" formControlName="maxOrderQuantity"></label>
              <label class="field"><span>Display order</span><input type="number" min="0" formControlName="displayOrder"></label>
              <label class="field"><span>Tax rate (%)</span><input type="number" step="0.01" min="0" formControlName="taxRate"></label>
            </div>

            <div class="checkbox-row">
              <label class="checkbox-field"><input type="checkbox" formControlName="isFeatured"><span>Featured</span></label>
              <label class="checkbox-field"><input type="checkbox" formControlName="isTaxable"><span>Taxable</span></label>
            </div>

            <label class="field field--wide">
              <span>Short description</span>
              <textarea formControlName="shortDescription" rows="2"></textarea>
            </label>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="5"></textarea>
            </label>
          </app-section-card>

          @if (!isEdit()) {
            <app-section-card title="Inventory">
              <div class="grid-auto" formGroupName="inventory">
                <label class="field"><span>Quantity</span><input type="number" min="0" formControlName="quantity"></label>
                <label class="field"><span>Low stock threshold</span><input type="number" min="0" formControlName="lowStockThreshold"></label>
                <label class="field"><span>Warehouse</span><input formControlName="warehouse"></label>
                <label class="field"><span>Bin location</span><input formControlName="binLocation"></label>
              </div>
              <label class="checkbox-field">
                <input type="checkbox" [formControl]="form.controls.inventory.controls.allowBackorder">
                <span>Allow backorder</span>
              </label>
            </app-section-card>
          }

          <app-section-card title="Attributes">
            <ng-container actions>
              <button type="button" class="btn btn-secondary btn-sm" (click)="addAttribute()">Add attribute</button>
            </ng-container>

            @if (attributes.length === 0) {
              <p class="muted">No attributes.</p>
            } @else {
              <div class="attribute-rows" formArrayName="attributes">
                @for (control of attributes.controls; track $index) {
                  <div class="attribute-row" [formGroupName]="$index">
                    <label class="field">
                      <span>Name</span>
                      <input formControlName="attributeName" placeholder="Material">
                      @if (control.controls.attributeName.invalid && control.controls.attributeName.touched) {
                        <small class="error-text">Attribute name is required.</small>
                      }
                    </label>
                    <label class="field">
                      <span>Value</span>
                      <input formControlName="attributeValue" placeholder="Cotton">
                      @if (control.controls.attributeValue.invalid && control.controls.attributeValue.touched) {
                        <small class="error-text">Attribute value is required.</small>
                      }
                    </label>
                    <button type="button" class="btn btn-danger btn-sm" (click)="removeAttribute($index)">Remove</button>
                  </div>
                }
              </div>
            }
          </app-section-card>

          @if (!isEdit()) {
            <app-section-card title="Tags">
              @if (tagsError()) {
                <app-error-state [message]="tagsError()!" (retry)="loadTags()" />
              } @else if (tags().length === 0) {
                <p class="muted">No tags defined yet.</p>
              } @else {
                <div class="tag-grid">
                  @for (tag of tags(); track tag.id) {
                    <label class="checkbox-field">
                      <input type="checkbox" [checked]="selectedTagIds().has(tag.id)" (change)="toggleTag(tag.id)">
                      <span>{{ tag.name }}</span>
                    </label>
                  }
                </div>
              }
            </app-section-card>
          }

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Product already exists' : 'Unable to save product'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create product') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomProducts">Cancel</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .checkbox-row {
      display: flex;
      gap: 1.15rem;
      flex-wrap: wrap;
    }

    .attribute-rows {
      display: grid;
      gap: 0.75rem;
    }

    .attribute-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
      gap: 0.75rem;
      align-items: end;
    }

    .tag-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.4rem 1rem;
    }

    @media (max-width: 720px) {
      .attribute-row {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly skuTaken = signal(false);

  readonly categories = signal<CategoryPreview[]>([]);
  readonly categoryOptions = computed<SelectOption<number>[]>(() =>
    this.categories().map((category) => ({
      value: category.id,
      label: category.name
    }))
  );
  readonly tags = signal<ProductTag[]>([]);
  readonly tagsError = signal<string | null>(null);
  readonly selectedTagIds = signal<Set<number>>(new Set());

  readonly isEdit = computed(() => !!this.id());

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    sku: ['', [Validators.required, Validators.maxLength(64)]],
    upc: '',
    slug: '',
    description: '',
    shortDescription: '',
    price: [null as number | null, [Validators.required, Validators.min(0)]],
    compareAtPrice: [null as number | null, [Validators.min(0)]],
    costPrice: [null as number | null, [Validators.min(0)]],
    minOrderQuantity: [null as number | null, [Validators.min(1)]],
    maxOrderQuantity: [null as number | null, [Validators.min(1)]],
    status: 'DRAFT',
    isFeatured: false,
    isTaxable: false,
    taxRate: [null as number | null, [Validators.min(0)]],
    categoryId: [null as number | null, [Validators.required]],
    subCategoryId: [null as number | null],
    displayOrder: [null as number | null, [Validators.min(0)]],
    attributes: this.formBuilder.array<ReturnType<ProductFormPageComponent['createAttributeGroup']>>([]),
    inventory: this.formBuilder.group({
      quantity: [null as number | null, [Validators.min(0)]],
      lowStockThreshold: [null as number | null, [Validators.min(0)]],
      allowBackorder: false,
      warehouse: '',
      binLocation: ''
    })
  });

  get attributes(): FormArray<ReturnType<ProductFormPageComponent['createAttributeGroup']>> {
    return this.form.controls.attributes;
  }

  ngOnInit(): void {
    void this.loadCategories();
    if (!this.isEdit()) {
      void this.loadTags();
    }
    void this.reload();
  }

  createAttributeGroup(attributeName = '', attributeValue = '') {
    return this.formBuilder.group({
      attributeName: [attributeName, [Validators.required, Validators.maxLength(80)]],
      attributeValue: [attributeValue, [Validators.required, Validators.maxLength(255)]]
    });
  }

  addAttribute(): void {
    this.attributes.push(this.createAttributeGroup());
  }

  removeAttribute(index: number): void {
    this.attributes.removeAt(index);
  }

  toggleTag(tagId: number): void {
    this.selectedTagIds.update((current) => {
      const next = new Set(current);
      next.has(tagId) ? next.delete(tagId) : next.add(tagId);
      return next;
    });
  }

  async loadCategories(): Promise<void> {
    try {
      const result = await firstValueFrom(this.ecommerce.getCategories({ page: 0, size: 200 }));
      this.categories.set(result.items);
    } catch {
      // A failed category fetch leaves the select empty; the required validator still blocks submit.
      this.categories.set([]);
    }
  }

  async loadTags(): Promise<void> {
    this.tagsError.set(null);

    try {
      const result = await firstValueFrom(this.catalogAdmin.getTags({ page: 0, size: 200 }));
      this.tags.set(result.items);
    } catch (error) {
      this.tagsError.set(toApiError(error).message);
    }
  }

  async reload(): Promise<void> {
    const productId = this.id();
    if (!productId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const product = await firstValueFrom(this.ecommerce.getProduct(Number(productId)));
      this.form.patchValue({
        name: product.name,
        sku: product.sku,
        upc: product.upc ?? '',
        slug: product.slug ?? '',
        description: product.description ?? '',
        shortDescription: product.shortDescription ?? '',
        price: product.price === null || product.price === undefined ? null : Number(product.price),
        compareAtPrice: product.compareAtPrice === null || product.compareAtPrice === undefined ? null : Number(product.compareAtPrice),
        status: product.status ?? 'DRAFT',
        isFeatured: product.isFeatured ?? false,
        isTaxable: product.isTaxable ?? false,
        taxRate: product.taxRate === null || product.taxRate === undefined ? null : Number(product.taxRate),
        categoryId: product.categoryId ?? null,
        subCategoryId: product.subCategoryId ?? null,
        displayOrder: product.displayOrder ?? null,
        minOrderQuantity: product.minOrderQuantity ?? null,
        maxOrderQuantity: product.maxOrderQuantity ?? null
      });

      this.attributes.clear();
      for (const attribute of product.attributes ?? []) {
        this.attributes.push(this.createAttributeGroup(attribute.attributeName ?? '', attribute.attributeValue ?? ''));
      }
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.skuTaken.set(false);

    const value = this.form.getRawValue();
    const productId = this.id();

    const base = {
      name: value.name,
      sku: value.sku,
      upc: value.upc || null,
      slug: value.slug || null,
      description: value.description || null,
      shortDescription: value.shortDescription || null,
      price: value.price!,
      compareAtPrice: value.compareAtPrice,
      costPrice: value.costPrice,
      minOrderQuantity: value.minOrderQuantity,
      maxOrderQuantity: value.maxOrderQuantity,
      status: value.status as never,
      isFeatured: value.isFeatured,
      isTaxable: value.isTaxable,
      taxRate: value.taxRate,
      categoryId: value.categoryId!,
      subCategoryId: value.subCategoryId,
      displayOrder: value.displayOrder,
      attributes: value.attributes
    };

    try {
      const saved = productId
        ? await firstValueFrom(this.catalogAdmin.updateProduct(Number(productId), base))
        : await firstValueFrom(this.catalogAdmin.createProduct({
          ...base,
          tagIds: [...this.selectedTagIds()],
          inventory: value.inventory
        }));

      await this.router.navigateByUrl(RoutePaths.ecomProductDetail(saved.id));
    } catch (error) {
      const apiError = toApiError(error);
      this.skuTaken.set(apiError.status === 409 && apiError.message.toLowerCase().includes('sku'));
      this.saveError.set(apiError);
    } finally {
      this.saving.set(false);
    }
  }
}
