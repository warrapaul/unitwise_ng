import { ChangeDetectionStrategy, Component, OnInit, inject, signal, effect } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { DocumentType, TenantDocumentPreview, TenantDocumentSearchParams } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-tenant-document-list-page',
  standalone: true,
  imports: [
    ContextScopeNoticeComponent,
    ErrorCardComponent,
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    EntityPickerComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="mine() ? 'My documents' : 'Tenant documents'">
        <ng-container actions>
          @if (mine()) {
            <!--
              The upload is only half the job. A document lands as a draft and
              reaches nobody until a grant is approved, so the next step has
              to be on the same screen as the one that produced it.
            -->
            <a class="btn btn-secondary" [routerLink]="RoutePaths.myProfileSharing">Who can see these</a>
          }
          <a class="btn btn-secondary" [routerLink]="mine() ? RoutePaths.tenantDocuments : RoutePaths.myTenantDocuments">
            {{ mine() ? 'All documents' : 'My documents' }}
          </a>
        </ng-container>

        <!--
          The personal library. No tenancy is asked for, and none is needed:
          the document belongs to the person, is versioned against them, and
          reaches no agency until they approve a grant. Upload once, share
          with each landlord in turn.
        -->
        @if (mine()) {
          <form class="stack upload" [formGroup]="uploadForm" appFormFeedback (ngSubmit)="uploadMine()">
              <p class="muted">
                These are yours alone. A new upload is saved as a draft and
                reaches no landlord until you share it, and re-uploading a
                type replaces the copy everyone sees rather than adding
                another. Documents a landlord filed against a tenancy are
                theirs and are not listed here.
              </p>

              <div class="grid-auto">
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
                  <span>File</span>
                  <input type="file" (change)="pickFile($event)" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
                  <small class="hint">PDF or a clear photo. Up to 10MB.</small>
                </label>
              </div>

              @if (uploadError(); as apiError) {
                <app-error-card
                  title="Unable to upload"
                  [message]="apiError.message"
                  [details]="apiError.details"
                />
              }

              <div class="button-row">
                <button type="submit" class="btn btn-primary" [disabled]="!selectedFile() || uploading()">
                  {{ uploading() ? 'Uploading...' : 'Add to my documents' }}
                </button>
              </div>
          </form>
        }

        <app-filter-panel [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']" actions [form]="form">
          @if (!mine()) {
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Tenant name</span><input formControlName="tenantName"></label>
                <label class="field"><span>File name</span><input formControlName="fileName"></label>
                <label class="field">
                  <span>Tenant</span>
                  <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
                </label>
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
                <label class="field">
                  <span>Type</span>
                  <select formControlName="documentType">
                    <option value="">Any</option>
                    <option value="LEASE_AGREEMENT">Lease agreement</option>
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
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Any</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="ARCHIVED">Archived</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </label>
                <label class="field">
                  <span>Version</span>
                  <select formControlName="isCurrentVersion">
                    <option value="">Any</option>
                    <option value="true">Current only</option>
                    <option value="false">Superseded only</option>
                  </select>
                </label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
              </div>
            </form>
          }
        </app-filter-panel>
      </app-section-card>

      <!--
        A list narrowed by the active context looks exactly like a short
        list. Say which it is, next to the results rather than only on the
        filter chip.
      -->
      <app-context-scope-notice noun="documents" />

      <!--
        What landlords have filed about this person. Separate card, because
        it is a different thing with different rules: they can open and
        download these, and nothing else. Only reachable since the tenancy
        read endpoints gained an owner arm.
      -->
      @if (mine() && filedDocuments().length > 0) {
        <app-section-card
          title="Filed by your landlords"
          subtitle="Their record of your tenancy. Read-only — to keep your own copy, download it and add it to your documents."
        >
          <ul class="filed">
            @for (document of filedDocuments(); track document.id) {
              <li class="filed__row">
                <div class="filed__body">
                  <a class="record-link__primary" [routerLink]="RoutePaths.myTenantDocumentDetail(document.id)">
                    {{ document.documentType | humanLabel }}
                  </a>
                  <span class="muted">
                    {{ document.uploadedByAgencyName || document.tenantName || 'Your landlord' }}
                    @if (document.fileName) { · {{ document.fileName }} }
                  </span>
                </div>

                <app-status-chip [status]="document.status" />
              </li>
            }
          </ul>
        </app-section-card>
      }

      @if (loading()) {
        <app-loading-state label="Loading documents..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (documents().length === 0) {
        <app-empty-state title="No documents" description="Documents uploaded by tenants will appear here." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="fileName"
                      label="Document"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Tenant</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="documentType"
                      label="Type"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Version</th>
                  <th>Status</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (document of documents(); track document.id) {
                  <tr [appRowLink]="mine() ? RoutePaths.myTenantDocumentDetail(document.id) : RoutePaths.tenantDocumentDetail(document.id)">
                    <td>
                      <a class="record-link__primary" [routerLink]="mine() ? RoutePaths.myTenantDocumentDetail(document.id) : RoutePaths.tenantDocumentDetail(document.id)">
                        {{ document.fileName || ('Document #' + document.id) }}
                      </a>
                    </td>
                    <td>{{ document.tenantName || document.tenantId || '-' }}</td>
                    <td>{{ document.documentType | humanLabel }}</td>
                    <td>
                      v{{ document.versionNumber ?? 1 }}
                      @if (document.isCurrentVersion) {
                        <span class="status-chip status-chip--info">Current</span>
                      }
                    </td>
                    <td>
                      <div class="chip-row">
                        <app-status-chip [status]="document.status" />
                      </div>
                    </td>
                    <td class="actions-col">
                      @if (document.fileUrl) {
                        <a class="btn btn-secondary btn-sm" [href]="document.fileUrl" target="_blank" rel="noopener">Open</a>
                      }
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
    .filed { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }

    .filed__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 0.6rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }

    .filed__body { display: grid; gap: 0.15rem; min-width: 0; }

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
      align-items: center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantDocumentListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  readonly context = inject(ActiveContextService);
  private readonly route = inject(ActivatedRoute);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly documents = signal<TenantDocumentPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly mine = signal(false);

  readonly selectedFile = signal<File | null>(null);

  /** Documents landlords filed against this person's tenancies. Read-only. */
  readonly filedDocuments = signal<TenantDocumentPreview[]>([]);
  readonly uploading = signal(false);
  readonly uploadError = signal<ApiError | null>(null);

  readonly uploadForm = this.formBuilder.group({
    documentType: 'NATIONAL_ID_FRONT'
  });

  pickFile(event: Event): void {
    this.selectedFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  /**
   * Add to the signed-in person's own library.
   *
   * The owner comes from the token, so there is nothing to choose and
   * nothing to get wrong — and it works before they have any tenancy at all,
   * which is the point of having a library.
   */
  async uploadMine(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.uploading.set(true);
    this.uploadError.set(null);

    try {
      await firstValueFrom(this.tenantsService.uploadMyDocument(
        file,
        this.uploadForm.controls.documentType.value as DocumentType
      ));

      this.selectedFile.set(null);
      this.uploadForm.controls.documentType.setValue('NATIONAL_ID_FRONT');
      await this.reload();
    } catch (error) {
      this.uploadError.set(toApiError(error));
    } finally {
      this.uploading.set(false);
    }
  }


  readonly form = this.formBuilder.group({
    tenantName: '',
    fileName: '',
    tenantId: [null as number | null],
    buildingId: [null as number | null],
    documentType: '',
    status: '',
    isCurrentVersion: '',
    page: 0,
    size: 20,
    sort: 'createdAt',
    direction: 'desc' as 'asc' | 'desc'
  });

  constructor() {
    // Follows the building the operator selected in the shell, so this list is
    // about the building they are working on (§30.5). Clearing it widens back
    // to the whole agency.
    effect(() => {
      const buildingId = this.context.buildingId();
      if (this.form.controls.buildingId.value === buildingId) {
        return;
      }

      this.form.patchValue({ buildingId, page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  ngOnInit(): void {
    this.mine.set(this.route.snapshot.data['mine'] === true);
    void this.reload();

    if (this.mine()) {
      void this.loadFiledDocuments();
    }
  }

  /**
   * Fetch each tenancy's documents and pool them.
   *
   * Failures are swallowed per tenancy: this is an addition to the page, and
   * one landlord's records being unreachable must not take the person's own
   * library down with it.
   */
  private async loadFiledDocuments(): Promise<void> {
    try {
      const tenancies = await firstValueFrom(this.tenantsService.getMyTenantProfiles());

      const pending = tenancies
        .filter((tenancy) => tenancy.agencyId && tenancy.buildingId)
        // A page each. Anyone with more than 100 documents on one tenancy is
        // past what this card is for, and the full list is a click away.
        .map((tenancy) => firstValueFrom(
          this.tenantsService.getDocumentsForTenant(
            tenancy.agencyId!, tenancy.buildingId!, tenancy.id, { size: 100 })
        ).then((page) => page.items ?? []).catch(() => [] as TenantDocumentPreview[]));

      const results = await Promise.all(pending);
      this.filedDocuments.set(results.flat());
    } catch {
      this.filedDocuments.set([]);
    }
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      tenantName: '',
      fileName: '',
      tenantId: null,
      buildingId: null,
      documentType: '',
      status: '',
      isCurrentVersion: '',
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'createdAt',
      direction: 'desc'
    });
    await this.reload();
  }

  async previousPage(): Promise<void> {
    const current = this.pagination()?.page ?? 0;
    if (current <= 0) {
      return;
    }

    this.form.patchValue({ page: current - 1 });
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.form.patchValue({ page: pagination.page + 1 });
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.form.patchValue({ size, page: 0 });
    await this.reload();
  }


  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as TenantDocumentSearchParams;

    try {
      const result = this.mine()
        ? await firstValueFrom(this.tenantsService.getMyDocuments({ page: params.page, size: params.size }))
        : await firstValueFrom(this.tenantsService.searchTenantDocuments(params));
      this.documents.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
