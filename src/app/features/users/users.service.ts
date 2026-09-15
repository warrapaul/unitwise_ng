import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { UserDetail, UserIdentity, UserPreview, UserSearchParams, CreateUserRequest, UpdateUserRequest, AdminUpdateUserRequest } from './models/user.models';
import { buildHttpParams } from '../../shared/utils/query-params.util';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  getUsers(params: UserSearchParams): Observable<PaginatedResult<UserPreview>> {
    return this.http.get<PaginatedApiResponse<UserPreview>>(
      `${this.apiUrl}/${ApiUrls.users}`,
      { params: this.toHttpParams(params) }
    ).pipe(
      map((response) => ({
        items: response.data,
        pagination: response.pagination
      }))
    );
  }

  getProfile(): Observable<UserDetail> {
    return this.http.get<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.userProfile}`).pipe(
      map((response) => response.data)
    );
  }

  getUserById(userId: number): Observable<UserDetail> {
    return this.http.get<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.userById(userId)}`).pipe(
      map((response) => response.data)
    );
  }

  /**
   * Confirm who is behind a uid, and nothing more.
   *
   * Returns identity only — name, photo, whether the account can log in. Not
   * a phone number, not a national ID, and not their tenancies elsewhere: a
   * uid is designed to be handed to a prospective landlord, so anything it
   * reached alone would be reachable by anyone who ever saw it.
   */
  getUserIdentityByUid(uid: string): Observable<UserIdentity> {
    return this.http.get<ApiResponse<UserIdentity>>(`${this.apiUrl}/${ApiUrls.userByUid(uid)}`).pipe(
      map((response) => response.data)
    );
  }

  createUser(request: CreateUserRequest): Observable<UserDetail> {
    return this.http.post<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.users}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateUser(userId: number, request: UpdateUserRequest): Observable<UserDetail> {
    return this.http.patch<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.userById(userId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  adminUpdateUser(userId: number, request: AdminUpdateUserRequest): Observable<UserDetail> {
    return this.http.patch<ApiResponse<UserDetail>>(
      `${this.apiUrl}/${ApiUrls.userAdminUpdate(userId)}`,
      request
    ).pipe(map((response) => response.data));
  }

  regenerateTempPassword(userId: number): Observable<string> {
    return this.http.post<ApiResponse<string>>(
      `${this.apiUrl}/${ApiUrls.userResetPassword(userId)}`,
      {}
    ).pipe(map((response) => response.data ?? response.message));
  }

  deleteUser(userId: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.userById(userId)}`).pipe(
      map(() => void 0)
    );
  }

  /**
   * Deferred to the shared builder, which now owns the whole sort contract —
   * folding a separate `direction` into `sort=field,dir` and sending a
   * multi-column ordering as repeated `sort` params. Keeping a second copy here
   * is how the two would drift.
   */
  private toHttpParams(params: UserSearchParams): HttpParams {
    return buildHttpParams(params);
  }
}
