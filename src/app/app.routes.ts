import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { RoutePaths } from './core/routes/route-paths';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home'
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/pages/home-page.component').then((m) => m.HomePageComponent),
        data: { title: 'Dashboard' }
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/users/pages/profile-page.component').then((m) => m.ProfilePageComponent),
        data: { title: 'Profile' }
      },
      {
        path: 'users',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/users/pages/user-list-page.component').then((m) => m.UserListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['USER_READ_ALL'], title: 'Users' }
          },
          {
            path: 'new',
            loadComponent: () => import('./features/users/pages/user-form-page.component').then((m) => m.UserFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['USER_CREATE'], title: 'Create user' }
          },
          {
            path: ':id',
            loadComponent: () => import('./features/users/pages/user-detail-page.component').then((m) => m.UserDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['USER_READ'], title: 'User detail' }
          },
          {
            path: ':id/edit',
            loadComponent: () => import('./features/users/pages/user-form-page.component').then((m) => m.UserFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['USER_WRITE'], title: 'Edit user' }
          }
        ]
      },
      {
        path: 'ecommerce',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/ecommerce/pages/ecommerce-dashboard-page.component').then((m) => m.EcommerceDashboardPageComponent),
            data: { title: 'Ecommerce' }
          },
          {
            path: 'products',
            loadComponent: () => import('./features/ecommerce/products/product-list-page.component').then((m) => m.ProductListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_READ_ALL'], title: 'Products' }
          },
          {
            path: 'products/:id',
            loadComponent: () => import('./features/ecommerce/products/product-detail-page.component').then((m) => m.ProductDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_READ'], title: 'Product detail' }
          },
          {
            path: 'orders',
            loadComponent: () => import('./features/ecommerce/orders/order-list-page.component').then((m) => m.OrderListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ORDER_READ_ALL'], title: 'Orders' }
          },
          {
            path: 'orders/:id',
            loadComponent: () => import('./features/ecommerce/orders/order-detail-page.component').then((m) => m.OrderDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ORDER_READ_ALL'], title: 'Order detail' }
          },
          {
            path: 'categories',
            loadComponent: () => import('./features/ecommerce/categories/category-list-page.component').then((m) => m.CategoryListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CATEGORY_READ_ALL'], title: 'Categories' }
          },
          {
            path: 'categories/:id',
            loadComponent: () => import('./features/ecommerce/categories/category-detail-page.component').then((m) => m.CategoryDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CATEGORY_READ'], title: 'Category detail' }
          },
          {
            path: 'stores',
            loadComponent: () => import('./features/ecommerce/stores/store-list-page.component').then((m) => m.StoreListPageComponent),
            data: { title: 'Stores' }
          },
          {
            path: 'stores/:id',
            loadComponent: () => import('./features/ecommerce/stores/store-detail-page.component').then((m) => m.StoreDetailPageComponent),
            data: { title: 'Store detail' }
          },
          {
            path: 'customers',
            loadComponent: () => import('./features/ecommerce/customers/customer-list-page.component').then((m) => m.CustomerListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ECOM_CUSTOMER_READ'], title: 'Customers' }
          }
        ]
      }
    ]
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'phone-login',
    loadComponent: () => import('./features/auth/pages/phone-login-page.component').then((m) => m.PhoneLoginPageComponent)
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/pages/signup-page.component').then((m) => m.SignupPageComponent)
  },
  {
    path: 'signup/verify-phone',
    loadComponent: () => import('./features/auth/pages/signup-verify-page.component').then((m) => m.SignupVerifyPageComponent)
  },
  {
    path: 'password-set',
    loadComponent: () => import('./features/auth/pages/password-set-page.component').then((m) => m.PasswordSetPageComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/pages/forgot-password-page.component').then((m) => m.ForgotPasswordPageComponent)
  },
  {
    path: 'password-reset',
    loadComponent: () => import('./features/auth/pages/password-reset-page.component').then((m) => m.PasswordResetPageComponent)
  },
  {
    path: 'change-password',
    loadComponent: () => import('./features/auth/pages/change-password-page.component').then((m) => m.ChangePasswordPageComponent)
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
