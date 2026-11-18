import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const TENANTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./tenants/tenant-list-page.component').then((m) => m.TenantListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.TENANT_READ_ALL, PermissionConstants.TENANT_READ, PermissionConstants.SINGLE_TENANT_READ], title: 'Tenants' }
  },
    {
    // The overview became the summary row on the tenants list; old links land there.
    path: 'overview',
    pathMatch: 'full',
    redirectTo: ''
  },
  {
    path: 'new',
    loadComponent: () => import('./tenants/tenant-form-page.component').then((m) => m.TenantFormPageComponent),
    canDeactivate: [unsavedChangesGuard],
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.TENANT_CREATE, PermissionConstants.BUILDING_TENANT_MANAGE], title: 'New tenant' }
  },
  {
    // Moving a building's existing tenants in from a filled-in rooms sheet.
    path: 'import',
    loadComponent: () => import('./import/tenant-import-page.component').then((m) => m.TenantImportPageComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PermissionConstants.TENANT_CREATE, PermissionConstants.BUILDING_TENANT_MANAGE], title: 'Import tenants' }
  },
    {
    // Adding somebody who already has an account. Same permission as creating
    // one from scratch — it is the same act, with the identity confirmed first.
    path: 'add-existing',
    loadComponent: () => import('./tenants/add-existing-tenant-page.component').then((m) => m.AddExistingTenantPageComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PermissionConstants.TENANT_CREATE, PermissionConstants.BUILDING_TENANT_MANAGE], title: 'Add tenant' }
  },
    {
    path: 'leases',
    loadComponent: () => import('./leases/lease-list-page.component').then((m) => m.LeaseListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.LEASE_AGREEMENT_READ_ALL, PermissionConstants.LEASE_AGREEMENT_READ, PermissionConstants.LEASE_READ], title: 'Leases' }
  },
    {
    path: 'leases/:id',
    loadComponent: () => import('./leases/lease-detail-page.component').then((m) => m.LeaseDetailPageComponent),
    data: { title: 'Lease detail' }
  },
  {
    path: 'amendments',
    loadComponent: () => import('./amendments/amendment-list-page.component').then((m) => m.AmendmentListPageComponent),
    canActivate: [permissionGuard],
    data: {
      permissions: [PermissionConstants.LEASE_AMENDMENT_READ, PermissionConstants.LEASE_AMENDMENT_READ_ALL],
      title: 'Lease amendments'
    }
  },
  {
    path: 'amendments/:id',
    loadComponent: () => import('./amendments/amendment-detail-page.component').then((m) => m.AmendmentDetailPageComponent),
    canActivate: [permissionGuard],
    data: {
      permissions: [PermissionConstants.LEASE_AMENDMENT_READ, PermissionConstants.LEASE_AMENDMENT_READ_ALL],
      title: 'Amendment detail'
    }
  },
  {
    path: 'maintenance',
    loadComponent: () => import('../maintenance/pages/maintenance-list-page.component').then((m) => m.MaintenanceListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.MAINTENANCE_READ_ALL, PermissionConstants.MAINTENANCE_READ], title: 'Maintenance' }
  },
  {
    // One request on its own page; the list above links here.
    path: 'maintenance/:agencyId/:buildingId/:id',
    loadComponent: () => import('../maintenance/pages/maintenance-detail-page.component').then((m) => m.MaintenanceDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.MAINTENANCE_READ_ALL, PermissionConstants.MAINTENANCE_READ], title: 'Repair request' }
  },
  {
    path: 'applications',
    loadComponent: () => import('./applications/room-application-list-page.component').then((m) => m.RoomApplicationListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.ROOM_APPLICATION_READ_ALL, PermissionConstants.ROOM_APPLICATION_READ], title: 'Room applications' }
  },
    {
    path: 'applications/:id',
    loadComponent: () => import('./applications/room-application-detail-page.component').then((m) => m.RoomApplicationDetailPageComponent),
    data: { title: 'Application detail' }
  },
  {
    // What tenants have allowed this agency to read. Same permission as
    // reading a document, because that is exactly what it governs.
    path: 'profile-sharing',
    loadComponent: () => import('./profile-grants/agency-profile-grants-page.component').then((m) => m.AgencyProfileGrantsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.TENANT_DOCUMENT_READ_ALL, PermissionConstants.TENANT_DOCUMENT_READ], title: 'Profile sharing' }
  },
  {
    // Kept so links from before documents moved under the tenant still open.
    path: 'documents/:id',
    loadComponent: () => import('./documents/document-detail-page.component').then((m) => m.TenantDocumentDetailPageComponent),
    data: { title: 'Document detail' }
  },
  {
    // Conversations with tenants are the chat now; the old list lands there.
    path: 'messages',
    pathMatch: 'full',
    redirectTo: '/chat'
  },
    {
    path: 'messages/:id',
    loadComponent: () => import('./messages/tenant-message-detail-page.component').then((m) => m.TenantMessageDetailPageComponent),
    data: { title: 'Message detail' }
  },
  {
    path: 'verification-snapshots/:agencyId/:buildingId/:tenantId/:id',
    loadComponent: () => import('./snapshots/snapshot-detail-page.component').then((m) => m.SnapshotDetailPageComponent),
    data: { title: 'Snapshot detail' }
  },
  {
    // Walking the room when they leave: condition, photos and the deposit deductions.
    path: ':agencyId/:buildingId/:tenantId/move-out',
    loadComponent: () => import('./move-out/move-out-inspection-page.component').then((m) => m.MoveOutInspectionPageComponent),
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Move-out inspection' }
  },
  {
    path: ':agencyId/:buildingId/:tenantId/documents/:id',
    loadComponent: () => import('./documents/document-detail-page.component').then((m) => m.TenantDocumentDetailPageComponent),
    data: { title: 'Document detail' }
  },
  {
    path: ':agencyId/:buildingId/:tenantId',
    loadComponent: () => import('./tenants/tenant-detail-page.component').then((m) => m.TenantDetailPageComponent),
    data: { title: 'Tenant detail' }
  }
];
