import { ChangeDetectionStrategy, Component, OnInit, inject, signal, effect, computed } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants, PermissionSets } from '../../../core/rbac/permission.constants';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { RoomLinkComponent } from '../../../shared/components/room-link/room-link.component';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { TENANT_SORTABLE_FIELDS, TenantPreview, TenantSearchParams } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type TenantSortField = typeof TENANT_SORTABLE_FIELDS[number];

@Component({
  selector: 'app-tenant-list-page',
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
    PermissionGateComponent,
    FormFeedbackDirective,
    RoomLinkComponent,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Tenants">
        <ng-container actions>
          <app-permission-gate [permissions]="PermissionSets.TENANT_CREATE">
            <!--
              Two ways in, and the uid one leads. It is the safer path — the
              person confirms their own identity and shares it — and it is
              what most people adding a tenant now want, so it takes the
              primary slot. The label names the act rather than being clever:
              "Already on Unitwise" did not tell anyone that this is where a
              user ID goes.
            -->
            <a class="btn btn-primary" [routerLink]="RoutePaths.tenantAddExisting">Add by user ID</a>
            <a class="btn btn-primary btn-outline" [routerLink]="RoutePaths.tenantCreate">
              Add someone without an account
            </a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>First name</span><input formControlName="firstName"></label>
              <label class="field"><span>Last name</span><input formControlName="lastName"></label>
              <label class="field"><span>Email</span><input formControlName="email"></label>
              <label class="field"><span>Phone</span><input formControlName="phoneNumber"></label>
              <label class="field"><span>National ID</span><input formControlName="nationalId"></label>
              <label class="field"><span>User UID</span><input formControlName="userUid"></label>
              <label class="field">
                <span>Building</span>
                <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
              </label>
              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="">Any</option>
                  <option value="AWAITING_TENANT_ACCEPTANCE">Awaiting the tenant</option>
                  <option value="PENDING">Pending my review</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="NOTICE_GIVEN">Notice given</option>
                  <option value="TERMINATED">Terminated</option>
                  <option value="EVICTED">Evicted</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="tenantType">
                  <option value="">Any</option>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="CORPORATE">Corporate</option>
                  <option value="FAMILY">Family</option>
                  <option value="STUDENT">Student</option>
                </select>
              </label>
              <label class="field">
                <span>Claim status</span>
                <select formControlName="claimStatus">
                  <option value="">Any</option>
                  <option value="NOT_APPLICABLE">Not applicable</option>
                  <option value="PENDING_CLAIM">Pending claim</option>
                  <option value="CLAIMED_UNVERIFIED">Claimed, unverified</option>
                  <option value="CLAIMED_VERIFIED">Claimed, verified</option>
                  <option value="EXPIRED">Expired</option>
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

      <!--
        A list narrowed by the active context looks exactly like a short
        list. Say which it is, next to the results rather than only on the
        filter chip.
      -->
      <app-context-scope-notice noun="tenants" />

      @if (loading()) {
        <app-loading-state label="Loading tenants..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (needsAgency()) {
        <app-empty-state
          title="Select an agency"
          description="Choose an agency in the switcher to see its tenants."
        />
      } @else if (tenants().length === 0) {
        <app-empty-state title="No tenants yet" description="Add your first tenant to get started." />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="lastName"
                      label="Tenant"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Room</th>
                  <th>Building</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="moveInDate"
                      label="Move in"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (tenant of tenants(); track tenant.id) {
                  <tr [appRowLink]="detailLink(tenant)">
                    <td>
                      <div class="cell-stack">
                        @if (detailLink(tenant); as link) {
                          <a class="record-link__primary" [routerLink]="link">{{ fullName(tenant) }}</a>
                        } @else {
                          <span class="record-link__primary">{{ fullName(tenant) }}</span>
                        }
                        <span class="muted">{{ tenant.userUid || tenant.tenantType || '-' }}</span>
                      </div>
                    </td>
                    <td class="mono">{{ tenant.phoneNumber || '-' }}</td>
                    <td class="wrap-anywhere">{{ tenant.email || '-' }}</td>
                    <td>
                      <app-room-link
                        [agencyId]="tenant.agencyId ?? context.agencyId()"
                        [buildingId]="tenant.buildingId ?? context.buildingId()"
                        [roomId]="tenant.roomId ?? tenant.intendedRoomId ?? null"
                        [roomNumber]="tenant.roomId ? tenant.roomNumber : tenant.intendedRoomNumber"
                        [roomName]="tenant.roomId ? tenant.roomName : tenant.intendedRoomName"
                        [intended]="!tenant.roomId && !!tenant.intendedRoomId"
                      />
                    </td>
                    <td>{{ tenant.buildingName || '-' }}</td>
                    <td>{{ formatDate(tenant.moveInDate) }}</td>
                    <td>
                      <div class="chip-row">
                        <app-status-chip [status]="tenant.status" />
                        @if (tenant.verified) {
                          <span class="status-chip status-chip--info">Verified</span>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="tenants().length"
            [total]="pagination()?.totalElements ?? tenants().length"
            noun="tenants"
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


    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly PermissionSets = PermissionSets;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  readonly context = inject(ActiveContextService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly tenants = signal<TenantPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly form = this.formBuilder.group({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    nationalId: '',
    userUid: '',
    buildingId: [null as number | null],
    status: '',
    tenantType: '',
    claimStatus: '',
    page: 0,
    size: 20,
  });

  constructor() {
    // A selected building is the operator saying "this one". Tenants then means
    // this building's tenants, not the whole agency's (§30.5). Clearing the
    // building widens it back to the agency.
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
    void this.reload();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      nationalId: '',
      userUid: '',
      buildingId: null,
      status: '',
      tenantType: '',
      claimStatus: '',
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


  fullName(tenant: TenantPreview): string {
    return [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean).join(' ') || `Tenant #${tenant.id}`;
  }


  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  /**
   * Ask the narrowest endpoint the context allows.
   *
   * The global search reaches every tenant on the platform and needs
   * TENANT_READ_ALL; an agency admin holds the scoped TENANT_READ instead, so
   * for them the by-building and by-agency routes are the only ones that
   * answer at all — and they are also the correct scope for what the operator
   * has selected in the shell (§30.5).
   */
  private scopedQuery() {
    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as TenantSearchParams;
    const agencyId = this.context.agencyId();
    const buildingId = this.context.buildingId();

    // By building is the only route an agency-scoped role can take: the backend
    // guards it with TENANT_READ over that building.
    if (agencyId !== null && buildingId !== null) {
      return this.tenantsService.getTenantsForBuilding(agencyId, buildingId, params);
    }

    // By agency is guarded `hasAgencyAccess(agencyId, 'TENANT_READ')`, so an
    // agency-scoped role reaches it too — no building needed.
    if (agencyId !== null) {
      return this.tenantsService.getTenantsForAgency(agencyId, params);
    }

    // Only the platform-wide list still needs TENANT_READ_ALL.
    return this.tenantsService.searchTenants(params);
  }

  /** Without an agency in context, only a platform-wide reader can list tenants. */
  readonly needsAgency = computed(() =>
    !this.context.can(PermissionConstants.TENANT_READ_ALL) && this.context.agencyId() === null);

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    if (this.needsAgency()) {
      // Nothing to ask for yet — the prompt below tells them what to do.
      this.tenants.set([]);
      this.pagination.set(null);
      this.loading.set(false);
      return;
    }

    try {
      const result = await firstValueFrom(this.scopedQuery());
      this.tenants.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * The tenant detail route is keyed `{agencyId}/{buildingId}/{id}`, but a
   * `TenantPreview` from the by-building endpoint carries neither — the path
   * already said which building, so the payload does not repeat it. Falling
   * back to the active context is what makes the row clickable at all; without
   * it every row rendered as plain text.
   */
  detailLink(tenant: TenantPreview): string | null {
    const agencyId = tenant.agencyId ?? this.context.agencyId();
    const buildingId = tenant.buildingId ?? this.context.buildingId();

    return agencyId !== null && buildingId !== null
      ? RoutePaths.tenantDetail(agencyId, buildingId, tenant.id)
      : null;
  }
}
