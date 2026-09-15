import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { validateFile } from '../../../shared/utils/file-validation.util';
import { EcommerceService } from '../ecommerce.service';
import { CatalogAdminService } from '../catalog-admin.service';
import { CategoryPreview } from '../models/ecommerce.models';
import { PRODUCT_IMAGE_MAX_MB, PRODUCT_IMAGE_TYPES } from '../models/catalog.models';
import { SearchableSelectComponent, SelectOption } from '../../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-category-form-page',
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
        <app-loading-state label="Loading category..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
      } @else {
        <form [formGroup]="form" appFormFeedback (ngSubmit)="submit()">
          <app-section-card [title]="isEdit() ? 'Edit category' : 'New category'">

            <div class="grid-auto">
              <label class="field">
                <span>Name</span>
                <input formControlName="name">
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <small class="error-text">Name is required.</small>
                }
              </label>

              <label class="field">
                <span>Slug</span>
                <input formControlName="slug">
                <small class="hint">Leave empty to derive it from the name.</small>
              </label>

              <label class="field">
                <span>Parent category</span>
                <app-searchable-select
                  formControlName="parentId"
                  [options]="parentSelectOptions()"
                  placeholder="None (top level)"
                  emptyOptionLabel="None (top level)"
                  searchPlaceholder="Search categories…"
                />
              </label>

              <label class="field"><span>Display order</span><input type="number" min="0" formControlName="displayOrder"></label>
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="3"></textarea>
            </label>

            <label class="field">
              <span>Image</span>
              <input type="file" [accept]="acceptTypes" (change)="onImageSelected($event)">
              <small class="hint">JPEG, PNG, WebP or GIF up to {{ maxSizeMb }}MB. Leave empty to keep the current image.</small>
              @if (fileError()) {
                <small class="error-text">{{ fileError() }}</small>
              }
            </label>

            @if (currentImageUrl()) {
              <img class="preview" [src]="currentImageUrl()!" [alt]="form.controls.name.value || 'Category image'">
            }

            <label class="checkbox-field">
              <input type="checkbox" formControlName="isActive">
              <span>Active</span>
            </label>
          </app-section-card>

          <app-section-card title="SEO">
            <div class="grid-auto">
              <label class="field"><span>Meta title</span><input formControlName="metaTitle"></label>
              <label class="field"><span>Meta keywords</span><input formControlName="metaKeywords"></label>
            </div>
            <label class="field field--wide">
              <span>Meta description</span>
              <textarea formControlName="metaDescription" rows="2"></textarea>
            </label>
          </app-section-card>

          @if (saveError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'Category already exists' : 'Unable to save category'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <div class="button-row">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : (isEdit() ? 'Save changes' : 'Create category') }}
            </button>
            <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomCategories">Cancel</a>
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

    .preview {
      max-width: 220px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryFormPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly acceptTypes = PRODUCT_IMAGE_TYPES.join(',');
  readonly maxSizeMb = PRODUCT_IMAGE_MAX_MB;

  readonly id = input<string>();

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly ecommerce = inject(EcommerceService);
  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<ApiError | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly selectedImage = signal<File | null>(null);
  readonly currentImageUrl = signal<string | null>(null);
  readonly categories = signal<CategoryPreview[]>([]);

  readonly isEdit = computed(() => !!this.id());

  /** A category can't be its own parent. */
  readonly parentOptions = computed(() => {
    const currentId = this.id() ? Number(this.id()) : null;
    return this.categories().filter((category) => category.id !== currentId);
  });

  readonly parentSelectOptions = computed<SelectOption<number>[]>(() =>
    this.parentOptions().map((category) => ({ value: category.id, label: category.name }))
  );

  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    slug: '',
    description: '',
    parentId: [null as number | null],
    displayOrder: [null as number | null, [Validators.min(0)]],
    isActive: true,
    metaTitle: '',
    metaDescription: '',
    metaKeywords: ''
  });

  ngOnInit(): void {
    void this.loadCategories();
    void this.reload();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError.set(null);

    if (!file) {
      this.selectedImage.set(null);
      return;
    }

    const problem = validateFile(file, { maxSizeMB: PRODUCT_IMAGE_MAX_MB, allowedTypes: PRODUCT_IMAGE_TYPES });
    if (problem) {
      this.fileError.set(problem);
      this.selectedImage.set(null);
      input.value = '';
      return;
    }

    this.selectedImage.set(file);
  }

  async loadCategories(): Promise<void> {
    try {
      const result = await firstValueFrom(this.ecommerce.getCategories({ page: 0, size: 200, includeInactive: true }));
      this.categories.set(result.items);
    } catch {
      this.categories.set([]);
    }
  }

  async reload(): Promise<void> {
    const categoryId = this.id();
    if (!categoryId) {
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const category = await firstValueFrom(this.ecommerce.getCategory(Number(categoryId)));
      this.form.patchValue({
        name: category.name,
        slug: category.slug ?? '',
        description: category.description ?? '',
        parentId: category.parent?.id ?? category.parentId ?? null,
        displayOrder: category.displayOrder ?? null,
        isActive: category.isActive ?? true,
        metaTitle: category.metaTitle ?? '',
        metaDescription: category.metaDescription ?? '',
        metaKeywords: category.metaKeywords ?? ''
      });
      this.currentImageUrl.set(category.imageUrl ?? null);
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

    const value = this.form.getRawValue();
    const request = {
      name: value.name,
      slug: value.slug || null,
      description: value.description || null,
      parentId: value.parentId,
      displayOrder: value.displayOrder,
      isActive: value.isActive,
      metaTitle: value.metaTitle || null,
      metaDescription: value.metaDescription || null,
      metaKeywords: value.metaKeywords || null
    };

    try {
      const categoryId = this.id();
      const saved = categoryId
        ? await firstValueFrom(this.catalogAdmin.updateCategory(Number(categoryId), request, this.selectedImage()))
        : await firstValueFrom(this.catalogAdmin.createCategory(request, this.selectedImage()));
      await this.router.navigateByUrl(RoutePaths.ecomCategoryDetail(saved.id));
    } catch (error) {
      this.saveError.set(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
