import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { BackLinkComponent } from '../../../shared/components/back-link/back-link.component';
import { ContextGuardComponent } from '../../../shared/components/context-guard/context-guard.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { FileUploadSend } from '../../../shared/components/files/file-upload/file-upload.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ConfirmService } from '../../../shared/services/confirm.service';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { MaintenanceDetailBodyComponent } from '../components/maintenance-detail-body.component';
import { MaintenanceService } from '../maintenance.service';
import {
  MAINTENANCE_ACTION_LABELS,
  MAINTENANCE_CATEGORY_LABELS,
  MaintenanceDetail,
  MaintenanceStatus,
  StaffOption
} from '../maintenance.models';

/**
 * One repair request, on a page of its own: what and where, who reported it and how to reach
 * them, the photos and everything that happened, then the work itself — who handles it, when
 * they visit, the next status, and (through the rent module, deliberately) charging the tenant.
 *
 * Only the moves the server allows from the current status are offered; the transition table
 * lives on the backend.
 */
@Component({
  selector: 'app-maintenance-detail-page',
  standalone: true,
  imports: [FormsModule, RouterLink, BackLinkComponent, ContextGuardComponent, SectionCardComponent, LoadingStateComponent,
    ErrorStateComponent, PermissionGateComponent, StatusChipComponent, HumanLabelPipe, MaintenanceDetailBodyComponent],
  template: `
    <section class="stack">
      <app-back-link [to]="RoutePaths.maintenance" label="Maintenance" [title]="request()?.title || null" />
      <app-context-guard [agencyId]="agencyId()" [buildingId]="buildingId()" requirePermission="MAINTENANCE_READ">
        @if (loading() && !request()) {
          <app-loading-state label="Loading the request..." />
        } @else if (error()) {
          <app-error-state [message]="error()!" (retry)="load()" />
        } @else if (request(); as d) {
          <app-section-card [title]="d.title">
            <app-status-chip actions [status]="d.status" />

            <!-- What it is and who to call, on one line under the title. -->
            <p class="who">
              <span class="muted">{{ category(d) }}@if (d.requestNumber) { · <span class="mono">{{ d.requestNumber }}</span> }</span>
              <span>{{ d.roomNumber ? 'Room ' + d.roomNumber : '' }}@if (d.buildingName) { · {{ d.buildingName }} }</span>
              @if (d.tenantId && d.buildingId) {
                <a class="text-link" [routerLink]="RoutePaths.tenantDetail(agencyId(), d.buildingId, d.tenantId)">{{ d.tenantName }}</a>
              } @else if (d.tenantName) { <span>{{ d.tenantName }}</span> }
              @if (d.tenantPhone) { <a class="text-link" [href]="'tel:' + d.tenantPhone">{{ d.tenantPhone }}</a> }
              @if (d.resolutionHours !== null && d.resolutionHours !== undefined) { <span class="muted">Took {{ d.resolutionHours }} h</span> }
            </p>

            <app-maintenance-detail-body [request]="d" [addPhoto]="d.open ? uploadPhoto : null" />
            @if (d.workNotes) { <p class="notes">{{ d.workNotes }}</p> }
          </app-section-card>

          <!-- The work: who and when on the left, the next status on the right with the main one last. -->
          @if (d.open || moves().length > 0) {
            <app-section-card title="Handle this request">
              <div class="actionbar">
                @if (d.open) {
                  <div class="actionbar__plan compact-controls">
                    <label>
                      <span>Handled by</span>
                      <select [value]="d.assignedToUserId ?? ''" [disabled]="busy()" (change)="assign(d, $any($event.target).value)">
                        <option value="">Not assigned</option>
                        @for (person of staff(); track person.userId) {
                          <option [value]="person.userId">{{ person.name }}@if (person.role) { · {{ person.role | humanLabel }} }</option>
                        }
                      </select>
                    </label>
                    <label>
                      <span>Visit on</span>
                      <input type="date" [value]="(d.scheduledDate ?? '').slice(0, 10)" [disabled]="busy()"
                             (change)="schedule(d, $any($event.target).value)">
                    </label>
                  </div>
                }
                @if (moves().length > 0) {
                  <div class="actionbar__moves">
                    @for (next of moves(); track next; let last = $last) {
                      <button type="button" class="btn btn-sm" [class.btn-primary]="last" [class.btn-secondary]="!last"
                              [disabled]="busy()" (click)="move(d, next)">{{ actionLabel(next) }}</button>
                    }
                  </div>
                }
              </div>

              <!-- Billing the tenant is a separate, deliberate act through the rent module — never automatic. -->
              <app-permission-gate [permissions]="['RENT_ARREAR_WRITE']">
                @if (!d.chargedAmount && d.tenantId) {
                  @if (charging()) {
                    <form class="charge" (submit)="$event.preventDefault(); charge(d)">
                      <label class="field"><span>Amount (KES)</span><input type="number" min="1" step="0.01" [(ngModel)]="chargeAmount" name="amount" required></label>
                      <label class="field"><span>Why the tenant pays</span><input [(ngModel)]="chargeReason" name="reason" maxlength="500" required placeholder="e.g. Damage caused by the tenant"></label>
                      <label class="field"><span>On the bill for</span><input type="month" [(ngModel)]="chargeMonth" name="month"></label>
                      <div class="button-row">
                        <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy() || !chargeAmount || !chargeReason.trim()">Add to their bill</button>
                        <button type="button" class="btn btn-secondary btn-sm" (click)="charging.set(false)">Cancel</button>
                      </div>
                    </form>
                  } @else {
                    <button type="button" class="btn btn-secondary btn-sm charge-start" (click)="startCharge()">Charge the tenant for this repair</button>
                  }
                }
              </app-permission-gate>
            </app-section-card>
          }
        }
      </app-context-guard>
    </section>
  `,
  styles: [`
    .who { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); margin: 0; }
    .notes { margin: 0; padding: var(--space-2) var(--space-3); border-left: 3px solid var(--border-strong); }
    .actionbar { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-3); }
    .actionbar__plan { display: flex; flex-wrap: wrap; gap: var(--space-3); }
    .actionbar__plan label { display: grid; gap: var(--space-1); font-size: var(--font-label); color: var(--text-muted); }
    .actionbar__moves { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-left: auto; }
    .charge { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: var(--space-2) var(--space-4); align-items: end;
              padding: var(--space-2-5); border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .charge-start { justify-self: start; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceDetailPageComponent {
  readonly RoutePaths = RoutePaths;

  /** From the route: /admin/tenants/maintenance/:agencyId/:buildingId/:id. */
  readonly agencyIdParam = input.required<string>({ alias: 'agencyId' });
  readonly buildingIdParam = input.required<string>({ alias: 'buildingId' });
  readonly idParam = input.required<string>({ alias: 'id' });
  readonly agencyId = computed(() => Number(this.agencyIdParam()));
  readonly buildingId = computed(() => Number(this.buildingIdParam()));
  private readonly id = computed(() => Number(this.idParam()));

  private readonly maintenance = inject(MaintenanceService);
  private readonly context = inject(ActiveContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);

  readonly request = signal<MaintenanceDetail | null>(null);
  readonly staff = signal<StaffOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly charging = signal(false);
  chargeAmount: number | null = null;
  chargeReason = '';
  chargeMonth = '';

  /** The server lists the likeliest next status first; it goes last in the bar, as the primary action. */
  readonly moves = computed(() => [...(this.request()?.allowedNextStatuses ?? [])].reverse());

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [request, staff] = await Promise.all([
        firstValueFrom(this.maintenance.getById(this.agencyId(), this.buildingId(), this.id())),
        firstValueFrom(this.maintenance.staff(this.agencyId())).catch(() => [] as StaffOption[])
      ]);
      this.request.set(request);
      this.staff.set(staff);
      this.context.syncFromRoute(this.agencyId(), this.buildingId(), request.buildingName ?? null);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async assign(request: MaintenanceDetail, value: string): Promise<void> {
    await this.update(() => this.maintenance.assign(this.agencyId(), this.buildingId(), request.id, value ? Number(value) : null),
      value ? 'Assigned.' : 'Unassigned.');
  }

  async schedule(request: MaintenanceDetail, value: string): Promise<void> {
    if (value) {
      await this.update(() => this.maintenance.schedule(this.agencyId(), this.buildingId(), request.id, `${value}T09:00:00`),
        'Visit planned — the tenant can see the date.');
    }
  }

  startCharge(): void {
    this.chargeAmount = null;
    this.chargeReason = '';
    this.chargeMonth = new Date().toISOString().slice(0, 7);
    this.charging.set(true);
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
    await this.update(() => this.maintenance.charge(this.agencyId(), this.buildingId(), request.id, {
      amount: this.chargeAmount!,
      reason: this.chargeReason.trim(),
      billedMonth: this.chargeMonth ? `${this.chargeMonth}-01` : null
    }), 'Added to their bill.');
    this.charging.set(false);
  }

  readonly uploadPhoto: FileUploadSend = async ([file]) => {
    const request = this.request();
    if (!request) {
      return false;
    }
    try {
      this.request.set(await firstValueFrom(this.maintenance.addPhoto(this.agencyId(), this.buildingId(), request.id, file)));
      return true;
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
      return false;
    }
  };

  /** Completing needs work notes and cancelling a reason (the server's rule); the rest go straight through. */
  async move(request: MaintenanceDetail, next: MaintenanceStatus): Promise<void> {
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
    await this.update(() => this.maintenance.changeStatus(this.agencyId(), this.buildingId(), request.id, { status: next, workNotes }),
      `${this.actionLabel(next)} — the tenant has been told.`);
  }

  private async update(call: () => ReturnType<MaintenanceService['assign']>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      this.request.set(await firstValueFrom(call()));
      this.notifications.push('success', done);
    } catch (error) {
      this.notifications.push('error', extractErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  actionLabel(status: MaintenanceStatus): string {
    return MAINTENANCE_ACTION_LABELS[status] ?? status;
  }

  category(request: MaintenanceDetail): string {
    return request.category ? MAINTENANCE_CATEGORY_LABELS[request.category] ?? request.category : '';
  }
}
