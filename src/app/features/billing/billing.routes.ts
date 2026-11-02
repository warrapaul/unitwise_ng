import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const BILLING_ROUTES: Routes = [
  {
    // The active agency's own billing: plan, usage, invoices, paying.
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/agency-billing-page.component').then((m) => m.AgencyBillingPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_VIEW, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], title: 'Billing' }
  },
  {
    path: 'plans',
    loadComponent: () => import('./pages/plan-list-page.component').then((m) => m.PlanListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PLAN_MANAGE], title: 'Plans' }
  },
  {
    path: 'plans/new',
    loadComponent: () => import('./pages/plan-form-page.component').then((m) => m.PlanFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PLAN_MANAGE], title: 'New plan' }
  },
  {
    path: 'plans/:id',
    loadComponent: () => import('./pages/plan-form-page.component').then((m) => m.PlanFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PLAN_MANAGE], title: 'Edit plan' }
  },
  {
    // The platform's inbox: payments agencies reported and plan changes they asked for.
    path: 'requests',
    loadComponent: () => import('./pages/billing-requests-page.component').then((m) => m.BillingRequestsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PAYMENT_RECORD, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], title: 'Billing requests' }
  },
  {
    path: 'unmatched',
    loadComponent: () => import('./pages/unmatched-payments-page.component').then((m) => m.UnmatchedPaymentsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_PAYMENT_RECORD], title: 'Unmatched payments' }
  },
  {
    // Any agency's billing, by id: the super admin managing it, or a link from an invoice notification.
    path: 'agencies/:agencyId',
    loadComponent: () => import('./pages/agency-billing-page.component').then((m) => m.AgencyBillingPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_VIEW, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], title: 'Billing' }
  },
  {
    path: 'agencies/:agencyId/invoices/:invoiceId',
    loadComponent: () => import('./pages/invoice-detail-page.component').then((m) => m.InvoiceDetailPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.BILLING_VIEW, PermissionConstants.BILLING_SUBSCRIPTION_MANAGE], title: 'Invoice' }
  }
];
