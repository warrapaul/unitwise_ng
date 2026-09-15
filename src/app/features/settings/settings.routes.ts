import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'cache'
  },
  {
    path: 'cache',
    loadComponent: () => import('./pages/cache-manager-page.component').then((m) => m.CacheManagerPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.APP_MANAGEMENT_WRITE], title: 'Cache manager' }
  }
];
