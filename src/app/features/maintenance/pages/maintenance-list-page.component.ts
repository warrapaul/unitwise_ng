import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { displayDate } from '../../../shared/utils/display-date.util';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { MaintenanceService } from '../maintenance.service';
import {
  MAINTENANCE_ACTION_LABELS,
  MAINTENANCE_CATEGORY_LABELS,
  MaintenanceCategory,
  MaintenanceDetail,
  MaintenancePreview,
  MaintenanceStatus
} from '../maintenance.models';

/**
 * Repairs across the agency (or the building in context), open ones first.
 *
 * A row opens in place with the tenant's description and contact, and only the
 * moves the server allows from its current status — the transition table lives
 * on the backend, so the buttons cannot offer one it would refuse.
 */
@Component({
  selector: 'app-maintenance-list-page',
  standalone: true,
  imports: [RouterLink, SectionCardComponent, ContextGuardComponent, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent,
    PaginationComponent, StatusChipComponent, HumanLabelPipe],
  template: `
    <section class="stack">
      <app-section-card title="Maintenance">
        <ng-container actions>
          <label class="checkbox-field">
            <input type="checkbox" [checked]="openOnly()" (change)="setOpenOnly($any($event.target).checked)">
            <span>Open only</span>
          </label>
        </ng-container>

        <app-context-guard [requireBuilding]="false" [requireAnyBuilding]="true" requirePermission="MAINTENANCE_READ">
          @if (loading()) {
            <app-loading-state [compact]="true" label="Loading requests..." />
          } @else if (error()) {
            <app-error-state [message]="error()!" (retry)="reload()" />
          } @else if (requests().length === 0) {
            <app-empty-state [title]="openOnly() ? 'No open requests' : 'No requests'"
                             description="Requests tenants report, or that you raise for them, appear here." />
          } @else {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr><th>Issue</th><th>Where</th><th>Urgency</th><th>Reported</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (request of requests(); track request.id) {
                    <tr class="row-clickable" tabindex="0" (click)="toggle(request)" (keydown.enter)="toggle(request)"
                        [attr.aria-expanded]="openId() === request.id">
                      <td>
                        <div class="cell-stack">
                          <strong>{{ request.title }}</strong>
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
                      <td>{{ date(request.createdAt) }}</td>
                      <td><app-status-chip [status]="request.status" /></td>
                    </tr>
                    @if (openId() === request.id) {
                      <tr class="detail-row">
                        <td colspan="5">
                          @if (detail(); as d) {
                            <div class="detail">
                              @if (d.description) { <p>{{ d.description }}</p> }
                              <dl class="facts">
                                @if (d.tenantPhone) { <div><dt>Phone</dt><dd><a [href]="'tel:' + d.tenantPhone">{{ d.tenantPhone }}</a></dd></div> }
                                @if (d.tenantId && d.buildingId && agencyId()) {
                                  <div><dt>Tenant</dt><dd><a class="text-link" [routerLink]="RoutePaths.tenantDetail(agencyId()!, d.buildingId, d.tenantId)">{{ d.tenantName }}</a></dd></div>
                                }
                                @if (d.scheduledDate) { <div><dt>Visit planned</dt><dd>{{ date(d.scheduledDate) }}</dd></div> }
                                @if (d.resolutionHours !== null && d.resolutionHours !== undefined) { <div><dt>Took</dt><dd>{{ d.resolutionHours }} h</dd></div> }
                              </dl>
                              @if (d.workNotes) { <p class="notes">{{ d.workNotes }}</p> }
                              @if ((d.allowedNextStatuses ?? []).length > 0) {
                                <div class="button-row">
                                  @for (next of d.allowedNextStatuses ?? []; track next) {
                                    <button type="button" class="btn btn-sm" [class.btn-primary]="$first" [class.btn-secondary]="!$first"
                                            [disabled]="busy()" (click)="move(d, next)">{{ actionLabel(next) }}</button>
                                  }
                                </div>
                              }
                            </div>
                          } @else {
                            <app-loading-state [compact]="true" label="Loading..." />
                          }
                        </td>
                      </tr>
                    }
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
      </app-section-card>
    </section>
  `,
  styles: [`
    .urgent { color: var(--danger); font-weight: 600; }
    .detail-row td { background: var(--surface-2); }
    .detail { display: grid; gap: 0.6rem; }
    .facts { display: flex; flex-wrap: wrap; gap: 0.4rem 1.5rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; }
    .facts dt { font-size: 0.75rem; color: var(--text-muted); }
    .facts dd { margin: 0; font-weight: 600; }
    .notes { padding: 0.5rem 0.7rem; border-left: 3px solid var(--border-strong); }
    td .status-chip { margin-left: 0.4rem; }
    p { margin: 0; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceListPageComponent {
  readonly RoutePaths = RoutePaths;

  private readonly maintenance = inject(MaintenanceService);
  private readonly context = inject(ActiveContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);

  readonly agencyId = this.context.agencyId;
  readonly requests = signal<MaintenancePreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly openOnly = signal(true);
  readonly openId = signal<number | null>(null);
  readonly detail = signal<MaintenanceDetail | null>(null);
  readonly busy = signal(false);
  private readonly page = signal(0);

  constructor() {
    effect(() => {
      this.context.agencyId();
      this.context.buildingId();
      untracked(() => {
        this.page.set(0);
        void this.reload();
      });
    });
  }

  setOpenOnly(value: boolean): void {
    this.openOnly.set(value);
    this.page.set(0);
    void this.reload();
  }

  go(page: number): void {
    this.page.set(Math.max(0, page));
    void this.reload();
  }

  async reload(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.maintenance.getForAgency(agencyId, {
        buildingId: this.context.buildingId() ?? undefined,
        openOnly: this.openOnly(),
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

  async toggle(request: MaintenancePreview): Promise<void> {
    const agencyId = this.context.agencyId();
    if (this.openId() === request.id || agencyId === null || !request.buildingId) {
      this.openId.set(null);
      return;
    }
    this.openId.set(request.id);
    this.detail.set(null);
    try {
      this.detail.set(await firstValueFrom(this.maintenance.getById(agencyId, request.buildingId, request.id)));
    } catch (error) {
      this.openId.set(null);
      this.notifications.push('error', extractErrorMessage(error));
    }
  }

  /** Completing needs work notes and cancelling a reason (the server's rule); the rest go straight through. */
  async move(request: MaintenanceDetail, next: MaintenanceStatus): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null || !request.buildingId) {
      return;
    }
    let workNotes: string | null = null;
    if (next === 'COMPLETED' || next === 'CANCELLED' || next === 'ON_HOLD') {
      const asked = await this.confirm.askForReason({
        title: `${this.actionLabel(next)} — ${request.title}?`,
        message: 'The tenant sees this note.',
        confirmLabel: this.actionLabel(next),
        destructive: next === 'CANCELLED',
        reason: {
          label: next === 'COMPLETED' ? 'What was done' : 'Why',
          required: next !== 'ON_HOLD',
          placeholder: next === 'COMPLETED' ? 'e.g. Replaced the tap washer' : '',
          maxLength: 1000
        }
      });
      if (asked === null) {
        return;
      }
      workNotes = asked || null;
    }
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(this.maintenance.changeStatus(agencyId, request.buildingId, request.id, {
        status: next,
        workNotes
      }));
      this.detail.set(updated);
      if (this.openOnly() && !updated.open) {
        this.requests.update((list) => list.filter((item) => item.id !== updated.id));
        this.openId.set(null);
      } else {
        this.requests.update((list) => list.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      }
      this.notifications.push('success', `${request.title}: ${this.actionLabel(next).toLowerCase()} — the tenant has been told.`);
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  isUrgent(request: MaintenancePreview): boolean {
    return request.priority === 'URGENT' || request.priority === 'EMERGENCY';
  }

  actionLabel(status: MaintenanceStatus): string {
    return MAINTENANCE_ACTION_LABELS[status] ?? status;
  }

  categoryLabel(category: MaintenanceCategory): string {
    return MAINTENANCE_CATEGORY_LABELS[category] ?? category;
  }

  date(value: string | null | undefined): string {
    return value ? displayDate(value) : '-';
  }
}
