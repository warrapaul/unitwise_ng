import { ChangeDetectionStrategy, Component, OnInit, inject, signal, effect } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { ContextScopeNoticeComponent } from '../../../shared/components/context-scope-notice/context-scope-notice.component';
import { RoomPickerComponent } from '../../../shared/components/room-picker/room-picker.component';
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { RoomApplicationPreview, RoomApplicationSearchParams } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';
import { ConfirmService } from '../../../shared/services/confirm.service';

@Component({
  selector: 'app-room-application-list-page',
  standalone: true,
  imports: [
    RoomPickerComponent,
    ContextScopeNoticeComponent,
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    EntityPickerComponent,
    ErrorCardComponent,
    RowLinkDirective,
    FilterPanelComponent,
    PermissionGateComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="mine() ? 'My room applications' : 'Room applications'">
        <ng-container actions>
          <a class="btn btn-secondary" [routerLink]="mine() ? RoutePaths.roomApplications : RoutePaths.myRoomApplications">
            {{ mine() ? 'All applications' : 'My applications' }}
          </a>
        </ng-container>

        <app-filter-panel (clear)="clear()" [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']" actions [form]="form">
          @if (!mine()) {
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Applicant name</span><input formControlName="applicantName"></label>
                <label class="field"><span>Unitwise ID</span><input formControlName="userUid"></label>
                <!-- A room is picked inside its building, never typed as an id (§28). -->
                @if (context.agencyId() !== null && context.buildingId() !== null) {
                  <label class="field">
                    <span>Room</span>
                    <app-room-picker formControlName="roomId" [agencyId]="context.agencyId()" [buildingId]="context.buildingId()" />
                  </label>
                }
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Any</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
              </div>
              <div class="button-row">
                <button type="submit" class="btn btn-primary">Search</button>
                <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
              </div>
            </form>
          }
        </app-filter-panel>
      </app-section-card>

      <!--
        A list narrowed by the active context looks exactly like a short
        list. Say which it is, next to the results rather than only on the
        filter chip.
      -->
      <app-context-scope-notice noun="applications" />

      <app-permission-gate [permissions]="[Permissions.ROOM_APPLICATION_CREATE]">
        <app-section-card title="Apply for a room">
          <form [formGroup]="applyForm" appFormFeedback (ngSubmit)="apply()">
            <div class="grid-auto">
              <label class="field">
                <span>Room</span>
                @if (context.agencyId() !== null && context.buildingId() !== null) {
                  <app-room-picker formControlName="roomId" [agencyId]="context.agencyId()" [buildingId]="context.buildingId()" />
                } @else {
                  <small class="hint">Choose a building in the switcher to pick one of its rooms.</small>
                }
                @if (applyForm.controls.roomId.invalid && applyForm.controls.roomId.touched) {
                  <small class="error-text">Choose the room.</small>
                }
              </label>
              <label class="field">
                <span>Tenant</span>
                <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Apply as yourself" />
                <small class="hint">Leave empty to apply as yourself.</small>
              </label>
              <label class="field"><span>Desired move-in date</span><input type="date" formControlName="desiredMoveInDate"></label>
            </div>

            <label class="field field--wide">
              <span>Message</span>
              <textarea formControlName="applicantMessage" rows="2"></textarea>
            </label>

            @if (applyError(); as apiError) {
              <app-error-card
                [title]="apiError.status === 409 ? 'Already applied' : 'Unable to submit application'"
                [message]="apiError.message"
                [details]="apiError.details"
              />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="applying()">
                {{ applying() ? 'Submitting...' : 'Submit application' }}
              </button>
            </div>
          </form>
        </app-section-card>
      </app-permission-gate>

      @if (loading()) {
        <app-loading-state label="Loading applications..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (applications().length === 0) {
        <app-empty-state title="No applications" description="Room applications will appear here once submitted." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Room</th>
                  <th>Building</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="desiredMoveInDate"
                      label="Desired move-in"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Status</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (application of applications(); track application.id) {
                  <tr [appRowLink]="mine() ? RoutePaths.myRoomApplicationDetail(application.id) : RoutePaths.roomApplicationDetail(application.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="mine() ? RoutePaths.myRoomApplicationDetail(application.id) : RoutePaths.roomApplicationDetail(application.id)">
                          {{ application.applicantName || ('Application #' + application.id) }}
                        </a>
                        <span class="muted mono">{{ application.userUid || '-' }}</span>
                      </div>
                    </td>
                    <td>{{ application.roomLabel || '-' }}</td>
                    <td>{{ application.buildingName || '-' }}</td>
                    <td>{{ formatDate(application.desiredMoveInDate) }}</td>
                    <td><app-status-chip [status]="application.status" /></td>
                    <td class="actions-col">
                      @if (application.status === 'PENDING') {
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          [disabled]="withdrawingId() === application.id"
                          (click)="withdraw(application)"
                        >
                          {{ withdrawingId() === application.id ? 'Withdrawing...' : 'Withdraw' }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (pagination()) {
          <app-pagination
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
    form {
      display: grid;
      gap: 1.15rem;
    }

    .field--wide textarea {
      max-width: var(--field-max-width-wide);
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomApplicationListPageComponent implements OnInit {
  readonly Permissions = PermissionConstants;
  private readonly confirm = inject(ConfirmService);
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  readonly context = inject(ActiveContextService);
  private readonly route = inject(ActivatedRoute);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly applications = signal<RoomApplicationPreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly mine = signal(false);
  readonly withdrawingId = signal<number | null>(null);

  readonly applying = signal(false);
  readonly applyError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    applicantName: '',
    userUid: '',
    roomId: [null as number | null],
    buildingId: [null as number | null],
    status: '',
    page: 0,
    size: 20,
    sort: 'createdAt',
    direction: 'desc' as 'asc' | 'desc'
  });

  readonly applyForm = this.formBuilder.group({
    roomId: [null as number | null, [Validators.required, Validators.min(1)]],
    tenantId: [null as number | null],
    desiredMoveInDate: '',
    applicantMessage: ''
  });

  constructor() {
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

  async ngOnInit(): Promise<void> {
    this.mine.set(this.route.snapshot.data['mine'] === true);

    const roomId = this.route.snapshot.queryParamMap.get('roomId');
    if (roomId) {
      this.applyForm.patchValue({ roomId: Number(roomId) });
    }

    void this.reload();
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      applicantName: '',
      userUid: '',
      roomId: null,
      buildingId: null,
      status: '',
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'createdAt',
      direction: 'desc'
    });
    await this.reload();
  }

  async apply(): Promise<void> {
    if (this.applyForm.invalid) {
      this.applyForm.markAllAsTouched();
      return;
    }

    this.applying.set(true);
    this.applyError.set(null);

    const value = this.applyForm.getRawValue();

    try {
      await firstValueFrom(this.tenantsService.createApplication({
        roomId: value.roomId!,
        tenantId: value.tenantId,
        desiredMoveInDate: value.desiredMoveInDate || null,
        applicantMessage: value.applicantMessage || null
      }));

      this.applyForm.reset({ roomId: null, tenantId: null, desiredMoveInDate: '', applicantMessage: '' });
      await this.reload();
    } catch (error) {
      this.applyError.set(toApiError(error));
    } finally {
      this.applying.set(false);
    }
  }

  async withdraw(application: RoomApplicationPreview): Promise<void> {
    if (!await this.confirm.ask({
      title: 'Withdraw this application?',
      confirmLabel: 'Withdraw',
      destructive: true
    })) {
      return;
    }

    this.withdrawingId.set(application.id);
    this.error.set(null);

    try {
      const updated = await firstValueFrom(this.tenantsService.withdrawApplication(application.id));
      this.applications.update((items) => items.map((item) => (item.id === updated.id ? { ...item, status: updated.status } : item)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.withdrawingId.set(null);
    }
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

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as RoomApplicationSearchParams;

    try {
      const result = this.mine()
        ? await firstValueFrom(this.tenantsService.getMyApplications({ page: params.page, size: params.size }))
        : await firstValueFrom(this.tenantsService.searchRoomApplications(params));
      this.applications.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
