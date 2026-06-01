import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse, PaginatedApiResponse } from '../../core/models/api-response.model';
import { PaginatedResult } from '../../core/models/pagination.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { UserDetail, UserPreview, UserSearchParams, CreateUserRequest, UpdateUserRequest, AdminUpdateUserRequest } from './models/user.models';

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

  getUserByUid(uid: string): Observable<UserDetail> {
    return this.http.get<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.userByUid(uid)}`).pipe(
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

  private toHttpParams(params: UserSearchParams): HttpParams {
    let httpParams = new HttpParams();
    const { sort, direction, ...rest } = params;

    for (const [key, value] of Object.entries(rest)) {
      if (value === null || value === undefined || value === '') {
        continue;
      }

      httpParams = httpParams.set(key, String(value));
    }

    const normalizedSort = sort
      ? direction
        ? `${sort},${direction}`
        : sort
      : null;

    if (normalizedSort) {
      httpParams = httpParams.set('sort', normalizedSort);
    }

    return httpParams;
  }
}
