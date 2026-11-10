import { ConfirmService } from '../../../shared/services/confirm.service';
import { NotificationService } from '../../../core/services/notification.service';
import { formatCurrency, roomTitle } from '../../../shared/utils/format.util';
import { startWith } from 'rxjs';
import { LeaseDetail } from '../models/tenant.models';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { MoneyInputDirective } from '../../../shared/directives/money-input.directive';
import { DialogComponent } from '../../../shared/components/dialog/dialog.component';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { displayDate } from '../../../shared/utils/display-date.util';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
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
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-amendment-list-page',
  standalone: true,
  imports: [DialogComponent, MoneyInputDirective, FieldErrorComponent, DateDisplayDirective, CardTableDirective, 
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    ErrorCardComponent,
    PermissionGateComponent,
    EntityPickerComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <div class="list-toolbar">
        <app-permission-gate [permissions]="[Permissions.LEASE_AMENDMENT_CREATE]">
          <button type="button" class="btn btn-primary" (click)="openCreate()">New amendment</button>
        </app-permission-gate>
        <app-filter-panel (clear)="clear()" [form]="form">
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
              <button type="button" class="btn btn-text" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </div>

      <!-- The list leads; a new amendment opens in a sheet over it. -->
      @if (createOpen()) {
        <app-dialog title="New amendment" [subtitle]="leaseSummary()" (closed)="closeCreate()">
          <form id="new-amendment" class="stack" [formGroup]="createForm" appFormFeedback (ngSubmit)="create()">
            <label class="field">
              <span>Lease</span>
              <app-entity-picker [config]="pickers.lease" [required]="true" formControlName="leaseAgreementId" placeholder="Search by tenant or room" />
              <app-field-error [control]="createForm.controls.leaseAgreementId" label="Lease" />
            </label>
            <label class="field">
              <span>What changes</span>
              <select formControlName="amendmentType">
                <option value="RENT_ADJUSTMENT">The rent</option>
                <option value="LEASE_EXTENSION">The end date (extend the lease)</option>
                <option value="TERMS_UPDATE">The terms</option>
                <option value="OCCUPANTS_CHANGE">Who lives there</option>
                <option value="OTHER">Something else</option>
              </select>
            </label>
            <label class="field">
              <span>From</span>
              <input type="date" formControlName="effectiveDate">
              <app-field-error [control]="createForm.controls.effectiveDate" label="From" />
            </label>
            <!-- Only the field the chosen change needs. -->
            @switch (createForm.controls.amendmentType.value) {
              @case ('RENT_ADJUSTMENT') {
                <label class="field">
                  <span>New monthly rent</span>
                  <span class="input-prefix"><span class="input-prefix__unit" aria-hidden="true">KES</span><input appMoneyInput formControlName="newMonthlyRent" aria-label="New monthly rent in KES"></span>
                  <app-field-error [control]="createForm.controls.newMonthlyRent" label="New monthly rent" />
                </label>
              }
              @case ('LEASE_EXTENSION') {
                <label class="field">
                  <span>New end date</span>
                  <input type="date" formControlName="newEndDate">
                  <app-field-error [control]="createForm.controls.newEndDate" label="New end date" />
                </label>
              }
            }
            <label class="field">
              <span>Details</span>
              <textarea formControlName="description" rows="3"></textarea>
            </label>

            @if (effectText(); as effect) {
              <div class="alert alert-info" role="status">
                <strong>What this does</strong>
                <p>{{ effect }}</p>
                <p>Applying it creates a new version of the lease. If the tenant has signed, their signature is cleared and they sign again.</p>
              </div>
            }

            @if (createError(); as apiError) {
              <app-error-card title="Unable to create the amendment" [message]="apiError.message" [details]="apiError.details" />
            }
          </form>
          <div dialog-actions>
            <button type="submit" form="new-amendment" class="btn btn-primary" [disabled]="creating()">
              {{ creating() ? 'Saving...' : 'Save amendment' }}
            </button>
          </div>
        </app-dialog>
      }


      @if (loading()) {
        <app-loading-state label="Loading amendments..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (needsAgency() && !form.controls.leaseAgreementId.value) {
        <app-empty-state title="Select an agency" description="Choose an agency in the switcher to see its amendments." />
      } @else if (amendments().length === 0) {
        <app-empty-state title="No amendments" description="Change a lease's rent, end date or terms with an amendment."
                         [actionLabel]="context.can(Permissions.LEASE_AMENDMENT_CREATE) ? 'New amendment' : null" (action)="openCreate()" />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table appCardTable class="table">
              <thead>
                <tr>
                  <th>Change</th>
                  <th>Tenant</th>
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
                      <a class="record-link__primary" [routerLink]="RoutePaths.amendmentDetail(amendment.id)">{{ changeSummary(amendment) }}</a>
                    </td>
                    <td>
                      @if (amendment.leaseAgreementId) {
                        <a [routerLink]="RoutePaths.leaseDetail(amendment.leaseAgreementId)">{{ whoWhere(amendment) }}</a>
                      } @else {
                        {{ whoWhere(amendment) }}
                      }
                    </td>
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
      gap: var(--space-5);
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .table-shell {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
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
  readonly context = inject(ActiveContextService);

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

  private readonly notifications = inject(NotificationService);
  readonly createOpen = signal(false);
  private readonly chosenLease = signal<LeaseDetail | null>(null);

  openCreate(): void {
    this.createError.set(null);
    this.createOpen.set(true);
  }

  async closeCreate(): Promise<void> {
    if (this.createForm.dirty && !(await this.confirm.ask({
      title: 'Discard this amendment?', message: 'What you have entered will be lost.',
      confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true
    }))) {
      return;
    }
    this.createOpen.set(false);
    this.createForm.markAsPristine();
  }

  readonly leaseSummary = computed(() => {
    const lease = this.chosenLease();
    return lease ? [lease.tenantName, lease.roomName ? roomTitle(lease.roomName) : null, lease.buildingName].filter(Boolean).join(' · ') : null;
  });

  /** The change in one sentence, before it is saved: "From 1 Dec 2026, rent goes from KES 25,000 to KES 27,000." */
  effectText(): string | null {
    const value = this.createForm.getRawValue();
    const lease = this.chosenLease();
    const from = value.effectiveDate ? `From ${displayDate(value.effectiveDate)}, ` : '';
    if (value.amendmentType === 'RENT_ADJUSTMENT' && value.newMonthlyRent) {
      return `${from}rent goes ${lease?.monthlyRent != null ? `from ${formatCurrency(lease.monthlyRent)} ` : ''}to ${formatCurrency(value.newMonthlyRent)} a month.`;
    }
    if (value.amendmentType === 'LEASE_EXTENSION' && value.newEndDate) {
      return `The lease ${lease?.endDate ? `ends ${displayDate(value.newEndDate)} instead of ${displayDate(lease.endDate)}` : `now ends ${displayDate(value.newEndDate)}`}.`;
    }
    return value.description.trim() ? `${from}the lease changes as described above.` : null;
  }

  changeSummary(amendment: LeaseAmendmentPreview): string {
    if (amendment.amendmentType === 'RENT_ADJUSTMENT' && amendment.newMonthlyRent != null) {
      return `Rent to ${formatCurrency(amendment.newMonthlyRent)}`;
    }
    if (amendment.amendmentType === 'LEASE_EXTENSION' && amendment.newEndDate) {
      return `Extended to ${displayDate(amendment.newEndDate)}`;
    }
    return ({ TERMS_UPDATE: 'Terms changed', OCCUPANTS_CHANGE: 'Occupants changed', OTHER: 'Other change' } as Record<string, string>)[amendment.amendmentType ?? ''] ?? 'Change';
  }

  whoWhere(amendment: LeaseAmendmentPreview): string {
    return [amendment.tenantName, amendment.roomName ? roomTitle(amendment.roomName) : null].filter(Boolean).join(' · ') || '-';
  }

  readonly createForm = this.formBuilder.group({
    leaseAgreementId: [null as number | null, [Validators.required, Validators.min(1)]],
    amendmentType: 'RENT_ADJUSTMENT',
    effectiveDate: ['', [Validators.required]],
    newMonthlyRent: [null as number | null, [Validators.min(0)]],
    newEndDate: '',
    description: '',
    termsChanges: ''
  });
  private readonly confirm = inject(ConfirmService);

  constructor() {
    // Follow the agency and building chosen in the shell (§30.5). Skips the
    // first run, which ngOnInit covers after reading the query string.
    let first = true;
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      if (first) {
        first = false;
        return;
      }

      this.form.patchValue({ page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  /** Without an agency in context, only a platform-wide reader can list amendments. */
  readonly needsAgency = computed(() =>
    !this.context.can(PermissionConstants.LEASE_AMENDMENT_READ_ALL) && this.context.agencyId() === null);

  /**
   * One lease when the filter names one, else the narrowest scope the context
   * allows (§30.6). The platform-wide list needs LEASE_AMENDMENT_READ_ALL.
   */
  private scopedQuery(params: AmendmentSearchParams) {
    if (params.leaseAgreementId) {
      return this.tenantsService.getAmendmentsForLease(params.leaseAgreementId, params);
    }

    const agencyId = this.context.agencyId();
    const buildingId = this.context.buildingId();
    if (agencyId !== null && buildingId !== null) {
      return this.tenantsService.getAmendmentsForBuilding(agencyId, buildingId, params);
    }

    if (agencyId !== null) {
      return this.tenantsService.getAmendmentsForAgency(agencyId, params);
    }

    return this.tenantsService.searchAmendments(params);
  }

  ngOnInit(): void {
    // Coming from a lease page — scope both the filter and the create form to it.
    const leaseAgreementId = this.route.snapshot.queryParamMap.get('leaseAgreementId');
    if (leaseAgreementId) {
      this.form.patchValue({ leaseAgreementId: Number(leaseAgreementId) });
      this.createForm.patchValue({ leaseAgreementId: Number(leaseAgreementId) });
      // "Amend lease" on a lease page lands here with the sheet already open for that lease.
      if (this.route.snapshot.queryParamMap.get('new') === '1') {
        this.openCreate();
      }
    }
    // The chosen lease's current terms, so the sheet can say what the change does.
    this.createForm.controls.leaseAgreementId.valueChanges.pipe(startWith(this.createForm.controls.leaseAgreementId.value))
      .subscribe((id) => {
        this.chosenLease.set(null);
        if (id) {
          firstValueFrom(this.tenantsService.getLease(id)).then((lease) => this.chosenLease.set(lease)).catch(() => undefined);
        }
      });

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
    const kind = this.createForm.controls.amendmentType.value;
    const raw = this.createForm.getRawValue();
    // The one field the chosen change needs is required for it.
    if (kind === 'RENT_ADJUSTMENT' && !raw.newMonthlyRent) {
      this.createForm.controls.newMonthlyRent.setErrors({ required: true });
    }
    if (kind === 'LEASE_EXTENSION' && !raw.newEndDate) {
      this.createForm.controls.newEndDate.setErrors({ required: true });
    }
    if ((kind === 'TERMS_UPDATE' || kind === 'OCCUPANTS_CHANGE' || kind === 'OTHER') && !raw.description.trim()) {
      this.createForm.controls.description.setErrors({ required: true });
    }
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
        newMonthlyRent: value.amendmentType === 'RENT_ADJUSTMENT' ? value.newMonthlyRent : null,
        newEndDate: value.amendmentType === 'LEASE_EXTENSION' ? value.newEndDate || null : null,
        // One "Details" box: it is both the summary and the wording of the change.
        description: value.description || null,
        termsChanges: value.description || null
      }));
      this.createForm.markAsPristine();
      this.createOpen.set(false);
      this.notifications.push('success', 'Amendment saved.');

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
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
  }

  async reload(): Promise<void> {
    if (this.needsAgency() && !this.form.controls.leaseAgreementId.value) {
      this.amendments.set([]);
      this.pagination.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as AmendmentSearchParams;

    try {
      const result = await firstValueFrom(this.scopedQuery(params));
      this.amendments.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
