import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { Routes } from '@angular/router';

/**
 * Self-service. Nothing here is permission-gated: every route resolves against
 * the signed-in user's own records, which the backend authorises via
 * `isAuthenticated()` or an "or owner" expression. An admin opening `/me` is
 * just looking at their own data — no role switch involved.
 */
export const ME_ROUTES: Routes = [
  {
    // The signed-in user's own account — name, email, phone, security. A tenant
    // record is a different entity and lives at /me/tenancy.
    path: '',
    loadComponent: () => import('../users/pages/profile-page.component').then((m) => m.ProfilePageComponent),
    data: { title: 'My profile' }
  },
  {
    path: 'edit',
    loadComponent: () => import('../users/pages/profile-edit-page.component').then((m) => m.ProfileEditPageComponent),
    data: { title: 'Edit my profile', focus: true }
  },
  {
    // Tenancy details and the documents behind them. `mine` is read from route
    // data by the embedded document list, so it has to be declared here.
    path: 'tenancy',
    loadComponent: () => import('../tenants/tenants/my-tenancy-page.component').then((m) => m.MyTenancyPageComponent),
    data: { title: 'My tenancy', mine: true }
  },
  {
    // Leases are a section of each tenancy now; the old list lands there.
    path: 'leases',
    pathMatch: 'full',
    redirectTo: '/me/tenancy'
  },
  {
    path: 'leases/:id',
    loadComponent: () => import('../tenants/leases/lease-detail-page.component').then((m) => m.LeaseDetailPageComponent),
    // The tenant's own lease: the only place Sign and Decline are offered.
    data: { title: 'My lease', mine: true }
  },
  {
    // The person's own settings — appearance and notifications. Distinct
    // from Settings under System, which is app maintenance and is gated.
    path: 'settings',
    loadComponent: () => import('../users/pages/settings-page.component').then((m) => m.SettingsPageComponent),
    data: { title: 'Settings' }
  },
  {
    // What a person tells landlords about themselves. Owner-only server-side,
    // so being signed in is the whole guard.
    path: 'renter-profile',
    loadComponent: () => import('../users/pages/renter-profile-page.component').then((m) => m.RenterProfilePageComponent),
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Edit tenant profile', focus: true }
  },
  {
    // Household, work and rental history: asked when applying for a room, not of a sitting tenant.
    path: 'rental-application',
    loadComponent: () => import('../users/pages/renter-profile-page.component').then((m) => m.RenterProfilePageComponent),
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Rental application', focus: true, mode: 'application' }
  },
  {
    // Owner-only on the backend: no permission an administrator holds reaches
    // it, so there is no guard here beyond being signed in.
    // Part of the tenant profile on My tenancy now; old links land there.
    path: 'profile-sharing',
    pathMatch: 'full',
    redirectTo: 'tenancy'
  },
  {
    // Documents live in the tenant profile now; old links and bookmarks land there.
    path: 'documents',
    pathMatch: 'full',
    redirectTo: 'tenancy'
  },
  {
    path: 'documents/:id',
    loadComponent: () => import('../tenants/documents/document-detail-page.component').then((m) => m.TenantDocumentDetailPageComponent),
    data: { title: 'My document' }
  },
  {
    // A tab of Find a room now.
    path: 'applications',
    pathMatch: 'full',
    redirectTo: '/rooms?tab=applications'
  },
  {
    path: 'applications/:id',
    loadComponent: () => import('../tenants/applications/room-application-detail-page.component').then((m) => m.RoomApplicationDetailPageComponent),
    data: { title: 'My application' }
  },
  {
    // Messages with a landlord go through the chat.
    path: 'messages',
    pathMatch: 'full',
    redirectTo: '/chat'
  },
  {
    path: 'messages/:id',
    loadComponent: () => import('../tenants/messages/tenant-message-detail-page.component').then((m) => m.TenantMessageDetailPageComponent),
    data: { title: 'My message' }
  },
  {
    // Its own page, so the list of requests leads on Repairs and the form has the screen to itself.
    path: 'maintenance/new',
    loadComponent: () => import('../maintenance/pages/my-maintenance-report-page.component').then((m) => m.MyMaintenanceReportPageComponent),
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Report an issue', focus: true }
  },
  {
    path: 'maintenance',
    loadComponent: () => import('../maintenance/pages/my-maintenance-page.component').then((m) => m.MyMaintenancePageComponent),
    data: { title: 'Repairs' }
  },
  {
    path: 'arrears',
    loadComponent: () => import('../rent/arrears/my-arrears-page.component').then((m) => m.MyArrearsPageComponent),
    data: { title: 'Rent', view: 'rent' }
  },
  {
    path: 'rent-payments',
    // Money paid, as one history; the bills are under Rent.
    loadComponent: () => import('../rent/arrears/my-arrears-page.component').then((m) => m.MyArrearsPageComponent),
    data: { title: 'Payments', view: 'payments' }
  },
  {
    path: 'rent-payments/:agencyId/:buildingId/:id',
    loadComponent: () => import('../rent/payments/rent-payment-detail-page.component').then((m) => m.RentPaymentDetailPageComponent),
    data: { title: 'My rent payment' }
  },
  {
    path: 'delivery-addresses',
    loadComponent: () => import('../ecommerce/delivery-addresses/delivery-address-list-page.component').then((m) => m.DeliveryAddressListPageComponent),
    data: { title: 'My addresses' }
  },
  {
    path: 'delivery-addresses/new',
    loadComponent: () => import('../ecommerce/delivery-addresses/delivery-address-form-page.component').then((m) => m.DeliveryAddressFormPageComponent),
    data: { title: 'Add an address' }
  },
  {
    path: 'delivery-addresses/:id',
    loadComponent: () => import('../ecommerce/delivery-addresses/delivery-address-detail-page.component').then((m) => m.DeliveryAddressDetailPageComponent),
    data: { title: 'My address' }
  },
  {
    path: 'delivery-addresses/:id/edit',
    loadComponent: () => import('../ecommerce/delivery-addresses/delivery-address-form-page.component').then((m) => m.DeliveryAddressFormPageComponent),
    data: { title: 'Edit address' }
  }
];
