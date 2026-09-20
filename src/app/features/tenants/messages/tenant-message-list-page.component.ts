import { ChangeDetectionStrategy, Component, OnInit, inject, signal, effect } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
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
import { ErrorCardComponent } from '../../../shared/components/error-card/error-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { EntityPickerComponent } from '../../../shared/components/entity-picker/entity-picker.component';
import { EntityPickerRegistry } from '../../../shared/components/entity-picker/entity-picker.registry';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { TenantsService } from '../tenants.service';
import { TenantMessagePreview, TenantMessageSearchParams } from '../models/tenant.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-tenant-message-list-page',
  standalone: true,
  imports: [
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
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card [title]="mine() ? 'My messages' : 'Tenant messages'">
        <ng-container actions>
          <div class="action-bar">
            @if (!mine() && unresolvedCount() !== null) {
              <span class="status-chip status-chip--warning">{{ unresolvedCount() }} unresolved</span>
            }
            <a class="btn btn-secondary" [routerLink]="mine() ? RoutePaths.tenantMessages : RoutePaths.myTenantMessages">
              {{ mine() ? 'All messages' : 'My messages' }}
            </a>
          </div>
        </ng-container>

        <app-filter-panel (clear)="clear()" [scopeLabel]="context.active().buildingName" [scopeControls]="['buildingId']" actions [form]="form">
          @if (!mine()) {
            <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
              <div class="grid-auto filters-grid">
                <label class="field"><span>Tenant name</span><input formControlName="tenantName"></label>
                <label class="field"><span>Message contains</span><input formControlName="messageContent"></label>
                <label class="field">
                  <span>Tenant</span>
                  <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Any tenant" />
                </label>
                <label class="field">
                  <span>Building</span>
                  <app-entity-picker [config]="pickers.building" formControlName="buildingId" placeholder="Any building" />
                </label>
                <label class="field">
                  <span>Type</span>
                  <select formControlName="type">
                    <option value="">Any</option>
                    <option value="CONTACT">Contact</option>
                    <option value="COMPLAINT">Complaint</option>
                    <option value="SUGGESTION">Suggestion</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label class="field">
                  <span>Status</span>
                  <select formControlName="status">
                    <option value="">Any</option>
                    <option value="NEW">New</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
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
      <app-context-scope-notice noun="messages" />

      <app-permission-gate [permissions]="[Permissions.TENANT_MESSAGE_CREATE]">
        <app-section-card title="New message">
          <form [formGroup]="createForm" appFormFeedback (ngSubmit)="create()">
            <div class="grid-auto">
              <label class="field">
                <span>Tenant ID</span>
                <app-entity-picker [config]="pickers.tenant" formControlName="tenantId" placeholder="Send as yourself" />
                <small class="hint">Leave empty to send as yourself.</small>
              </label>
              <label class="field">
                <span>Type</span>
                <select formControlName="type">
                  <option value="CONTACT">Contact</option>
                  <option value="COMPLAINT">Complaint</option>
                  <option value="SUGGESTION">Suggestion</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>

            <label class="field field--wide">
              <span>Message</span>
              <textarea formControlName="message" rows="3"></textarea>
              @if (createForm.controls.message.invalid && createForm.controls.message.touched) {
                <small class="error-text">A message is required.</small>
              }
            </label>

            @if (createError(); as apiError) {
              <app-error-card title="Unable to send message" [message]="apiError.message" [details]="apiError.details" />
            }

            <div class="button-row">
              <button type="submit" class="btn btn-primary" [disabled]="creating()">
                {{ creating() ? 'Sending...' : 'Send message' }}
              </button>
            </div>
          </form>
        </app-section-card>
      </app-permission-gate>

      @if (loading()) {
        <app-loading-state label="Loading messages..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (messages().length === 0) {
        <app-empty-state title="No messages yet" description="Messages will appear here once someone reaches out." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Tenant</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="type"
                      label="Type"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="createdAt"
                      label="Received"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (message of messages(); track message.id) {
                  <tr [appRowLink]="mine() ? RoutePaths.myTenantMessageDetail(message.id) : RoutePaths.tenantMessageDetail(message.id)">
                    <td>
                      <a class="record-link__primary" [routerLink]="mine() ? RoutePaths.myTenantMessageDetail(message.id) : RoutePaths.tenantMessageDetail(message.id)">
                        {{ message.messagePreview || ('Message #' + message.id) }}
                      </a>
                    </td>
                    <td>{{ message.tenantName || message.tenantId || '-' }}</td>
                    <td>{{ message.type || '-' }}</td>
                    <td>{{ formatDateTime(message.createdAt) }}</td>
                    <td><app-status-chip [status]="message.status" /></td>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TenantMessageListPageComponent implements OnInit {
  readonly pickers = inject(EntityPickerRegistry);
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly tenantsService = inject(TenantsService);
  readonly context = inject(ActiveContextService);
  private readonly route = inject(ActivatedRoute);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly messages = signal<TenantMessagePreview[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly mine = signal(false);
  readonly unresolvedCount = signal<number | null>(null);

  readonly creating = signal(false);
  readonly createError = signal<ApiError | null>(null);

  readonly form = this.formBuilder.group({
    tenantName: '',
    messageContent: '',
    tenantId: [null as number | null],
    buildingId: [null as number | null],
    type: '',
    status: '',
    page: 0,
    size: 20,
    sort: 'createdAt',
    direction: 'desc' as 'asc' | 'desc'
  });

  readonly createForm = this.formBuilder.group({
    tenantId: [null as number | null],
    type: 'CONTACT',
    message: ['', [Validators.required, Validators.maxLength(2000)]]
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

  ngOnInit(): void {
    this.mine.set(this.route.snapshot.data['mine'] === true);
    void this.reload();

    if (!this.mine()) {
      void this.loadUnresolvedCount();
    }
  }

  async loadUnresolvedCount(): Promise<void> {
    try {
      this.unresolvedCount.set(await firstValueFrom(this.tenantsService.getUnresolvedMessageCount()));
    } catch {
      // The badge is informational — a failure here shouldn't block the list.
      this.unresolvedCount.set(null);
    }
  }

  async search(): Promise<void> {
    this.form.patchValue({ page: 0 });
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({
      tenantName: '',
      messageContent: '',
      tenantId: null,
      buildingId: null,
      type: '',
      status: '',
      page: 0,
      size: this.form.getRawValue().size,
      sort: 'createdAt',
      direction: 'desc'
    });
    await this.reload();
  }

  async create(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.creating.set(true);
    this.createError.set(null);

    const value = this.createForm.getRawValue();

    try {
      await firstValueFrom(this.tenantsService.createMessage({
        tenantId: value.tenantId,
        type: value.type as never,
        message: value.message
      }));

      this.createForm.reset({ tenantId: value.tenantId, type: 'CONTACT', message: '' });
      await this.reload();
    } catch (error) {
      this.createError.set(toApiError(error));
    } finally {
      this.creating.set(false);
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


  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const params = { ...this.form.getRawValue(),
        sort: this.sorting.toParams() } as TenantMessageSearchParams;

    try {
      const result = this.mine()
        ? await firstValueFrom(this.tenantsService.getMyMessages({ page: params.page, size: params.size }))
        : await firstValueFrom(this.tenantsService.searchMessages(params));
      this.messages.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
