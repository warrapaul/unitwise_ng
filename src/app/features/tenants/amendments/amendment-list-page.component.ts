import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { AmendmentSearchParams, LeaseAmendmentPreview } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-amendment-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    EntityPickerComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Lease amendments">
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Lease number</span><input formControlName="leaseNumber"></label>
              <label class="field"><span>Tenant name</span><input formControlName="tenantName"></label>
              <label class="field">
                <span>Lease</span>
                <app-entity-picker [config]="pickers.lease" formControlName="leaseAgreementId" placeholder="Any lease" />
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="amendmentType">
                  <option value="">Any</option>
                  <option value="RENT_ADJUSTMENT">Rent adjustment</option>
                  <option value="LEASE_EXTENSION">Lease extension</option>
                  <option value="TERMS_UPDATE">Terms update</option>
                  <option value="OCCUPANTS_CHANGE">Occupants change</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="">Any</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING_APPROVAL">Pending approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      <app-permission-gate [permissions]="[Permissions.LEASE_AMENDMENT_CREATE]">
        <app-section-card title="New amendment">
          <form [formGroup]="createForm" appFormFeedback (ngSubmit)="create()">
            <div class="grid-auto">
              <label class="field">
                <span>Lease ID</span>
                <app-entity-picker [config]="pickers.lease" [required]="true" formControlName="leaseAgreementId" placeholder="Search for the lease" />
                @if (createForm.controls.leaseAgreementId.invalid && createForm.controls.leaseAgreementId.touched) {
                  <small class="error-text">A lease ID is required.</small>
                }
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="amendmentType">
                  <option value="RENT_ADJUSTMENT">Rent adjustment</option>
                  <option value="LEASE_EXTENSION">Lease extension</option>
                  <option value="TERMS_UPDATE">Terms update</option>
                  <option value="OCCUPANTS_CHANGE">Occupants change</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label class="field">
                <span>Effective date</span>
                <input type="date" formControlName="effectiveDate">
                @if (createForm.controls.effectiveDate.invalid && createForm.controls.effectiveDate.touched) {
                  <small class="error-text">An effective date is required.</small>
                }
              </label>
              <label class="field"><span>New monthly rent</span><input type="number" step="0.01" min="0" formControlName="newMonthlyRent"></label>
              <label class="field"><span>New end date</span><input type="date" formControlName="newEndDate"></label>
            </div>

            <label class="field field--wide">
              <span>Description</span>
              <textarea formControlName="description" rows="2"></textarea>
            </label>

            <label class="field field--wide">
              <span>Terms changes</span>
              <textarea formControlName="termsChanges" rows="3"></textarea>
            </label>

            @if (createError(); as apiError) {
              <app-error-card title="Unable to create amendment" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="creating()">
                {{ creating() ? 'Creating...' : 'Create amendment' }}
              </button>
            </div>
          </form>
        </app-section-card>
      </app-permission-gate>

      @if (loading()) {
        <app-loading-state label="Loading amendments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (amendments().length === 0) {
        <app-empty-state title="No amendments" description="Amendments will appear here once a lease is changed." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="amendmentNumber"
                      label="Amendment"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Lease</th>
                  <th>Type</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="effectiveDate"
                      label="Effective"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (amendment of amendments(); track amendment.id) {
                  <tr [appRowLink]="RoutePaths.amendmentDetail(amendment.id)">
                    <td>
                      <a class="record-link__primary" [routerLink]="RoutePaths.amendmentDetail(amendment.id)">
                        #{{ amendment.amendmentNumber ?? amendment.id }}
                      </a>
                    </td>
                    <td>
                      @if (amendment.leaseAgreementId) {
                        <a [routerLink]="RoutePaths.leaseDetail(amendment.leaseAgreementId)">
                          {{ amendment.leaseNumber || amendment.leaseAgreementId }}
                        </a>
                      } @else {
                        -
                      }
                    </td>
                    <td>{{ amendment.amendmentType | humanLabel }}</td>
                    <td>{{ formatDate(amendment.effectiveDate) }}</td>
                    <td><app-status-chip [status]="amendment.status" /></td>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AmendmentListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;
  readonly pickers = inject(EntityPickerRegistry);

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  private readonly route = inject(ActivatedRoute);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('effectiveDate', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly amendments = signal<LeaseAmendmentPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly creating = signal(false);
  readonly createError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    leaseNumber: '',
    tenantName: '',
    leaseAgreementId: [null as number | null],
    amendmentType: '',
    status: '',
    page: 0,
    size: 20,
    sort: 'effectiveDate',
    direction: 'desc' as 'asc' | 'desc'
  });

  readonly createForm = this.formBuilder.group({
    leaseAgreementId: [null as number | null, [Validators.required, Validators.min(1)]],
    amendmentType: 'RENT_ADJUSTMENT',
    effectiveDate: ['', [Validators.required]],
    newMonthlyRent: [null as number | null, [Validators.min(0)]],
    newEndDate: '',
    description: '',
    termsChanges: ''
  });

  ngOnInit(): void {
    // Coming from a lease page — scope both the filter and the create form to it.
    const leaseAgreementId = this.route.snapshot.queryParamMap.get('leaseAgreementId');
    if (leaseAgreementId) {
      this.form.patchValue({ leaseAgreementId: Number(leaseAgreementId) });
      this.createForm.patchValue({ leaseAgreementId: Number(leaseAgreementId) });
    }

    void this.reload();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      leaseNumber: '',
      tenantName: '',
      leaseAgreementId: null,
      amendmentType: '',
      status: '',
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'effectiveDate',
      direction: 'desc'
    });
    await this.reload();
  }

  async create(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.creating.set(true);
    this.createError.set(null);

    const value = this.createForm.getRawValue();

    try {
      await firstValueFrom(this.tenantsService.createAmendment({
        leaseAgreementId: value.leaseAgreementId!,
        amendmentType: value.amendmentType as never,
        effectiveDate: value.effectiveDate,
        newMonthlyRent: value.newMonthlyRent,
        newEndDate: value.newEndDate || null,
        description: value.description || null,
        termsChanges: value.termsChanges || null
      }));

      this.createForm.patchValue({
        newMonthlyRent: null,
        newEndDate: '',
        description: '',
        termsChanges: ''
      });
      await this.reload();
    } catch (error) {
      this.createError.set(toApiError(error));
    } finally {
      this.creating.set(false);
    }
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

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as AmendmentSearchParams;

    try {
      const result = params.leaseAgreementId
        ? await firstValueFrom(this.tenantsService.getAmendmentsForLease(params.leaseAgreementId, params))
        : await firstValueFrom(this.tenantsService.searchAmendments(params));
      this.amendments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
