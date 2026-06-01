# Unitwise Angular — Project-Specific Conventions

**Version:** 1.0  
**Purpose:** Angular web client conventions derived directly from the Unitwise Spring Boot backend contract and Flutter BLoC patterns. Read this alongside the Angular General Skills guide. This file takes precedence when the two conflict.

---

## Table of Contents

1. Backend Contract Reference
2. HTTP Client Setup & Base URL
3. API Response Unwrapping
4. Auth & JWT Integration
5. RBAC & Permission Gates
6. Domain Models (TypeScript Mirrors of Java DTOs)
7. Feature Services (URL-to-Service Mapping)
8. Routing Conventions
9. Auth Feature
10. Users Feature
11. Products & Categories Feature
12. Orders & Checkout Feature
13. eCommerce Admin Feature
14. Housing / Tenancy Feature
15. File Uploads (MinIO)
16. WebSocket & Real-Time (STOMP)
17. Error Handling — Backend Error Shapes
18. Pagination — Backend Pagination Shape
19. Search Request DTOs
20. Feature Generation Checklist
21. Minimalist Visual Direction

---

## 1. Backend Contract Reference

The Spring Boot backend wraps every response in one of two envelopes:

### Single Item

```typescript
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string; // "yyyy-MM-dd HH:mm:ss"
}
```

### Paginated List

```typescript
interface PaginatedApiResponse<T> {
  data: T[];
  pagination: {
    page: number;      // 0-based page number
    size: number;
    totalElements: number;
    totalPages: number;
    isFirst: boolean;
    isLast: boolean;
  };
  success: boolean;
  message: string;
  timestamp: string;
}
```

### Error Shape

```typescript
interface ErrorResponse {
  status: number;
  errorCode: string;  // e.g. 'RESOURCE_NOT_FOUND', 'VALIDATION_ERROR', 'ACCESS_DENIED'
  message: string;
  details?: string[]; // validation field errors: "fieldName: message"
  timestamp: string;
  path: string;
}
```

**Rule:** Angular services must unwrap these envelopes. Components never see `ApiResponse<T>` or `PaginatedApiResponse<T>`.

---

## 2. HTTP Client Setup & Base URL

### Environment

```typescript
// environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'https://your-ngrok-or-server-host/api',
  wsUrl: 'wss://your-ngrok-or-server-host/ws',
};

// environments/environment.production.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.unitwise.co.ke/api',
  wsUrl: 'wss://api.unitwise.co.ke/ws',
};
```

### Base URL Injection Token

```typescript
// core/tokens/api-url.token.ts
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

// core/tokens/ws-url.token.ts
export const WS_URL = new InjectionToken<string>('WS_URL', {
  providedIn: 'root',
  factory: () => environment.wsUrl,
});
```

### App Config

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withPreloading(QuicklinkStrategy), withComponentInputBinding()),
    provideHttpClient(withInterceptors([
      authInterceptor,
      tokenRefreshInterceptor,
      errorInterceptor,
      loadingInterceptor,
    ])),
    provideAnimationsAsync(),
  ],
};
```

---

## 3. API Response Unwrapping

All services must unwrap the backend envelope. The pattern is the same for every endpoint.

### Single Item

```typescript
getUser(id: number): Observable<UserDetail> {
  return this.http.get<ApiResponse<UserDetail>>(`${this.baseUrl}/v1/users/${id}`)
    .pipe(map(response => response.data));
}
```

### Paginated List

```typescript
getUsers(params: UsersFilterParams): Observable<PaginatedResult<UserPreview>> {
  return this.http.get<PaginatedApiResponse<UserPreview>>(`${this.baseUrl}/v1/users`, {
    params: this.buildHttpParams(params)
  }).pipe(
    map(response => ({
      items: response.data,
      pagination: {
        page: response.pagination.page,
        size: response.pagination.size,
        totalElements: response.pagination.totalElements,
        totalPages: response.pagination.totalPages,
        isFirst: response.pagination.isFirst,
        isLast: response.pagination.isLast,
      }
    }))
  );
}
```

### Internal PaginatedResult Type

```typescript
// shared/models/pagination.model.ts
export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    isFirst: boolean;
    isLast: boolean;
  };
}
```

### Void / Delete Endpoints

```typescript
deleteUser(id: number): Observable<void> {
  return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/v1/users/${id}`)
    .pipe(map(() => void 0));
}
```

### String Response (e.g. forgot password message)

```typescript
forgotPassword(email: string): Observable<string> {
  return this.http.post<ApiResponse<string>>(`${this.baseUrl}/v1/auth/forgot-password`, { email })
    .pipe(map(response => response.data ?? response.message));
}
```

---

## 4. Auth & JWT Integration

### Auth Service

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  // Token in memory — never localStorage (XSS protection)
  private _accessToken = signal<string | null>(null);

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly accessToken = this._accessToken.asReadonly();

  login(credentials: LoginRequest): Observable<AuthModel> {
    return this.http.post<ApiResponse<AuthModel>>(`${this.apiUrl}/v1/auth/login`, credentials)
      .pipe(
        map(response => response.data),
        tap(auth => {
          this._accessToken.set(auth.accessToken);
          if (auth.passwordResetRequired) {
            // store flag for guard
          }
        })
      );
  }

  logout(): Observable<void> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/v1/auth/logout`, {}).pipe(
      map(() => void 0),
      tap(() => this._accessToken.set(null)),
      catchError(() => { this._accessToken.set(null); return EMPTY; })
    );
  }

  refreshToken(): Observable<void> {
    // Refresh token is in httpOnly cookie — backend reads it automatically
    return this.http.post<ApiResponse<AuthModel>>(`${this.apiUrl}/v1/auth/refresh`, {}).pipe(
      map(response => response.data),
      tap(auth => this._accessToken.set(auth.accessToken)),
      map(() => void 0)
    );
  }

  hasRole(role: UserRole): boolean {
    return this.decodeTokenPayload()?.roles?.includes(role) ?? false;
  }

  hasPermission(permission: string): boolean {
    return this.decodeTokenPayload()?.permissions?.includes(permission) ?? false;
  }

  private decodeTokenPayload(): TokenPayload | null {
    const token = this._accessToken();
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch { return null; }
  }
}
```

### Auth Model (mirrors Java `AuthModel`)

```typescript
export interface AuthModel {
  accessToken: string;
  refreshToken?: string;
  passwordResetRequired: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenPayload {
  sub: string;       // email
  userId: number;
  roles: string[];
  permissions: string[];
  exp: number;
}
```

---

## 5. RBAC & Permission Gates

### Permission Constants (mirrors `PermissionConstants.java`)

```typescript
// core/rbac/permission-constants.ts
export const PermissionConstants = {
  // Users
  USER_CREATE: 'USER_CREATE',
  USER_READ: 'USER_READ',
  USER_READ_ALL: 'USER_READ_ALL',
  USER_WRITE: 'USER_WRITE',
  USER_DELETE: 'USER_DELETE',

  // Products
  PRODUCT_CREATE: 'PRODUCT_CREATE',
  PRODUCT_READ: 'PRODUCT_READ',
  PRODUCT_UPDATE: 'PRODUCT_UPDATE',
  PRODUCT_DELETE: 'PRODUCT_DELETE',

  // Orders
  ORDER_CREATE: 'ORDER_CREATE',
  ORDER_READ: 'ORDER_READ',
  ORDER_READ_ALL: 'ORDER_READ_ALL',
  ORDER_UPDATE: 'ORDER_UPDATE',
  ORDER_CANCEL_ALL: 'ORDER_CANCEL_ALL',

  // Categories
  CATEGORY_CREATE: 'CATEGORY_CREATE',
  CATEGORY_UPDATE: 'CATEGORY_UPDATE',
  CATEGORY_DELETE: 'CATEGORY_DELETE',

  // Housing / Agency
  AGENCY_CREATE: 'AGENCY_CREATE',
  AGENCY_READ: 'AGENCY_READ',
  AGENCY_READ_ALL: 'AGENCY_READ_ALL',
  TENANT_CREATE: 'TENANT_CREATE',
  TENANT_READ_ALL: 'TENANT_READ_ALL',
  LEASE_CREATE: 'LEASE_CREATE',
  MAINTENANCE_READ_ALL: 'MAINTENANCE_READ_ALL',
} as const;

export type Permission = typeof PermissionConstants[keyof typeof PermissionConstants];
```

### Role Constants (mirrors `RoleConstants.java`)

```typescript
// core/rbac/role-constants.ts
export const RoleConstants = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  ECOMMERCE_ADMIN: 'ECOMMERCE_ADMIN',
  TENANT: 'TENANT',
  USER: 'USER',
} as const;

export type UserRole = typeof RoleConstants[keyof typeof RoleConstants];
```

### Permission Gate Component

The Angular equivalent of Flutter's `PermissionGate` widget:

```typescript
// shared/components/permission-gate/permission-gate.component.ts
@Component({
  selector: 'app-permission-gate',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (hasAccess()) {
      <ng-content />
    } @else if (fallback) {
      <ng-content select="[fallback]" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionGateComponent {
  private readonly authService = inject(AuthService);

  readonly permissions = input<string[]>([]);
  readonly roles = input<string[]>([]);
  readonly requireAll = input<boolean>(false);

  readonly hasAccess = computed(() => {
    // Super admin bypasses all checks
    if (this.authService.hasRole(RoleConstants.SUPER_ADMIN)) return true;

    const perms = this.permissions();
    const roleList = this.roles();

    if (perms.length === 0 && roleList.length === 0) return false;

    const permCheck = perms.length === 0 ? true
      : this.requireAll()
        ? perms.every(p => this.authService.hasPermission(p))
        : perms.some(p => this.authService.hasPermission(p));

    const roleCheck = roleList.length === 0 ? true
      : roleList.some(r => this.authService.hasRole(r as UserRole));

    return permCheck && roleCheck;
  });
}
```

Usage:

```html
<!-- Single permission -->
<app-permission-gate [permissions]="['USER_CREATE']">
  <button (click)="createUser()">Create User</button>
</app-permission-gate>

<!-- Either of two permissions -->
<app-permission-gate [permissions]="['USER_READ', 'USER_READ_ALL']" [requireAll]="false">
  <app-user-list />
</app-permission-gate>

<!-- Role-based -->
<app-permission-gate [roles]="['SUPER_ADMIN', 'ECOMMERCE_ADMIN']">
  <app-admin-panel />
</app-permission-gate>
```

---

## 6. Domain Models (TypeScript Mirrors of Java DTOs)

Match field names exactly to Java `fromJson`/`toJson` conventions (camelCase from Spring's Jackson default).

### User Models

```typescript
export interface UserPreview {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  status: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail extends UserPreview {
  middleName?: string;
  occupation?: string;
  employer?: string;
  roles: RoleModel[];
  permissions: string[];
}

export interface RoleModel {
  id: number;
  name: string;
  description: string;
  roleScope: 'SYSTEM' | 'AGENCY';
  enabled: boolean;
}

// Request DTOs
export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phoneNumber: string;
  password: string;
  roleIds?: number[];
}

export interface UpdateUserRolesRequest {
  roleIds: number[];
}
```

### Product Models

```typescript
export interface ProductPreview {
  id: number;
  name: string;
  sku: string;
  slug: string;
  basePrice: number;
  salePrice?: number;
  currency: string;
  stockStatus: string;
  stockQuantity: number;
  status: string;
  isFeatured: boolean;
  rating: number;
  reviewCount: number;
  primaryImageUrl?: string;
  category: ProductCategoryPreview;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends ProductPreview {
  description: string;
  shortDescription: string;
  upc?: string;
  images: ProductImageResponse[];
  subcategory?: ProductCategoryPreview;
  variants: ProductVariantResponse[];
  attributes: ProductAttributeResponse[];
  tags: ProductTagResponse[];
  isTaxable: boolean;
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parentId?: number;
  imageUrl?: string;
  level: number;
  children: ProductCategory[];
}

export interface ProductCategoryPreview {
  id: number;
  name: string;
  slug: string;
  level: number;
}
```

### Order Models (mirrors `OrderDtos.java`)

```typescript
export interface OrderPreview {
  id: number;
  orderNumber: string;
  customerId: number;
  customerName: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  deliveryMethod: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderPreview {
  customerEmail?: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  deliveryFee: number;
  notes?: string;
  items: OrderItemResponse[];
  payment?: OrderPaymentResponse;
  statusHistory: OrderStatusHistoryResponse[];
}

export interface OrderItemResponse {
  id: number;
  productIdSnapshot: number;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  productImageUrlSnapshot?: string;
  variantColorSnapshot?: string;
  variantSizeSnapshot?: string;
  originalPrice: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  discountApplied: number;
  taxAmount: number;
}

// Status enums matching Java OrderStatus exactly
export type OrderStatus =
  | 'WAITING_PAYMENT_CONFIRMATION'
  | 'PAID'
  | 'PROCESSING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PAYMENT_TIMEOUT'
  | 'PAYMENT_FAILED';
```

### Cart Models

```typescript
export interface CartItem {
  productId: number;
  variantId?: number;
  name: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  maxQuantity: number;
}

export interface CartValidationRequest {
  items: CartItemValidationRequest[];
}

export interface CartItemValidationRequest {
  productId: number;
  variantId?: number;
  quantity: number;
  expectedUnitPrice: number;
}

export interface CartValidationResponse {
  valid: boolean;
  items: CartItemValidationResult[];
  summary: { subtotal: number; currency: string; };
}
```

---

## 7. Feature Services (URL-to-Service Mapping)

### Complete URL Reference

```typescript
// core/constants/api-urls.ts — mirrors ApiUrlsConstants.java
export const ApiUrls = {
  // Auth
  login: 'v1/auth/login',
  register: 'v1/auth/signup',
  logout: 'v1/auth/logout',
  refreshToken: 'v1/auth/refresh',
  forgotPassword: 'v1/auth/forgot-password',
  changePassword: 'v1/auth/change-password',

  // Users
  userProfile: 'v1/users/profile',
  users: 'v1/users',
  userById: (id: number) => `v1/users/${id}`,
  adminUpdateUser: (id: number) => `v1/users/${id}/admin-update`,
  updateUserRoles: (id: number) => `v1/users/${id}/roles`,
  regenerateTempPassword: (id: number) => `v1/users/${id}/temp-password`,

  // Products
  products: 'v1/products',
  productById: (id: number) => `v1/products/${id}`,
  productsByCategory: (categoryId: number) => `v1/products/category/${categoryId}`,
  productsBySubCategory: (subCategoryId: number) => `v1/products/subcategory/${subCategoryId}`,
  productImages: (productId: number) => `v1/products/${productId}/images`,
  productImageById: (productId: number, imageId: number) => `v1/products/${productId}/images/${imageId}`,

  // Categories
  categories: 'v1/categories',
  categoryById: (id: number) => `v1/categories/${id}`,
  categoryRoots: 'v1/categories/roots',
  categoryHierarchy: 'v1/categories/hierarchy',
  subCategories: (parentId: number) => `v1/categories/${parentId}/subcategories`,

  // Orders (ecom)
  validateCart: 'v1/orders/validate-cart',
  orders: 'v1/orders',
  orderById: (id: number) => `v1/orders/${id}`,
  cancelOrder: (id: number) => `v1/orders/${id}/cancel`,
  myOrders: 'v1/orders/my-orders',

  // Housing
  properties: 'v1/properties',
  propertyById: (id: number) => `v1/properties/${id}`,
  units: 'v1/units',
  unitById: (id: number) => `v1/units/${id}`,
  tenants: 'v1/tenants',
  tenantById: (id: number) => `v1/tenants/${id}`,
  leases: 'v1/leases',
  leaseById: (id: number) => `v1/leases/${id}`,
  maintenance: 'v1/maintenance',
  maintenanceById: (id: number) => `v1/maintenance/${id}`,
  payments: 'v1/payments',
} as const;
```

---

## 8. Routing Conventions

### Route Paths (mirrors `AppRoutePaths.dart`)

```typescript
// core/routes/route-paths.ts
export const RoutePaths = {
  // Public
  splash: '/splash',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  changePassword: '/change-password',

  // User portal
  home: '/home',
  productsListing: '/products',
  productDetail: '/products/:id',
  cart: '/cart',
  myOrders: '/orders',
  orderDetail: '/orders/:orderId',
  checkout: '/checkout',
  checkoutPayment: '/checkout/payment',

  // Admin
  adminDashboard: '/admin',
  adminProducts: '/admin/products',
  adminProductCreate: '/admin/products/create',
  adminProductEdit: '/admin/products/:id/edit',
  adminCategories: '/admin/categories',
  adminOrders: '/admin/orders',
  adminOrderDetail: '/admin/orders/:id',
  adminUsers: '/admin/users',
  adminUserDetail: '/admin/users/:id',

  // Housing admin
  adminProperties: '/admin/housing/properties',
  adminUnits: '/admin/housing/units',
  adminTenants: '/admin/housing/tenants',
  adminLeases: '/admin/housing/leases',
  adminMaintenance: '/admin/housing/maintenance',
  adminPayments: '/admin/housing/payments',
} as const;
```

---

## 9. Auth Feature

### Auth Store

```typescript
// features/auth/store/auth.store.ts
export interface AuthStoreState {
  loading: boolean;
  error: string | null;
  passwordResetRequired: boolean;
}

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthStoreState>({ loading: false, error: null, passwordResetRequired: false }),

  withMethods((store, authService = inject(AuthService), router = inject(Router)) => ({
    async login(credentials: LoginRequest): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const auth = await firstValueFrom(authService.login(credentials));
        if (auth.passwordResetRequired) {
          patchState(store, { loading: false, passwordResetRequired: true });
          router.navigate([RoutePaths.changePassword]);
        } else {
          patchState(store, { loading: false });
          router.navigate([RoutePaths.home]);
        }
      } catch (err: any) {
        patchState(store, { loading: false, error: err.error?.message ?? 'Login failed' });
      }
    },

    async logout(): Promise<void> {
      await firstValueFrom(authService.logout());
      router.navigate([RoutePaths.login]);
    },
  }))
);
```

---

## 10. Users Feature

### Users Service

```typescript
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  getUsers(params: UsersFilterParams): Observable<PaginatedResult<UserPreview>> {
    return this.http.get<PaginatedApiResponse<UserPreview>>(
      `${this.baseUrl}/${ApiUrls.users}`,
      { params: this.buildParams(params) }
    ).pipe(map(r => ({ items: r.data, pagination: r.pagination })));
  }

  getUserById(id: number): Observable<UserDetail> {
    return this.http.get<ApiResponse<UserDetail>>(`${this.baseUrl}/${ApiUrls.userById(id)}`)
      .pipe(map(r => r.data));
  }

  createUser(request: CreateUserRequest): Observable<UserDetail> {
    return this.http.post<ApiResponse<UserDetail>>(`${this.baseUrl}/${ApiUrls.users}`, request)
      .pipe(map(r => r.data));
  }

  updateUserRoles(userId: number, request: UpdateUserRolesRequest): Observable<UserDetail> {
    return this.http.patch<ApiResponse<UserDetail>>(
      `${this.baseUrl}/${ApiUrls.updateUserRoles(userId)}`, request
    ).pipe(map(r => r.data));
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/${ApiUrls.userById(id)}`)
      .pipe(map(() => void 0));
  }

  regenerateTempPassword(userId: number): Observable<string> {
    return this.http.post<ApiResponse<string>>(
      `${this.baseUrl}/${ApiUrls.regenerateTempPassword(userId)}`, {}
    ).pipe(map(r => r.data ?? r.message));
  }
}
```

### Users Filter Params (mirrors `UsersFilterReqParams.dart`)

```typescript
export interface UsersFilterParams {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  phoneNumber?: string;
  status?: boolean;
  createdFrom?: string;
  createdTo?: string;
  lastLoginFrom?: string;
  lastLoginTo?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
```

### Users Signal Store

```typescript
export const UsersStore = signalStore(
  withState<UsersState>({
    loading: false,
    loadingMore: false,
    error: null,
    filters: { page: 0, size: 20, sortBy: 'createdAt', sortOrder: 'desc' },
  }),
  withEntities<UserPreview>(),

  withComputed(({ entities, isLoadingMore: loadingMore }) => ({
    users: computed(() => entities()),
    isLoadingMore: computed(() => loadingMore()),
  })),

  withMethods((store, usersService = inject(UsersService)) => ({
    async loadUsers(filters?: Partial<UsersFilterParams>): Promise<void> {
      const mergedFilters = { ...store.filters(), ...filters, page: 0 };
      patchState(store, { loading: true, error: null, filters: mergedFilters });
      try {
        const result = await firstValueFrom(usersService.getUsers(mergedFilters));
        patchState(store, setEntities(result.items), {
          loading: false,
          pagination: result.pagination
        });
      } catch (err: any) {
        patchState(store, { loading: false, error: err.error?.message ?? 'Failed to load users' });
      }
    },

    async deleteUser(userId: number): Promise<void> {
      await firstValueFrom(usersService.deleteUser(userId));
      patchState(store, removeEntity(String(userId)));
    },
  }))
);
```

---

## 11. Products & Categories Feature

### Product Search Params (mirrors `ProductSearchReq.dart`)

```typescript
export interface ProductSearchParams {
  name?: string;
  sku?: string;
  upc?: string;
  slug?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  categoryId?: number;
  subCategoryId?: number;
  isFeatured?: boolean;
  isTaxable?: boolean;
  stockStatus?: string;
  expiryStatus?: string;
  tagSlugs?: string[];
  tagMatchMode?: 'any' | 'all';
  hasVariants?: boolean;
  searchInDescription?: boolean;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
```

### Products Service

```typescript
@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  searchProducts(params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
    const httpParams = this.buildSearchParams(params);
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.baseUrl}/${ApiUrls.products}`, { params: httpParams }
    ).pipe(map(r => ({ items: r.data, pagination: r.pagination })));
  }

  getProductById(id: number): Observable<ProductDetail> {
    return this.http.get<ApiResponse<ProductDetail>>(`${this.baseUrl}/${ApiUrls.productById(id)}`)
      .pipe(map(r => r.data));
  }

  getProductsByCategory(categoryId: number, page = 0, size = 20): Observable<PaginatedResult<ProductPreview>> {
    return this.http.get<PaginatedApiResponse<ProductPreview>>(
      `${this.baseUrl}/${ApiUrls.productsByCategory(categoryId)}`,
      { params: { page, size } }
    ).pipe(map(r => ({ items: r.data, pagination: r.pagination })));
  }

  private buildSearchParams(params: ProductSearchParams): HttpParams {
    let p = new HttpParams();
    const entries = Object.entries(params);
    for (const [key, value] of entries) {
      if (value === null || value === undefined) continue;
      if (key === 'tagSlugs' && Array.isArray(value)) {
        p = p.set('tagSlugs', value.join(','));
      } else {
        p = p.set(key, String(value));
      }
    }
    return p;
  }
}
```

### Categories Service

```typescript
@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  getRootCategories(): Observable<ProductCategory[]> {
    return this.http.get<ApiResponse<ProductCategory[]>>(`${this.baseUrl}/${ApiUrls.categoryRoots}`)
      .pipe(map(r => r.data), shareReplay(1));
  }

  getCategoryHierarchy(): Observable<ProductCategory[]> {
    return this.http.get<ApiResponse<ProductCategory[]>>(`${this.baseUrl}/${ApiUrls.categoryHierarchy}`)
      .pipe(map(r => r.data), shareReplay(1));
  }

  getSubcategories(parentId: number): Observable<ProductCategory[]> {
    return this.http.get<ApiResponse<ProductCategory[]>>(
      `${this.baseUrl}/${ApiUrls.subCategories(parentId)}`
    ).pipe(map(r => r.data));
  }

  // Admin mutations
  createCategory(request: CreateCategoryRequest): Observable<ProductCategory> {
    return this.http.post<ApiResponse<ProductCategory>>(`${this.baseUrl}/${ApiUrls.categories}`, request)
      .pipe(map(r => r.data));
  }

  updateCategory(id: number, request: UpdateCategoryRequest): Observable<ProductCategory> {
    return this.http.patch<ApiResponse<ProductCategory>>(
      `${this.baseUrl}/${ApiUrls.categoryById(id)}`, request
    ).pipe(map(r => r.data));
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/${ApiUrls.categoryById(id)}`)
      .pipe(map(() => void 0));
  }
}
```

---

## 12. Orders & Checkout Feature

### Orders Service

```typescript
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  validateCart(request: CartValidationRequest): Observable<CartValidationResponse> {
    return this.http.post<ApiResponse<CartValidationResponse>>(
      `${this.baseUrl}/${ApiUrls.validateCart}`, request
    ).pipe(map(r => r.data));
  }

  createOrder(request: CreateOrderRequest): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(`${this.baseUrl}/${ApiUrls.orders}`, request)
      .pipe(map(r => r.data));
  }

  getMyOrders(page = 0, size = 20): Observable<PaginatedResult<OrderPreview>> {
    return this.http.get<PaginatedApiResponse<OrderPreview>>(
      `${this.baseUrl}/${ApiUrls.myOrders}`, { params: { page, size } }
    ).pipe(map(r => ({ items: r.data, pagination: r.pagination })));
  }

  getOrderById(id: number): Observable<OrderDetail> {
    return this.http.get<ApiResponse<OrderDetail>>(`${this.baseUrl}/${ApiUrls.orderById(id)}`)
      .pipe(map(r => r.data));
  }

  cancelOrder(id: number, reason: string): Observable<OrderDetail> {
    return this.http.post<ApiResponse<OrderDetail>>(
      `${this.baseUrl}/${ApiUrls.cancelOrder(id)}`, { reason }
    ).pipe(map(r => r.data));
  }
}
```

### Create Order Request (mirrors `OrderDtos.CreateRequest`)

```typescript
export interface CreateOrderRequest {
  customerId: number;
  deliveryMethod: 'HOME_DELIVERY' | 'PICK_AT_STORE';
  deliveryAddressId?: number;
  storeId?: number;
  paymentMethod: 'MPESA' | 'PAY_ON_DELIVERY';
  paymentPhoneNumber?: string;   // Required for MPESA — format: 254XXXXXXXXX
  cartItems: CartItemRequest[];
  voucherCodes?: string[];
  deliveryInstructions?: string;
  notes?: string;
}

export interface CartItemRequest {
  productId: number;
  variantId?: number;
  quantity: number;
  unitPrice: number;
}
```

### Cart Store (local-first, mirrors Flutter `CartCubit`)

```typescript
// Cart persists in localStorage (items list only — no tokens or sensitive data)
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly ordersService = inject(OrdersService);
  private readonly _items = signal<CartItem[]>(this.restoreFromStorage());

  readonly items = this._items.asReadonly();
  readonly itemCount = computed(() => this._items().reduce((s, i) => s + i.quantity, 0));
  readonly subtotal = computed(() => this._items().reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  readonly isEmpty = computed(() => this._items().length === 0);

  addItem(item: CartItem): void {
    this._items.update(items => {
      const idx = items.findIndex(i => i.productId === item.productId && i.variantId === item.variantId);
      const updated = idx >= 0
        ? items.map((i, index) => index === idx ? { ...i, quantity: i.quantity + item.quantity } : i)
        : [...items, item];
      this.saveToStorage(updated);
      return updated;
    });
  }

  removeItem(productId: number, variantId?: number): void {
    this._items.update(items => {
      const updated = items.filter(i => !(i.productId === productId && i.variantId === variantId));
      this.saveToStorage(updated);
      return updated;
    });
  }

  clear(): void {
    this._items.set([]);
    localStorage.removeItem('cart_items');
  }

  validateCart(): Observable<CartValidationResponse> {
    return this.ordersService.validateCart({
      items: this._items().map(i => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        expectedUnitPrice: i.unitPrice,
      }))
    });
  }

  private saveToStorage(items: CartItem[]): void {
    localStorage.setItem('cart_items', JSON.stringify(items));
  }

  private restoreFromStorage(): CartItem[] {
    try {
      const stored = localStorage.getItem('cart_items');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }
}
```

---

## 13. eCommerce Admin Feature

### Admin Orders Search Params (mirrors `OrderSearchReq.java`)

```typescript
export interface OrderSearchParams {
  id?: number;
  orderNumber?: string;
  customerId?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  deliveryMethod?: string;
  minTotalAmount?: number;
  maxTotalAmount?: number;
  createdFrom?: string;  // ISO date-time string
  createdTo?: string;
  page?: number;
  size?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
```

### Admin Orders Service

```typescript
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  searchOrders(params: OrderSearchParams): Observable<PaginatedResult<OrderPreview>> {
    return this.http.get<PaginatedApiResponse<OrderPreview>>(
      `${this.baseUrl}/${ApiUrls.orders}`,
      { params: this.buildParams(params) }
    ).pipe(map(r => ({ items: r.data, pagination: r.pagination })));
  }

  updateOrder(id: number, request: UpdateOrderRequest): Observable<OrderDetail> {
    return this.http.patch<ApiResponse<OrderDetail>>(
      `${this.baseUrl}/${ApiUrls.orderById(id)}`, request
    ).pipe(map(r => r.data));
  }
}
```

### Admin Categories Store (mirrors `AdminCategoriesCubit`)

Preserve loaded data during mutations — never blank the screen on save/delete.

```typescript
export interface AdminCategoriesState {
  loading: boolean;
  mutating: boolean;    // true during create/update/delete — keeps data visible
  error: string | null;
  mutationSuccess: string | null;
  hierarchy: ProductCategory[];
}

export const AdminCategoriesStore = signalStore(
  withState<AdminCategoriesState>({
    loading: false, mutating: false, error: null, mutationSuccess: null, hierarchy: [],
  }),

  withMethods((store, categoriesService = inject(CategoriesService)) => ({
    async loadHierarchy(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const hierarchy = await firstValueFrom(categoriesService.getCategoryHierarchy());
        patchState(store, { loading: false, hierarchy });
      } catch (err: any) {
        patchState(store, { loading: false, error: err.error?.message ?? 'Failed to load categories' });
      }
    },

    async createCategory(request: CreateCategoryRequest): Promise<void> {
      // Keep hierarchy visible — use mutating: true, not loading: true
      patchState(store, { mutating: true, error: null, mutationSuccess: null });
      try {
        await firstValueFrom(categoriesService.createCategory(request));
        patchState(store, { mutating: false, mutationSuccess: `Category "${request.name}" created successfully` });
        // Reload hierarchy after mutation
        const hierarchy = await firstValueFrom(categoriesService.getCategoryHierarchy());
        patchState(store, { hierarchy });
      } catch (err: any) {
        patchState(store, { mutating: false, error: err.error?.message ?? 'Failed to create category' });
      }
    },

    async deleteCategory(id: number, name: string): Promise<void> {
      patchState(store, { mutating: true, error: null, mutationSuccess: null });
      try {
        await firstValueFrom(categoriesService.deleteCategory(id));
        patchState(store, {
          mutating: false,
          mutationSuccess: `Category "${name}" deleted`,
          hierarchy: store.hierarchy().filter(c => c.id !== id),
        });
      } catch (err: any) {
        patchState(store, { mutating: false, error: err.error?.message ?? 'Failed to delete category' });
      }
    },

    clearMutationResult(): void {
      patchState(store, { mutationSuccess: null, error: null });
    },
  }))
);
```

---

## 14. Housing / Tenancy Feature

### Housing Models (mirrors Spring housing entities)

```typescript
export interface PropertyPreview {
  id: number;
  name: string;
  type: string;
  address: Address;
  unitCount: number;
  occupancyRate: number;
  isActive: boolean;
  createdAt: string;
}

export interface TenantPreview {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  currentUnitNumber?: string;
  currentPropertyName?: string;
  leaseStatus?: string;
  createdAt: string;
}

export interface LeaseDetail {
  id: number;
  unitId: number;
  tenantId: number;
  startDate: string;
  endDate: string;
  rentAmount: number;
  securityDeposit: number;
  paymentDueDay: number;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATED' | 'RENEWED';
  terms: string;
  createdAt: string;
}

export interface MaintenanceTicketPreview {
  id: number;
  unitId: number;
  tenantId: number;
  title: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  status: 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED';
  assignedTo?: string;
  createdAt: string;
}
```

---

## 15. File Uploads (MinIO)

The backend stores file **paths** and returns presigned **URLs**. The Angular client always sends files and displays URLs — it never constructs paths.

### File Upload Service

```typescript
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /**
   * Uploads a file as multipart/form-data.
   * Endpoint should accept the file as @RequestPart("file").
   * Returns URL (already presigned/public) from the backend response.
   */
  uploadProductImage(
    productId: number,
    file: File,
    options?: { altText?: string; isPrimary?: boolean }
  ): Observable<ProductImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.altText) formData.append('altText', options.altText);
    if (options?.isPrimary !== undefined) formData.append('isPrimary', String(options.isPrimary));

    return this.http.post<ApiResponse<ProductImageResponse>>(
      `${this.baseUrl}/${ApiUrls.productImages(productId)}`, formData
    ).pipe(map(r => r.data));
  }

  uploadTenantDocument(tenantId: number, file: File, docType: string): Observable<TenantDocumentResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', docType);

    return this.http.post<ApiResponse<TenantDocumentResponse>>(
      `${this.baseUrl}/v1/tenants/${tenantId}/documents`, formData
    ).pipe(map(r => r.data));
  }
}
```

### File Validation (client-side, before upload)

```typescript
// mirrors FileUploadContext.validate() in Java
export function validateFile(
  file: File,
  options: { maxSizeMB: number; allowedTypes: string[] }
): string | null {
  if (file.size > options.maxSizeMB * 1024 * 1024) {
    return `File exceeds ${options.maxSizeMB}MB limit`;
  }
  if (!options.allowedTypes.includes(file.type)) {
    return `File type "${file.type}" not allowed. Allowed: ${options.allowedTypes.join(', ')}`;
  }
  return null;  // null = valid
}

// Allowed types per context
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
```

---

## 16. WebSocket & Real-Time (STOMP)

The backend uses STOMP over WebSocket with RabbitMQ relay. Flutter connects with plain WebSocket; the Angular web app should use `@stomp/rx-stomp`.

### WebSocket Service

```typescript
@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly authService = inject(AuthService);
  private readonly wsUrl = inject(WS_URL);

  private rxStomp: RxStomp | null = null;

  connect(): void {
    const token = this.authService.accessToken();
    if (!token) return;

    this.rxStomp = new RxStomp();
    this.rxStomp.configure({
      brokerURL: `${this.wsUrl}?token=${token}`,
      heartbeatIncoming: 5000,
      heartbeatOutgoing: 5000,
      reconnectDelay: 3000,
    });
    this.rxStomp.activate();
  }

  disconnect(): void {
    this.rxStomp?.deactivate();
    this.rxStomp = null;
  }

  // Subscribe to personal notifications
  watchNotifications(): Observable<any> {
    return this.rxStomp?.watch('/user/queue/notifications').pipe(
      map(msg => JSON.parse(msg.body))
    ) ?? EMPTY;
  }

  // Subscribe to personal chat messages
  watchChatMessages(): Observable<any> {
    return this.rxStomp?.watch('/user/queue/chat').pipe(
      map(msg => JSON.parse(msg.body))
    ) ?? EMPTY;
  }

  // Send chat message
  sendMessage(destination: string, body: any): void {
    this.rxStomp?.publish({
      destination: `/app/${destination}`,
      body: JSON.stringify(body),
    });
  }
}
```

### STOMP Channel Reference (mirrors backend `WebSocketConfig`)

| Direction | Destination | Purpose |
|---|---|---|
| Server → user | `/user/{userId}/queue/chat` | Personal chat messages |
| Server → user | `/user/{userId}/queue/notifications` | Personal in-app notifications |
| Server → all | `/topic/admin-chat` | Admin dashboard broadcast |
| Client → server | `/app/chat.send` | Send text message |
| Client → server | `/app/chat.typing.start` | Typing indicator on |
| Client → server | `/app/chat.typing.stop` | Typing indicator off |
| Client → server | `/app/chat.read` | Mark as read |

---

## 17. Error Handling — Backend Error Shapes

### Error Interceptor (with backend error extraction)

```typescript
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const backendError: ErrorResponse | null = error.error;
      const message = backendError?.message ?? 'An unexpected error occurred';
      const errorCode = backendError?.errorCode ?? 'UNKNOWN';
      const details = backendError?.details ?? [];

      switch (error.status) {
        case 401:
          // Handled by tokenRefreshInterceptor — only reaches here if refresh also failed
          authService.logout();
          router.navigate(['/login']);
          break;
        case 403:
          notificationService.error('You do not have permission to perform this action');
          router.navigate(['/forbidden']);
          break;
        case 404:
          // Let components handle 404 locally
          break;
        case 422:
          // Validation errors — details contains field-level messages
          const fieldErrors = details.join('\n');
          notificationService.error(fieldErrors || message);
          break;
        case 429:
          notificationService.warn('Too many requests. Please slow down.');
          break;
        default:
          if (error.status >= 500) {
            notificationService.error('Server error. Please try again later.');
          }
      }

      return throwError(() => ({
        status: error.status,
        errorCode,
        message,
        details,
      }));
    })
  );
};
```

### Error Code Reference (from `GlobalExceptionHandler.java`)

| `errorCode` | HTTP | When |
|---|---|---|
| `RESOURCE_NOT_FOUND` | 404 | Entity doesn't exist |
| `RESOURCE_ALREADY_EXISTS` | 409 | Uniqueness violation |
| `VALIDATION_ERROR` | 400 | `@Valid` failed — check `details[]` for field errors |
| `BAD_REQUEST` | 400 | Invalid input |
| `ACCESS_DENIED` | 403 | Insufficient permission |
| `BAD_CREDENTIALS` | 401 | Wrong email/password |
| `TOKEN_REFRESH_ERROR` | 401 | Refresh token invalid |
| `OPERATION_NOT_ALLOWED` | 405 | Entity state prevents operation |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |

---

## 18. Pagination — Backend Pagination Shape

### Pagination Component State Pattern

```typescript
export interface PaginationState {
  page: number;         // 0-based (matches Spring Pageable)
  size: number;
  totalElements: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
}

// In admin list components — mirrors Flutter AppTablePaginator
@Component({ ... })
export class UserListPageComponent {
  readonly store = inject(UsersStore);

  onPageChange(page: number): void {
    this.store.loadUsers({ page, size: this.store.pagination().size });
  }

  onPageSizeChange(size: number): void {
    this.store.loadUsers({ page: 0, size });
  }
}
```

### Paginator Component Usage

```html
<app-paginator
  [page]="store.pagination().page"
  [size]="store.pagination().size"
  [totalElements]="store.pagination().totalElements"
  [totalPages]="store.pagination().totalPages"
  (pageChange)="onPageChange($event)"
  (sizeChange)="onPageSizeChange($event)"
/>
```

---

## 19. Search Request DTOs

All admin list pages pass query params via `@ModelAttribute` on the backend. Build params explicitly — don't send null values.

```typescript
// Utility to build HttpParams, skipping null/undefined
export function buildHttpParams(params: Record<string, any>): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      p = p.set(key, value.join(','));
    } else {
      p = p.set(key, String(value));
    }
  }
  return p;
}
```

---

## 20. Feature Generation Checklist

When generating a new Angular feature for the Unitwise web app, work in this order:

1. **Add API URLs** to `api-urls.ts` (mirrors `ApiUrlsConstants.java`)
2. **Add route paths** to `route-paths.ts`
3. **Add permission constants** if the feature needs permission gates
4. **Create TypeScript interfaces** mirroring the Java `*Dtos.java` inner classes exactly
5. **Create the service** — inject `API_URL`, unwrap `ApiResponse<T>` and `PaginatedApiResponse<T>`, never expose envelopes
6. **Create the signal store** — loading/mutating/error states; preserve list data during mutations
7. **Create the page component** — uses `PermissionGate`, shows all three states (loading/empty/error)
8. **Create list + detail pages** with pagination, filters, search
9. **Wire error messages** from `errorCode` field (not generic messages)
10. **Add validation** matching `@Valid` constraints from the Java DTO
11. **Write service tests** with mocked HTTP responses matching the real envelope shape
12. **Add E2E tests** for critical flows

### Pre-generation Confirmation

Before generating any service code, confirm:
- Does every `GET` list endpoint use the `PaginatedApiResponse<T>` unwrap pattern?
- Are enum values uppercase strings matching Java exactly (e.g. `'WAITING_PAYMENT_CONFIRMATION'`)?
- Does every mutation (POST/PATCH/DELETE) unwrap `ApiResponse<T>`?
- Does the paginator use 0-based page numbers (Spring default)?
- Are phone numbers for M-Pesa formatted as `254XXXXXXXXX` before submission?
- Does the cart store persist to `localStorage` (items only, not tokens)?
- Are file upload components validating MIME type and size before calling the upload service?
- Does the admin mutation store use `mutating: true` (not `loading: true`) to preserve displayed data?

---

## 21. Minimalist Visual Direction

Keep the UI quiet, compact, and easy to scan. The goal is a clean product feel, not decorative density.

### Layout Rules

1. Keep titles modest in size and weight; a title should not consume most of the panel.
2. Avoid large intro paragraphs when the screen already shows a clear form or table.
3. Remove decorative chips, badges, or labels when they do not add real meaning.
4. Prefer compact cards with tighter vertical spacing and less empty space around controls.
5. Keep tables dense with smaller row heights and subtle separators.

### Color Rules

1. Use one calm primary color, one neutral surface palette, and only the semantic colors the view truly needs.
2. Prefer light backgrounds with soft borders and restrained contrast.
3. Avoid mixing too many accent colors in the same view.
4. Keep interactive states clear, but subtle.

### Copy Rules

1. Use short titles such as `Sign in`, `Create account`, or `Reset password`.
2. Prefer one-line helper text over long write-ups.
3. If a label or title repeats what the form already shows, remove it.
4. Keep field labels and button labels concise and direct.
