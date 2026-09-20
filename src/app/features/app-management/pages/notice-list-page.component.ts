import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { Pagination } from '../../../core/models/pagination.model';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage } from '../../../shared/utils/error-message.util';
import { AppManagementService } from '../app-management.service';
import { AppNoticeDetail } from '../models/app-management.models';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

@Component({
  selector: 'app-notice-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    NgClass,
    FilterPanelComponent,
    FormFeedbackDirective,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    StatusChipComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="App notices">
        <ng-container actions>
          <div class="action-bar">
            <a class="btn btn-secondary" [routerLink]="RoutePaths.appVersionConfig">Version config</a>
            <app-permission-gate [permissions]="[Permissions.APP_MANAGEMENT_WRITE]">
              <a class="btn btn-primary" [routerLink]="RoutePaths.appNoticeCreate">New notice</a>
            </app-permission-gate>
          </div>
        </ng-container>

        <p class="hint">A blocking notice stops clients from proceeding until it is deactivated.</p>

        <!--
          Inactive notices are excluded by the endpoint unless asked for, so the
          toggle is a request rather than a client-side filter over one page.
        -->
        <app-filter-panel (clear)="clear()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="checkbox-field">
                <input type="checkbox" formControlName="includeInactive">
                <span>Include deactivated notices</span>
              </label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (loading()) {
        <app-loading-state label="Loading notices..." />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="reload()" />
      } @else if (notices().length === 0) {
        <app-empty-state title="No notices" description="Create a notice to surface a message in the apps." />
      } @else {
        <section class="panel table-shell">
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="title"
                      label="Notice"
                      (sorted)="search()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="noticeType"
                      label="Type"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Context</th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="scheduledStart"
                      label="Window"
                      (sorted)="search()"
                    />
                  </th>
                  <th>Platforms</th>
                  <th>Status</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (notice of notices(); track notice.id) {
                  <tr [appRowLink]="RoutePaths.appNoticeEdit(notice.id)">
                    <td>
                      <div class="cell-stack">
                        <a class="record-link__primary" [routerLink]="RoutePaths.appNoticeEdit(notice.id)">{{ notice.title }}</a>
                        <span class="muted">{{ notice.body }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="chip-row">
                        <span class="status-chip" [ngClass]="typeClass(notice.type)">{{ notice.type || '-' }}</span>
                        @if (notice.actionType === 'BLOCKING') {
                          <span class="status-chip status-chip--danger">Blocking</span>
                        }
                      </div>
                    </td>
                    <td>{{ notice.displayContext || '-' }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ formatDateTime(notice.scheduledStart) }}</span>
                        <span class="muted">to {{ formatDateTime(notice.scheduledEnd) }}</span>
                      </div>
                    </td>
                    <td>{{ (notice.targetPlatforms ?? []).join(', ') || 'All' }}</td>
                    <td>
                      <app-status-chip [status]="notice.isActive ? 'ACTIVE' : 'INACTIVE'" />
                    </td>
                    <td class="actions-col">
                      <app-permission-gate [permissions]="[Permissions.APP_MANAGEMENT_WRITE]">
                        <div class="row-actions">
                          <button type="button" class="btn btn-secondary btn-sm" [disabled]="busyId() === notice.id" (click)="toggle(notice)">
                            {{ notice.isActive ? 'Deactivate' : 'Activate' }}
                          </button>
                        </div>
                      </app-permission-gate>
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
    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }

    .actions-col {
      white-space: nowrap;
    }

    .chip-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoticeListPageComponent implements OnInit {
  readonly RoutePaths = RoutePaths;
  readonly Permissions = PermissionConstants;

  private readonly appManagement = inject(AppManagementService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('priority', 'desc');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notices = signal<AppNoticeDetail[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly busyId = signal<number | null>(null);
  readonly page = signal(0);
  readonly size = signal(20);

  readonly form = this.formBuilder.group({
    includeInactive: false,
    sort: 'priority',
    direction: 'desc' as 'asc' | 'desc'
  });

  async search(): Promise<void> {
    this.page.set(0);
    await this.reload();
  }

  async clear(): Promise<void> {
    this.form.reset({ includeInactive: false });
    this.page.set(0);
    await this.reload();
  }

  ngOnInit(): void {
    void this.reload();
  }

  async toggle(notice: AppNoticeDetail): Promise<void> {
    this.busyId.set(notice.id);
    this.error.set(null);

    try {
      const updated = await firstValueFrom(this.appManagement.toggleNotice(notice.id));
      this.notices.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }


  async previousPage(): Promise<void> {
    if (this.page() <= 0) {
      return;
    }

    this.page.update((value) => value - 1);
    await this.reload();
  }

  async nextPage(): Promise<void> {
    const pagination = this.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    this.page.set(pagination.page + 1);
    await this.reload();
  }

  async changePageSize(size: number): Promise<void> {
    this.size.set(size);
    this.page.set(0);
    await this.reload();
  }

  typeClass(type?: string | null): string {
    switch (type) {
      case 'MAINTENANCE':
        return 'status-chip--danger';
      case 'DISRUPTION':
        return 'status-chip--warning';
      case 'PROMOTION':
        return 'status-chip--info';
      default:
        return 'status-chip--neutral';
    }
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

    try {
      const result = await firstValueFrom(this.appManagement.getNotices({
        ...this.form.getRawValue(),
        sort: this.sorting.toParams(),
        page: this.page(),
        size: this.size()
      }));
      this.notices.set(result.items);
      this.pagination.set(result.pagination);
    } catch (error) {
      this.error.set(extractErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
