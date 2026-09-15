import { computed, inject } from '@angular/core';
import { ApiError, extractErrorMessage, toApiError } from '../../../shared/utils/error-message.util';
import { signalStore, withComputed, withMethods, withState, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { UsersService } from '../users.service';
import {
  AdminUpdateUserRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UserDetail,
  UserPreview,
  UserSearchParams
} from '../models/user.models';
import { PaginatedResult } from '../../../core/models/pagination.model';

export interface UsersState {
  loading: boolean;
  mutating: boolean;
  /** A failed load — rendered by the error-state that replaces the page. */
  error: string | null;
  /**
   * A failed create/update/delete, kept apart so it can be shown *on* the form
   * the operator just submitted instead of replacing it (§31.2). Carries
   * `details[]`, the per-field list a 400 returns.
   */
  mutationError: ApiError | null;
  users: UserPreview[];
  selectedUser: UserDetail | null;
  profile: UserDetail | null;
  pagination: PaginatedResult<UserPreview>['pagination'] | null;
  filters: UserSearchParams;
}

const initialState: UsersState = {
  loading: false,
  mutating: false,
  error: null,
  mutationError: null,
  users: [],
  selectedUser: null,
  profile: null,
  pagination: null,
  filters: {
    page: 0,
    size: 20,
    sort: 'createdAt',
    direction: 'desc'
  }
};


export const UsersStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    hasUsers: computed(() => store.users().length > 0),
    totalUsers: computed(() => store.pagination()?.totalElements ?? store.users().length)
  })),
  withMethods((store, usersService = inject(UsersService)) => ({
    async loadUsers(filters?: Partial<UserSearchParams>, options?: { replaceFilters?: boolean }): Promise<void> {
      const mergedFilters = options?.replaceFilters
        ? { ...initialState.filters, ...filters }
        : { ...store.filters(), ...filters };
      patchState(store, { loading: true, error: null, filters: mergedFilters });

      try {
        const result = await firstValueFrom(usersService.getUsers(mergedFilters));
        patchState(store, {
          loading: false,
          users: result.items,
          pagination: result.pagination
        });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async loadProfile(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const profile = await firstValueFrom(usersService.getProfile());
        patchState(store, { loading: false, profile });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async loadUser(userId: number): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const selectedUser = await firstValueFrom(usersService.getUserById(userId));
        patchState(store, { loading: false, selectedUser });
      } catch (error) {
        patchState(store, { loading: false, error: extractErrorMessage(error) });
      }
    },

    async createUser(request: CreateUserRequest): Promise<void> {
      patchState(store, { mutating: true, mutationError: null });
      try {
        const created = await firstValueFrom(usersService.createUser(request));
        patchState(store, {
          mutating: false,
          selectedUser: created,
          users: [created, ...store.users()]
        });
      } catch (error) {
        patchState(store, { mutating: false, mutationError: toApiError(error) });
      }
    },

    async updateUser(userId: number, request: UpdateUserRequest): Promise<void> {
      patchState(store, { mutating: true, mutationError: null });
      try {
        const updated = await firstValueFrom(usersService.updateUser(userId, request));
        patchState(store, {
          mutating: false,
          selectedUser: updated,
          users: store.users().map((user) => (user.id === updated.id ? { ...user, ...updated } : user))
        });
      } catch (error) {
        patchState(store, { mutating: false, mutationError: toApiError(error) });
      }
    },

    async adminUpdateUser(userId: number, request: AdminUpdateUserRequest): Promise<void> {
      patchState(store, { mutating: true, mutationError: null });
      try {
        const updated = await firstValueFrom(usersService.adminUpdateUser(userId, request));
        patchState(store, {
          mutating: false,
          selectedUser: updated,
          users: store.users().map((user) => (user.id === updated.id ? { ...user, ...updated } : user))
        });
      } catch (error) {
        patchState(store, { mutating: false, mutationError: toApiError(error) });
      }
    },

    async regenerateTempPassword(userId: number): Promise<void> {
      patchState(store, { mutating: true, mutationError: null });
      try {
        await firstValueFrom(usersService.regenerateTempPassword(userId));
        patchState(store, { mutating: false });
      } catch (error) {
        patchState(store, { mutating: false, mutationError: toApiError(error) });
      }
    },

    async deleteUser(userId: number): Promise<void> {
      patchState(store, { mutating: true, mutationError: null });
      try {
        await firstValueFrom(usersService.deleteUser(userId));
        patchState(store, {
          mutating: false,
          users: store.users().filter((user) => user.id !== userId),
          selectedUser: store.selectedUser()?.id === userId ? null : store.selectedUser()
        });
      } catch (error) {
        patchState(store, { mutating: false, mutationError: toApiError(error) });
      }
    },

    clearSelection(): void {
      patchState(store, { selectedUser: null, error: null });
    }
  }))
);
