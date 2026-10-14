import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const GEO_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'regions'
  },
  {
    path: 'regions',
    loadComponent: () => import('./pages/region-list-page.component').then((m) => m.RegionListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_REGION_READ], title: 'Geo regions' }
  },
  {
    path: 'regions/new',
    loadComponent: () => import('./pages/region-form-page.component').then((m) => m.RegionFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_REGION_CREATE], title: 'Create region' }
  },
  {
    path: 'regions/:id',
    loadComponent: () => import('./pages/region-detail-page.component').then((m) => m.RegionDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_REGION_READ], title: 'Region detail' }
  },
  {
    path: 'regions/:id/edit',
    loadComponent: () => import('./pages/region-form-page.component').then((m) => m.RegionFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_REGION_UPDATE], title: 'Edit region' }
  },
  {
    path: 'landmarks',
    loadComponent: () => import('./pages/landmark-list-page.component').then((m) => m.LandmarkListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_LANDMARK_READ], title: 'Geo landmarks' }
  },
  {
    path: 'landmarks/new',
    loadComponent: () => import('./pages/landmark-form-page.component').then((m) => m.LandmarkFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_LANDMARK_CREATE], title: 'Create landmark' }
  },
  {
    path: 'landmarks/:id',
    loadComponent: () => import('./pages/landmark-detail-page.component').then((m) => m.LandmarkDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_LANDMARK_READ], title: 'Landmark detail' }
  },
  {
    path: 'landmarks/:id/edit',
    loadComponent: () => import('./pages/landmark-form-page.component').then((m) => m.LandmarkFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_LANDMARK_UPDATE], title: 'Edit landmark' }
  },
  {
    path: 'buildings',
    loadComponent: () => import('./pages/building-list-page.component').then((m) => m.BuildingListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_BUILDING_READ], title: 'Geo buildings' }
  },
  {
    path: 'buildings/new',
    loadComponent: () => import('./pages/building-form-page.component').then((m) => m.BuildingFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_BUILDING_CREATE], title: 'New building' }
  },
  {
    path: 'buildings/:id',
    loadComponent: () => import('./pages/building-detail-page.component').then((m) => m.BuildingDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_BUILDING_READ], title: 'Building' }
  },
  {
    path: 'buildings/:id/edit',
    loadComponent: () => import('./pages/building-form-page.component').then((m) => m.BuildingFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.GEO_BUILDING_UPDATE], title: 'Edit building' }
  }
];
