import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

/**
 * One page, four levels. `level` in route data is what tells it which endpoints
 * to talk to, so the chain stays visible in the URL: an agency's document lives
 * under the agency, a room's under its building.
 */
export const CONTRACT_ROUTES: Routes = [
  {
    path: 'master',
    loadComponent: () => import('./pages/contract-template-page.component').then((m) => m.ContractTemplatePageComponent),
    canActivate: [permissionGuard],
    data: {
      level: 'MASTER',
      permissions: [PermissionConstants.CONTRACT_TEMPLATE_MANAGE_ALL],
      title: 'Master contract template'
    }
  },
  {
    path: 'agencies/:agencyId',
    loadComponent: () => import('./pages/contract-template-page.component').then((m) => m.ContractTemplatePageComponent),
    canActivate: [permissionGuard],
    data: {
      level: 'AGENCY',
      permissions: [PermissionConstants.CONTRACT_TEMPLATE_MANAGE, PermissionConstants.CONTRACT_TEMPLATE_MANAGE_ALL],
      title: 'Agency contract template'
    }
  },
  {
    path: 'agencies/:agencyId/buildings/:buildingId',
    loadComponent: () => import('./pages/contract-template-page.component').then((m) => m.ContractTemplatePageComponent),
    canActivate: [permissionGuard],
    data: {
      level: 'BUILDING',
      permissions: [PermissionConstants.CONTRACT_TEMPLATE_MANAGE, PermissionConstants.CONTRACT_TEMPLATE_MANAGE_ALL],
      title: 'Building contract template'
    }
  },
  {
    path: 'agencies/:agencyId/buildings/:buildingId/rooms/:roomId',
    loadComponent: () => import('./pages/contract-template-page.component').then((m) => m.ContractTemplatePageComponent),
    canActivate: [permissionGuard],
    data: {
      level: 'ROOM',
      permissions: [PermissionConstants.CONTRACT_TEMPLATE_MANAGE, PermissionConstants.CONTRACT_TEMPLATE_MANAGE_ALL],
      title: 'Room contract template'
    }
  }
];
