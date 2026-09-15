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
    path: 'new',
    loadComponent: () => import('./tenants/tenant-form-page.component').then((m) => m.TenantFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.TENANT_CREATE, PermissionConstants.BUILDING_TENANT_MANAGE], title: 'New tenant' }
  },
    {
    // Adding somebody who already has an account. Same permission as creating
    // one from scratch — it is the same act, with the identity confirmed first.
    path: 'add-existing',
    loadComponent: () => import('./tenants/add-existing-tenant-page.component').then((m) => m.AddExistingTenantPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.TENANT_CREATE, PermissionConstants.BUILDING_TENANT_MANAGE], title: 'Add existing user as tenant' }
  },
    {
    path: 'leases',
    loadComponent: () => import('./leases/lease-list-page.component').then((m) => m.LeaseListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.LEASE_AGREEMENT_READ_ALL, PermissionConstants.LEASE_AGREEMENT_READ, PermissionConstants.LEASE_READ], title: 'Lease agreements' }
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
    path: 'documents',
    loadComponent: () => import('./documents/document-list-page.component').then((m) => m.TenantDocumentListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.TENANT_DOCUMENT_READ_ALL, PermissionConstants.TENANT_DOCUMENT_READ], title: 'Tenant documents' }
  },
    {
    path: 'documents/:id',
    loadComponent: () => import('./documents/document-detail-page.component').then((m) => m.TenantDocumentDetailPageComponent),
    data: { title: 'Document detail' }
  },
  {
    path: 'messages',
    loadComponent: () => import('./messages/tenant-message-list-page.component').then((m) => m.TenantMessageListPageComponent),
    canActivate: [permissionGuard],
    data: {
      permissions: [PermissionConstants.TENANT_MESSAGE_READ, PermissionConstants.TENANT_MESSAGE_READ_ALL],
      title: 'Tenant messages'
    }
  },
    {
    path: 'messages/:id',
    loadComponent: () => import('./messages/tenant-message-detail-page.component').then((m) => m.TenantMessageDetailPageComponent),
    data: { title: 'Message detail' }
  },
  {
    path: 'verification-snapshots',
    loadComponent: () => import('./snapshots/snapshot-list-page.component').then((m) => m.SnapshotListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.VERIFICATION_SNAPSHOT_READ_ALL, PermissionConstants.VERIFICATION_SNAPSHOT_READ], title: 'Verification snapshots' }
  },
  {
    path: 'verification-snapshots/:agencyId/:buildingId/:tenantId/:id',
    loadComponent: () => import('./snapshots/snapshot-detail-page.component').then((m) => m.SnapshotDetailPageComponent),
    data: { title: 'Snapshot detail' }
  },
  {
    path: ':agencyId/:buildingId/:tenantId',
    loadComponent: () => import('./tenants/tenant-detail-page.component').then((m) => m.TenantDetailPageComponent),
    data: { title: 'Tenant detail' }
  }
];
