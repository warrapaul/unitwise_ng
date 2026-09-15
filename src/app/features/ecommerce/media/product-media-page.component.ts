import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { FilePreviewComponent } from '../../../shared/components/file-preview/file-preview.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { validateFile } from '../../../shared/utils/file-validation.util';
import { CatalogAdminService } from '../catalog-admin.service';
import {
  PRODUCT_IMAGE_MAX_MB,
  PRODUCT_IMAGE_TYPES,
  ProductImage,
  ProductVariantDetail
} from '../models/catalog.models';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-product-media-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    FormFeedbackDirective,
    FilePreviewComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Product media">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomProductDetail(id())">Back to product</a>
        </ng-container>

        <div class="upload-row">
          <label class="field">
            <span>Add images</span>
            <input type="file" multiple [accept]="acceptTypes" (change)="onFilesSelected($event)">
            <small class="hint">JPEG, PNG, WebP or GIF up to {{ maxSizeMb }}MB each.</small>
          </label>
          <button type="button" class="btn btn-primary" [disabled]="uploading() || pendingFiles().length === 0" (click)="uploadImages()">
            {{ uploading() ? 'Uploading...' : 'Upload ' + pendingFiles().length + ' file(s)' }}
          </button>
        </div>

        @if (fileError()) {
          <p class="error-text">{{ fileError() }}</p>
        }

        @if (pendingFiles().length > 0) {
          <div class="pending-previews">
            @for (file of pendingFiles(); track file.name + file.size) {
              <app-file-preview [file]="file" />
            }
          </div>
        }

        @if (uploadError(); as apiError) {
          <app-error-card title="Upload failed" [message]="apiError.message" [details]="apiError.details" />
        }
      </app-section-card>

      <app-section-card title="Images">
        @if (imagesLoading()) {
          <app-loading-state label="Loading images..." />
        } @else if (imagesError()) {
          <app-error-state [message]="imagesError()!" (retry)="loadImages()" />
        } @else if (images().length === 0) {
          <app-empty-state title="No images yet" description="Upload an image so the product renders in the catalog." />
        } @else {
          <div class="image-grid">
            @for (image of images(); track image.id) {
              <figure class="image-card" [class.image-card--primary]="image.isPrimary">
                <img [src]="image.imageUrl" [alt]="image.altText || 'Product image'" loading="lazy">
                <figcaption>
                  <span class="muted">{{ image.altText || 'No alt text' }}</span>
                  <div class="row-actions">
                    @if (!image.isPrimary) {
                      <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyImageId() === image.id" (click)="makePrimary(image)">
                        Make primary
                      </button>
                    }
                    <button
                      type="button"
                      class="icon-action icon-action--danger"
                      aria-label="Delete image"
                      title="Delete image"
                      [disabled]="busyImageId() === image.id"
                      (click)="removeImage(image)"
                    ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                  </div>
                </figcaption>
              </figure>
            }
          </div>
        }
      </app-section-card>

      <app-section-card title="Variants">
        <ng-container actions>
          <button type="button" class="btn btn-secondary btn-sm" (click)="toggleVariantForm()">
            {{ showVariantForm() ? 'Close' : 'Add variant' }}
          </button>
        </ng-container>

        @if (showVariantForm()) {
          <form [formGroup]="variantForm" appFormFeedback (ngSubmit)="saveVariant()">
            <div class="grid-auto">
              <label class="field"><span>SKU</span><input formControlName="sku"></label>
              <label class="field"><span>Color</span><input formControlName="color"></label>
              <label class="field"><span>Size</span><input formControlName="size"></label>
              <label class="field"><span>Material</span><input formControlName="material"></label>
              <label class="field">
                <span>Price override</span>
                <input type="number" step="0.01" min="0" formControlName="priceOverride">
                <small class="hint">Leave empty to use the base price plus the adjustment.</small>
              </label>
              <label class="field"><span>Price adjustment</span><input type="number" step="0.01" formControlName="priceAdjustment"></label>
              <label class="field"><span>Quantity</span><input type="number" min="0" formControlName="quantity"></label>
              <label class="field"><span>Low stock threshold</span><input type="number" min="0" formControlName="lowStockThreshold"></label>
              <label class="field"><span>Warehouse</span><input formControlName="warehouse"></label>
              <label class="field"><span>Bin location</span><input formControlName="binLocation"></label>
            </div>

            <div class="checkbox-row">
              <label class="checkbox-field"><input type="checkbox" formControlName="allowBackorder"><span>Allow backorder</span></label>
              <label class="checkbox-field"><input type="checkbox" formControlName="isActive"><span>Active</span></label>
            </div>

            @if (variantError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'Variant SKU already exists' : 'Unable to save variant'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="savingVariant()">
                {{ savingVariant() ? 'Saving...' : (editingVariant() ? 'Save variant' : 'Create variant') }}
              </button>
              @if (editingVariant()) {
                <button type="button" class="btn btn-secondary" (click)="cancelVariantEdit()">Cancel edit</button>
              }
            </div>
          </form>
        }

        @if (variantsLoading()) {
          <app-loading-state label="Loading variants..." />
        } @else if (variantsError()) {
          <app-error-state [message]="variantsError()!" (retry)="loadVariants()" />
        } @else if (variants().length === 0) {
          <app-empty-state title="No variants" description="Add a variant when the product ships in more than one option." />
        } @else {
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Variant</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th class="actions-col">Actions</th></tr>
              </thead>
              <tbody>
                @for (variant of variants(); track variant.id) {
                  <tr>
                    <td>{{ variantLabel(variant) }}</td>
                    <td class="mono">{{ variant.sku || '-' }}</td>
                    <td>{{ variant.effectivePrice ?? '-' }}</td>
                    <td>
                      {{ variant.availableQuantity ?? 0 }}
                      @if (variant.isLowStock) {
                        <span class="status-chip status-chip--warning">Low</span>
                      }
                    </td>
                    <td>
                      <app-status-chip [status]="variant.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td class="actions-col">
                      <div class="row-actions">
                        <button
                          type="button"
                          class="icon-action"
                          aria-label="Edit variant"
                          title="Edit variant"
                          (click)="startVariantEdit(variant)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></button>
                        <button
                          type="button"
                          class="icon-action icon-action--danger"
                          aria-label="Delete variant"
                          title="Delete variant"
                          [disabled]="deletingVariantId() === variant.id"
                          (click)="removeVariant(variant)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .upload-row {
      display: flex;
      gap: 1rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }

    /* A batch of picked files sits side by side, each preview capped by its
       track rather than by its own 26rem ceiling. */
    .pending-previews {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 200px));
      gap: 1rem;
      margin-top: 1rem;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
    }

    .image-card {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: grid;
      gap: 0.5rem;
    }

    .image-card--primary {
      border-color: var(--primary);
    }

    .image-card img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      display: block;
    }

    figcaption {
      display: grid;
      gap: 0.5rem;
      padding: 0 0.6rem 0.6rem;
      font-size: 0.85rem;
    }

    .checkbox-row {
      display: flex;
      gap: 1.15rem;
      flex-wrap: wrap;
    }

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductMediaPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly acceptTypes = PRODUCT_IMAGE_TYPES.join(',');
  readonly maxSizeMb = PRODUCT_IMAGE_MAX_MB;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly catalogAdmin = inject(CatalogAdminService);

  readonly imagesLoading = signal(false);
  readonly imagesError = signal<string | null>(null);
  readonly images = signal<ProductImage[]>([]);
  readonly busyImageId = signal<number | null>(null);

  readonly pendingFiles = signal<File[]>([]);
  readonly fileError = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<ApiError | null>(null);

  readonly variantsLoading = signal(false);
  readonly variantsError = signal<string | null>(null);
  readonly variants = signal<ProductVariantDetail[]>([]);
  readonly showVariantForm = signal(false);
  readonly editingVariant = signal<ProductVariantDetail | null>(null);
  readonly savingVariant = signal(false);
  readonly variantError = signal<ApiError | null>(null);
  readonly deletingVariantId = signal<number | null>(null);

  readonly variantForm = this.formBuilder.group({
    sku: '',
    color: '',
    size: '',
    material: '',
    priceOverride: [null as number | null],
    priceAdjustment: [null as number | null],
    quantity: [null as number | null],
    lowStockThreshold: [null as number | null],
    warehouse: '',
    binLocation: '',
    allowBackorder: false,
    isActive: true
  });

  ngOnInit(): void {
    void this.loadImages();
    void this.loadVariants();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.fileError.set(null);

    for (const file of files) {
      const problem = validateFile(file, { maxSizeMB: PRODUCT_IMAGE_MAX_MB, allowedTypes: PRODUCT_IMAGE_TYPES });
      if (problem) {
        this.fileError.set(`${file.name}: ${problem}`);
        this.pendingFiles.set([]);
        input.value = '';
        return;
      }
    }

    this.pendingFiles.set(files);
  }

  async uploadImages(): Promise<void> {
    const files = this.pendingFiles();
    if (files.length === 0) {
      return;
    }

    this.uploading.set(true);
    this.uploadError.set(null);

    try {
      if (files.length === 1) {
        const uploaded = await firstValueFrom(this.catalogAdmin.uploadProductImage(Number(this.id()), files[0]));
        this.images.update((images) => [...images, uploaded]);
      } else {
        const uploaded = await firstValueFrom(this.catalogAdmin.uploadProductImagesBulk(Number(this.id()), files));
        this.images.update((images) => [...images, ...uploaded]);
      }

      this.pendingFiles.set([]);
    } catch (error) {
      this.uploadError.set(toApiError(error));
    } finally {
      this.uploading.set(false);
    }
  }

  async loadImages(): Promise<void> {
    this.imagesLoading.set(true);
    this.imagesError.set(null);

    try {
      this.images.set(await firstValueFrom(this.catalogAdmin.getProductImages(Number(this.id()))));
    } catch (error) {
      this.imagesError.set(extractErrorMessage(error));
    } finally {
      this.imagesLoading.set(false);
    }
  }

  async makePrimary(image: ProductImage): Promise<void> {
    this.busyImageId.set(image.id);
    this.imagesError.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.setPrimaryProductImage(Number(this.id()), image.id));
      this.images.update((images) => images.map((item) => ({ ...item, isPrimary: item.id === image.id })));
    } catch (error) {
      this.imagesError.set(extractErrorMessage(error));
    } finally {
      this.busyImageId.set(null);
    }
  }

  async removeImage(image: ProductImage): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Delete this image?',
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.busyImageId.set(image.id);
    this.imagesError.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.deleteProductImage(Number(this.id()), image.id));
      this.images.update((images) => images.filter((item) => item.id !== image.id));
    } catch (error) {
      this.imagesError.set(extractErrorMessage(error));
    } finally {
      this.busyImageId.set(null);
    }
  }

  async loadVariants(): Promise<void> {
    this.variantsLoading.set(true);
    this.variantsError.set(null);

    try {
      this.variants.set(await firstValueFrom(this.catalogAdmin.getVariants(Number(this.id()))));
    } catch (error) {
      this.variantsError.set(extractErrorMessage(error));
    } finally {
      this.variantsLoading.set(false);
    }
  }

  toggleVariantForm(): void {
    this.showVariantForm.update((value) => !value);
    if (!this.showVariantForm()) {
      this.cancelVariantEdit();
    }
  }

  startVariantEdit(variant: ProductVariantDetail): void {
    this.showVariantForm.set(true);
    this.editingVariant.set(variant);
    this.variantError.set(null);
    this.variantForm.patchValue({
      sku: variant.sku ?? '',
      color: variant.color ?? '',
      size: variant.size ?? '',
      material: variant.material ?? '',
      priceOverride: variant.priceOverride === null || variant.priceOverride === undefined ? null : Number(variant.priceOverride),
      priceAdjustment: variant.priceAdjustment === null || variant.priceAdjustment === undefined ? null : Number(variant.priceAdjustment),
      quantity: variant.quantity ?? null,
      lowStockThreshold: variant.lowStockThreshold ?? null,
      warehouse: variant.warehouse ?? '',
      binLocation: variant.binLocation ?? '',
      allowBackorder: variant.allowBackorder ?? false,
      isActive: variant.isActive ?? true
    });
  }

  async cancelVariantEdit(): Promise<void> {
    this.editingVariant.set(null);
    this.variantError.set(null);
    this.variantForm.reset({
      sku: '',
      color: '',
      size: '',
      material: '',
      priceOverride: null,
      priceAdjustment: null,
      quantity: null,
      lowStockThreshold: null,
      warehouse: '',
      binLocation: '',
      allowBackorder: false,
      isActive: true
    });
  }

  async saveVariant(): Promise<void> {
    if (this.variantForm.invalid) {
      this.variantForm.markAllAsTouched();
      return;
    }

    this.savingVariant.set(true);
    this.variantError.set(null);

    const value = this.variantForm.getRawValue();
    const request = {
      sku: value.sku || null,
      color: value.color || null,
      size: value.size || null,
      material: value.material || null,
      priceOverride: value.priceOverride,
      priceAdjustment: value.priceAdjustment,
      quantity: value.quantity,
      lowStockThreshold: value.lowStockThreshold,
      warehouse: value.warehouse || null,
      binLocation: value.binLocation || null,
      allowBackorder: value.allowBackorder,
      isActive: value.isActive
    };

    try {
      const editing = this.editingVariant();
      if (editing) {
        const updated = await firstValueFrom(this.catalogAdmin.updateVariant(Number(this.id()), editing.id, request));
        this.variants.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        await firstValueFrom(this.catalogAdmin.createVariant(Number(this.id()), request));
        // Refetched, so the new row lands in the server's order rather than
        // wherever the client happened to push it.
        await this.loadVariants();
      }

      this.cancelVariantEdit();
    } catch (error) {
      this.variantError.set(toApiError(error));
    } finally {
      this.savingVariant.set(false);
    }
  }

  async removeVariant(variant: ProductVariantDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete variant ${this.variantLabel(variant)}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deletingVariantId.set(variant.id);
    this.variantsError.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.deleteVariant(Number(this.id()), variant.id));
      this.variants.update((items) => items.filter((item) => item.id !== variant.id));
    } catch (error) {
      this.variantsError.set(extractErrorMessage(error));
    } finally {
      this.deletingVariantId.set(null);
    }
  }

  variantLabel(variant: ProductVariantDetail): string {
    const parts = [variant.color, variant.size, variant.material].filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(' / ') : (variant.sku || `#${variant.id}`);
  }
}
