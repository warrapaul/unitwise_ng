import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { HousingService } from '../housing.service';
import { AGENCY_SORTABLE_FIELDS, AgencyPreview, AgencySearchParams } from '../models/housing.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';

type AgencySortField = typeof AGENCY_SORTABLE_FIELDS[number];

/**
 * Above this many records a listing earns its table. Below it, the filter panel,
 * the sortable headers and the pager are all machinery for a problem the
 * operator does not have.
 */
const COMPACT_THRESHOLD = 5;

@Component({
  selector: 'app-agency-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    EntityPickerComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Agencies">
        <ng-container actions>
          <div class="action-bar">
            <app-permission-gate [permissions]="[Permissions.AGENCY_CREATE]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.agencyCreate">New agency</a>
            </app-permission-gate>
          </div>
        </ng-container>

        @if (showFilters()) {
        <app-filter-panel actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>Name</span><input formControlName="name"></label>
              <label class="field"><span>Registration no.</span><input formControlName="registrationNumber"></label>
              <label class="field"><span>Owner email</span><input formControlName="ownerEmail"></label>
              <label class="field"><span>Owner phone</span><input formControlName="ownerPhoneNumber"></label>
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
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
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
        <app-loading-state label="Loading agencies..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (agencies().length === 0) {
        @if (hasFilters()) {
          <app-empty-state title="No agencies found" description="Try a different search or clear the filters." />
        } @else {
          <app-empty-state
            title="No agencies yet"
            description="Create an agency to hold your buildings, tenants and rent."
            actionLabel="New agency"
            (action)="startCreate()"
          />
        }
      } @else if (compact()) {
        <!--
          A handful of agencies is a set the operator can see whole, so there is
          nothing to narrow and nothing to compare down a column. Cards let each
          one lead with its name and carry its own actions.
        -->
        <div class="record-grid">
          @for (agency of agencies(); track agency.id) {
            <article class="record-card">
              <header class="record-card__head">
                <a class="record-card__title" [routerLink]="RoutePaths.agencyDetail(agency.id)">{{ agency.name }}</a>
                <app-status-chip [status]="agency.status" />
              </header>

              <p class="muted">{{ agency.registrationNumber || 'No registration number' }}</p>

              <dl class="record-card__facts">
                <div><dt>Buildings</dt><dd>{{ agency.buildingCount ?? 0 }}</dd></div>
                <div><dt>Admins</dt><dd>{{ agency.adminCount ?? 0 }}</dd></div>
              </dl>

              @if (agency.ownerName || agency.ownerEmail) {
                <p class="muted">{{ agency.ownerName }}<br>{{ agency.ownerEmail }}</p>
              }

              <div class="button-row">
                <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.agencyDetail(agency.id)">Open</a>
                <app-permission-gate [permissions]="[Permissions.AGENCY_UPDATE]">
                  <a class="btn btn-secondary btn-sm" [routerLink]="RoutePaths.agencyEdit(agency.id)">Edit</a>
                </app-permission-gate>
              </div>
            </article>
          }
        </div>
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="name"
                      label="Agency"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Owner</th>
                  <th>Buildings</th>
                  <th>Admins</th>
                  <th>Status</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="createdAt"
                      label="Created"
                      (sorted)="search()"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (agency of agencies(); track agency.id) {
                  <tr [appRowLink]="RoutePaths.agencyDetail(agency.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.agencyDetail(agency.id)">{{ agency.name }}</a>
                        <span class="muted">{{ agency.registrationNumber || '-' }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ agency.ownerName || '-' }}</span>
                        <span class="muted">{{ agency.ownerEmail || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ agency.buildingCount ?? 0 }}</td>
                    <td>{{ agency.adminCount ?? 0 }}</td>
                    <td><app-status-chip [status]="agency.status" /></td>
                    <td>{{ formatDate(agency.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
            [shown]="agencies().length"
            [total]="pagination()?.totalElements ?? agencies().length"
            noun="agencies"
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
export class AgencyListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  readonly pickers = inject(EntityPickerRegistry);
  private readonly housing = inject(HousingService);
  private readonly context = inject(ActiveContextService);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('name', 'asc');

  /**
   * How many agencies exist when nothing is filtered. Read once, from the first
   * unfiltered page, because the decision is about the size of the set — not
   * about how many rows a search happened to return. Narrowing 200 agencies down
   * to two must not swap the filters out from under the operator.
   */
  private readonly baselineTotal = signal<number | null>(null);

  /** True while any criterion is set, so a narrow result is not read as a small set. */
  hasFilters(): boolean {
    const { page, size, sort, direction, ...criteria } = this.form.getRawValue() as Record<string, unknown>;
    return Object.values(criteria).some((value) => value !== '' && value !== null && value !== undefined);
  }

  /** Cards below the threshold, the table and its filters above it. */
  readonly compact = computed(() => {
    const total = this.baselineTotal();
    return total !== null && total <= COMPACT_THRESHOLD;
  });

  /*
   * Nothing is shown until the first read says how big the set is. Rendering the
   * panel meanwhile and withdrawing it a moment later is worse than a beat of
   * nothing: the operator sees controls appear and vanish, which reads as a
   * glitch rather than as a decision.
   */
  readonly showFilters = computed(() => this.baselineTotal() !== null && !this.compact());

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly agencies = signal<AgencyPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);

  readonly form = this.formBuilder.group({
    name: '',
    registrationNumber: '',
    ownerEmail: '',
    ownerPhoneNumber: '',
    cityId: [null as number | null],
    countyId: [null as number | null],
    status: '',
    page: 0,
    size: 20,
  });

  /** The empty state's own way in, so a first-time admin is not hunting the header. */
  startCreate(): void {
    void this.router.navigateByUrl(RoutePaths.agencyCreate);
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
      ownerEmail: '',
      ownerPhoneNumber: '',
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

    try {
      /*
       * `AGENCY_READ_ALL` is a super-admin permission: it lists every agency on
       * the platform. An agency admin sees only the agencies they administer,
       * which is a different endpoint — not the same one returning fewer rows.
       * Asking for the platform list without the permission is a 403, not a
       * short list (§30.6).
       *
       * Both take the same search request and answer with the same page
       * envelope, so the filters, the sort and the pager work identically
       * whichever one this operator reaches.
       */
      const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as AgencySearchParams;
      const result = this.context.can(PermissionConstants.AGENCY_READ_ALL)
        ? await firstValueFrom(this.housing.searchAgencies(params))
        : await firstValueFrom(this.housing.getMyAgencies(params));

      this.agencies.set(result.items);
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
