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
import { FormsModule } from '@angular/forms';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { MaintenanceDetailBodyComponent } from '../components/maintenance-detail-body.component';
import {
  MAINTENANCE_ACTION_LABELS,
  MAINTENANCE_CATEGORY_LABELS,
  MaintenanceCategory,
  MaintenanceDetail,
  MaintenanceMetrics,
  MaintenancePreview,
  MaintenanceStatus,
  MaintenanceView,
  StaffOption
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
  imports: [FormsModule, PermissionGateComponent, MaintenanceDetailBodyComponent, RouterLink, SectionCardComponent, ContextGuardComponent, LoadingStateComponent, ErrorStateComponent, EmptyStateComponent,
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
          <!-- The figures are the views: each opens the requests it counts. -->
          @if (metrics(); as m) {
            <div class="tiles" role="group" aria-label="Maintenance at a glance">
              @for (tile of tiles; track tile.view) {
                <button type="button" class="tile" [class.tile--on]="view() === tile.view" [class.tile--alert]="tile.alert && m[tile.key] > 0"
                        [attr.aria-pressed]="view() === tile.view" (click)="setView(view() === tile.view ? null : tile.view)">
                  <strong class="tile__n">{{ m[tile.key] }}</strong>
                  <span class="tile__label">{{ tile.label }}</span>
                </button>
              }
            </div>
          }
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
                  <tr><th>Issue</th><th>Where</th><th>Urgency</th><th>Handled by</th><th>Reported</th><th>Status</th></tr>
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
                      <td>{{ request.assignedToName || '—' }}</td>
                      <td>{{ date(request.createdAt) }}</td>
                      <td><app-status-chip [status]="request.status" /></td>
                    </tr>
                    @if (openId() === request.id) {
                      <tr class="detail-row">
                        <td colspan="6">
                          @if (detail(); as d) {
                            <div class="detail">
                              <dl class="facts">
                                @if (d.tenantId && d.buildingId && agencyId()) {
                                  <div><dt>Tenant</dt><dd><a class="text-link" [routerLink]="RoutePaths.tenantDetail(agencyId()!, d.buildingId, d.tenantId)">{{ d.tenantName }}</a></dd></div>
                                }
                                @if (d.tenantPhone) { <div><dt>Phone</dt><dd><a [href]="'tel:' + d.tenantPhone">{{ d.tenantPhone }}</a></dd></div> }
                                @if (d.resolutionHours !== null && d.resolutionHours !== undefined) { <div><dt>Took</dt><dd>{{ d.resolutionHours }} h</dd></div> }
                              </dl>
                              <app-maintenance-detail-body [request]="d" [addPhoto]="d.open ? uploadPhoto : null" />
                              @if (d.workNotes) { <p class="notes">{{ d.workNotes }}</p> }

                              <!-- Who and when: the two things a caretaker's day is planned by. -->
                              @if (d.open) {
                                <div class="controls">
                                  <label class="field">
                                    <span>Handled by</span>
                                    <select [value]="d.assignedToUserId ?? ''" [disabled]="busy()" (change)="assign(d, $any($event.target).value)">
                                      <option value="">Not assigned</option>
                                      @for (person of staff(); track person.userId) {
                                        <option [value]="person.userId">{{ person.name }}@if (person.role) { · {{ person.role | humanLabel }} }</option>
                                      }
                                    </select>
                                  </label>
                                  <label class="field">
                                    <span>Visit on</span>
                                    <input type="date" [value]="(d.scheduledDate ?? '').slice(0, 10)" [disabled]="busy()"
                                           (change)="schedule(d, $any($event.target).value)">
                                  </label>
                                </div>
                              }

                              <!-- Billing the tenant is a separate, deliberate act through the rent module — never automatic. -->
                              <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                                @if (!d.chargedAmount && d.tenantId) {
                                  @if (chargingId() === d.id) {
                                    <form class="charge" (submit)="$event.preventDefault(); charge(d)">
                                      <label class="field"><span>Amount (KES)</span><input type="number" min="1" step="0.01" [(ngModel)]="chargeAmount" name="amount" required></label>
                                      <label class="field"><span>Why the tenant pays</span><input [(ngModel)]="chargeReason" name="reason" maxlength="500" required placeholder="e.g. Damage caused by the tenant"></label>
                                      <label class="field"><span>On the bill for</span><input type="month" [(ngModel)]="chargeMonth" name="month"></label>
                                      <div class="button-row">
                                        <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy() || !chargeAmount || !chargeReason.trim()">Add to their bill</button>
                                        <button type="button" class="btn btn-secondary btn-sm" (click)="chargingId.set(null)">Cancel</button>
                                      </div>
                                    </form>
                                  } @else {
                                    <button type="button" class="btn btn-secondary btn-sm charge-start" (click)="startCharge(d)">Charge the tenant for this repair</button>
                                  }
                                }
                              </app-permission-gate>
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
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(8.5rem, 100%), 1fr)); gap: 0.5rem; margin-bottom: 0.75rem; }
    .tile { display: grid; gap: 0.1rem; padding: 0.5rem 0.7rem; border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
            color: inherit; font: inherit; text-align: start; cursor: pointer; }
    .tile--on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-ring); }
    .tile--alert { border-left: 3px solid var(--danger); }
    .tile__n { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
    .tile__label { font-size: 0.8rem; color: var(--text-muted); }
    .controls { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
    .controls .field { min-width: 12rem; }
    .charge { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: 0.5rem 1rem; align-items: end;
              padding: 0.6rem; border: 1px solid var(--border); border-radius: 10px; }
    .charge-start { justify-self: start; }
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
  readonly view = signal<MaintenanceView | null>(null);
  readonly metrics = signal<MaintenanceMetrics | null>(null);
  readonly staff = signal<StaffOption[]>([]);
  readonly chargingId = signal<number | null>(null);
  chargeAmount: number | null = null;
  chargeReason = '';
  chargeMonth = '';

  readonly tiles: { view: MaintenanceView; key: keyof MaintenanceMetrics; label: string; alert?: boolean }[] = [
    { view: 'NEW', key: 'newRequests', label: 'New' },
    { view: 'UNASSIGNED', key: 'unassigned', label: 'Unassigned' },
    { view: 'URGENT', key: 'urgent', label: 'Urgent', alert: true },
    { view: 'OVERDUE', key: 'overdue', label: 'Overdue', alert: true },
    { view: 'SCHEDULED_TODAY', key: 'scheduledToday', label: 'Visits today' },
    { view: 'COMPLETED_MONTH', key: 'completedThisMonth', label: 'Done this month' }
  ];

  setView(view: MaintenanceView | null): void {
    this.view.set(view);
    // A view decides open-or-not itself ("done this month" is all closed).
    if (view) {
      this.openOnly.set(false);
    }
    this.page.set(0);
    void this.reload();
  }

  private async loadSide(): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null) {
      return;
    }
    const [metrics, staff] = await Promise.all([
      firstValueFrom(this.maintenance.metrics(agencyId, this.context.buildingId() ?? undefined)).catch(() => null),
      firstValueFrom(this.maintenance.staff(agencyId)).catch(() => [] as StaffOption[])
    ]);
    this.metrics.set(metrics);
    this.staff.set(staff);
  }

  async assign(request: MaintenanceDetail, value: string): Promise<void> {
    await this.update(request, (agencyId) => this.maintenance.assign(agencyId, request.buildingId!, request.id, value ? Number(value) : null),
      value ? 'Assigned.' : 'Unassigned.');
  }

  async schedule(request: MaintenanceDetail, value: string): Promise<void> {
    if (!value) {
      return;
    }
    await this.update(request, (agencyId) => this.maintenance.schedule(agencyId, request.buildingId!, request.id, `${value}T09:00:00`),
      'Visit planned — the tenant can see the date.');
  }

  startCharge(request: MaintenanceDetail): void {
    this.chargeAmount = null;
    this.chargeReason = '';
    this.chargeMonth = new Date().toISOString().slice(0, 7);
    this.chargingId.set(request.id);
  }

  async charge(request: MaintenanceDetail): Promise<void> {
    if (!this.chargeAmount || !this.chargeReason.trim()) {
      return;
    }
    if (!await this.confirm.ask({
      title: `Add KES ${this.chargeAmount.toLocaleString()} to ${request.tenantName}'s bill?`,
      message: 'It becomes a charge on their rent statement for that month, linked to this request. Change or waive it later from the rent pages.',
      confirmLabel: 'Add to their bill'
    })) {
      return;
    }
    await this.update(request, (agencyId) => this.maintenance.charge(agencyId, request.buildingId!, request.id, {
      amount: this.chargeAmount!,
      reason: this.chargeReason.trim(),
      billedMonth: this.chargeMonth ? `${this.chargeMonth}-01` : null
    }), 'Added to their bill.');
    this.chargingId.set(null);
  }

  readonly uploadPhoto: FileUploadSend = async ([file]) => {
    const request = this.detail();
    const agencyId = this.context.agencyId();
    if (!request || agencyId === null || !request.buildingId) {
      return false;
    }
    try {
      this.detail.set(await firstValueFrom(this.maintenance.addPhoto(agencyId, request.buildingId, request.id, file)));
      return true;
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
      return false;
    }
  };

  /** One change to the open request: the detail and its row refresh, and the figures with them. */
  private async update(request: MaintenanceDetail, call: (agencyId: number) => ReturnType<MaintenanceService['assign']>, done: string): Promise<void> {
    const agencyId = this.context.agencyId();
    if (agencyId === null || !request.buildingId) {
      return;
    }
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(call(agencyId));
      this.detail.set(updated);
      this.requests.update((list) => list.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      this.notifications.push('success', done);
      void this.loadSide();
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
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
        void this.loadSide();
      });
    });
  }

  setOpenOnly(value: boolean): void {
    this.openOnly.set(value);
    this.view.set(null);
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
        view: this.view() ?? undefined,
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
      void this.loadSide();
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
