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
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
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
import { BUILDING_SORTABLE_FIELDS, BuildingPreviewWithRole, BuildingSearchParams } from '../models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type BuildingSortField = typeof BUILDING_SORTABLE_FIELDS[number];

/** See the agency list: below this, a table is machinery without a problem. */
const COMPACT_THRESHOLD = 5;

@Component({
  selector: 'app-building-list-page',
  standalone: true,
  imports: [
    HumanLabelPipe,
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
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
            <button type="button" class="btn btn-secondary" (click)="toggleScope()">
              {{ myBuildingsOnly() ? 'All buildings' : 'My buildings' }}
            </button>
            <app-permission-gate [permissions]="[Permissions.BUILDING_CREATE]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.buildingCreate">New building</a>
            </app-permission-gate>
          </div>
        </ng-container>

        @if (showFilters()) {
        <app-filter-panel (clear)="clear()" [scopeLabel]="context.active().agencyName" [scopeControls]="['agencyId']" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name"></label>
              <label class="field"><span>Registration no.</span><input formControlName="registrationNumber"></label>
              <label class="field">
                <span>Agency</span>
                <app-entity-picker [config]="pickers.agency" formControlName="agencyId" placeholder="Any agency" />
              </label>
              <label class="field"><span>City</span>
                <app-entity-picker [config]="pickers.city" formControlName="cityId" placeholder="Any city" />
              </label>
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
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
        }
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading buildings..." />
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
                  <span class="building-card__placeholder" aria-hidden="true">🏢</span>
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
                <app-status-chip [status]="building.status" />
              </header>

              <p class="muted">
                {{ joinParts([building.address?.subCounty, building.address?.city, building.address?.county]) }}
              </p>

              <dl class="record-card__facts">
                <div><dt>Floors</dt><dd>{{ building.floorCount ?? 0 }}</dd></div>
                <div><dt>Rooms</dt><dd>{{ building.totalRoomCount ?? 0 }}</dd></div>
                @if (myBuildingsOnly() && building.adminRole?.roleName) {
                  <div><dt>Your role</dt><dd>{{ building.adminRole!.roleName | humanLabel }}</dd></div>
                }
              </dl>
            </article>
          }
        </div>

        <section class="panel table-shell only-wide">
          @if (!smallSet()) {
          }

          <div class="table-scroll">
            <table class="table">
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
                  <th>Agency</th>
                  <th>Location</th>
                  <th>Floors</th>
                  <th>Rooms</th>
                  @if (myBuildingsOnly()) {
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
                        <span class="muted">{{ building.registrationNumber || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ building.agency?.name || '-' }}</td>
                    <td>{{ joinParts([building.address?.subCounty, building.address?.city, building.address?.county]) }}</td>
                    <td>{{ building.floorCount ?? 0 }}</td>
                    <td>{{ building.totalRoomCount ?? 0 }}</td>
                    @if (myBuildingsOnly()) {
                      <td>{{ building.adminRole?.roleName | humanLabel }}</td>
                    }
                    <td><app-status-chip [status]="building.status" /></td>
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
      column-gap: 0.8rem;
      row-gap: 0.3rem;
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

    .building-card__placeholder { font-size: 1.5rem; opacity: 0.45; }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
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
  readonly showFilters = computed(() => this.baselineTotal() !== null && !this.smallSet());

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
  readonly pagination = signal<Pagination | null>(null);
  readonly myBuildingsOnly = signal(false);

  readonly form = this.formBuilder.group({
    name: '',
    registrationNumber: '',
    agencyId: [null as number | null],
    cityId: [null as number | null],
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

  async toggleScope(): Promise<void> {
    this.myBuildingsOnly.update((value) => !value);
    this.form.patchValue({ page: 0 });
    await this.reload();
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
      cityId: null,
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
    const seesEverything = this.context.can(PermissionConstants.BUILDING_READ_ALL);

    try {
      const result = this.myBuildingsOnly()
        ? await firstValueFrom(this.housing.getMyBuildings(params))
        : agencyId !== null
          ? await firstValueFrom(this.housing.getBuildingsForAgency(agencyId, params))
          : seesEverything
            ? await firstValueFrom(this.housing.searchBuildings(params))
            : await firstValueFrom(this.housing.getMyBuildings(params));
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
