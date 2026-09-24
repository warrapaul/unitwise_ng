import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormFeedbackDirective } from '../../../shared/directives/form-feedback.directive';
import { UsersService } from '../users.service';
import { RoutePaths } from '../../../core/routes/route-paths';
import { extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { RowLinkDirective } from '../../../shared/directives/row-link.directive';
import { SortHeaderComponent } from '../../../shared/components/sort-header/sort-header.component';
import { sortState } from '../../../shared/utils/sort-state.util';

type UserSortField = 'firstName' | 'email' | 'phoneNumber' | 'userUid' | 'nationalIdNumber' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-user-list-page',
  standalone: true,
  imports: [
    SortHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent,
    RowLinkDirective,
    FilterPanelComponent,
    FormFeedbackDirective
  ],
  template: `
    <section class="stack">
      <app-section-card title="Users">
        <ng-container actions>
          <app-permission-gate [permissions]="['USER_CREATE']">
            <a routerLink="/admin/users/new" class="btn btn-primary">Add user</a>
          </app-permission-gate>
        </ng-container>

        <app-filter-panel (clear)="reset()" actions [form]="form">
          <form class="filters" [formGroup]="form" appFormFeedback (ngSubmit)="search()">
            <div class="grid-auto filters-grid">
              <label class="field"><span>First name</span><input formControlName="firstName"></label>
              <label class="field"><span>Last name</span><input formControlName="lastName"></label>
              <label class="field"><span>Email</span><input formControlName="email"></label>
              <label class="field"><span>Phone number</span><input formControlName="phoneNumber"></label>
              <label class="field">
                <span>Unitwise ID</span>
                <input formControlName="userUid" class="mono" >
              </label>
              <label class="field"><span>National ID</span><input formControlName="nationalId"></label>
            </div>
            <div class="button-row">
              <button type="submit" class="btn btn-primary">Search</button>
              <button type="button" class="btn btn-secondary" (click)="reset()">Clear</button>
            </div>
          </form>
        </app-filter-panel>
      </app-section-card>

      @if (store.loading()) {
        <app-loading-state label="Loading users..." />
      } @else if (store.error()) {
        <app-error-state [message]="store.error() || 'Unable to load users'" (retry)="reload()" />
      } @else if (store.users().length === 0) {
        <app-empty-state
          title="No users found"
          description="Try changing the search filters or create a new user."
        />
      } @else {
        <section class="panel table-shell">

          <div class="table-scroll">
            <table class="table users-table">
              <thead>
                <tr>
<th>
                    <app-sort-header
                      [state]="sorting"
                      field="firstName"
                      label="User"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="phoneNumber"
                      label="Phone"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="email"
                      label="Email"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="userUid"
                      label="Identifiers"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="status"
                      label="Status"
                      (sorted)="applySort()"
                    />
                  </th>
                  <th>
                    <app-sort-header
                      [state]="sorting"
                      field="createdAt"
                      label="Created"
                      (sorted)="applySort()"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (user of store.users(); track user.id) {
                  <tr [appRowLink]="['/admin/users', user.id]">
                    <td>
                      <a class="user-link" [routerLink]="['/admin/users', user.id]">
                        <span class="avatar" aria-hidden="true">{{ initials(user) }}</span>
                        <span class="user-link__text">
                          <strong>{{ displayName(user) }}</strong>
                        </span>
                      </a>
                    </td>
                    <td class="mono">{{ user.phoneNumber || '-' }}</td>
                    <td class="wrap-anywhere">{{ user.email || '-' }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ user.userUid || '-' }}</span>
                        <span class="muted">{{ user.nationalIdNumber }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="status-pill" [class.status-pill--active]="user.isActive" [class.status-pill--inactive]="!user.isActive">
                        {{ user.isActive ? 'Active' : 'Inactive' }}
                      </span>
                      @if (user.emailVerified) {
                        <span class="status-note">Verified</span>
                      }
                    </td>
                    <td>{{ formatDate(user.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        @if (store.pagination()) {
          <app-pagination
            [shown]="store.users().length"
            [total]="store.pagination()?.totalElements ?? store.users().length"
            noun="users"
            [pagination]="store.pagination()!"
            [size]="store.pagination()?.size ?? store.filters().size ?? 20"
            [sizes]="pageSizeOptions"
            (previous)="previousPage()"
            (next)="nextPage()"
            (sizeChange)="changePageSize($event)"
          />
        }
      }
    </section>
  `,
  styles: [`
    .uid-lookup {
      display: flex;
      align-items: end;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .filters {
      display: grid;
      gap: 0.75rem;
    }


    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .filters .field {
      gap: 0.4rem;
    }

    .filters .field span {
      font-size: 0.82rem;
    }

    .filters .field input {
      padding-block: 0.68rem;
      min-height: 2.75rem;
    }

    .filters .button-row .btn {
      padding: 0.68rem 1rem;
      font-size: 0.95rem;
    }

    .table-shell {
      display: grid;
      gap: 0.75rem;
      padding: 1rem;
    }



    .sort-button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .sort-button span {
      color: var(--text-muted);
      font-size: 0.75rem;
      line-height: 1;
    }

    .table-scroll {
      overflow: auto;
    }

    .users-table th,
    .users-table td {
      vertical-align: top;
      white-space: nowrap;
    }

    .users-table td:first-child,
    .users-table th:first-child {
      white-space: normal;
      min-width: 240px;
    }

    .users-table tbody tr:hover td {
      background: var(--primary-tint);
    }

    .user-link {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
    }

    .avatar {
      display: inline-grid;
      place-items: center;
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 999px;
      background: var(--primary-tint);
      color: var(--primary-strong);
      font-size: 0.85rem;
      font-weight: 700;
      flex: none;
    }

    .user-link__text {
      display: grid;
      gap: 0.15rem;
    }

    .cell-stack {
      display: grid;
      gap: 0.18rem;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.28rem 0.65rem;
      font-size: 0.78rem;
      font-weight: 600;
      border: 1px solid transparent;
    }

    .status-pill--active {
      color: var(--success);
      background: var(--success-tint);
      border-color: var(--success-border);
    }

    .status-pill--inactive {
      color: var(--danger);
      background: var(--danger-tint);
      border-color: var(--danger-border);
    }

    .status-note {
      display: block;
      margin-top: 0.35rem;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserListPageComponent implements OnInit {

  private readonly fb = inject(NonNullableFormBuilder);
  readonly store = inject(UsersStore);
  private readonly usersService = inject(UsersService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    firstName: [''],
    lastName: [''],
    email: [''],
    phoneNumber: [''],
    nationalId: [''],
    userUid: ['']
  });

  readonly pageSizeOptions = [10, 20, 50];

  ngOnInit(): void {
    void this.store.loadUsers();
  }

  search(): void {
    void this.store.loadUsers({
      ...this.form.getRawValue(),
      page: 0
    });
  }

  reset(): void {
    this.form.reset();
    void this.store.loadUsers(
      {
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        nationalId: '',
        userUid: '',
        page: 0,
        size: this.store.filters().size,
        sort: this.sorting.toParams()
      },
      { replaceFilters: true }
    );
  }

  /** Ordering the table asks the server for; shift-click adds a second key. */
  readonly sorting = sortState('createdAt', 'desc');

  reload(): void {
    void this.store.loadUsers(this.store.filters());
  }

  /** A new ordering starts at the first page, like any other query change. */
  applySort(): void {
    void this.store.loadUsers({ ...this.store.filters(), sort: this.sorting.toParams(), page: 0 });
  }



  changePageSize(size: number): void {
    void this.store.loadUsers({
      ...this.store.filters(),
      size,
      page: 0
    });
  }

  displayName(user: { firstName: string; middleName?: string | null; lastName: string }): string {
    return [user.firstName, user.middleName, user.lastName]
      .filter((part): part is string => !!part && part.trim().length > 0)
      .join(' ');
  }

  initials(user: { firstName: string; middleName?: string | null; lastName: string }): string {
    return [user.firstName, user.middleName, user.lastName]
      .filter((part): part is string => !!part && part.trim().length > 0)
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return this.dateFormatter.format(date);
  }

  previousPage(): void {
    const pagination = this.store.pagination();
    if (!pagination || pagination.isFirst) {
      return;
    }

    void this.store.loadUsers({ ...this.store.filters(), page: pagination.page - 1 });
  }

  nextPage(): void {
    const pagination = this.store.pagination();
    if (!pagination || pagination.isLast) {
      return;
    }

    void this.store.loadUsers({ ...this.store.filters(), page: pagination.page + 1 });
  }

  private readonly dateFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  });

  /** Jumps straight to the user a UID names, or says it matched nothing. */
}
