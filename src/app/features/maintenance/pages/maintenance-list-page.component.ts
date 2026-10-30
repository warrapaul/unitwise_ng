import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { SummaryStripComponent, SummaryTile } from '../../../shared/components/summary-strip/summary-strip.component';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { MaintenanceService } from '../maintenance.service';
import {
  MAINTENANCE_CATEGORY_LABELS,
  MaintenanceCategory,
  MaintenanceMetrics,
  MaintenancePreview,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceView
} from '../maintenance.models';

/**
 * Repairs across the agency (or the building in context), open ones first: the figures, the
 * filters and the table. A row opens the request's own page, where the work is done.
 */
@Component({
  selector: 'app-maintenance-list-page',
  standalone: true,
  imports: [SummaryStripComponent, ContextScopeNoticeComponent, ReactiveFormsModule, RouterLink, RowLinkDirective, SectionCardComponent, ContextGuardComponent,
    LoadingStateComponent, ErrorStateComponent, EmptyStateComponent, FilterPanelComponent, PaginationComponent, StatusChipComponent, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-context-guard [requireBuilding]="false" [requireAnyBuilding]="true" requirePermission="MAINTENANCE_READ">
        <!-- The figures are the views: each shows the requests it counts. -->
        <app-summary-strip label="Maintenance at a glance" [tiles]="summary()" [active]="view()"
                           (picked)="setView($any($event))" />

        <app-section-card title="Maintenance">
          <app-filter-panel actions [form]="form" (clear)="clear()">
            <form class="filters" [formGroup]="form" (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Issue or number</span><input formControlName="search" placeholder="e.g. leak, MNT-…"></label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Any</option>
                    @for (status of statuses; track status) { <option [value]="status">{{ status | humanLabel }}</option> }
                  </select>
                </label>
                <label class="field">
                  <span>Urgency</span>
                  <select formControlName="priority">
                    <option value="">Any</option>
                    @for (priority of priorities; track priority) { <option [value]="priority">{{ priority | humanLabel }}</option> }
                  </select>
                </label>
                <label class="field">
                  <span>Category</span>
                  <select formControlName="category">
                    <option value="">Any</option>
                    @for (category of categories; track category.value) { <option [value]="category.value">{{ category.label }}</option> }
                  </select>
                </label>
                <label class="checkbox-field">
                  <input type="checkbox" formControlName="openOnly">
                  <span>Open only</span>
                </label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
              </div>
            </form>
          </app-filter-panel>
        </app-section-card>

        <app-context-scope-notice noun="repair requests" />

        @if (loading()) {
          <app-loading-state [compact]="true" label="Loading requests..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="reload()" />
        } @else if (requests().length === 0) {
          <app-empty-state [title]="form.controls.openOnly.value ? 'No open requests' : 'No requests'"
                           description="Requests tenants report, or that you raise for them, appear here." />
        } @else {
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Issue</th><th>Where</th><th>Urgency</th><th>Handled by</th><th>Reported</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (request of requests(); track request.id) {
                  <tr [appRowLink]="link(request)">
                    <td>
                      <div class="cell-stack">
                        @if (link(request); as to) {
                          <a class="record-link__primary" [routerLink]="to">{{ request.title }}</a>
                        } @else { <strong>{{ request.title }}</strong> }
                        <span class="muted">{{ categoryLabel(request.category) }}@if (request.requestNumber) { · {{ request.requestNumber }} }</span>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ request.roomNumber ? 'Room ' + request.roomNumber : '-' }} · {{ request.buildingName }}</span>
                        @if (request.tenantName) { <span class="muted">{{ request.tenantName }}</span> }
                      </div>
                    </td>
                    <td>
                      <span [class.urgent]="isUrgent(request)">{{ request.priority | humanLabel }}</span>
                      @if (request.overdue) { <span class="status-chip status-chip--danger">Overdue</span> }
                    </td>
                    <td>{{ request.assignedToName || '—' }}</td>
                    <td>{{ date(request.createdAt) }}</td>
                    <td><app-status-chip [status]="request.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (pagination(); as page) {
            <app-pagination [pagination]="page" [size]="20" [sizes]="[20]" [shown]="requests().length"
                            [total]="page.totalElements" noun="requests"
                            (previous)="go(page.page - 1)" (next)="go(page.page + 1)" />
          }
        }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .urgent { color: var(--danger); font-weight: var(--weight-semibold); }
    td .status-chip { margin-left: var(--space-1-5); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceListPageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly maintenance = inject(MaintenanceService);
  private readonly context = inject(ActiveContextService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly requests = signal<MaintenancePreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly view = signal<MaintenanceView | null>(null);
  readonly metrics = signal<MaintenanceMetrics | null>(null);
  private readonly page = signal(0);

  readonly form = this.fb.group({
    search: '',
    status: '' as MaintenanceStatus | '',
    priority: '' as MaintenancePriority | '',
    category: '' as MaintenanceCategory | '',
    openOnly: true
  });

  readonly statuses: MaintenanceStatus[] = ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
  readonly priorities: MaintenancePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY'];
  readonly categories = (Object.keys(MAINTENANCE_CATEGORY_LABELS) as MaintenanceCategory[])
    .map((value) => ({ value, label: MAINTENANCE_CATEGORY_LABELS[value] }));

  readonly tiles: { view: MaintenanceView; key: keyof MaintenanceMetrics; label: string; alert?: boolean }[] = [
    { view: 'NEW', key: 'newRequests', label: 'New' },
    { view: 'UNASSIGNED', key: 'unassigned', label: 'Unassigned' },
    { view: 'URGENT', key: 'urgent', label: 'Urgent', alert: true },
    { view: 'OVERDUE', key: 'overdue', label: 'Overdue', alert: true },
    { view: 'SCHEDULED_TODAY', key: 'scheduledToday', label: 'Visits today' },
    { view: 'COMPLETED_MONTH', key: 'completedThisMonth', label: 'Done this month' }
  ];

  /** The figures are the views: each filters the table to the requests it counts. */
  readonly summary = computed<SummaryTile[]>(() => {
    const m = this.metrics();
    return m ? this.tiles.map((tile) => ({ key: tile.view, label: tile.label, value: m[tile.key], filter: true, act: tile.alert })) : [];
  });

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      untracked(() => {
        this.page.set(0);
        void this.reload();
        void this.loadMetrics();
      });
    });
  }

  setView(view: MaintenanceView | null): void {
    this.view.set(view);
    // A view decides open-or-not itself ("done this month" is all closed).
    if (view) {
      this.form.controls.openOnly.setValue(false);
    }
    this.page.set(0);
    void this.reload();
  }

  search(): void {
    this.page.set(0);
    void this.reload();
  }

  clear(): void {
    this.form.reset();
    this.view.set(null);
    this.search();
  }

  go(page: number): void {
    this.page.set(Math.max(0, page));
    void this.reload();
  }

  private async loadMetrics(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId !== null) {
      this.metrics.set(await firstValueFrom(this.maintenance.metrics(agencyId, this.context.buildingId() ?? undefined)).catch(() => null));
    }
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    const filters = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.maintenance.getForAgency(agencyId, {
        buildingId: this.context.buildingId() ?? undefined,
        openOnly: filters.openOnly,
        view: this.view() ?? undefined,
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        category: filters.category || undefined,
        page: this.page(),
        size: 20
      }));
      this.requests.set(result.items);
      this.pagination.set(result.pagination ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** The request's own page; null when the row lacks what the route needs. */
  link(request: MaintenancePreview): string | null {
    const agencyId = this.context.agencyId();
    return agencyId !== null && request.buildingId ? RoutePaths.maintenanceDetail(agencyId, request.buildingId, request.id) : null;
  }

  isUrgent(request: MaintenancePreview): boolean {
    return request.priority === 'URGENT' || request.priority === 'EMERGENCY';
  }

  categoryLabel(category: MaintenanceCategory): string {
    return MAINTENANCE_CATEGORY_LABELS[category] ?? category;
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
