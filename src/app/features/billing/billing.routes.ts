import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const BILLING_ROUTES: Routes = [
  {
    // The active agency's own billing: plan, usage, invoices, paying.
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/agency-billing-page.component').then((m) => m.AgencyBillingPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_VIEW, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], agencyLevel: true, title: 'Billing' }
  },
  {
    // The platform's subscription business: revenue, who owes, trials ending, queues.
    path: 'overview',
    loadComponent: () => import('./pages/billing-overview-page.component').then((m) => m.BillingOverviewPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], agencyLevel: true, title: 'Billing overview' }
  },
  {
    path: 'plans',
    loadComponent: () => import('./pages/plan-list-page.component').then((m) => m.PlanListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PLAN_MANAGE], agencyLevel: true, title: 'Plans' }
  },
  {
    path: 'plans/new',
    loadComponent: () => import('./pages/plan-form-page.component').then((m) => m.PlanFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PLAN_MANAGE], agencyLevel: true, title: 'New plan', focus: true },
    canDeactivate: [unsavedChangesGuard]
  },
  {
    path: 'plans/:id',
    loadComponent: () => import('./pages/plan-form-page.component').then((m) => m.PlanFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PLAN_MANAGE], agencyLevel: true, title: 'Edit plan', focus: true },
    canDeactivate: [unsavedChangesGuard]
  },
  {
    // The platform's inbox: payments agencies reported and plan changes they asked for.
    path: 'requests',
    loadComponent: () => import('./pages/billing-requests-page.component').then((m) => m.BillingRequestsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PAYMENT_RECORD, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], agencyLevel: true, title: 'Billing requests' }
  },
  {
    path: 'unmatched',
    loadComponent: () => import('./pages/unmatched-payments-page.component').then((m) => m.UnmatchedPaymentsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PAYMENT_RECORD], agencyLevel: true, title: 'Unmatched payments' }
  },
  {
    // Any agency's billing, by id: the super admin managing it, or a link from an invoice notification.
    path: 'agencies/:agencyId',
    loadComponent: () => import('./pages/agency-billing-page.component').then((m) => m.AgencyBillingPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_VIEW, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], agencyLevel: true, title: 'Billing' }
  },
  {
    path: 'agencies/:agencyId/invoices/:invoiceId',
    loadComponent: () => import('./pages/invoice-detail-page.component').then((m) => m.InvoiceDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_VIEW, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], agencyLevel: true, title: 'Invoice' }
  }
];
