import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { shortDate } from '../../../shared/utils/format.util';
import { asText, exportAllPages } from '../../../shared/utils/csv-export.util';
import { NotificationService } from '../../../core/services/notification.service';
import { CardTableDirective } from '../../../shared/directives/card-table.directive';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, effect } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import { StatsService } from '../../stats/stats.service';
import { BillingStepComponent } from '../../rent/components/billing-step.component';
import { BuildingStatsRow } from '../../stats/models/stats.models';
import { formatCurrency, formatMoney, monthKey, monthRange } from '../../../shared/utils/format.util';
import { BUILDING_SORTABLE_FIELDS, BuildingPreviewWithRole, BuildingSearchParams } from '../models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type BuildingSortField = typeof BUILDING_SORTABLE_FIELDS[number];

/** See the agency list: below this, a table is machinery without a problem. */
const COMPACT_THRESHOLD = 5;

@Component({
  selector: 'app-building-list-page',
  standalone: true,
  imports: [SectionCardComponent, CardTableDirective, BillingStepComponent, 
    HumanLabelPipe,
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    EntityPickerComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Buildings">
        <ng-container actions>
          <div class="action-bar">
            <!--
              No "My buildings / All buildings" switch: an agency admin sees the
              buildings of the agency they work in, and "All buildings" is the
              platform view — its own sidebar entry, for BUILDING_READ_ALL only.
            -->
            <button type="button" class="btn btn-secondary" [disabled]="exporting() || buildings().length === 0" (click)="exportCsv()">{{ exporting() ? 'Exporting…' : 'Export CSV' }}</button>
            <app-permission-gate [permissions]="[Permissions.BUILDING_CREATE]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.buildingCreate">New building</a>
            </app-permission-gate>
          </div>
        </ng-container>

        @if (showFilters()) {
        <app-filter-panel (clear)="clear()" [scopeLabel]="showsAgency() ? context.active().agencyName : null" [scopeControls]="['agencyId']" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name"></label>
              <label class="field"><span>Registration number</span><input formControlName="registrationNumber"></label>
              <!-- Only the platform view spans agencies; an agency admin's list is already their agency's. -->
              @if (seesEverything()) {
                <label class="field">
                  <span>Agency</span>
                  <app-entity-picker [config]="pickers.agency" formControlName="agencyId" placeholder="Any agency" />
                </label>
              }
              <label class="field"><span>County</span>
                <app-entity-picker [config]="pickers.county" formControlName="countyId" placeholder="Any county" />
              </label>
              <label class="field">
                <span>Status</span>
                <select formControlName="status">
                  <option value="">Any</option>
                  <option value="PENDING_APPROVAL">Pending approval</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DISABLED">Disabled</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-text" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
        }
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading buildings…" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (buildings().length === 0) {
        <!--
          Nothing found and nothing here yet are different states, and telling a
          new admin to "clear the filters" they never set sends them looking for
          a control that is not on the page.
        -->
        @if (hasFilters()) {
          <app-empty-state title="No buildings found" description="Try a different search or clear the filters." />
        } @else {
          <app-empty-state
            title="No buildings yet"
            description="Add your first building to start setting up floors, rooms and tenancies."
            actionLabel="New building"
            (action)="startCreate()"
          />
        }
      } @else {
        <div class="record-grid only-narrow">
          @for (building of buildings(); track building.id) {
            <article
              class="record-card building-card"
              [appRowLink]="building.agency?.id ? RoutePaths.buildingDetail(building.agency!.id, building.id) : null"
            >
              <!--
                Card view only. In the table a thumbnail per row is a column
                of decoration that pushes the figures sideways; on a card,
                where the building is the subject rather than a row, it is the
                fastest way to recognise the one you meant.
              -->
              <div class="building-card__media">
                @if (building.buildingProfile?.profilePic; as photo) {
                  <img [src]="photo" [alt]="building.name + ' exterior'" loading="lazy">
                } @else {
                  <!-- A placeholder rather than a gap: a missing photo should
                       not make the card a different shape from its neighbours. -->
                  <span class="building-card__initial" aria-hidden="true">{{ initial(building.name) }}</span>
                }
              </div>

              <header class="record-card__head">
                @if (building.agency?.id) {
                  <a class="record-card__title" [routerLink]="RoutePaths.buildingDetail(building.agency!.id, building.id)">
                    {{ building.name }}
                  </a>
                } @else {
                  <span class="record-card__title">{{ building.name }}</span>
                }
                <!-- Only when it is news: an active building is the usual case. -->
                @if (building.status !== 'ACTIVE') { <app-status-chip [status]="building.status" /> }
              </header>
              <!-- Where it is, then its size: two lines, not one run-on. -->
              @if (showsAgency() && building.agency?.name) { <p class="muted building-card__sub">{{ building.agency!.name }}</p> }
              @if (location(building) !== '-') { <p class="muted building-card__sub">{{ location(building) }}</p> }
              <p class="muted building-card__sub">
                {{ building.floorCount ?? 0 }} {{ building.floorCount === 1 ? 'floor' : 'floors' }} · {{ building.totalRoomCount ?? 0 }} rooms
                @if (fromAssignments() && building.adminRole?.roleName) { · {{ building.adminRole!.roleName | humanLabel }} }
              </p>

              <!-- This month in one line, then the billing state and anything that needs someone: quick to skim. -->
              @if (statsFor(building.id); as st) {
                <!-- Two labelled facts, like the tenant card's Room and Rent: what each number is, at a glance. -->
                @if ((st.occupied ?? 0) === 0) {
                  <!-- One state, not "Not billed yet" beside "No tenants". -->
                  <p class="building-card__empty">No tenants yet</p>
                } @else {
                <dl class="building-card__facts">
                  <div><dt>Occupied</dt><dd>{{ st.occupied ?? 0 }} of {{ st.rooms ?? building.totalRoomCount ?? 0 }}</dd></div>
                  <div>
                    <dt>Collected · {{ monthLabel }}</dt>
                    <dd>
                      @if (Number(st.rentExpected ?? 0) > 0) {
                        {{ money(st.rentCollected) }} / {{ amountOnly(st.rentExpected) }} ({{ percent(st.rentCollected, st.rentExpected) }}%)
                        <span class="progress" aria-hidden="true"><span [style.width.%]="percent(st.rentCollected, st.rentExpected)"></span></span>
                      } @else { <span class="muted">Not billed yet</span> }
                    </dd>
                  </div>
                </dl>
                }
                <div class="building-card__flags">
                  @if (building.agency?.id && (st.occupied ?? 0) > 0) {
                    <span class="label">Billing</span>
                    <app-billing-step [agencyId]="building.agency!.id" [buildingId]="building.id" [buildingName]="building.name"
                                      [billingDay]="st.billingDay ?? null" [month]="month" [carried]="st.deferredMeterReadings ?? 0" />
                  }
                  @if (Number(st.rentOutstanding ?? 0) > 0) { <span class="status-chip status-chip--warning">{{ money(st.rentOutstanding) }} owed</span> }
                  @if ((st.openMaintenanceRequests ?? 0) > 0) {
                    <span class="status-chip status-chip--info">{{ st.openMaintenanceRequests }} {{ st.openMaintenanceRequests === 1 ? 'repair' : 'repairs' }} open</span>
                  }
                </div>
              }
            </article>
          }
        </div>

        <section class="panel table-shell only-wide">
          @if (!smallSet()) {
          }

          <div class="table-scroll">
            <table appCardTable class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Building"
                      (sorted)="search()"
                    />
                  </th>
                  <!-- Only when there is more than one agency to tell apart. -->
                  @if (showsAgency()) {
                    <th>Agency</th>
                  }
                  <th>Location</th>
                  <th>Floors</th>
                  <th>Rooms</th>
                  @if (hasStats()) {
                    <th>Occupied</th>
                    <th>Collected this month</th>
                    <th>Owed</th>
                    <th>Billing</th>
                  }
                  @if (fromAssignments()) {
                    <th>Your role</th>
                  }
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (building of buildings(); track building.id) {
                  <tr [appRowLink]="building.agency?.id ? RoutePaths.buildingDetail(building.agency!.id, building.id) : null">
                    <td>
                      <div class="cell-stack">
                        @if (building.agency?.id) {
                          <a class="record-link__primary" [routerLink]="RoutePaths.buildingDetail(building.agency!.id, building.id)">
                            {{ building.name }}
                          </a>
                        } @else {
                          <span class="record-link__primary">{{ building.name }}</span>
                        }
                      </div>
                    </td>
                    @if (showsAgency()) {
                      <td>{{ building.agency?.name || '-' }}</td>
                    }
                    <td class="location">{{ location(building) }}</td>
                    <td>{{ building.floorCount ?? 0 }}</td>
                    <td>{{ building.totalRoomCount ?? 0 }}</td>
                    @if (hasStats()) {
                      @if (statsFor(building.id); as st) {
                        <td>{{ st.occupied ?? 0 }} of {{ st.rooms ?? 0 }}</td>
                        <td>{{ Number(st.rentExpected ?? 0) > 0 ? money(st.rentCollected) + ' of ' + money(st.rentExpected) : 'Not billed' }}</td>
                        <td [class.owing]="Number(st.rentOutstanding ?? 0) > 0">{{ money(st.rentOutstanding) }}</td>
                        <td>
                          @if (building.agency?.id) {
                            <app-billing-step [agencyId]="building.agency!.id" [buildingId]="building.id" [buildingName]="building.name"
                                              [billingDay]="st.billingDay ?? null" [month]="month" [carried]="st.deferredMeterReadings ?? 0" />
                          }
                        </td>
                      } @else {
                        <td>-</td><td>-</td><td>-</td><td>-</td>
                      }
                    }
                    @if (fromAssignments()) {
                      <td>{{ $safeNavigationMigration(building.adminRole?.roleName) | humanLabel }}</td>
                    }
                    <td>@if (building.status !== 'ACTIVE') { <app-status-chip [status]="building.status" /> }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination() && !smallSet()) {
          <app-pagination
            [shown]="buildings().length"
            [total]="pagination()?.totalElements ?? buildings().length"
            noun="buildings"
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
    td.location { font-size: var(--text-md); color: var(--text-muted); }
    /*
     * A list card: a small thumbnail beside what the building is. A full-width
     * 16:9 photo on top made each card mostly picture on a phone, and read as
     * an image stacked above a card rather than part of it. The thumbnail
     * sits inside the card's own padding, rounded to match it, and spans the
     * card's rows so every card keeps one shape with or without a photo.
     */
    .building-card {
      display: grid;
      grid-template-columns: 4.25rem minmax(0, 1fr);
      column-gap: var(--space-3);
      row-gap: var(--space-1);
      align-content: start;
    }

    .building-card > :not(.building-card__media) { grid-column: 2; min-width: 0; }

    .building-card__media {
      grid-column: 1;
      grid-row: 1 / span 3;
      align-self: start;
      display: grid;
      place-items: center;
      width: 4.25rem;
      height: 4.25rem;
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      overflow: hidden;
    }

    .building-card__media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .building-card__initial { font-size: var(--text-2xl); font-weight: var(--weight-bold); color: var(--primary-strong); }
    .building-card__empty { margin: var(--space-1) 0 0; color: var(--text-muted); }
    .progress { display: block; height: 6px; margin-top: var(--space-1); border-radius: var(--radius-pill); background: var(--surface-2); overflow: hidden; }
    .progress > span { display: block; height: 100%; background: var(--primary); border-radius: inherit; }
    .building-card__sub { margin: 0; font-size: var(--font-description); }
    .building-card__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: var(--space-1) 0 0; }
    .building-card__facts div { display: grid; gap: var(--space-0-5); min-width: 0; }
    .building-card__facts dt { font-size: var(--font-label); font-weight: var(--weight-semibold); color: var(--text-muted); }
    .building-card__facts dd { margin: 0; font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    .building-card__flags { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1-5); margin-top: var(--space-1); font-size: var(--font-description); }
    .owing { color: var(--danger); font-weight: var(--weight-semibold); }

    .table-shell {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }


    /*
     * The layout is decided by the viewport, not by the row count: a table is
     * the clearer read at any size on a wide screen, and never the right
     * answer on a phone, where it can only scroll sideways (§29.6).
     *
     * Both are in the DOM and CSS chooses, so the choice does not wait on the
     * count arriving — which is what used to make the panel flicker.
     */
    .only-narrow { display: none; }

    @media (max-width: 720px) {
      .only-narrow { display: grid; }
      .only-wide { display: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuildingListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly housing = inject(HousingService);
  readonly context = inject(ActiveContextService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  /**
   * The size of the set, read from the first unfiltered page — not from however
   * many rows the current query returned. See the agency list for why.
   */
  private readonly baselineTotal = signal<number | null>(null);

  /**
   * Small enough that the machinery is not worth its space.
   *
   * This no longer decides the *layout* — the viewport does that, in CSS. A
   * table reads perfectly well at two rows; what does not earn its place is
   * the apparatus around it, so a small set drops the filter panel, the pager
   * and the "showing 2 of 2" line and keeps the table.
   */
  readonly smallSet = computed(() => {
    const total = this.baselineTotal();
    return total !== null && total <= COMPACT_THRESHOLD;
  });

  /*
   * Nothing is shown until the first read says how big the set is. Rendering the
   * panel meanwhile and withdrawing it a moment later is worse than a beat of
   * nothing: the operator sees controls appear and vanish, which reads as a
   * glitch rather than as a decision.
   */
  /*
   * Searching by name is offered at every size. Hiding the panel for a small set
   * also hid the one way to find a building by name, and a portfolio is small
   * only until it is not.
   */
  readonly showFilters = computed(() => this.baselineTotal() !== null);

  readonly seesEverything = computed(() => this.context.can(PermissionConstants.BUILDING_READ_ALL));

  /**
   * The agency is worth naming only when there is more than one: a landlord
   * with one agency sees its name on every row and in the search badge, saying
   * nothing. Platform readers and multi-agency admins keep it.
   */
  readonly showsAgency = computed(() => this.seesEverything() || this.context.canSwitchAgency());

  /** Finest first, parts set apart with a middle dot so they scan as separate places. */
  location(building: BuildingPreviewWithRole): string {
    return this.joinParts([building.address?.town, building.address?.ward, building.address?.county], ' · ');
  }

  /**
   * True while any criterion the operator chose is set.
   *
   * The agency the context seeded is scope, not a filter (§29.2c). Counting it
   * told an agency admin with no buildings to "clear the filters" they never
   * set, and kept the baseline — which only records unfiltered reads — from
   * ever being taken.
   */
  hasFilters(): boolean {
    const { page, size, sort, direction, agencyId, ...criteria } = this.form.getRawValue() as Record<string, unknown>;
    const agencyChosen = agencyId !== null && agencyId !== undefined && agencyId !== this.context.agencyId();
    return agencyChosen
      || Object.values(criteria).some((value) => value !== '' && value !== null && value !== undefined);
  }

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly buildings = signal<BuildingPreviewWithRole[]>([]);

  private readonly statsApi = inject(StatsService);
  /** This month's figures per building, from the dashboard's stats; empty when the operator cannot read them. */
  private readonly stats = signal<Map<number, BuildingStatsRow>>(new Map());
  readonly hasStats = computed(() => this.stats().size > 0);
  readonly Number = Number;
  readonly month = monthKey(new Date());
  /** "Nov": the month the card's figures are for. */
  /** "Nov 2026": a month without its year was ambiguous. */
  readonly monthLabel = shortDate(new Date(), { month: 'short', year: 'numeric' });

  initial(name: string | null | undefined): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?';
  }

  percent(part: number | string | null | undefined, whole: number | string | null | undefined): number {
    const total = Number(whole ?? 0);
    return total > 0 ? Math.min(100, Math.round((Number(part ?? 0) / total) * 100)) : 0;
  }

  statsFor(buildingId: number): BuildingStatsRow | null {
    return this.stats().get(buildingId) ?? null;
  }

  /** "7,600" — the second figure in "KES 7,600 of 7,600", where the currency is already said once. */
  amountOnly(value: number | string | null | undefined): string {
    return formatCurrency(value, null);
  }

    money(value: number | string | null | undefined): string {
    return formatMoney(value, 'KES');
  }

  bar(rate: number | string | null | undefined): number {
    const value = Number(rate ?? 0);
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
  }

  /** The figures are extra: without the permission, or on failure, the cards simply go without. */
  private async loadStats(agencyId: number | null): Promise<void> {
    if (agencyId === null || !this.context.can(PermissionConstants.STATS_AGENCY_READ)) {
      this.stats.set(new Map());
      return;
    }
    try {
      const breakdown = await firstValueFrom(this.statsApi.getAgencyBuildings(agencyId, { period: 'CUSTOM', ...monthRange(this.month) }));
      this.stats.set(new Map((breakdown.buildings ?? []).filter((row) => row.buildingId != null).map((row) => [row.buildingId!, row])));
    } catch {
      this.stats.set(new Map());
    }
  }
  readonly pagination = signal<Pagination | null>(null);
  /** The list came from the operator's own building assignments, which carry their role there. */
  readonly fromAssignments = signal(false);

  readonly form = this.formBuilder.group({
    name: '',
    registrationNumber: '',
    agencyId: [null as number | null],
    countyId: [null as number | null],
    status: '',
    page: 0,
    size: 20,
  });

  constructor() {
    // The agency the operator has selected is the agency they mean. Seed the
    // filter from it and follow it when they switch, so "Buildings" shows this
    // agency's buildings instead of everyone's (§30.5).
    effect(() => {
      const agencyId = this.context.agencyId();
      void this.loadStats(agencyId);
      if (this.form.controls.agencyId.value === agencyId) {
        return;
      }

      this.form.patchValue({ agencyId, page: 0 }, { emitEvent: false });
      void this.reload();
    });
  }

  /** The empty state's own way in, so a first-time admin is not hunting the header. */
  startCreate(): void {
    void this.router.navigateByUrl(RoutePaths.buildingCreate);
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
      name: '',
      registrationNumber: '',
      agencyId: null,
      countyId: null,
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


  joinParts(values: Array<string | null | undefined>, separator = ', '): string {
    return values.filter((value): value is string => !!value).join(separator) || '-';
  }


  private readonly toasts = inject(NotificationService);
  readonly exporting = signal(false);

  /** Every building matching the filters, not just this page. */
  async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const base = { ...this.form.getRawValue(), sort: this.sorting.toParams() } as BuildingSearchParams;
      await exportAllPages({
        file: 'buildings', noun: ['building', 'buildings'],
        fetchPage: (page, size) => this.fetchBuildings({ ...base, page, size }),
        columns: [
          { header: 'Building', value: (b) => b.name },
          { header: 'Agency', value: (b) => b.agency?.name },
          { header: 'Registration number', value: (b) => asText(b.registrationNumber) },
          { header: 'Status', value: (b) => b.status },
          { header: 'Floors', value: (b) => b.floorCount },
          { header: 'Rooms', value: (b) => b.totalRoomCount },
          { header: 'Monthly rent (KES)', value: (b) => b.monthlyRent },
          { header: 'Deposit (KES)', value: (b) => b.securityDeposit },
          { header: 'Rent due day', value: (b) => b.paymentDueDay },
          { header: 'Town', value: (b) => b.address?.town },
          { header: 'Estate', value: (b) => b.address?.estateArea },
          { header: 'County', value: (b) => b.address?.county },
          { header: 'Added', value: (b) => b.createdAt?.slice(0, 10) }
        ],
        notify: (tone, text) => this.toasts.push(tone, text)
      });
    } catch (error) {
      this.toasts.push('error', extractErrorMessage(error));
    } finally {
      this.exporting.set(false);
    }
  }

  /** One page from whichever endpoint this operator may read (see reload). */
  private fetchBuildings(params: BuildingSearchParams) {
    const agencyId = this.context.agencyId();
    return firstValueFrom(agencyId !== null
      ? this.housing.getBuildingsForAgency(agencyId, params)
      : agencyId === null && !this.seesEverything() ? this.housing.getMyBuildings(params) : this.housing.searchBuildings(params));
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as BuildingSearchParams;

    /*
     * `GET /v1/buildings` is gated on BUILDING_READ_ALL — a super-admin
     * permission that lists every building on the platform. An agency admin
     * reaches buildings through their agency instead, and falls back to
     * `user-buildings` when no agency is in context. Asking for the platform
     * list without the permission is a 403, not a shorter list (§30.7).
     */
    const agencyId = this.context.agencyId();
    const fromAssignments = agencyId === null && !this.seesEverything();

    try {
      const result = agencyId !== null
        ? await firstValueFrom(this.housing.getBuildingsForAgency(agencyId, params))
        : fromAssignments
          ? await firstValueFrom(this.housing.getMyBuildings(params))
          : await firstValueFrom(this.housing.searchBuildings(params));
      this.fromAssignments.set(fromAssignments);
      this.buildings.set(result.items);
      this.pagination.set(result.pagination);

      // Only an unfiltered read describes the set; a filtered one describes the query.
      if (!this.hasFilters()) {
        this.baselineTotal.set(result.pagination?.totalElements ?? result.items.length);
      }
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
