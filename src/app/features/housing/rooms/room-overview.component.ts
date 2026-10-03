import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { HumanLabelPipe } from '../../../shared/pipes/human-label.pipe';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../../tenants/tenants.service';
import { RoomApplicationPreview, RoomOccupancy, TenantPreview } from '../../tenants/models/tenant.models';
import { RentService } from '../../rent/rent.service';
import { RoomPaymentStatus } from '../../rent/models/rent.models';
import { HousingService } from '../housing.service';
import { MaintenanceRequestPreview } from '../models/housing.models';

/** One section's state: each loads on its own, so a refusal in one leaves the rest readable. */
interface Section<T> {
  loading: boolean;
  error: string | null;
  data: T;
}

const idle = <T>(data: T): Section<T> => ({ loading: true, error: null, data });

/**
 * What a landlord wants to know about a room beyond its terms: who lives there,
 * how this month's rent stands, what is broken, who lived there before and who
 * has asked to. Each part is a preview with a way into the full record.
 *
 * Every section is behind its own permission, so a caretaker who may read
 * maintenance but not rent sees the one and not the other.
 */
@Component({
  selector: 'app-room-overview',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet, RouterLink, SectionCardComponent, PermissionGateComponent, StatusChipComponent, HumanLabelPipe],
  template: `
    <app-permission-gate [permissions]="['TENANT_READ', 'TENANT_READ_ALL']">
      <app-section-card title="Occupant">
        @if (occupants().loading) {
          <p class="muted">Loading…</p>
        } @else if (occupants().error) {
          <p class="error-text">{{ occupants().error }}</p>
        } @else if (living().length === 0 && movingIn().length === 0) {
          <p class="muted">Vacant — nobody lives in this room.</p>
        } @else {
          <div class="people">
            @for (tenant of living(); track tenant.id) {
              <ng-container [ngTemplateOutlet]="person" [ngTemplateOutletContext]="{ $implicit: tenant, label: null }" />
            }
            @for (tenant of movingIn(); track tenant.id) {
              <ng-container [ngTemplateOutlet]="person" [ngTemplateOutletContext]="{ $implicit: tenant, label: 'Moving in' }" />
            }
          </div>
        }
      </app-section-card>
    </app-permission-gate>

    <ng-template #person let-tenant let-label="label">
      <article class="person">
        <div class="person__main">
          <strong>{{ fullName(tenant) }}</strong>
          <div class="chips">
            @if (label) { <span class="status-chip status-chip--warning">{{ label }}</span> }
            <app-status-chip [status]="tenant.status" />
          </div>
        </div>
        <dl class="facts">
          <div><dt>Phone</dt><dd>{{ tenant.phoneNumber || '-' }}</dd></div>
          <div><dt>Email</dt><dd>{{ tenant.email || '-' }}</dd></div>
          <div><dt>Moved in</dt><dd>{{ tenant.moveInDate ? (tenant.moveInDate | date: 'd MMM y') : '-' }}</dd></div>
        </dl>
        <a class="btn btn-primary btn-sm" [routerLink]="RoutePaths.tenantDetail(agencyId(), buildingId(), tenant.id)">View tenant</a>
      </article>
    </ng-template>

    <app-permission-gate [permissions]="['RENT_ARREAR_READ']">
      <app-section-card title="This month's rent" [subtitle]="monthLabel">
        <ng-container actions>
          <a class="btn btn-secondary btn-sm" routerLink="/admin/rent/arrears">Rent payment per room</a>
        </ng-container>
        @if (rent().loading) {
          <p class="muted">Loading…</p>
        } @else if (rent().error) {
          <p class="error-text">{{ rent().error }}</p>
        } @else if (!rent().data || !rent().data!.isOccupied) {
          <p class="muted">Nothing billed — the room is vacant this month.</p>
        } @else if (rent().data!.rentRecordGenerated === false) {
          <p class="muted">Not billed yet for this month.</p>
        } @else {
          <dl class="facts">
            <div><dt>Due</dt><dd>{{ rent().data!.totalDue ?? '-' }}</dd></div>
            <div><dt>Paid</dt><dd>{{ rent().data!.totalPaid ?? '-' }}</dd></div>
            <div><dt>Outstanding</dt><dd><strong>{{ rent().data!.outstanding ?? '-' }}</strong></dd></div>
            <div>
              <dt>Status</dt>
              <dd class="chips">
                <app-status-chip [status]="rent().data!.paymentStatus" />
                @if (rent().data!.isOverdue) { <span class="status-chip status-chip--danger">Overdue</span> }
              </dd>
            </div>
          </dl>
        }
      </app-section-card>
    </app-permission-gate>

    <app-permission-gate [permissions]="['MAINTENANCE_READ', 'MAINTENANCE_READ_ALL']">
      <app-section-card title="Maintenance" [subtitle]="openRequests() > 0 ? openRequests() + ' open' : null">
        @if (maintenance().loading) {
          <p class="muted">Loading…</p>
        } @else if (maintenance().error) {
          <p class="error-text">{{ maintenance().error }}</p>
        } @else if (maintenance().data.length === 0) {
          <p class="muted">No maintenance requests for this room.</p>
        } @else {
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Request</th><th>Priority</th><th>Status</th><th>Raised</th></tr></thead>
              <tbody>
                @for (request of maintenance().data; track request.id) {
                  <tr>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ request.title || request.requestNumber || ('#' + request.id) }}</strong>
                        <span class="muted">{{ request.category | humanLabel }}{{ request.tenantName ? ' · ' + request.tenantName : '' }}</span>
                      </div>
                    </td>
                    <td>{{ request.priority | humanLabel }}</td>
                    <td class="chips">
                      <app-status-chip [status]="request.status" />
                      @if (request.overdue) { <span class="status-chip status-chip--danger">Overdue</span> }
                    </td>
                    <td>{{ request.createdAt ? (request.createdAt | date: 'd MMM y') : '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </app-permission-gate>

    <app-permission-gate [permissions]="['TENANT_READ', 'TENANT_READ_ALL']">
      <app-section-card title="Tenant history">
        @if (history().loading) {
          <p class="muted">Loading…</p>
        } @else if (history().error) {
          <p class="error-text">{{ history().error }}</p>
        } @else if (history().data.length === 0) {
          <p class="muted">Nobody has lived here yet.</p>
        } @else {
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Tenant</th><th>Stayed</th><th>Rent</th><th>Left because</th></tr></thead>
              <tbody>
                @for (stay of history().data; track stay.id) {
                  <tr>
                    <td>
                      @if (stay.tenantId) {
                        <a class="record-link__primary" [routerLink]="RoutePaths.tenantDetail(agencyId(), buildingId(), stay.tenantId)">{{ stay.tenantName || 'Tenant' }}</a>
                      } @else {
                        {{ stay.tenantName || 'Tenant' }}
                      }
                    </td>
                    <td>
                      {{ stay.moveInDate ? (stay.moveInDate | date: 'MMM y') : '?' }} –
                      @if (stay.isCurrentOccupancy) { <span class="status-chip status-chip--success">Now</span> }
                      @else { {{ stay.moveOutDate ? (stay.moveOutDate | date: 'MMM y') : '?' }} }
                    </td>
                    <td>{{ stay.rentAmount ?? '-' }}</td>
                    <td>
                      {{ stay.isCurrentOccupancy ? '-' : (stay.moveOutReason | humanLabel) }}
                      @if (stay.wasEvicted) { <span class="status-chip status-chip--danger">Evicted</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-section-card>
    </app-permission-gate>

    <app-permission-gate [permissions]="['ROOM_APPLICATION_READ', 'ROOM_APPLICATION_READ_ALL']">
      <app-section-card title="Applications" [subtitle]="pendingApplications() > 0 ? pendingApplications() + ' waiting for a decision' : null">
        @if (applications().loading) {
          <p class="muted">Loading…</p>
        } @else if (applications().error) {
          <p class="error-text">{{ applications().error }}</p>
        } @else if (applications().data.length === 0) {
          <p class="muted">No one has applied for this room.</p>
        } @else {
          <ul class="list">
            @for (application of applications().data; track application.id) {
              <li>
                <a class="record-link__primary" [routerLink]="RoutePaths.roomApplicationDetail(application.id)">{{ application.applicantName || ('Application #' + application.id) }}</a>
                <span class="muted">{{ application.createdAt ? (application.createdAt | date: 'd MMM y') : '' }}</span>
                <app-status-chip [status]="application.status" />
              </li>
            }
          </ul>
        }
      </app-section-card>
    </app-permission-gate>
  `,
  styles: [`
    :host { display: contents; }
    p { margin: 0; }
    .people { display: grid; gap: 0.75rem; }
    .person {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.6rem 1rem;
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }
    .person__main { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .person .facts { grid-column: 1 / -1; grid-row: 2; }
    .person .btn { grid-row: 1; grid-column: 2; }
    .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.4rem 1rem; margin: 0; }
    .facts div { display: grid; gap: 0.1rem; min-width: 0; }
    .facts dt { font-size: 0.75rem; color: var(--text-muted); }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
    .list li { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .list .muted { font-size: 0.82rem; margin-right: auto; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomOverviewComponent {
  readonly agencyId = input.required<number>();
  readonly buildingId = input.required<number>();
  readonly roomId = input.required<number>();

  readonly RoutePaths = RoutePaths;

  private readonly tenants = inject(TenantsService);
  private readonly rentService = inject(RentService);
  private readonly housing = inject(HousingService);
  private readonly context = inject(ActiveContextService);

  private readonly month = currentMonth();
  readonly monthLabel = new Date(`${this.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  readonly occupants = signal<Section<TenantPreview[]>>(idle([]));
  readonly rent = signal<Section<RoomPaymentStatus | null>>(idle(null));
  readonly maintenance = signal<Section<MaintenanceRequestPreview[]>>(idle([]));
  readonly history = signal<Section<RoomOccupancy[]>>(idle([]));
  readonly applications = signal<Section<RoomApplicationPreview[]>>(idle([]));

  /** In the room now, and assigned to it but not yet moved in — two different facts. */
  readonly living = computed(() => this.occupants().data.filter((tenant) => tenant.roomId === this.roomId()));
  readonly movingIn = computed(() => this.occupants().data.filter((tenant) =>
    tenant.roomId !== this.roomId() && tenant.intendedRoomId === this.roomId()));

  readonly openRequests = computed(() => this.maintenance().data.filter((request) => request.open).length);
  readonly pendingApplications = computed(() => this.applications().data.filter((application) => application.status === 'PENDING').length);

  constructor() {
    effect(() => {
      const agencyId = this.agencyId();
      const buildingId = this.buildingId();
      const roomId = this.roomId();
      untracked(() => this.loadAll(agencyId, buildingId, roomId));
    });
  }

  fullName(tenant: TenantPreview): string {
    return [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean).join(' ') || `Tenant #${tenant.id}`;
  }

  private loadAll(agencyId: number, buildingId: number, roomId: number): void {
    // Sections the operator cannot see are not fetched: a refused request is noise in the logs.
    const can = (...permissions: string[]) => this.context.canAny(permissions);

    if (can('TENANT_READ', 'TENANT_READ_ALL')) {
      void this.load(this.occupants, () => firstValueFrom(this.tenants.getTenantsForRoom(agencyId, buildingId, roomId)));
      void this.load(this.history, () => firstValueFrom(this.tenants.getRoomHistory(agencyId, buildingId, roomId, 10)));
    }
    if (can('RENT_ARREAR_READ')) {
      void this.load(this.rent, async () => {
        const page = await firstValueFrom(this.rentService.getRoomPaymentStatuses(agencyId, buildingId, this.month, { page: 0, size: 500 }));
        return page.items.find((room) => room.roomId === roomId) ?? null;
      });
    }
    if (can('MAINTENANCE_READ', 'MAINTENANCE_READ_ALL')) {
      void this.load(this.maintenance, async () =>
        (await firstValueFrom(this.housing.getMaintenanceForBuilding(agencyId, buildingId, { roomId, page: 0, size: 10 }))).items);
    }
    if (can('ROOM_APPLICATION_READ', 'ROOM_APPLICATION_READ_ALL')) {
      void this.load(this.applications, async () =>
        (await firstValueFrom(this.tenants.getApplicationsForRoom(agencyId, buildingId, roomId, { page: 0, size: 5 }))).items);
    }
  }

  private async load<T>(section: ReturnType<typeof signal<Section<T>>>, request: () => Promise<T>): Promise<void> {
    section.update((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await request();
      section.set({ loading: false, error: null, data });
    } catch (error) {
      section.update((current) => ({ ...current, loading: false, error: extractErrorMessage(error) }));
    }
  }
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
