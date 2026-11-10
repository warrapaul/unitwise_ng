import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { formatPhone, roomTitle } from '../../../shared/utils/format.util';
import { personName } from '../../../shared/utils/format.util';
import { PhoneMenuComponent } from '../../../shared/components/phone-menu/phone-menu.component';
import { MONEY_LOCALE, formatCurrency } from '../../../shared/utils/format.util';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { displayDate } from '../../../shared/utils/display-date.util';
import { TenancySummaryComponent } from '../components/tenancy-summary.component';
import { syncBuildingFilterToContext } from '../../../shared/utils/building-filter.util';
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
  imports: [RoomPickerComponent, PhoneMenuComponent, CardTableDirective, TenancySummaryComponent, 
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
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
      <!-- First: the pipeline in one row. A tenant count filters the table below; a lease or application count opens its list. -->
      <app-permission-gate [permissions]="['STATS_AGENCY_READ']">
        <app-tenancy-summary [activeStatus]="form.controls.status.value" (statusPicked)="filterByStatus($event)" />
      </app-permission-gate>
      <!-- No card title: the app bar already says Tenants. Add leads, filters follow. -->
      <div class="list-toolbar">
        <ng-container>
          <app-permission-gate [permissions]="PermissionSets.TENANT_CREATE">
            <!--
              One way in. The add page offers the three routes — a share code,
              a Unitwise ID, or no account yet — as tabs, so this header holds a
              single action and fits the title's row on a phone.
            -->
            <a class="btn btn-primary" [routerLink]="RoutePaths.tenantAddExisting">Add tenant</a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel (clear)="clear()" [scopeLabel]="canChooseBuilding() ? context.active().buildingName : null" [scopeControls]="['buildingId']" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>First name</span><input formControlName="firstName" autocomplete="given-name" autocapitalize="words"></label>
              <label class="field"><span>Last name</span><input formControlName="lastName" autocomplete="family-name" autocapitalize="words"></label>
              <label class="field"><span>Phone</span><input formControlName="phoneNumber" type="tel" inputmode="tel" autocomplete="tel"></label>
              <label class="field"><span>National ID</span><input formControlName="nationalId"></label>
              <!-- A person's Unitwise ID is theirs; only a super admin searches by it. -->
              @if (context.isSuperAdmin()) {
                <label class="field"><span>Unitwise ID</span><input formControlName="userUid"></label>
              }
              <!-- Only where there is more than one building to narrow to. -->
              @if (showBuilding()) {
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
              }
              <!-- Rooms live in a building, so this appears once one is chosen (here or in the switcher). -->
              @if (context.buildingId() !== null) {
                <label class="field">
                  <span>Room</span>
                  <app-room-picker formControlName="roomId" [clearable]="true" placeholder="Any room"
                                   [agencyId]="context.agencyId()" [buildingId]="context.buildingId()" />
                </label>
              }
              <label class="field">
                <span>Status</span>
                <!-- Grouped by where the tenancy is in its life, so the onboarding queue reads as one. -->
                <select formControlName="status">
                  <option value="">Any</option>
                  <optgroup label="Onboarding">
                    <option value="AWAITING_TENANT_ACCEPTANCE">Awaiting the tenant</option>
                    <option value="PENDING">To review</option>
                    <option value="VERIFIED">Not moved in</option>
                  </optgroup>
                  <optgroup label="Living here">
                    <option value="ACTIVE">Active</option>
                    <option value="NOTICE_GIVEN">On notice</option>
                    <option value="INACTIVE">Inactive</option>
                  </optgroup>
                  <optgroup label="Ended">
                    <option value="TERMINATED">Moved out</option>
                    <option value="EVICTED">Evicted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="CANCELLED">Cancelled</option>
                  </optgroup>
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
        <app-empty-state title="No tenants yet" description="Add your first tenant to get started."
                         actionLabel="Add tenant" [actionLink]="RoutePaths.tenantAddExisting" />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table table--packed" appCardTable>
              <!--
                Room first: a landlord finds a tenant by where they live. Email
                last — rarely what anyone scans for. No Unitwise ID: it is the
                person's own, not the agency's to display.
              -->
              <thead>
                <tr>
                  <!-- Building leads (it contains the room), and only when there is more than one (§19.15). -->
                  @if (showBuilding()) {
                    <th>Building</th>
                  }
                  <th><app-sort-header [state]="sorting" field="room.name" label="Room" (sorted)="search()" /></th>
                  <!-- Two facts, two labelled columns: the tenancy's status leads, verification follows. -->
                  <th>Status</th>
                  <th>Verification</th>
                  <th><app-sort-header [state]="sorting" field="lastName" label="Tenant" (sorted)="search()" /></th>
                  <th>Contact</th>
                  <th class="num">Rent</th>
                  <th>This month</th>
                  <th>Lease</th>
                  <th><app-sort-header [state]="sorting" field="moveInDate" label="Move-in date" (sorted)="search()" /></th>
                </tr>
              </thead>
              <tbody>
                @for (tenant of tenants(); track tenant.id) {
                  <tr [appRowLink]="detailLink(tenant)">
                    @if (showBuilding()) {
                      <td class="card-skip">{{ tenant.buildingName || '-' }}</td>
                    }
                    <td class="card-skip">
                      <app-room-link
                        [agencyId]="tenant.agencyId ?? context.agencyId()"
                        [buildingId]="tenant.buildingId ?? context.buildingId()"
                        [roomId]="tenant.roomId ?? tenant.intendedRoomId ?? null"
                        [roomNumber]="tenant.roomId ? tenant.roomNumber : tenant.intendedRoomNumber"
                        [roomName]="tenant.roomId ? tenant.roomName : tenant.intendedRoomName"
                        [intended]="!tenant.roomId && !!tenant.intendedRoomId"
                      />
                    </td>
                    <td class="card-skip"><app-status-chip [status]="tenant.status" /></td>
                    <td class="card-skip">
                      @if (tenant.verified) {
                        <span>Verified</span>
                      } @else {
                        @if (tenant.status === 'PENDING' && detailLink(tenant); as link) {
                          <app-permission-gate [permissions]="['VERIFICATION_SNAPSHOT_CREATE']">
                            <a class="btn btn-secondary btn-sm" [routerLink]="link" [queryParams]="{ verify: 1 }" (click)="$event.stopPropagation()">Verify</a>
                          </app-permission-gate>
                        } @else {
                          <span class="muted">Not verified</span>
                        }
                      }
                    </td>
                    <td class="card-title">
                      <div class="cell-stack">
                        @if (detailLink(tenant); as link) {
                          <a class="record-link__primary" [routerLink]="link">{{ fullName(tenant) }}</a>
                        } @else {
                          <span class="record-link__primary">{{ fullName(tenant) }}</span>
                        }
                        <!-- On the card only, under the name: a number to call. The table has a Contact column. -->
                        @if (tenant.phoneNumber) {
                          <span class="tenant-phone"><app-phone-menu [phone]="tenant.phoneNumber" /></span>
                        }
                      </div>
                    </td>
                    <td class="card-skip">
                      <div class="cell-stack">
                        <span>{{ tenant.phoneNumber ? phone(tenant.phoneNumber) : '-' }}</span>
                        @if (tenant.email) { <span class="muted wrap-anywhere">{{ tenant.email }}</span> }
                      </div>
                    </td>
                    <td class="num card-skip">{{ tenant.monthlyRent != null ? money(tenant.monthlyRent) : '-' }}</td>
                    <!-- Money, separate from the tenancy's status: an active tenant can be behind. -->
                    <td class="standing-cell">
                      @if (tenant.paymentStanding; as standing) {
                        <div class="cell-stack standing">
                          <span [class]="'status-chip status-chip--' + standingTone(standing)">{{ standingLabel(standing) }}@if (overdueFor(tenant); as late) { · {{ late }}}</span>
                          @if (dueText(tenant); as due) { <span class="due">{{ due }}</span> }
                        </div>
                      } @else {
                        <!-- Nothing billed to a tenancy that is not living here: say nothing rather than "-". -->
                        <span class="muted card-skip-empty">-</span>
                      }
                    </td>
                    <td class="card-skip">
                      @if (tenant.leaseStartDate) {
                        <div class="cell-stack">
                          <span>{{ formatDate(tenant.leaseStartDate) }} – {{ tenant.leaseEndDate ? formatDate(tenant.leaseEndDate) : 'periodic' }}</span>
                          @if (tenant.leaseStatus === 'PENDING_SIGNATURE') { <span class="muted small">Awaiting signature</span> }
                        </div>
                      } @else {
                        <span class="muted">No lease</span>
                      }
                    </td>
                    <td class="card-skip">{{ formatDate(tenant.moveInDate) }}</td>
                    <!--
                      The phone card: where they live, what they pay, how to reach them — one line —
                      then only what needs attention. Active and verified are the usual case and say nothing.
                    -->
                    <td class="card-only tenant-line">
                      <!-- Two labelled facts side by side: where they live, what they pay. -->
                      <p class="tenant-summary">{{ roomText(tenant) }}@if (tenant.monthlyRent != null) { · {{ money(tenant.monthlyRent) }}/mo }</p>
                      <span class="tenant-flags">
                        <!-- One chip, for where the tenancy stands; anything else is a plain note beside it. -->
                        <app-status-chip [status]="tenant.status" />
                        @if (flagNotes(tenant); as notes) { <span class="tenant-notes">{{ notes }}</span> }
                        <!-- Skipped at creation: verifying is one tap from the list, straight to the step. -->
                        @if (tenant.status === 'PENDING' && detailLink(tenant); as link) {
                          <app-permission-gate [permissions]="['VERIFICATION_SNAPSHOT_CREATE']">
                            <a class="btn btn-primary btn-sm" [routerLink]="link" [queryParams]="{ verify: 1 }" (click)="$event.stopPropagation()">Verify</a>
                          </app-permission-gate>
                        }
                      </span>
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
    .tenant-notes { color: var(--text-muted); font-size: var(--text-sm); }
    .tenant-summary { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
    .standing { gap: var(--space-0-5); justify-items: start; }
    .standing .status-chip { width: fit-content; }
    /* The amount and "due" are joined by a no-break space, so the line may wrap but never orphans the word. */
    .due { font-size: var(--text-sm); font-weight: var(--weight-semibold); }
    @media (max-width: 640px) { .card-skip-empty { display: none; } }
    .tenant-phone { display: none; }
    .tenant-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
    .tenant-facts div { display: grid; gap: var(--space-0-5); min-width: 0; }
    .tenant-facts dt { font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--text-muted); }
    .tenant-facts dd { margin: 0; }
    .tenant-flags { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
    .table--cards .tenant-phone { align-items: center; gap: var(--space-1-5); justify-self: start; font-size: var(--font-description); color: var(--primary-strong);
                    font-weight: var(--weight-semibold); text-decoration: none; font-variant-numeric: tabular-nums; }
    .tenant-phone svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @media (max-width: 640px) {
      /* Name on the left, this month's standing on the right of the same line. */
      .table--cards tbody tr { row-gap: var(--space-1); }
      .table--cards tbody tr > td.card-title { grid-column: 1; align-self: start; }
      .table--cards tbody tr > td.card-title .tenant-phone { display: inline-flex; }
      /* Outweighs the global card-only display: block, so facts and tags stack with a gap. */
      .table--cards tbody tr > td.card-only.tenant-line { display: grid; gap: var(--space-2); margin-top: var(--space-1); }
      /* Under the name, full width: beside it, a long chip ran over the phone number. */
      .table--cards tbody tr > td.standing-cell { grid-column: 1 / -1; justify-self: start; text-align: start; }
      .standing { flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
      .table--cards tbody tr > td.standing-cell::before { content: none; }
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .small { font-size: var(--text-sm); }
    .table-shell {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
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
    phoneNumber: '',
    nationalId: '',
    userUid: '',
    buildingId: [null as number | null],
    roomId: [null as number | null],
    status: '',
    page: 0,
    size: 20,
  });

  constructor() {
    // The page's building filter is the shared context: a building picked here carries to the next page.
    syncBuildingFilterToContext(this.form.controls.buildingId);
    // A selected building is the operator saying "this one". Tenants then means
    // this building's tenants, not the whole agency's (§30.5). Clearing the
    // building widens it back to the agency.
    effect(() => {
      const buildingId = this.context.buildingId();
      if (this.form.controls.buildingId.value === buildingId) {
        return;
      }

      // A room belongs to one building: a new building drops the room filter.
      this.form.patchValue({ buildingId, roomId: null, page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  ngOnInit(): void {
    void this.reload();
  }

  /** From the summary row: filter the table to one status, or back to any. */
  async filterByStatus(status: string): Promise<void> {
    this.form.patchValue({ status, page: 0 });
    await this.reload();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      firstName: '',
      lastName: '',
      phoneNumber: '',
      nationalId: '',
      userUid: '',
      buildingId: null,
      roomId: null,
      status: '',
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
    return personName(tenant.firstName, tenant.middleName, tenant.lastName) || `Tenant #${tenant.id}`;
  }


  /** The secondary facts, as words: "Not verified · No lease". */
  flagNotes(tenant: { status?: string | null; verified?: boolean | null; leaseStatus?: string | null; leaseStartDate?: string | null }): string {
    const living = tenant.status === 'ACTIVE' || tenant.status === 'NOTICE_GIVEN';
    return [
      tenant.verified ? null : 'Not verified',
      tenant.leaseStatus === 'PENDING_SIGNATURE' ? 'Lease to sign'
        // Billing runs from the move-in, lease or not: say so, or "Overdue" beside "No lease" reads as a mistake.
        : !tenant.leaseStartDate ? (living ? 'No lease (rent billed from move-in)' : 'No lease') : null
    ].filter(Boolean).join(' · ');
  }

  money(value: number | string | null | undefined): string {
    return formatCurrency(value);
  }

  readonly phone = formatPhone;

  /** "KES 25,500 due", or the whole balance when earlier months are owed too: "KES 75,000 due · 3 months". */
  dueText(tenant: TenantPreview): string | null {
    const standing = tenant.paymentStanding;
    const total = Number(tenant.totalOutstanding ?? tenant.monthOutstanding ?? 0);
    if (!standing || standing === 'NOT_BILLED' || !(total > 0)) {
      return null;
    }
    const months = tenant.monthsOwed ?? 0;
    return months > 1 ? `${this.money(total)}\u00A0due · ${months}\u00A0months` : `${this.money(total)}\u00A0due`;
  }

  /** How late: "12 days" under a month, "2 months" after. */
  overdueFor(tenant: TenantPreview): string | null {
    if (!tenant.overdueSince) {
      return null;
    }
    const days = Math.floor((Date.now() - new Date(tenant.overdueSince).getTime()) / 86_400_000);
    if (days < 1) {
      return null;
    }
    const months = Math.floor(days / 30);
    return months >= 1 ? `${months} month${months === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'}`;
  }

  standingLabel(standing: string): string {
    return { PAID: 'Paid', PART_PAID: 'Part paid', UNPAID: 'Not paid yet', OVERDUE: 'Overdue', NOT_BILLED: 'Not billed' }[standing] ?? standing;
  }

  standingTone(standing: string): string {
    return { PAID: 'success', PART_PAID: 'info', UNPAID: 'neutral', OVERDUE: 'danger', NOT_BILLED: 'neutral' }[standing] ?? 'neutral';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
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

  readonly canChooseBuilding = computed(() => this.context.canChooseBuilding(PermissionConstants.TENANT_READ_ALL));
  /** A building column only when the list spans buildings: filtered to one, every row would repeat it. */
  readonly showBuilding = computed(() => this.canChooseBuilding() && this.context.buildingId() === null);

  /** "101", "101 (reserved)", or "bld1 · 101" when the list spans buildings. */
  roomText(tenant: TenantPreview): string {
    const roomNo = tenant.roomId ? (tenant.roomName || tenant.roomNumber) : (tenant.intendedRoomName || tenant.intendedRoomNumber);
    const room = roomNo != null && roomNo !== '' ? `${roomTitle(String(roomNo))}${!tenant.roomId && tenant.intendedRoomId ? ' (held)' : ''}` : 'No room yet';
    return this.showBuilding() && tenant.buildingName ? `${tenant.buildingName} · ${room}` : room;
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
