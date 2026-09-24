import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { PermissionConstants } from '../../core/rbac/permission.constants';

export const RENT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    // Rent opens on who owes what — the question the section exists for.
    redirectTo: 'portfolio-overdue'
  },
  {
    path: 'payments',
    loadComponent: () => import('./payments/rent-payment-list-page.component').then((m) => m.RentPaymentListPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_PAYMENT_READ_ALL, PermissionConstants.RENT_PAYMENT_READ], title: 'Rent payments' }
  },
  {
    path: 'payments/new',
    loadComponent: () => import('./payments/rent-payment-form-page.component').then((m) => m.RentPaymentFormPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_PAYMENT_CREATE, PermissionConstants.RENT_PAYMENT_WRITE], title: 'Record payment' }
  },
  {
    path: 'portfolio-overdue',
    loadComponent: () => import('./payments/portfolio-overdue-page.component').then((m) => m.PortfolioOverduePageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_PAYMENT_READ_ALL, PermissionConstants.RENT_PAYMENT_READ], title: 'Portfolio overdue payments' }
  },
    {
    path: 'payments/:agencyId/:buildingId/:id',
    loadComponent: () => import('./payments/rent-payment-detail-page.component').then((m) => m.RentPaymentDetailPageComponent),
    data: { title: 'Rent payment' }
  },
  {
    path: 'arrears',
    loadComponent: () => import('./arrears/arrears-page.component').then((m) => m.ArrearsPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_ARREAR_READ], title: 'Rent arrears' }
  },
    {
    path: 'adjustments',
    loadComponent: () => import('./adjustments/rent-adjustment-page.component').then((m) => m.RentAdjustmentPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_ARREAR_READ], title: 'Rent adjustments' }
  },
  {
    path: 'charge-templates',
    loadComponent: () => import('./templates/charge-template-page.component').then((m) => m.ChargeTemplatePageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_ARREAR_READ], title: 'Charge templates' }
  },
  {
    path: 'meter-readings',
    loadComponent: () => import('./readings/meter-reading-page.component').then((m) => m.MeterReadingPageComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PermissionConstants.RENT_ARREAR_READ], title: 'Meter readings' }
  }
];
