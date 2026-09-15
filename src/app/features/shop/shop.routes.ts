import { Routes } from '@angular/router';

/**
 * The customer-facing storefront. These routes carry no permission guards on
 * purpose: the backend leaves the browse endpoints unannotated and gates orders
 * on ownership, so any signed-in user may shop (skills §8 — empty permissions
 * mirror the backend's authenticated-by-default posture).
 */
export const SHOP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/catalog-page.component').then((m) => m.CatalogPageComponent),
    data: { title: 'Shop' }
  },
  {
    path: 'products/:id',
    loadComponent: () => import('./pages/product-page.component').then((m) => m.ShopProductPageComponent),
    data: { title: 'Product' }
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart-page.component').then((m) => m.CartPageComponent),
    data: { title: 'Cart' }
  },
  {
    path: 'checkout',
    loadComponent: () => import('./pages/checkout-page.component').then((m) => m.CheckoutPageComponent),
    data: { title: 'Checkout' }
  },
  {
    path: 'my-orders',
    loadComponent: () => import('./pages/my-orders-page.component').then((m) => m.MyOrdersPageComponent),
    data: { title: 'My orders' }
  },
  {
    path: 'my-orders/:id',
    loadComponent: () => import('./pages/my-order-detail-page.component').then((m) => m.MyOrderDetailPageComponent),
    data: { title: 'Order detail' }
  },
  {
    path: 'my-vouchers',
    loadComponent: () => import('./pages/my-vouchers-page.component').then((m) => m.MyVouchersPageComponent),
    data: { title: 'My vouchers' }
  }
];
