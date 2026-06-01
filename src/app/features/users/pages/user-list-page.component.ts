import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UsersStore } from '../store/users.store';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';

type UserSortField = 'firstName' | 'email' | 'phoneNumber' | 'userUid' | 'nationalIdNumber' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-user-list-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginationComponent,
    SectionCardComponent,
    PermissionGateComponent
  ],
  template: `
    <section class="stack">
      <app-section-card title="Users">
        <ng-container actions>
          <app-permission-gate [permissions]="['USER_CREATE']">
            <a routerLink="/users/new" class="btn btn-primary">Add user</a>
          </app-permission-gate>
        </ng-container>

        <form class="filters" [formGroup]="form" (ngSubmit)="search()">
          <div class="grid-auto filters-grid">
            <label class="field"><span>First name</span><input formControlName="firstName"></label>
            <label class="field"><span>Last name</span><input formControlName="lastName"></label>
            <label class="field"><span>Email</span><input formControlName="email"></label>
            <label class="field"><span>Phone number</span><input formControlName="phoneNumber"></label>
            <label class="field"><span>User UID</span><input formControlName="userUid"></label>
            <label class="field"><span>National ID</span><input formControlName="nationalId"></label>
          </div>
          <div class="button-row">
            <button type="submit" class="btn btn-primary">Search</button>
            <button type="button" class="btn btn-secondary" (click)="reset()">Clear</button>
          </div>
        </form>
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
          <header class="table-shell__header">
            <p class="muted">Showing {{ store.users().length }} of {{ store.pagination()?.totalElements ?? store.users().length }} users</p>
            <p class="muted">Page {{ (store.pagination()?.page ?? 0) + 1 }} of {{ store.pagination()?.totalPages || 1 }}</p>
          </header>

          <div class="table-scroll">
            <table class="table users-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('firstName')">
                      User <span>{{ sortMarker('firstName') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('email')">
                      Contact <span>{{ sortMarker('email') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('userUid')">
                      Identifiers <span>{{ sortMarker('userUid') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('status')">
                      Status <span>{{ sortMarker('status') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-button" (click)="sortBy('createdAt')">
                      Created <span>{{ sortMarker('createdAt') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (user of store.users(); track user.id) {
                  <tr>
                    <td>
                      <a class="user-link" [routerLink]="['/users', user.id]">
                        <span class="avatar" aria-hidden="true">{{ initials(user) }}</span>
                        <span class="user-link__text">
                          <strong>{{ displayName(user) }}</strong>
                          <span class="muted">View details</span>
                        </span>
                      </a>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ user.email }}</span>
                        <span class="muted">{{ user.phoneNumber }}</span>
                      </div>
                    </td>
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
    .filters {
      display: grid;
      gap: 0.75rem;
    }

    .filters-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.65rem;
    }

    .button-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .filters .field {
      gap: 0.3rem;
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

    .table-shell__header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .table-shell__header p {
      margin: 0;
      font-size: 0.9rem;
    }

    .sort-button {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
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
      background: rgba(79, 132, 217, 0.03);
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
      background: rgba(79, 132, 217, 0.1);
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
      color: #1f6d52;
      background: rgba(31, 157, 106, 0.1);
      border-color: rgba(31, 157, 106, 0.16);
    }

    .status-pill--inactive {
      color: #8d4a4a;
      background: rgba(201, 79, 79, 0.08);
      border-color: rgba(201, 79, 79, 0.16);
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
        sort: this.store.filters().sort,
        direction: this.store.filters().direction
      },
      { replaceFilters: true }
    );
  }

  reload(): void {
    void this.store.loadUsers(this.store.filters());
  }

  sortBy(field: UserSortField): void {
    const filters = this.store.filters();
    const nextDirection: SortDirection = filters.sort === field && filters.direction === 'desc' ? 'asc' : 'desc';

    void this.store.loadUsers({
      ...filters,
      sort: field,
      direction: nextDirection,
      page: 0
    });
  }

  sortMarker(field: UserSortField): string {
    const filters = this.store.filters();
    if (filters.sort !== field) {
      return '↕';
    }

    return filters.direction === 'asc' ? '↑' : '↓';
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
}
