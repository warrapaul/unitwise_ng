import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const ACCESS_CONTROL_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'roles'
  },
  {
    path: 'roles',
    loadComponent: () => import('./pages/role-list-page.component').then((m) => m.RoleListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.ROLE_READ], title: 'Roles' }
  },
  {
    path: 'roles/new',
    loadComponent: () => import('./pages/role-form-page.component').then((m) => m.RoleFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.ROLE_CREATE], title: 'Create role' }
  },
  {
    path: 'roles/:id',
    loadComponent: () => import('./pages/role-detail-page.component').then((m) => m.RoleDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.ROLE_READ], title: 'Role detail' }
  },
  {
    path: 'roles/:id/edit',
    loadComponent: () => import('./pages/role-form-page.component').then((m) => m.RoleFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.ROLE_CREATE], title: 'Edit role' }
  },
  {
    path: 'permissions',
    loadComponent: () => import('./pages/permission-list-page.component').then((m) => m.PermissionListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.PERMISSION_READ], title: 'Permissions' }
  }
];
