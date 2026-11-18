import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const APP_MANAGEMENT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'notices'
  },
  {
    path: 'notices',
    loadComponent: () => import('./pages/notice-list-page.component').then((m) => m.NoticeListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.APP_MANAGEMENT_READ], title: 'App notices' }
  },
  {
    path: 'notices/new',
    loadComponent: () => import('./pages/notice-form-page.component').then((m) => m.NoticeFormPageComponent),
    canDeactivate: [unsavedChangesGuard],
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.APP_MANAGEMENT_WRITE], title: 'New notice' }
  },
  {
    path: 'notices/:id/edit',
    loadComponent: () => import('./pages/notice-form-page.component').then((m) => m.NoticeFormPageComponent),
    canDeactivate: [unsavedChangesGuard],
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.APP_MANAGEMENT_WRITE], title: 'Edit notice' }
  },
  {
    path: 'version-config',
    loadComponent: () => import('./pages/version-config-page.component').then((m) => m.VersionConfigPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.APP_MANAGEMENT_READ], title: 'Version config' }
  },
  {
    path: 'help-privacy',
    loadComponent: () => import('./pages/app-info-page.component').then((m) => m.AppInfoPageComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PermissionConstants.APP_MANAGEMENT_WRITE], title: 'Website content' }
  }
];
