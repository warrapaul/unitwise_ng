import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, effect } from '@angular/core';
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
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { LEASE_SORTABLE_FIELDS, LeasePreview, LeaseSearchParams } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type LeaseSortField = typeof LEASE_SORTABLE_FIELDS[number];

@Component({
  selector: 'app-lease-list-page',
  standalone: true,
  imports: [
    ContextScopeNoticeComponent,
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
      <app-section-card [title]="mine() ? 'My leases' : 'Lease agreements'">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="mine() ? RoutePaths.leases : RoutePaths.myLeases">
            {{ mine() ? 'All leases' : 'My leases' }}
          </a>
        </ng-container>

        <app-filter-panel (clear)="clear()" [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']" actions [form]="form">
          @if (!mine()) {
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Lease number</span><input formControlName="leaseNumber"></label>
                <label class="field"><span>Tenant name</span><input formControlName="tenantName"></label>
                <label class="field">
                  <span>Tenant</span>
                  <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
                </label>
                @if (canChooseBuilding()) {
                  <label class="field">
                    <span>Building</span>
                    <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                  </label>
                }
                <label class="field"><span>Room name</span><input formControlName="roomName"></label>
                <!--
                  LeaseAgreementSearchReq has no status field, so this select
                  narrowed nothing (§28.12). Restore it when the DTO grows one —
                  it is the filter this table wants most.
                -->
                <label class="field"><span>Ends from</span><input type="date" formControlName="endDateFrom"></label>
                <label class="field"><span>Ends to</span><input type="date" formControlName="endDateTo"></label>
                <label class="field"><span>Starts from</span><input type="date" formControlName="startDateFrom"></label>
                <label class="field"><span>Starts to</span><input type="date" formControlName="startDateTo"></label>
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
      <app-context-scope-notice noun="leases" />

      @if (loading()) {
        <app-loading-state label="Loading leases..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (needsAgency()) {
        <app-empty-state title="Select an agency" description="Choose an agency in the switcher to see its leases." />
      } @else if (leases().length === 0) {
        <app-empty-state title="No leases yet" description="Generate a lease from a verified tenant to get started." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="leaseNumber"
                      label="Lease"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Tenant</th>
                  <th>Room</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="startDate"
                      label="Term"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Rent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (lease of leases(); track lease.id) {
                  <tr [appRowLink]="mine() ? RoutePaths.myLeaseDetail(lease.id) : RoutePaths.leaseDetail(lease.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="mine() ? RoutePaths.myLeaseDetail(lease.id) : RoutePaths.leaseDetail(lease.id)">
                          {{ lease.leaseNumber || ('Lease #' + lease.id) }}
                        </a>
                        <span class="muted">{{ lease.leaseType | humanLabel }}</span>
                      </div>
                    </td>
                    <td>{{ lease.tenantName || '-' }}</td>
                    <td>{{ lease.roomName || lease.roomNumber || '-' }}</td>
                    <td>{{ formatDate(lease.startDate) }} — {{ formatDate(lease.endDate) }}</td>
                    <td>{{ lease.monthlyRent ?? '-' }}</td>
                    <td><app-status-chip [status]="lease.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="leases().length"
            [total]="pagination()?.totalElements ?? leases().length"
            noun="leases"
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
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaseListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  readonly context = inject(ActiveContextService);
  private readonly route = inject(ActivatedRoute);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('startDate', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly leases = signal<LeasePreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly mine = signal(false);

  readonly form = this.formBuilder.group({
    leaseNumber: '',
    tenantName: '',
    tenantId: [null as number | null],
    buildingId: [null as number | null],
    roomName: '',
    startDateFrom: '',
    startDateTo: '',
    endDateFrom: '',
    endDateTo: '',
    page: 0,
    size: 20,
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

    // Coming from a tenant page — scope the list to that tenant.
    const tenantId = this.route.snapshot.queryParamMap.get('tenantId');
    if (tenantId) {
      this.form.patchValue({ tenantId: Number(tenantId) });
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
      tenantId: null,
      buildingId: null,
      roomName: '',
      endDateFrom: '',
      endDateTo: '',
      startDateFrom: '',
      startDateTo: '',
      page: 0,
      size: this.form.getRawValue().size,
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



  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  readonly canChooseBuilding = computed(() =>
    this.context.canChooseBuilding(PermissionConstants.LEASE_AGREEMENT_READ_ALL));

  /** Without an agency in context, only a platform-wide reader can list leases. */
  readonly needsAgency = computed(() =>
    !this.mine()
    && !this.context.can(PermissionConstants.LEASE_AGREEMENT_READ_ALL)
    && this.context.agencyId() === null);

  /**
   * The narrowest endpoint the context allows (§30.6). The platform-wide
   * search needs LEASE_AGREEMENT_READ_ALL, which an agency admin does not hold
   * — asking it was the 403 on this page. A building picked in the filter
   * narrows the same way the switcher's building does.
   */
  private scopedQuery(params: LeaseSearchParams) {
    const agencyId = this.context.agencyId();
    const buildingId = params.buildingId ?? this.context.buildingId();

    if (agencyId !== null && buildingId) {
      return this.tenantsService.getLeasesForBuilding(agencyId, buildingId, params);
    }

    if (agencyId !== null) {
      return this.tenantsService.getLeasesForAgency(agencyId, params);
    }

    return this.tenantsService.searchLeases(params);
  }

  async reload(): Promise<void> {
    if (this.needsAgency()) {
      this.leases.set([]);
      this.pagination.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as LeaseSearchParams;

    try {
      const result = this.mine()
        ? await firstValueFrom(this.tenantsService.getMyLeases({ page: params.page, size: params.size }))
        : await firstValueFrom(this.scopedQuery(params));
      this.leases.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
