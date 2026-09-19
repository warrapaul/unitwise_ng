import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry, tap } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
import { ReferenceCache } from '../../core/cache/reference-cache';
import { UserDetail } from '../users/models/user.models';
import {
  CreateRoleRequest,
  PermissionResponse,
  RoleResponse,
  ToggleRolePermissionRequest,
  UpdateRoleRequest,
  UpdateUserRolesRequest
} from './models/access-control.models';

@Injectable({ providedIn: 'root' })
export class AccessControlService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  /*
   * Picker lists, cached for the session. Every write below that can change
   * them ends in invalidateRoles() — this service is the only place the app
   * edits a role, so the cache and its invalidation stay in one file.
   *
   * Permissions have no writer at all: the backend seeds them and nothing in
   * this app creates one, so the cache only ever needs filling.
   */
  private readonly rolesCache = new ReferenceCache(() => this.fetchRoles(ApiUrls.roles));
  private readonly agencyRolesCache = new ReferenceCache(() => this.fetchRoles(ApiUrls.agencyRoles));
  private readonly permissionsCache = new ReferenceCache(() => this.fetchPermissions());

  getRoles(): Observable<RoleResponse[]> {
    return this.rolesCache.read();
  }

  getAgencyRoles(): Observable<RoleResponse[]> {
    return this.agencyRolesCache.read();
  }

  /** Both lists come from the same table, so both go when either changes. */
  invalidateRoles(): void {
    this.rolesCache.invalidate();
    this.agencyRolesCache.invalidate();
  }

  private fetchRoles(url: string): Observable<RoleResponse[]> {
    return this.http.get<ApiResponse<RoleResponse[]>>(`${this.apiUrl}/${url}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  private fetchPermissions(): Observable<PermissionResponse[]> {
    return this.http.get<ApiResponse<PermissionResponse[]>>(`${this.apiUrl}/${ApiUrls.permissions}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  getRole(roleId: number): Observable<RoleResponse> {
    return this.http.get<ApiResponse<RoleResponse>>(`${this.apiUrl}/${ApiUrls.roleById(roleId)}`).pipe(
      map((response) => response.data)
    );
  }

  createRole(request: CreateRoleRequest): Observable<RoleResponse> {
    return this.http.post<ApiResponse<RoleResponse>>(`${this.apiUrl}/${ApiUrls.roles}`, request).pipe(
      map((response) => response.data),
      tap(() => this.invalidateRoles())
    );
  }

  updateRole(roleId: number, request: UpdateRoleRequest): Observable<RoleResponse> {
    return this.http.patch<ApiResponse<RoleResponse>>(`${this.apiUrl}/${ApiUrls.roleById(roleId)}`, request).pipe(
      map((response) => response.data),
      tap(() => this.invalidateRoles())
    );
  }

  deleteRole(roleId: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.roleById(roleId)}`).pipe(
      map(() => void 0),
      tap(() => this.invalidateRoles())
    );
  }

  toggleRolePermission(request: ToggleRolePermissionRequest): Observable<RoleResponse> {
    return this.http.post<ApiResponse<RoleResponse>>(`${this.apiUrl}/${ApiUrls.roleTogglePermission}`, request).pipe(
      map((response) => response.data),
      tap(() => this.invalidateRoles())
    );
  }

  updateUserRoles(userId: number, request: UpdateUserRolesRequest): Observable<UserDetail> {
    return this.http.patch<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.userRoles(userId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  getPermissions(): Observable<PermissionResponse[]> {
    return this.permissionsCache.read();
  }

  getPermission(permissionId: number): Observable<PermissionResponse> {
    return this.http.get<ApiResponse<PermissionResponse>>(`${this.apiUrl}/${ApiUrls.permissionById(permissionId)}`).pipe(
      map((response) => response.data)
    );
  }
}
