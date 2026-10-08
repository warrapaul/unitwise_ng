import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { FileListComponent, FileListItem } from '../../../shared/components/files/file-list/file-list.component';
import { FileUploadComponent, FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, toApiError } from '../../../shared/utils/error-message.util';
import { humanizeLabel } from '../../../shared/pipes/human-label.pipe';
import { TenantsService } from '../tenants.service';
import { DocumentType, TENANT_DOCUMENT_MAX_MB, TENANT_DOCUMENT_TYPES, TenantDocumentPreview } from '../models/tenant.models';

const TYPE_OPTIONS: readonly { value: DocumentType; label: string }[] = [
  { value: 'NATIONAL_ID_FRONT', label: 'National ID (front)' },
  { value: 'NATIONAL_ID_BACK', label: 'National ID (back)' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'PROOF_OF_EMPLOYMENT', label: 'Proof of employment' },
  { value: 'UTILITY_BILL', label: 'Utility bill' },
  { value: 'BANK_STATEMENT', label: 'Bank statement' },
  { value: 'REFERENCE_LETTER', label: 'Reference letter' },
  { value: 'OTHER', label: 'Other' }
];

/**
 * The person's documents, inside their renter profile: a grid of tiles named by
 * what each document *is* (National ID, Passport) — never the file name, which
 * says nothing and often more than it should. A tile previews the file; Open,
 * Details and Delete sit under it. Only the current version of each shows;
 * older ones stay on the document's own page.
 *
 * What landlords filed against a tenancy follows, read-only, in the same grid.
 */
@Component({
  selector: 'app-my-documents-panel',
  standalone: true,
  imports: [SectionCardComponent, DialogComponent, ErrorCardComponent, FileListComponent, FileUploadComponent],
  template: `
    <app-section-card title="Your documents" subtitle="Shared only with landlords you approve. Preview any document right here.">
      <ng-container actions>
        <button type="button" class="btn btn-primary btn-sm" (click)="openUpload()">Add a document</button>
      </ng-container>

      @if (loadError()) {
        <p class="error-text">Your documents could not be loaded. <button type="button" class="link-button" (click)="load()">Try again</button></p>
      } @else {
        <app-file-list [items]="mine()" [replace]="editing() ? replaceDocument : null" [replaceTypes]="fileTypes" [replaceMaxSizeMb]="maxMb"
                       emptyLabel="Nothing uploaded yet — add your ID so landlords can verify you.">
          <ng-template #actions let-item>
            @if (item.url) {
              <a class="icon-action" [href]="item.url" target="_blank" rel="noopener" [attr.aria-label]="'Open ' + item.name" title="Open in a new tab">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-view" /></svg>
              </a>
            }
            <button type="button" class="icon-action icon-action--danger" [disabled]="deletingId() === item.id"
                    (click)="remove(item)" [attr.aria-label]="'Delete ' + item.name" title="Delete">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-trash" /></svg>
            </button>
          </ng-template>
        </app-file-list>
      }
      @if (deleteError(); as apiError) {
        <app-error-card title="Not deleted" [message]="apiError.message" [details]="apiError.details" />
      }

      @if (filed().length > 0) {
        <h3 class="panel-title">From your landlords</h3>
        <p class="muted small">Their record of your tenancy. Read-only — to keep your own copy, open it and add it above.</p>
        <app-file-list [items]="filed()">
          <ng-template #actions let-item>
            @if (item.url) {
              <a class="icon-action" [href]="item.url" target="_blank" rel="noopener" [attr.aria-label]="'Open ' + item.name" title="Open in a new tab">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#act-view" /></svg>
              </a>
            }
          </ng-template>
        </app-file-list>
      }
    </app-section-card>

    @if (uploading()) {
      <app-dialog title="Add a document" subtitle="Saved to your profile; no landlord sees it until you share your profile."
                  (closed)="uploading.set(false)">
        <div class="stack">
          <label class="field">
            <span>What is it?</span>
            <select [value]="documentType()" (change)="documentType.set($any($event.target).value)">
              @for (option of typeOptions(); track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
            @if (replacing()) { <small class="hint">You already have one — this becomes the new version, and the old one is kept.</small> }
          </label>
          <app-file-upload [types]="fileTypes" [maxSizeMb]="maxMb" uploadLabel="Upload" [send]="upload" />
          @if (uploadError(); as apiError) {
            <app-error-card title="Unable to upload" [message]="apiError.message" [details]="apiError.details" />
          }
        </div>
      </app-dialog>
    }
  `,
  styles: [`
    /* A block, not contents: in the profile's grid the card and its dialog must stay one grid item. */
    :host { display: block; min-width: 0; }
    .panel-title { margin: 0.75rem 0 0; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .small { margin: 0; font-size: 0.85rem; }
    .error-text { margin: 0; }
    .link-button { padding: 0; border: 0; background: none; font: inherit; font-weight: 600; color: var(--primary-strong); cursor: pointer; text-decoration: underline; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyDocumentsPanelComponent implements OnInit {
  readonly fileTypes = TENANT_DOCUMENT_TYPES;
  readonly maxMb = TENANT_DOCUMENT_MAX_MB;

  /** On the edit page each document also offers Replace: a new version of the same type. */
  readonly editing = input(false);

  private readonly tenants = inject(TenantsService);
  private readonly confirm = inject(ConfirmService);

  private readonly documents = signal<TenantDocumentPreview[]>([]);
  private readonly filedDocuments = signal<TenantDocumentPreview[]>([]);
  readonly loadError = signal(false);
  readonly uploading = signal(false);
  readonly uploadError = signal<ApiError | null>(null);
  readonly deleteError = signal<ApiError | null>(null);
  readonly deletingId = signal<string | number | null>(null);
  readonly documentType = signal<DocumentType>('NATIONAL_ID_FRONT');

  /** Current versions only, one tile per document: its type, version and state — no file name. */
  readonly mine = computed<FileListItem[]>(() => this.documents()
    .filter((document) => document.isCurrentVersion !== false)
    .map((document) => ({
      id: document.id,
      name: humanizeLabel(document.documentType, 'Document'),
      meta: [`v${document.versionNumber ?? 1}`, document.status ? humanizeLabel(document.status) : null].filter(Boolean).join(' · '),
      url: document.fileUrl,
      contentType: null,
      link: RoutePaths.myTenantDocumentDetail(document.id),
      replaceable: true
    })));

  readonly filed = computed<FileListItem[]>(() => this.filedDocuments()
    .filter((document) => document.isCurrentVersion !== false)
    .map((document) => ({
      id: `filed-${document.id}`,
      name: humanizeLabel(document.documentType, 'Document'),
      meta: document.uploadedByAgencyName || 'Your landlord',
      url: document.fileUrl,
      contentType: null,
      link: RoutePaths.myTenantDocumentDetail(document.id)
    })));

  /** Every type, the ones not yet held first; Other can always be added again. */
  readonly typeOptions = computed(() => {
    const held = new Set(this.documents().map((document) => document.documentType));
    return [...TYPE_OPTIONS].sort((a, b) => Number(held.has(a.value) && a.value !== 'OTHER') - Number(held.has(b.value) && b.value !== 'OTHER'));
  });

  readonly replacing = computed(() => this.documentType() !== 'OTHER'
    && this.documents().some((document) => document.documentType === this.documentType() && document.isCurrentVersion !== false));

  ngOnInit(): void {
    void this.load();
    void this.loadFiled();
  }

  async load(): Promise<void> {
    this.loadError.set(false);
    try {
      const page = await firstValueFrom(this.tenants.getMyDocuments({ size: 100 }));
      this.documents.set(page.items ?? []);
    } catch {
      this.loadError.set(true);
    }
  }

  /** Each tenancy's filed documents, pooled; one landlord's records failing does not hide the rest. */
  private async loadFiled(): Promise<void> {
    try {
      const tenancies = await firstValueFrom(this.tenants.getMyTenantProfiles());
      const pages = await Promise.all(tenancies
        .filter((tenancy) => tenancy.agencyId && tenancy.buildingId)
        .map((tenancy) => firstValueFrom(this.tenants.getDocumentsForTenant(tenancy.agencyId!, tenancy.buildingId!, tenancy.id, { size: 100 }))
          .then((page) => page.items ?? [])
          .catch(() => [] as TenantDocumentPreview[])));
      this.filedDocuments.set(pages.flat());
    } catch {
      this.filedDocuments.set([]);
    }
  }

  openUpload(): void {
    this.uploadError.set(null);
    this.documentType.set(this.typeOptions()[0]?.value ?? 'OTHER');
    this.uploading.set(true);
  }

  readonly upload: FileUploadSend = async ([file]) => {
    this.uploadError.set(null);
    try {
      await firstValueFrom(this.tenants.uploadMyDocument(file, this.documentType()));
      await this.load();
      this.uploading.set(false);
      return true;
    } catch (error) {
      this.uploadError.set(toApiError(error));
      return false;
    }
  };

  /** A new upload of the same type; the server keeps the old one as an earlier version. */
  readonly replaceDocument = async (item: FileListItem, file: File): Promise<boolean> => {
    const documentType = this.documents().find((document) => document.id === item.id)?.documentType;
    if (!documentType) {
      return false;
    }
    this.uploadError.set(null);
    try {
      await firstValueFrom(this.tenants.uploadMyDocument(file, documentType));
      await this.load();
      return true;
    } catch (error) {
      this.deleteError.set(toApiError(error));
      return false;
    }
  };

  async remove(item: FileListItem): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete your ${item.name.toLowerCase()}?`,
      message: 'Agencies you share with will no longer see it. One that already verified you keeps its own record.',
      confirmLabel: 'Delete document',
      destructive: true
    })) {
      return;
    }
    this.deletingId.set(item.id);
    this.deleteError.set(null);
    try {
      await firstValueFrom(this.tenants.deleteDocument(Number(item.id)));
      await this.load();
    } catch (error) {
      this.deleteError.set(toApiError(error));
    } finally {
      this.deletingId.set(null);
    }
  }
}
