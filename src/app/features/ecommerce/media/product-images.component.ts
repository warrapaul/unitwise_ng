import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FileUploadComponent, FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { FileListComponent, FileListItem } from '../../../shared/components/files/file-list/file-list.component';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { CatalogAdminService } from '../catalog-admin.service';
import { PRODUCT_IMAGE_MAX_MB, PRODUCT_IMAGE_TYPES, ProductImage } from '../models/catalog.models';

/**
 * A product's images: the gallery, with upload, "Make primary" and delete for
 * whoever may update products.
 *
 * Shared by the product page — where an admin lands right after creating a
 * product, so images are added in the same place it was made — and the media
 * page. Every action here is saved; nothing only changes the view.
 */
@Component({
  selector: 'app-product-images',
  standalone: true,
  imports: [SectionCardComponent, LoadingStateComponent, ErrorStateComponent, ErrorCardComponent,
    FileUploadComponent, FileListComponent],
  template: `
    <app-section-card title="Images" [subtitle]="canEdit() ? 'The primary image is the one shown in the catalog.' : null">
      @if (loading()) {
        <app-loading-state [compact]="true" label="Loading images..." />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="load()" />
      } @else {
        @if (images().length === 0) {
          <p class="muted">No images yet{{ canEdit() ? ' — add one so the product shows in the catalog.' : '.' }}</p>
        } @else {
          <app-file-list variant="thumbs" [items]="items()">
            <ng-template #actions let-item>
              @if (canEdit()) {
                @if (!item.highlight) {
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === item.id" (click)="makePrimary(imageOf(item))">
                    Make primary
                  </button>
                }
                <button type="button" class="icon-action icon-action--danger" aria-label="Delete image" title="Delete image"
                        [disabled]="busyId() === item.id" (click)="remove(imageOf(item))">
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg>
                </button>
              }
            </ng-template>
          </app-file-list>
        }

        @if (actionError(); as apiError) {
          <app-error-card title="That did not save" [message]="apiError.message" [details]="apiError.details" />
        }

        @if (canEdit()) {
          <app-file-upload label="Add images" [types]="imageTypes" [maxSizeMb]="maxSizeMb" [multiple]="true"
                           uploadLabel="Upload" [send]="upload" />
        }
      }
    </app-section-card>
  `,
  styles: [`p { margin: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductImagesComponent {
  readonly productId = input.required<number>();
  /** After any change, so a page showing the primary elsewhere can refresh it. */
  readonly changed = output<ProductImage[]>();

  readonly imageTypes = PRODUCT_IMAGE_TYPES;
  readonly maxSizeMb = PRODUCT_IMAGE_MAX_MB;

  private readonly catalogAdmin = inject(CatalogAdminService);
  private readonly confirm = inject(ConfirmService);
  private readonly context = inject(ActiveContextService);

  readonly canEdit = computed(() => this.context.can(PermissionConstants.PRODUCT_UPDATE));

  readonly images = signal<ProductImage[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<ApiError | null>(null);
  readonly busyId = signal<number | null>(null);

  /** The gallery as the shared list shows it; the primary is outlined and badged. */
  readonly items = computed<FileListItem[]>(() => this.images().map((image) => ({
    id: image.id,
    name: image.altText || 'Product image',
    url: image.imageUrl,
    badge: image.isPrimary ? 'Primary' : null,
    highlight: !!image.isPrimary
  })));

  constructor() {
    effect(() => {
      this.productId();
      untracked(() => void this.load());
    });
  }

  imageOf(item: FileListItem): ProductImage {
    return this.images().find((image) => image.id === item.id)!;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.images.set(await firstValueFrom(this.catalogAdmin.getProductImages(this.productId())));
    } catch (error) {
      this.loadError.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** One file goes to the single endpoint, a batch to the bulk one; then the list is re-read for the primary. */
  readonly upload: FileUploadSend = async (files) => {
    this.actionError.set(null);
    try {
      if (files.length === 1) {
        await firstValueFrom(this.catalogAdmin.uploadProductImage(this.productId(), files[0]));
      } else {
        await firstValueFrom(this.catalogAdmin.uploadProductImagesBulk(this.productId(), files));
      }
      // Re-read rather than append: the server decides whether the first upload becomes primary.
      await this.load();
      this.changed.emit(this.images());
      return true;
    } catch (error) {
      this.actionError.set(toApiError(error));
      return false;
    }
  };

  async makePrimary(image: ProductImage): Promise<void> {
    this.busyId.set(image.id);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.catalogAdmin.setPrimaryProductImage(this.productId(), image.id));
      this.images.update((images) => images.map((item) => ({ ...item, isPrimary: item.id === image.id })));
      this.changed.emit(this.images());
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(image: ProductImage): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Delete this image?',
      message: image.isPrimary ? 'It is the primary image; pick another as primary afterwards.' : undefined,
      confirmLabel: 'Delete image',
      destructive: true
    })) {
      return;
    }
    this.busyId.set(image.id);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.catalogAdmin.deleteProductImage(this.productId(), image.id));
      this.images.update((images) => images.filter((item) => item.id !== image.id));
      this.changed.emit(this.images());
    } catch (error) {
      this.actionError.set(toApiError(error));
    } finally {
      this.busyId.set(null);
    }
  }
}
