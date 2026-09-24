import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const HOUSING_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'agencies'
  },
  {
    path: 'agencies',
    loadComponent: () => import('./agencies/agency-list-page.component').then((m) => m.AgencyListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.AGENCY_READ_ALL, PermissionConstants.AGENCY_READ], title: 'Agencies' }
  },
  {
    path: 'agencies/new',
    loadComponent: () => import('./agencies/agency-form-page.component').then((m) => m.AgencyFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.AGENCY_CREATE], title: 'Create agency' }
  },
  {
    path: 'my-agencies',
    loadComponent: () => import('./agencies/my-agencies-page.component').then((m) => m.MyAgenciesPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.AGENCY_READ], title: 'My agencies' }
  },
  {
    path: 'agencies/:id',
    loadComponent: () => import('./agencies/agency-detail-page.component').then((m) => m.AgencyDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.AGENCY_READ, PermissionConstants.AGENCY_READ_ALL], title: 'Agency detail' }
  },
  {
    path: 'agencies/:id/edit',
    loadComponent: () => import('./agencies/agency-form-page.component').then((m) => m.AgencyFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.AGENCY_UPDATE], title: 'Edit agency' }
  },
  {
    path: 'buildings',
    loadComponent: () => import('./buildings/building-list-page.component').then((m) => m.BuildingListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BUILDING_READ, PermissionConstants.BUILDING_READ_ALL], title: 'Buildings' }
  },
  {
    path: 'buildings/new',
    loadComponent: () => import('./buildings/building-form-page.component').then((m) => m.BuildingFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BUILDING_CREATE], title: 'Create building' }
  },
  {
    path: 'buildings/:agencyId/:buildingId',
    loadComponent: () => import('./buildings/building-detail-page.component').then((m) => m.BuildingDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BUILDING_READ, PermissionConstants.BUILDING_READ_ALL], title: 'Building detail' }
  },
  {
    path: 'buildings/:agencyId/:buildingId/edit',
    loadComponent: () => import('./buildings/building-form-page.component').then((m) => m.BuildingFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BUILDING_UPDATE], title: 'Edit building' }
  },
  {
    // Monthly charges now live on the building page itself (its "Monthly
    // charges" card), priced through charge templates. Old links land there.
    path: 'buildings/:agencyId/:buildingId/utilities',
    redirectTo: 'buildings/:agencyId/:buildingId'
  },
  {
    path: 'buildings/:agencyId/:buildingId/rooms/:roomId',
    loadComponent: () => import('./rooms/room-detail-page.component').then((m) => m.RoomDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BUILDING_READ, PermissionConstants.BUILDING_READ_ALL], title: 'Room detail' }
  },
  ];
