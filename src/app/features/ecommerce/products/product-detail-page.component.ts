import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { EcommerceService } from '../ecommerce.service';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { CatalogAdminService } from '../catalog-admin.service';
import { ProductVariantDetail } from '../models/catalog.models';
import { ProductDetail } from '../models/ecommerce.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { DetailGroupComponent } from '../../../shared/components/detail-group/detail-group.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

interface ProductImageView {
  id?: number | null;
  url?: string | null;
  altText?: string | null;
  isPrimary?: boolean;
}

@Component({
  selector: 'app-product-detail-page',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, SectionCardComponent, PermissionGateComponent, ErrorCardComponent, BackLinkComponent,
    HumanLabelPipe,
    DetailGroupComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="'/admin/ecommerce/products'" label="Back to products" [title]="product()?.name || null" />
      @if (loading()) {
        <app-loading-state label="Loading product..." />
      } @else if (error()) {
        <app-error-state [message]="error() || 'Unable to load product'" (retry)="reload()" />
      } @else if (product()) {
        <app-section-card [title]="product()?.name || 'Product detail'" [subtitle]="product()?.sku || null">
          <ng-container actions>
            <div class="detail-actions">
              <app-permission-gate [permissions]="[Permissions.PRODUCT_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomProductEdit(productId())">Edit</a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.PRODUCT_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomProductMedia(productId())">Media</a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.PRODUCT_UPDATE]">
                <a class="btn btn-secondary" [routerLink]="RoutePaths.ecomProductDiscounts(productId())">Discounts</a>
              </app-permission-gate>
              <app-permission-gate [permissions]="[Permissions.PRODUCT_DELETE]">
                <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove()">
                  {{ deleting() ? 'Deleting...' : 'Delete' }}
                </button>
              </app-permission-gate>
              <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
            </div>
          </ng-container>

          @if (actionError(); as apiError) {
            <app-error-card
              [title]="apiError.status === 409 ? 'This product is referenced elsewhere' : 'Unable to delete the product'"
              [message]="apiError.message"
              [details]="apiError.details"
            />
          }

          <!--
            Four nested panel/subcard articles became four groups. The cards
            implied a level of structure the contents did not have — every one
            of them was a plain list of fields — and they made a product parse
            differently from every other record in the app.
          -->
          @if (product()?.shortDescription) {
            <p class="muted">{{ product()?.shortDescription }}</p>
          }

          <div class="detail-groups">
            <app-detail-group label="Overview">
              <div class="lead">
                <dt>Selling price</dt>
                <dd>{{ formatMoney(product()?.sellingPrice) }}</dd>
              </div>
              <div class="lead">
                <dt>Status</dt>
                <dd>{{ product()?.status | humanLabel }}</dd>
              </div>
              <div><dt>List price</dt><dd>{{ formatMoney(product()?.price) }}</dd></div>
              <div><dt>Featured</dt><dd>{{ product()?.isFeatured ? 'Yes' : 'No' }}</dd></div>
              <div><dt>Has variants</dt><dd>{{ product()?.hasVariants ? 'Yes' : 'No' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Stock">
              <div class="lead">
                <dt>Availability</dt>
                <dd>
                  <span class="status-chip" [class.status-chip--danger]="isOutOfStock()" [class.status-chip--success]="!isOutOfStock()">
                    {{ isOutOfStock() ? 'Out of stock' : 'In stock' }}
                  </span>
                </dd>
              </div>
              <div><dt>Quantity</dt><dd>{{ product()?.inventory?.quantity ?? product()?.availableQuantity ?? 0 }}</dd></div>
              @if (product()?.inventory) {
                <div><dt>Reserved</dt><dd>{{ product()?.inventory?.quantityReserved ?? '-' }}</dd></div>
                <div><dt>Allow backorder</dt><dd>{{ product()?.inventory?.allowBackorder ? 'Yes' : 'No' }}</dd></div>
              }
            </app-detail-group>

            <app-detail-group label="Pricing">
              <div><dt>Compare at</dt><dd>{{ formatMoney(product()?.compareAtPrice) }}</dd></div>
              <div><dt>Lowest variant</dt><dd>{{ formatMoney(product()?.minVariantPrice) }}</dd></div>
              <div><dt>Highest variant</dt><dd>{{ formatMoney(product()?.maxVariantPrice) }}</dd></div>
              <div><dt>Display order</dt><dd>{{ product()?.displayOrder ?? '-' }}</dd></div>
            </app-detail-group>

            <app-detail-group label="Identifiers">
              <div><dt>SKU</dt><dd class="mono">{{ product()?.sku || '-' }}</dd></div>
              <div><dt>UPC</dt><dd class="mono">{{ product()?.upc || '-' }}</dd></div>
              <div><dt>Slug</dt><dd class="mono">{{ product()?.slug || '-' }}</dd></div>
              <div>
                <dt>Category</dt>
                <dd>
                  @if (product()?.categoryId; as categoryId) {
                    <a [routerLink]="RoutePaths.ecomCategoryDetail(categoryId)">Category #{{ categoryId }}</a>
                  } @else {
                    -
                  }
                </dd>
              </div>
            </app-detail-group>
          </div>

          @if (product()?.description) {
            <p class="muted description">{{ product()?.description }}</p>
          }

          @if (product()?.tags?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Tags</p>
              <div class="tag-row">
                @for (tag of product()?.tags || []; track tag.id ?? tag.slug) {
                  <span class="pill">{{ tag.name || tag.slug }}</span>
                }
              </div>
            </article>
          }

          @if (product()?.images?.length || product()?.primaryImageUrl) {
            <article class="panel subcard">
              <p class="eyebrow">Images</p>
              <div class="image-row">
                @for (image of visibleImages(); track image.id ?? image.url) {
                  <div class="image-card">
                    <img [src]="image.url || ''" [alt]="image.altText || product()?.name || 'Product image'" />
                    <div class="image-card__meta">
                      <span class="status-chip" [class.status-chip--info]="image.isPrimary" [class.status-chip--neutral]="!image.isPrimary">
                        {{ image.isPrimary ? 'Primary' : 'Additional' }}
                      </span>
                      <div class="image-actions">
                        <button
                          type="button"
                          class="icon-action"
                          aria-label="Edit image"
                          title="Edit image"
                          (click)="editImage(image)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-edit" /></svg></button>
                        <button
                          type="button"
                          class="icon-action icon-action--danger"
                          aria-label="Remove image"
                          title="Remove image"
                          (click)="removeImage(image)"
                        ><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg></button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </article>
          }

          @if (product()?.variants?.length) {
            <article class="panel subcard">
              <p class="eyebrow">Variants</p>
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Display</th>
                      <th>SKU</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (variant of product()?.variants || []; track variant.id ?? variant.sku) {
                      <tr>
                        <td>{{ variantLabel(variant) }}</td>
                        <td>{{ variant.sku || '-' }}</td>
                        <td>{{ formatMoney(variant.effectivePrice) }}</td>
                        <td>{{ variant.isInStock ? 'In stock' : 'Out of stock' }}</td>
                        <td>{{ variant.availableQuantity ?? '-' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </article>
          }
        </app-section-card>
      } @else {
        <app-empty-state title="No product selected" description="Choose a product from the list to view its details." />
      }
    </section>
  `,
  styles: [`
    .detail-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
    }

    .subcard {
      padding: 1rem;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
    }

    .meta-grid div,
    .stack.compact div {
      display: grid;
      gap: 0.15rem;
    }

    .description {
      white-space: pre-wrap;
    }

    .tag-row,
    .image-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .image-card {
      width: 160px;
      display: grid;
      gap: 0.4rem;
    }

    .image-card img {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: var(--surface-2);
    }

    .image-card__meta {
      display: grid;
      gap: 0.4rem;
    }

    .image-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .btn-sm {
      padding: 0.55rem 0.8rem;
      font-size: 0.85rem;
    }

    .table-scroll {
      overflow: auto;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ecommerceService = inject(EcommerceService);
  private readonly catalogAdmin = inject(CatalogAdminService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly deleting = signal(false);

  /** A rejected delete, shown on the page rather than replacing it (§31.2). */
  readonly actionError = signal<ApiError | null>(null);
  readonly product = signal<ProductDetail | null>(null);
  readonly productId = computed(() => this.product()?.id ?? this.route.snapshot.paramMap.get('id') ?? '');
  readonly visibleImages = signal<ProductImageView[]>([]);

  async ngOnInit(): Promise<void> {
    void this.load();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  /**
   * Destructive actions live on the detail page, never inline on the listing —
   * the operator has to open the record and see what they are removing first
   * (skills §28.4).
   */
  async remove(): Promise<void> {
    const product = this.product();
    if (!product || !await this.confirm.ask({
      title: `Delete the product "${product.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.actionError.set(null);

    try {
      await firstValueFrom(this.catalogAdmin.deleteProduct(product.id));
      await this.router.navigateByUrl(RoutePaths.ecomProducts);
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.deleting.set(false);
    }
  }

  private async load(): Promise<void> {
    const productId = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isNaN(productId)) {
      this.error.set('Invalid product id');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const product = await firstValueFrom(this.ecommerceService.getProduct(productId));
      this.product.set(product);
      this.visibleImages.set(this.buildImageGallery(product));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  variantLabel(variant: ProductVariantDetail): string {
    const parts = [variant.color, variant.size, variant.material].filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(' / ') : (variant.sku || '-');
  }

  formatMoney(value?: number | string | null): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const numeric = Number(value);
    return Number.isNaN(numeric) ? String(value) : numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  isOutOfStock(): boolean {
    const inventoryQuantity = this.product()?.inventory?.quantity;
    const availableQuantity = this.product()?.availableQuantity;
    const quantity = typeof inventoryQuantity === 'number' ? inventoryQuantity : Number(availableQuantity ?? 0);
    return quantity <= 0;
  }

  async editImage(image: ProductImageView): Promise<void> {
    const currentValue = image.altText || '';
    const updatedValue = window.prompt('Update image alt text', currentValue);
    if (updatedValue === null) {
      return;
    }

    this.visibleImages.update((images) =>
      images.map((item) => (item.id === image.id && item.url === image.url ? { ...item, altText: updatedValue.trim() || item.altText } : item))
    );
  }

  async removeImage(image: ProductImageView): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Remove this image from the gallery view?',
      confirmLabel: 'Remove',
      destructive: true
    })) {
      return;
    }

    this.visibleImages.update((images) => images.filter((item) => !(item.id === image.id && item.url === image.url)));
  }

  private buildImageGallery(product: ProductDetail): ProductImageView[] {
    const images: ProductImageView[] = (product.images ?? []).map((image) => ({
      id: image.id,
      url: image.imageUrl ?? null,
      altText: image.altText ?? null,
      isPrimary: image.isPrimary
    }));

    if (product.primaryImageUrl && !images.some((image) => image.url === product.primaryImageUrl)) {
      images.unshift({
        id: null,
        url: product.primaryImageUrl,
        altText: product.name || 'Product image',
        isPrimary: true
      });
    }

    return images;
  }

}
