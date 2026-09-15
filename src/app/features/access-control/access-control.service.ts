import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, retry, shareReplay } from 'rxjs';
import { API_URL } from '../../core/tokens/api-url.token';
import { ApiResponse } from '../../core/models/api-response.model';
import { ApiUrls } from '../../core/constants/api-urls';
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
  private permissionsCache?: Observable<PermissionResponse[]>;

  getRoles(): Observable<RoleResponse[]> {
    return this.http.get<ApiResponse<RoleResponse[]>>(`${this.apiUrl}/${ApiUrls.roles}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? [])
    );
  }

  getAgencyRoles(): Observable<RoleResponse[]> {
    return this.http.get<ApiResponse<RoleResponse[]>>(`${this.apiUrl}/${ApiUrls.agencyRoles}`).pipe(
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
      map((response) => response.data)
    );
  }

  updateRole(roleId: number, request: UpdateRoleRequest): Observable<RoleResponse> {
    return this.http.patch<ApiResponse<RoleResponse>>(`${this.apiUrl}/${ApiUrls.roleById(roleId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  deleteRole(roleId: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.apiUrl}/${ApiUrls.roleById(roleId)}`).pipe(
      map(() => void 0)
    );
  }

  toggleRolePermission(request: ToggleRolePermissionRequest): Observable<RoleResponse> {
    return this.http.post<ApiResponse<RoleResponse>>(`${this.apiUrl}/${ApiUrls.roleTogglePermission}`, request).pipe(
      map((response) => response.data)
    );
  }

  updateUserRoles(userId: number, request: UpdateUserRolesRequest): Observable<UserDetail> {
    return this.http.patch<ApiResponse<UserDetail>>(`${this.apiUrl}/${ApiUrls.userRoles(userId)}`, request).pipe(
      map((response) => response.data)
    );
  }

  getPermissions(): Observable<PermissionResponse[]> {
    this.permissionsCache ??= this.http.get<ApiResponse<PermissionResponse[]>>(`${this.apiUrl}/${ApiUrls.permissions}`).pipe(
      retry({ count: 2, delay: 1000 }),
      map((response) => response.data ?? []),
      shareReplay(1)
    );

    return this.permissionsCache;
  }

  getPermission(permissionId: number): Observable<PermissionResponse> {
    return this.http.get<ApiResponse<PermissionResponse>>(`${this.apiUrl}/${ApiUrls.permissionById(permissionId)}`).pipe(
      map((response) => response.data)
    );
  }
}
