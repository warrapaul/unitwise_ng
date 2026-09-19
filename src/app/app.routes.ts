import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { RoutePaths } from './core/routes/route-paths';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    // The public front door. Signed-in or not, `/` explains the product; the
    // page itself offers "Open dashboard" once there is a session, so a
    // returning user is one click from where they were rather than being
    // bounced past the thing they may have come back to read.
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/pages/landing-page.component').then((m) => m.LandingPageComponent),
    data: { title: 'Unitwise' }
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/pages/home-page.component').then((m) => m.HomePageComponent),
        data: { title: 'Dashboard', mine: true }
      },
      {
        // The caretaker's drill-in. Guarded server-side on the building, so
        // the route needs no permission of its own beyond being signed in.
        path: 'home/buildings/:agencyId/:buildingId',
        loadComponent: () => import('./features/stats/pages/caretaker-building-page.component').then((m) => m.CaretakerBuildingPageComponent),
        data: { title: 'Building report' }
      },
                  {
        path: 'admin/addresses',
        children: [
          {
            path: '',
            loadComponent: () => import('./features/addresses/pages/address-management-page.component').then((m) => m.AddressManagementPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ADDRESS_READ_ALL'], title: 'Address management' }
          },
          {
            path: 'records',
            loadComponent: () => import('./features/addresses/pages/address-list-page.component').then((m) => m.AddressListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ADDRESS_READ_ALL'], title: 'Addresses' }
          },
          {
            path: 'records/new',
            loadComponent: () => import('./features/addresses/pages/address-form-page.component').then((m) => m.AddressFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ADDRESS_CREATE'], title: 'Create address' }
          },
          {
            path: 'records/:id',
            loadComponent: () => import('./features/addresses/pages/address-detail-page.component').then((m) => m.AddressDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ADDRESS_READ'], title: 'Address detail' }
          },
          {
            path: 'records/:id/edit',
            loadComponent: () => import('./features/addresses/pages/address-form-page.component').then((m) => m.AddressFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ADDRESS_WRITE'], title: 'Edit address' }
          }
        ]
      },
      {
        path: 'admin/users',
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
        path: 'admin/access-control',
        loadChildren: () => import('./features/access-control/access-control.routes').then((m) => m.ACCESS_CONTROL_ROUTES)
      },
      {
        path: 'me',
        loadChildren: () => import('./features/me/me.routes').then((m) => m.ME_ROUTES)
      },
      {
        path: 'rooms',
        loadComponent: () => import('./features/housing/rooms/available-rooms-page.component').then((m) => m.AvailableRoomsPageComponent),
        data: { title: 'Find a room' }
      },
      {
        path: 'shop',
        loadChildren: () => import('./features/shop/shop.routes').then((m) => m.SHOP_ROUTES)
      },
      {
        path: 'chat',
        loadComponent: () => import('./features/chat/pages/chat-page.component').then((m) => m.ChatPageComponent),
        data: { title: 'Chat' }
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/pages/notification-list-page.component').then((m) => m.NotificationListPageComponent),
        data: { title: 'Notifications' }
      },
      {
        path: 'me/notification-preferences',
        loadComponent: () => import('./features/notifications/pages/notification-preferences-page.component').then((m) => m.NotificationPreferencesPageComponent),
        data: { title: 'Notification preferences' }
      },
      {
        path: 'admin/notifications/channels',
        loadComponent: () => import('./features/notifications/pages/notification-policy-page.component').then((m) => m.NotificationPolicyPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['NOTIFICATION_POLICY_READ'], title: 'Notification channels' }
      },
      {
        path: 'admin/notifications/broadcast',
        loadComponent: () => import('./features/notifications/pages/notification-broadcast-page.component').then((m) => m.NotificationBroadcastPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['NOTIFICATION_SEND'], title: 'Send notification' }
      },
      {
        path: 'admin/app-management',
        loadChildren: () => import('./features/app-management/app-management.routes').then((m) => m.APP_MANAGEMENT_ROUTES)
      },
      {
        path: 'admin/rent',
        loadChildren: () => import('./features/rent/rent.routes').then((m) => m.RENT_ROUTES)
      },
      {
        path: 'admin/tenants',
        loadChildren: () => import('./features/tenants/tenants.routes').then((m) => m.TENANTS_ROUTES)
      },
      {
        path: 'admin/housing',
        loadChildren: () => import('./features/housing/housing.routes').then((m) => m.HOUSING_ROUTES)
      },
      {
        path: 'admin/contracts',
        loadChildren: () => import('./features/contracts/contracts.routes').then((m) => m.CONTRACT_ROUTES)
      },
      {
        path: 'admin/settings',
        loadChildren: () => import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES)
      },
      {
        path: 'admin/geo',
        loadChildren: () => import('./features/geo/geo.routes').then((m) => m.GEO_ROUTES)
      },
      {
        path: 'admin/ecommerce',
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
            path: 'products/new',
            loadComponent: () => import('./features/ecommerce/products/product-form-page.component').then((m) => m.ProductFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_CREATE'], title: 'Create product' }
          },
          {
            path: 'products/:id',
            loadComponent: () => import('./features/ecommerce/products/product-detail-page.component').then((m) => m.ProductDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_READ'], title: 'Product detail' }
          },
          {
            path: 'products/:id/edit',
            loadComponent: () => import('./features/ecommerce/products/product-form-page.component').then((m) => m.ProductFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_UPDATE'], title: 'Edit product' }
          },
          {
            path: 'products/:id/media',
            loadComponent: () => import('./features/ecommerce/media/product-media-page.component').then((m) => m.ProductMediaPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_UPDATE'], title: 'Product media' }
          },
          {
            path: 'products/:id/discounts',
            loadComponent: () => import('./features/ecommerce/discounts/product-discount-page.component').then((m) => m.ProductDiscountPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PRODUCT_UPDATE'], title: 'Product discounts' }
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
            path: 'categories/new',
            loadComponent: () => import('./features/ecommerce/categories/category-form-page.component').then((m) => m.CategoryFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CATEGORY_CREATE'], title: 'Create category' }
          },
          {
            path: 'categories/:id',
            loadComponent: () => import('./features/ecommerce/categories/category-detail-page.component').then((m) => m.CategoryDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CATEGORY_READ'], title: 'Category detail' }
          },
          {
            path: 'categories/:id/edit',
            loadComponent: () => import('./features/ecommerce/categories/category-form-page.component').then((m) => m.CategoryFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CATEGORY_UPDATE'], title: 'Edit category' }
          },
          {
            path: 'stores',
            loadComponent: () => import('./features/ecommerce/stores/store-list-page.component').then((m) => m.StoreListPageComponent),
            data: { title: 'Stores' }
          },
          {
            path: 'stores/new',
            loadComponent: () => import('./features/ecommerce/stores/store-form-page.component').then((m) => m.StoreFormPageComponent),
            data: { title: 'Create store' }
          },
          {
            path: 'stores/:id/edit',
            loadComponent: () => import('./features/ecommerce/stores/store-form-page.component').then((m) => m.StoreFormPageComponent),
            data: { title: 'Edit store' }
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
          },
          {
            path: 'tags',
            loadComponent: () => import('./features/ecommerce/tags/tag-list-page.component').then((m) => m.TagListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['TAG_READ'], title: 'Tags' }
          },
          {
            path: 'tags/new',
            loadComponent: () => import('./features/ecommerce/tags/tag-detail-page.component').then((m) => m.TagDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['TAG_CREATE'], title: 'Create tag' }
          },
          {
            path: 'tags/:id',
            loadComponent: () => import('./features/ecommerce/tags/tag-detail-page.component').then((m) => m.TagDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['TAG_READ'], title: 'Tag detail' }
          },
          {
            path: 'customer-groups',
            loadComponent: () => import('./features/ecommerce/customer-groups/customer-group-list-page.component').then((m) => m.CustomerGroupListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CUSTOMER_GROUP_READ'], title: 'Customer groups' }
          },
          {
            path: 'customer-groups/new',
            loadComponent: () => import('./features/ecommerce/customer-groups/customer-group-form-page.component').then((m) => m.CustomerGroupFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CUSTOMER_GROUP_CREATE'], title: 'Create customer group' }
          },
          {
            path: 'customer-groups/:id',
            loadComponent: () => import('./features/ecommerce/customer-groups/customer-group-detail-page.component').then((m) => m.CustomerGroupDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CUSTOMER_GROUP_READ'], title: 'Customer group' }
          },
          {
            path: 'customer-groups/:id/edit',
            loadComponent: () => import('./features/ecommerce/customer-groups/customer-group-form-page.component').then((m) => m.CustomerGroupFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['CUSTOMER_GROUP_UPDATE'], title: 'Edit customer group' }
          },
          {
            path: 'vouchers',
            loadComponent: () => import('./features/ecommerce/vouchers/voucher-list-page.component').then((m) => m.VoucherListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['VOUCHER_READ_ALL'], title: 'Vouchers' }
          },
          {
            path: 'vouchers/new',
            loadComponent: () => import('./features/ecommerce/vouchers/voucher-form-page.component').then((m) => m.VoucherFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['VOUCHER_CREATE'], title: 'Create voucher' }
          },
          {
            path: 'vouchers/:id',
            loadComponent: () => import('./features/ecommerce/vouchers/voucher-detail-page.component').then((m) => m.VoucherDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['VOUCHER_READ_ALL'], title: 'Voucher detail' }
          },
          {
            path: 'vouchers/:id/edit',
            loadComponent: () => import('./features/ecommerce/vouchers/voucher-form-page.component').then((m) => m.VoucherFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['VOUCHER_UPDATE'], title: 'Edit voucher' }
          },
          {
            path: 'payments',
            loadComponent: () => import('./features/ecommerce/payments/payment-list-page.component').then((m) => m.PaymentListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ORDER_PAYMENT_READ_ALL'], title: 'Payments' }
          },
          {
            path: 'payments/:id',
            loadComponent: () => import('./features/ecommerce/payments/payment-detail-page.component').then((m) => m.PaymentDetailPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['ORDER_PAYMENT_READ_ALL'], title: 'Payment detail' }
          },
          {
            path: 'partial-payment-policies',
            loadComponent: () => import('./features/ecommerce/partial-payments/policy-list-page.component').then((m) => m.PartialPaymentPolicyListPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PARTIAL_PAYMENT_POLICY_READ'], title: 'Partial payment policies' }
          },
          {
            path: 'partial-payment-policies/new',
            loadComponent: () => import('./features/ecommerce/partial-payments/policy-form-page.component').then((m) => m.PartialPaymentPolicyFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PARTIAL_PAYMENT_POLICY_CREATE'], title: 'Create policy' }
          },
          {
            path: 'partial-payment-policies/:id/edit',
            loadComponent: () => import('./features/ecommerce/partial-payments/policy-form-page.component').then((m) => m.PartialPaymentPolicyFormPageComponent),
            canActivate: [permissionGuard],
            data: { permissions: ['PARTIAL_PAYMENT_POLICY_UPDATE'], title: 'Edit policy' }
          },
          {
            path: 'delivery-addresses',
            loadComponent: () => import('./features/ecommerce/delivery-addresses/delivery-address-list-page.component').then((m) => m.DeliveryAddressListPageComponent),
            data: { title: 'Delivery addresses' }
          },
          {
            path: 'delivery-addresses/new',
            loadComponent: () => import('./features/ecommerce/delivery-addresses/delivery-address-form-page.component').then((m) => m.DeliveryAddressFormPageComponent),
            data: { title: 'Create delivery address' }
          },
          {
            path: 'delivery-addresses/:id',
            loadComponent: () => import('./features/ecommerce/delivery-addresses/delivery-address-detail-page.component').then((m) => m.DeliveryAddressDetailPageComponent),
            data: { title: 'Delivery address' }
          },
          {
            path: 'delivery-addresses/:id/edit',
            loadComponent: () => import('./features/ecommerce/delivery-addresses/delivery-address-form-page.component').then((m) => m.DeliveryAddressFormPageComponent),
            data: { title: 'Edit delivery address' }
          }
        ]
      },
      {
        path: 'profile',
        redirectTo: 'me',
        pathMatch: 'full'
      },
      {
        path: 'profile/edit',
        redirectTo: 'me/edit',
        pathMatch: 'full'
      },
      {
        path: 'users',
        redirectTo: 'admin/users'
      },
      {
        path: 'addresses',
        redirectTo: 'admin/addresses'
      },
      {
        path: 'access-control',
        redirectTo: 'admin/access-control'
      },
      {
        path: 'geo',
        redirectTo: 'admin/geo'
      },
      {
        path: 'housing',
        redirectTo: 'admin/housing'
      },
      {
        path: 'app-management',
        redirectTo: 'admin/app-management'
      },
      {
        path: 'ecommerce',
        redirectTo: 'admin/ecommerce'
      },
      {
        path: 'tenants',
        redirectTo: 'admin/tenants'
      },
      {
        path: 'rent',
        redirectTo: 'admin/rent'
      },
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
