export type RoleScope = 'SYSTEM' | 'AGENCY_MANAGEMENT' | 'ECOMMERCE';
export type PermissionAction = 'GRANT' | 'REVOKE';

export interface PermissionResponse {
  id: number;
  name: string;
  category?: string;
  description?: string;
  enabled: boolean;
  roleScope?: RoleScope;
}

export interface RoleResponse {
  id: number;
  name: string;
  description?: string;
  enabled: boolean;
  permissions: PermissionResponse[];
  roleScope?: RoleScope;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissionIds?: number[];
}

export interface UpdateRoleRequest {
  name: string;
  description?: string;
  enabled: boolean;
  permissionIds?: number[];
}

export interface ToggleRolePermissionRequest {
  roleId: number;
  permissionId: number;
  action: PermissionAction;
}

export interface UpdateUserRolesRequest {
  roleIds: number[];
}
