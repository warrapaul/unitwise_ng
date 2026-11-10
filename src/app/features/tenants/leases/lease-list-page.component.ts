import { NotificationService } from '../../../core/services/notification.service';
import { roomTitle, shortDate } from '../../../shared/utils/format.util';
import { DateDisplayDirective } from '../../../shared/directives/date-display.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { displayRange } from '../../../shared/utils/display-date.util';
import { SummaryStripComponent, SummaryTile } from '../../../shared/components/summary-strip/summary-strip.component';
import { StatsService } from '../../stats/stats.service';
import { AgencyOverview, StatMetric } from '../../stats/models/stats.models';
import { syncBuildingFilterToContext } from '../../../shared/utils/building-filter.util';
import { displayDate } from '../../../shared/utils/display-date.util';
import { LeaseRefPipe } from '../../../shared/pipes/lease-ref.pipe';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, effect, untracked } from '@angular/core';
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
  imports: [DateDisplayDirective, MoneyPipe, CardTableDirective, SummaryStripComponent, 
    LeaseRefPipe,
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
    FormFeedbackDirective,
    HumanLabelPipe,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <!-- Each count filters the list below to those leases; pressed again, it clears. -->
      <app-summary-strip label="Leases at a glance" [tiles]="summary()" [active]="activeTile()" (picked)="pickTile($event)" />
      <!-- No card around the filters: the app bar names the page, and the table below is the one card. -->
      <div class="list-toolbar">

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
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Any</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING_SIGNATURE">To sign</option>
                    <option value="DRAFT">Draft</option>
                    <option value="EXPIRED">Expired</option>
                    <option value="TERMINATED">Terminated</option>
                    <option value="RENEWED">Renewed</option>
                  </select>
                </label>
                <label class="field"><span>Ends from</span><input type="date" formControlName="endDateFrom"></label>
                <label class="field"><span>Ends to</span><input type="date" formControlName="endDateTo"></label>
                <label class="field"><span>Starts from</span><input type="date" formControlName="startDateFrom"></label>
                <label class="field"><span>Starts to</span><input type="date" formControlName="startDateTo"></label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-text" (click)="clear()">Clear</button>
              </div>
            </form>
          }
        </app-filter-panel>
      </div>


      @if (loading()) {
        <app-loading-state label="Loading leases..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (needsAgency()) {
        <app-empty-state title="Select an agency" description="Choose an agency in the switcher to see its leases." />
      } @else if (leases().length === 0) {
        <app-empty-state title="No leases yet" description="A lease is created from a verified tenant's page."
                         actionLabel="Go to tenants" [actionLink]="RoutePaths.tenants" />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table appCardTable class="table">
              <!--
                Room first: it is how a landlord thinks of a lease ("A2's lease"),
                and a room's name, never its id, is what identifies it.
              -->
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Rent</th>
                  <th>
                    <app-sort-header [state]="sorting" field="leaseNumber" label="Lease" (sorted)="search()" />
                  </th>
                  <th>
                    <app-sort-header [state]="sorting" field="startDate" label="Term" (sorted)="search()" />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (lease of leases(); track lease.id) {
                  <tr [appRowLink]="mine() ? RoutePaths.myLeaseDetail(lease.id) : RoutePaths.leaseDetail(lease.id)">
                    <td>
                      <a class="record-link__primary" [routerLink]="mine() ? RoutePaths.myLeaseDetail(lease.id) : RoutePaths.leaseDetail(lease.id)">
                        {{ roomLabel(lease) }}
                      </a>
                    </td>
                    <td>{{ lease.tenantName || '-' }}</td>
                    <td><app-status-chip [status]="lease.status" /></td>
                    <td>{{ lease.monthlyRent | money }}</td>
                    <!-- The reference is for the paperwork, so a phone card leaves it out. -->
                    <td class="card-skip">
                      <div class="cell-stack">
                        <span class="lease-ref">
                          <span class="mono" [title]="lease.leaseNumber || ''">{{ lease.leaseNumber | leaseRef: lease.id }}</span>
                          @if (lease.leaseNumber) {
                            <button type="button" class="btn-text copy" (click)="$event.stopPropagation(); copy(lease.leaseNumber)"
                                    [attr.aria-label]="'Copy lease number ' + lease.leaseNumber">Copy</button>
                          }
                        </span>
                        <span class="muted">{{ lease.leaseType | humanLabel }}</span>
                      </div>
                    </td>
                    <td [title]="dateRange(lease.startDate, lease.endDate)">{{ term(lease.startDate, lease.endDate) }}</td>
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
    .lease-ref { display: inline-flex; align-items: center; gap: var(--space-2); }
    .copy { font-size: var(--text-sm); padding: 0; }
    .table-shell {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaseListPageComponent implements OnInit {
  /** "24 Sep 2026 – Ongoing": an open end says so, rather than a trailing dash. */
  readonly dateRange = displayRange;
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
    status: '',
    startDateFrom: '',
    startDateTo: '',
    endDateFrom: '',
    endDateTo: '',
    page: 0,
    size: 20,
  });

  private readonly stats = inject(StatsService);
  private readonly overview = signal<AgencyOverview | null>(null);

  readonly summary = computed<SummaryTile[]>(() => {
    const o = this.overview();
    if (!o) {
      return [];
    }
    const n = (key: string) => Number((o.leases?.[key] as StatMetric | undefined)?.value ?? 0) || 0;
    // Three that answer "what needs me": the rest were sums of these ("current" = active + to
    // sign) or a wider window of the same figure (ending in 90 days). Drafts only when there are some.
    return [
      { key: 'ACTIVE', label: 'Active', value: n('active'), filter: true },
      { key: 'PENDING_SIGNATURE', label: 'To sign', value: n('pendingSignature'), act: true, filter: true },
      { key: 'ending30', label: 'Ending in 30 days', value: n('expiringIn30Days'), act: true, filter: true },
      ...(n('draft') > 0 ? [{ key: 'DRAFT', label: 'Drafts', value: n('draft'), filter: true }] : [])
    ];
  });

  constructor() {
    effect(() => {
      const [agencyId, buildingId] = [this.context.agencyId(), this.context.buildingId()];
      untracked(() => {
        if (agencyId === null) {
          this.overview.set(null);
          return;
        }
        firstValueFrom(this.stats.getAgencyOverview(agencyId, { buildingId }))
          .then((overview) => this.overview.set(overview))
          .catch(() => this.overview.set(null));
      });
    });
    // The page's building filter is the shared context: a building picked here carries to the next page.
    syncBuildingFilterToContext(this.form.controls.buildingId);
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
      status: '',
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



  private readonly toasts = inject(NotificationService);

  /** The full number, for quoting in a message or on paper; the list shows it shortened. */
  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.toasts.push('success', 'Lease number copied.');
    } catch {
      this.toasts.push('error', 'Could not copy. Select the number on the lease page instead.');
    }
  }

  /** The tile matching the current filter, so it shows pressed. */
  readonly activeTile = signal<string | null>(null);

  /** A tile is a status filter, or for "ending in 30 days" an end-date window from today. */
  async pickTile(key: string | null): Promise<void> {
    this.activeTile.set(key);
    const today = new Date();
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const in30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    this.form.patchValue(key === 'ending30'
      ? { status: 'ACTIVE', endDateFrom: iso(today), endDateTo: iso(in30), page: 0 }
      : { status: key ?? '', endDateFrom: '', endDateTo: '', page: 0 });
    await this.reload();
  }

  /** "Sep 2026 – Aug 2027": the term at a glance; the lease itself has the exact days. */
  term(start?: string | null, end?: string | null): string {
    const month = (value?: string | null) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? shortDate(date, { month: 'short', year: 'numeric' }) : null;
    };
    return `${month(start) ?? '-'} – ${month(end) ?? 'Ongoing'}`;
  }

  /** A room by its name; its number only when unnamed, never its id. */
  roomLabel(lease: LeasePreview): string {
    if (lease.roomName) {
      return roomTitle(lease.roomName);
    }
    return lease.roomNumber !== null && lease.roomNumber !== undefined ? `Room ${lease.roomNumber}` : '-';
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : displayDate(date);
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
