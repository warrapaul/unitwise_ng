import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FilePreviewComponent } from '../../../shared/components/file-preview/file-preview.component';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { validateFile } from '../../../shared/utils/file-validation.util';
import { TenantsService } from '../tenants.service';
import {
  DocumentType,
  TENANT_DOCUMENT_MAX_MB,
  TENANT_DOCUMENT_TYPES,
  TenantDocumentDetail,
  TenantDocumentPreview
} from '../models/tenant.models';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-tenant-document-detail-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    LoadingStateComponent,
    ErrorStateComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    BackLinkComponent,
    FilePreviewComponent,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.tenantDocuments" label="Back" />
      @if (loading()) {
        <app-loading-state label="Loading document..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (document(); as detail) {
        <app-section-card
          [title]="detail.fileName || ('Document #' + detail.id)"
          [subtitle]="detail.tenantName || null"
        >
          <ng-container actions>
            <div class="button-row">
              @if (detail.fileUrl) {
                <a class="btn btn-secondary" [href]="detail.fileUrl" target="_blank" rel="noopener">Open file</a>
              }
              <app-permission-gate [permissions]="[Permissions.TENANT_DOCUMENT_DELETE_ALL, Permissions.TENANT_DOCUMENT_DELETE]">
                @if (deletable(detail)) {
                  <button type="button" class="btn btn-danger" [disabled]="deleting()" (click)="remove(detail)">
                    {{ deleting() ? 'Deleting...' : 'Delete' }}
                  </button>
                }
              </app-permission-gate>
            </div>
          </ng-container>

          <!--
            Two tiers, and the server names which this is. A LIBRARY document
            belongs to the person; a TENANCY one was filed by a landlord and
            is theirs to maintain — the tenant reads and downloads it, and
            keeps their own copy by uploading it to their library, which
            creates a separate row under them.
          -->
          @if (detail.source === 'TENANCY') {
            <p class="hint">
              Filed by {{ detail.uploadedByAgencyName || 'your landlord' }}. You can read and
              download it. To keep your own copy, download it and add it to your documents.
            </p>
          }

          @if (detail.status === 'SUBMITTED') {
            <p class="hint">Submitted for review, so it cannot be deleted until it is rejected.</p>
          }

          @if (detail.isLockedBySnapshot) {
            <p class="hint">Held by {{ detail.activeSnapshotCount ?? 1 }} verification snapshot(s).</p>
          }

          <!-- Show the document, do not just link to it (§28.6). -->

          <app-file-preview

            [url]="detail.fileUrl ?? null"

            [contentType]="detail.mimeType ?? null"

            [label]="detail.fileName || 'Tenant document'"

          />


          <dl class="detail-grid">
            <div>
              <dt>Status</dt>
              <dd><app-status-chip [status]="detail.status" /></dd>
            </div>
            <div><dt>Type</dt><dd>{{ detail.documentType | humanLabel }}</dd></div>
            <div><dt>Version</dt><dd>v{{ detail.versionNumber ?? 1 }}{{ detail.isCurrentVersion ? ' (current)' : '' }}</dd></div>
            <div><dt>MIME type</dt><dd class="mono">{{ detail.mimeType || '-' }}</dd></div>
            <div><dt>Size</dt><dd>{{ formatSize(detail.fileSize) }}</dd></div>
            <div><dt>Submitted</dt><dd>{{ formatDateTime(detail.submittedAt) }}</dd></div>
            <div><dt>Hash</dt><dd class="mono truncate">{{ detail.hashValue || '-' }}</dd></div>
            <div><dt>IPFS CID</dt><dd class="mono truncate">{{ detail.ipfsCid || '-' }}</dd></div>
          </dl>

          @if (detail.rejectionReason) {
            <section class="alert alert-error" role="alert">
              <strong>Rejected</strong>
              <p>{{ detail.rejectionReason }}</p>
            </section>
          }
        </app-section-card>

        <app-section-card title="Review">
          <form [formGroup]="reviewForm" appFormFeedback (ngSubmit)="saveReview()">
            <div class="grid-auto">
              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="DRAFT">Draft</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
              <label class="field">
                <span>Document type</span>
                <select formControlName="documentType">
                  <option value="NATIONAL_ID_FRONT">National ID (front)</option>
                  <option value="NATIONAL_ID_BACK">National ID (back)</option>
                  <option value="PASSPORT">Passport</option>
                  <option value="PROOF_OF_EMPLOYMENT">Proof of employment</option>
                  <option value="UTILITY_BILL">Utility bill</option>
                  <option value="BANK_STATEMENT">Bank statement</option>
                  <option value="REFERENCE_LETTER">Reference letter</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label class="field">
                <span>Rejection reason</span>
                <input formControlName="rejectionReason">
                @if (reviewForm.controls.status.value === 'REJECTED' && !reviewForm.controls.rejectionReason.value) {
                  <small class="error-text">Give the tenant a reason before rejecting.</small>
                }
              </label>
            </div>

            @if (reviewError(); as apiError) {
              <app-error-card title="Unable to update document" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="savingReview()">
                {{ savingReview() ? 'Saving...' : 'Save review' }}
              </button>
            </div>
          </form>
        </app-section-card>

        <!--
          Only the owner replaces a file. A document filed against a tenancy
          is the landlord's record, and the backend refuses the write — so
          offering the form would be an action that always fails.
        -->
        @if (detail.source !== 'TENANCY') {
        <app-section-card title="Replace file">
          <p class="hint">Uploading here creates a new version; the previous version is archived for the audit trail.</p>

          <form [formGroup]="replaceForm" appFormFeedback (ngSubmit)="replaceFile()">
            <div class="grid-auto">
              <label class="field">
                <span>File</span>
                <input type="file" [accept]="acceptDocumentTypes" (change)="onFileSelected($event)">
                <small class="hint">PDF, JPEG, PNG or Word up to {{ maxDocumentMb }}MB.</small>
                @if (fileError()) {
                  <small class="error-text">{{ fileError() }}</small>
                }
              </label>
            </div>

            @if (selectedFile(); as picked) {
              <app-file-preview [file]="picked" />
            }

            @if (replaceError(); as apiError) {
              <app-error-card title="Upload failed" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-secondary" [disabled]="replacing() || !selectedFile()">
                {{ replacing() ? 'Uploading...' : 'Upload new version' }}
              </button>
            </div>
          </form>
        </app-section-card>
        }

        <app-section-card title="Version history">
          @if (versions().length === 0) {
            <p class="muted">No earlier versions.</p>
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Version</th><th>File</th><th>Status</th><th>Submitted</th><th class="actions-col">Actions</th></tr>
                </thead>
                <tbody>
                  @for (version of versions(); track version.id) {
                    <tr>
                      <td>
                        v{{ version.versionNumber ?? 1 }}
                        @if (version.isCurrentVersion) {
                          <span class="status-chip status-chip--info">Current</span>
                        }
                      </td>
                      <td>{{ version.fileName || '-' }}</td>
                      <td><app-status-chip [status]="version.status" /></td>
                      <td>{{ formatDateTime(version.submittedAt) }}</td>
                      <td class="actions-col">
                        @if (version.fileUrl) {
                          <a class="btn btn-secondary btn-sm" [href]="version.fileUrl" target="_blank" rel="noopener">Open</a>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </app-section-card>
      }
    </section>
  `,
  styles: [`
    form {
      display: grid;
      gap: 1.15rem;
    }

    .truncate {
      overflow-wrap: anywhere;
    }

    .actions-col {
      white-space: nowrap;
    }

    p {
      margin: 0;
    }

    .alert p {
      margin: 0.4rem 0 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDocumentDetailPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly acceptDocumentTypes = TENANT_DOCUMENT_TYPES.join(',');
  readonly maxDocumentMb = TENANT_DOCUMENT_MAX_MB;

  readonly id = input.required<string>();

  private readonly confirm = inject(ConfirmService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly document = signal<TenantDocumentDetail | null>(null);
  readonly versions = signal<TenantDocumentPreview[]>([]);
  readonly deleting = signal(false);

  readonly savingReview = signal(false);
  readonly reviewError = signal<ApiError | null>(null);

  readonly replacing = signal(false);
  readonly replaceError = signal<ApiError | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);

  readonly reviewForm = this.formBuilder.group({
    status: 'SUBMITTED',
    documentType: 'OTHER',
    rejectionReason: ''
  });

  readonly replaceForm = this.formBuilder.group({});

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const document = await firstValueFrom(this.tenantsService.getDocument(Number(this.id())));
      this.document.set(document);
      this.reviewForm.patchValue({
        status: document.status ?? 'SUBMITTED',
        documentType: document.documentType ?? 'OTHER',
        rejectionReason: document.rejectionReason ?? ''
      });
      this.versions.set(await firstValueFrom(this.tenantsService.getDocumentVersions(Number(this.id()))));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError.set(null);

    if (!file) {
      this.selectedFile.set(null);
      return;
    }

    const problem = validateFile(file, { maxSizeMB: TENANT_DOCUMENT_MAX_MB, allowedTypes: TENANT_DOCUMENT_TYPES });
    if (problem) {
      this.fileError.set(problem);
      this.selectedFile.set(null);
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
  }

  async saveReview(): Promise<void> {
    const value = this.reviewForm.getRawValue();
    if (value.status === 'REJECTED' && !value.rejectionReason) {
      this.reviewForm.controls.rejectionReason.markAsTouched();
      return;
    }

    this.savingReview.set(true);
    this.reviewError.set(null);

    try {
      this.document.set(await firstValueFrom(this.tenantsService.updateDocument(Number(this.id()), {
        status: value.status as never,
        documentType: value.documentType as never,
        rejectionReason: value.rejectionReason || null
      })));
    } catch (error) {
      this.reviewError.set(toApiError(error));
    } finally {
      this.savingReview.set(false);
    }
  }

  async replaceFile(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.replacing.set(true);
    this.replaceError.set(null);

    try {
      await firstValueFrom(this.tenantsService.replaceDocumentFile(
        Number(this.id()),
        file,
        this.reviewForm.getRawValue().documentType as DocumentType
      ));
      this.selectedFile.set(null);
      await this.reload();
    } catch (error) {
      this.replaceError.set(toApiError(error));
    } finally {
      this.replacing.set(false);
    }
  }

  /**
   * Whether this person may remove the row.
   *
   * Three separate reasons not to offer it, and the button is hidden rather
   * than disabled because a disabled control with no explanation reads as a
   * fault. Each case prints its own line above instead.
   *
   * The backend is the authority — this only avoids offering an action that
   * would be refused.
   */
  deletable(document: TenantDocumentDetail): boolean {
    // Filed by a landlord against a tenancy: theirs to manage, not the tenant's.
    if (document.source === 'TENANCY') {
      return false;
    }

    // Awaiting a landlord's decision; it has to be rejected first.
    if (document.status === 'SUBMITTED') {
      return false;
    }

    // A snapshot holds its own copy, but the live row still anchors it.
    return !document.isLockedBySnapshot;
  }

  async remove(document: TenantDocumentDetail): Promise<void> {
    if (!await this.confirm.ask({
      title: `Delete ${document.fileName || 'this document'}?`,
      confirmLabel: 'Delete',
      destructive: true
    })) {
      return;
    }

    this.deleting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.tenantsService.deleteDocument(document.id));
      await this.router.navigateByUrl(RoutePaths.tenantDocuments);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }


  formatSize(bytes?: number | null): string {
    if (bytes === null || bytes === undefined) {
      return '-';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
}
