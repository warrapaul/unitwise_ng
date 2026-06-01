# Angular AI Agent Skills Guide
## eCommerce & Housing Management Applications

> **Version:** 1.0 — Angular 20+ | Signals | NgRx Signal Store | Standalone Components | Tailwind CSS  
> **Scope:** Full-stack Angular project generation for eCommerce storefronts, admin dashboards, and property/housing management platforms

---

## Table of Contents

1. [Core Architecture Principles](#1-core-architecture-principles)
2. [Project Structure](#2-project-structure)
3. [Angular Modern Patterns](#3-angular-modern-patterns)
4. [State Management](#4-state-management)
5. [RxJS Mastery](#5-rxjs-mastery)
6. [API Integration & HTTP Layer](#6-api-integration--http-layer)
7. [Forms Architecture](#7-forms-architecture)
8. [Routing & Lazy Loading](#8-routing--lazy-loading)
9. [Performance Optimization](#9-performance-optimization)
10. [Security Standards](#10-security-standards)
11. [UI/UX Design System](#11-uiux-design-system)
12. [Component Library](#12-component-library)
13. [eCommerce Domain](#13-ecommerce-domain)
14. [Housing Management Domain](#14-housing-management-domain)
15. [Testing Standards](#15-testing-standards)
16. [TypeScript & Code Quality](#16-typescript--code-quality)
17. [Admin Dashboard Patterns](#17-admin-dashboard-patterns)
18. [Accessibility (WCAG)](#18-accessibility-wcag)
19. [Loading, Empty & Error States](#19-loading-empty--error-states)
20. [Code Generation Rules (Quick Reference)](#20-code-generation-rules-quick-reference)

---

## 1. Core Architecture Principles

The agent must strictly enforce the following architectural standards on every generated file.

### 1.1 Mandatory Standards

- **Angular 20+ Standalone Components only** — never generate `NgModule`-based code
- **Feature-based folder structure** — group files by domain feature, not by file type
- **Domain-Driven Design (DDD)** — model features around business concepts (product, cart, tenancy, lease)
- **Smart/Container vs Presentational separation** — containers manage state, presentational components receive inputs and emit outputs
- **SOLID Principles** — single responsibility, open/closed, dependency inversion at every layer
- **Clean Architecture layers:** `core → domain → infrastructure → presentation`
- **OnPush Change Detection everywhere** — no exceptions unless explicitly justified

### 1.2 Dependency Injection

Always use `inject()` function — never constructor-based injection:

```typescript
// ✅ Correct
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);
}

// ❌ Never
export class ProductService {
  constructor(private http: HttpClient, private store: Store) {}
}
```

### 1.3 Component Anatomy

Every generated component must follow this structure:

```typescript
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyPipe],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  // 1. Inputs (use input() signal)
  readonly product = input.required<Product>();
  readonly showActions = input<boolean>(true);

  // 2. Outputs (use output())
  readonly addToCart = output<Product>();
  readonly addToWishlist = output<Product>();

  // 3. Injected services
  private readonly router = inject(Router);

  // 4. Computed signals
  readonly discountPercent = computed(() =>
    Math.round((1 - this.product().salePrice / this.product().originalPrice) * 100)
  );

  // 5. Methods
  onAddToCart(): void {
    this.addToCart.emit(this.product());
  }
}
```

---

## 2. Project Structure

### 2.1 Universal Structure (Both Apps)

```
src/
├── app/
│   ├── core/                         # Singleton services, app-wide concerns
│   │   ├── auth/
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.store.ts
│   │   │   └── auth.interceptor.ts
│   │   ├── interceptors/
│   │   │   ├── error.interceptor.ts
│   │   │   ├── loading.interceptor.ts
│   │   │   └── auth.interceptor.ts
│   │   ├── guards/
│   │   │   ├── auth.guard.ts
│   │   │   ├── role.guard.ts
│   │   │   └── permission.guard.ts
│   │   ├── models/                   # App-wide interfaces and enums
│   │   ├── services/
│   │   │   ├── notification.service.ts
│   │   │   └── analytics.service.ts
│   │   └── core.providers.ts
│   │
│   ├── shared/                       # Reusable UI and utilities
│   │   ├── components/
│   │   │   ├── button/
│   │   │   ├── card/
│   │   │   ├── modal/
│   │   │   ├── pagination/
│   │   │   ├── search-bar/
│   │   │   ├── skeleton-loader/
│   │   │   ├── empty-state/
│   │   │   ├── error-state/
│   │   │   ├── data-table/
│   │   │   └── breadcrumb/
│   │   ├── pipes/
│   │   │   ├── currency-format.pipe.ts
│   │   │   ├── time-ago.pipe.ts
│   │   │   └── truncate.pipe.ts
│   │   ├── directives/
│   │   │   ├── click-outside.directive.ts
│   │   │   └── infinite-scroll.directive.ts
│   │   ├── validators/
│   │   │   ├── phone.validator.ts
│   │   │   └── password-match.validator.ts
│   │   └── utils/
│   │       ├── date.utils.ts
│   │       └── format.utils.ts
│   │
│   ├── features/                     # Domain feature modules
│   │   └── (see domain-specific sections below)
│   │
│   ├── layout/
│   │   ├── header/
│   │   ├── footer/
│   │   ├── sidebar/
│   │   └── layout.component.ts
│   │
│   ├── app.config.ts
│   ├── app.routes.ts
│   └── app.component.ts
│
├── environments/
│   ├── environment.ts
│   └── environment.production.ts
│
└── styles/
    ├── _tokens.scss              # Design tokens
    ├── _typography.scss
    ├── _utilities.scss
    └── styles.scss
```

### 2.2 eCommerce Feature Structure

```
features/
├── auth/
├── catalog/
│   ├── components/
│   ├── pages/
│   │   ├── product-list/
│   │   └── product-detail/
│   ├── store/
│   │   ├── catalog.store.ts
│   │   └── catalog.selectors.ts
│   ├── services/
│   │   └── catalog.service.ts
│   ├── models/
│   │   ├── product.model.ts
│   │   └── category.model.ts
│   └── catalog.routes.ts
├── cart/
├── checkout/
├── orders/
├── account/
├── wishlist/
└── admin/
    ├── products/
    ├── orders/
    ├── customers/
    ├── inventory/
    └── analytics/
```

### 2.3 Housing Management Feature Structure

```
features/
├── auth/
├── properties/
│   ├── components/
│   ├── pages/
│   │   ├── property-list/
│   │   ├── property-detail/
│   │   └── property-map/
│   ├── store/
│   ├── services/
│   └── models/
├── units/
├── tenants/
├── leases/
├── maintenance/
├── payments/
├── documents/
├── reports/
└── admin/
    ├── dashboard/
    ├── properties/
    ├── tenants/
    └── finances/
```

---

## 3. Angular Modern Patterns

### 3.1 Signals (Priority: Mandatory)

Use Angular Signals for ALL synchronous, local, and derived state.

```typescript
// ✅ Signal-based service
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>([]);
  private readonly _coupon = signal<Coupon | null>(null);

  // Public readonly computed signals
  readonly items = this._items.asReadonly();
  readonly itemCount = computed(() => this._items().reduce((sum, i) => sum + i.quantity, 0));
  readonly subtotal = computed(() =>
    this._items().reduce((sum, i) => sum + i.price * i.quantity, 0)
  );
  readonly discount = computed(() =>
    this._coupon() ? this.subtotal() * this._coupon()!.discountRate : 0
  );
  readonly total = computed(() => this.subtotal() - this.discount());
  readonly isEmpty = computed(() => this._items().length === 0);

  addItem(item: CartItem): void {
    this._items.update(items => {
      const existing = items.find(i => i.productId === item.productId);
      if (existing) {
        return items.map(i =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...items, item];
    });
  }

  removeItem(productId: string): void {
    this._items.update(items => items.filter(i => i.productId !== productId));
  }

  applyCoupon(coupon: Coupon): void {
    this._coupon.set(coupon);
  }

  clear(): void {
    this._items.set([]);
    this._coupon.set(null);
  }
}
```

### 3.2 Signal API Summary

```typescript
// Creation
const count = signal(0);
const user = signal<User | null>(null);

// Derived
const doubled = computed(() => count() * 2);

// Side effects (use sparingly, prefer computed)
effect(() => {
  localStorage.setItem('cart', JSON.stringify(cartService.items()));
});

// Component inputs/outputs
readonly product = input.required<Product>();
readonly label = input<string>('Click me');
readonly clicked = output<void>();

// Two-way binding
readonly value = model<string>('');
```

### 3.3 Modern Template Syntax

Always use new control flow syntax — never `*ngIf`, `*ngFor`, `*ngSwitch`:

```html
<!-- ✅ New control flow -->
@if (products().length > 0) {
  <app-product-grid [products]="products()" />
} @else {
  <app-empty-state message="No products found" />
}

@for (product of products(); track product.id) {
  <app-product-card [product]="product" />
} @empty {
  <app-skeleton-loader />
}

@switch (order.status) {
  @case ('pending') { <app-order-pending /> }
  @case ('shipped') { <app-order-shipped /> }
  @default { <app-order-default /> }
}

<!-- Deferred loading -->
@defer (on viewport) {
  <app-product-reviews [productId]="product().id" />
} @placeholder {
  <app-skeleton-loader rows="3" />
} @loading (minimum 300ms) {
  <app-spinner />
}
```

### 3.4 `toSignal` and `toObservable`

Bridge the gap between RxJS and Signals:

```typescript
export class ProductSearchComponent {
  private readonly catalogService = inject(CatalogService);

  readonly searchQuery = signal('');

  // Convert Observable → Signal
  readonly searchResults = toSignal(
    toObservable(this.searchQuery).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      filter(q => q.length >= 2),
      switchMap(q => this.catalogService.search(q))
    ),
    { initialValue: [] as Product[] }
  );
}
```

---

## 4. State Management

### 4.1 Decision Matrix

| State Type | Solution | Example |
|---|---|---|
| Component-local UI state | `signal()` | toggle, selected tab |
| Shared transient state | Signal-based service | cart, notification |
| Feature-scoped state | `signalStore` from `@ngrx/signals` | product catalog, tenant list |
| Complex cross-feature state | NgRx Store + Effects | auth, order flow, payments |
| Server cache/async state | `signalStore` + resource API | paginated data, filters |

### 4.2 NgRx Signal Store Pattern

```typescript
// housing-management: tenant.store.ts
import { signalStore, withState, withComputed, withMethods, withHooks } from '@ngrx/signals';
import { withEntities, setEntities, addEntity, updateEntity, removeEntity } from '@ngrx/signals/entities';

export interface TenantState {
  loading: boolean;
  error: string | null;
  selectedTenantId: string | null;
  filters: TenantFilters;
}

const initialState: TenantState = {
  loading: false,
  error: null,
  selectedTenantId: null,
  filters: { status: 'all', propertyId: null },
};

export const TenantStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withEntities<Tenant>(),

  withComputed(({ entities, selectedTenantId, filters }) => ({
    selectedTenant: computed(() =>
      entities().find(t => t.id === selectedTenantId()) ?? null
    ),
    activeTenants: computed(() =>
      entities().filter(t => t.status === 'active')
    ),
    filteredTenants: computed(() => {
      const f = filters();
      return entities().filter(t =>
        (f.status === 'all' || t.status === f.status) &&
        (!f.propertyId || t.propertyId === f.propertyId)
      );
    }),
    tenantCount: computed(() => entities().length),
  })),

  withMethods((store, tenantService = inject(TenantService)) => ({
    async loadTenants(): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const tenants = await tenantService.getAll();
        patchState(store, setEntities(tenants), { loading: false });
      } catch (err) {
        patchState(store, { error: 'Failed to load tenants', loading: false });
      }
    },

    selectTenant(id: string): void {
      patchState(store, { selectedTenantId: id });
    },

    updateFilters(filters: Partial<TenantFilters>): void {
      patchState(store, state => ({
        filters: { ...state.filters, ...filters }
      }));
    },
  })),

  withHooks({
    onInit: (store) => store.loadTenants(),
  })
);
```

### 4.3 NgRx Classic Store (Complex Flows)

Use for multi-step flows like checkout or lease signing:

```typescript
// Checkout state with NgRx
export interface CheckoutState {
  step: CheckoutStep;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  selectedShippingMethod: ShippingMethod | null;
  paymentIntent: PaymentIntent | null;
  placingOrder: boolean;
  orderId: string | null;
  error: string | null;
}

// Enum for steps
export enum CheckoutStep {
  Shipping = 'shipping',
  Payment = 'payment',
  Review = 'review',
  Confirmation = 'confirmation',
}
```

---

## 5. RxJS Mastery

### 5.1 Operator Decision Guide

| Scenario | Operator |
|---|---|
| Cancel previous HTTP on new trigger | `switchMap` |
| Allow concurrent HTTP calls | `mergeMap` |
| Queue sequential requests | `concatMap` |
| Prevent repeat clicks (e.g., form submit) | `exhaustMap` |
| Parallel requests, wait for all | `forkJoin` |
| React to multiple streams | `combineLatest` |
| Share single subscription | `shareReplay(1)` |
| Auto-cleanup on component destroy | `takeUntilDestroyed()` |

### 5.2 Anti-Patterns

```typescript
// ❌ NEVER — nested subscriptions
this.authService.getUser().subscribe(user => {
  this.orderService.getOrders(user.id).subscribe(orders => {
    this.store.dispatch(loadOrdersSuccess({ orders }));
  });
});

// ✅ CORRECT — pipe and flatten
this.authService.getUser().pipe(
  switchMap(user => this.orderService.getOrders(user.id)),
  takeUntilDestroyed()
).subscribe(orders => this.store.dispatch(loadOrdersSuccess({ orders })));
```

### 5.3 Auto-Cleanup Pattern

```typescript
export class OrderListComponent {
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.orderService.streamUpdates().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(update => this.handleUpdate(update));
  }
}
```

---

## 6. API Integration & HTTP Layer

### 6.1 Interceptors

Always generate these three interceptors for every project:

```typescript
// auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();

  if (token) {
    req = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }
  return next(req);
};

// error.interceptor.ts
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
        router.navigate(['/auth/login']);
      } else if (error.status === 403) {
        router.navigate(['/forbidden']);
      } else if (error.status >= 500) {
        notify.error('Server error. Please try again later.');
      }
      return throwError(() => error);
    })
  );
};

// loading.interceptor.ts
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);
  loadingService.show();
  return next(req).pipe(
    finalize(() => loadingService.hide())
  );
};
```

### 6.2 JWT + Refresh Token Workflow

```typescript
// token-refresh.interceptor.ts
export const tokenRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/refresh')) {
        return authService.refreshToken().pipe(
          switchMap(() => {
            const newToken = authService.accessToken();
            const retried = req.clone({
              headers: req.headers.set('Authorization', `Bearer ${newToken}`)
            });
            return next(retried);
          }),
          catchError(refreshErr => {
            authService.logout();
            return throwError(() => refreshErr);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
```

### 6.3 Service Layer Pattern

```typescript
@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly env = inject(ENVIRONMENT);

  private readonly baseUrl = `${this.env.apiUrl}/products`;

  getProducts(params: ProductQueryParams): Observable<PaginatedResponse<Product>> {
    return this.http.get<PaginatedResponse<Product>>(this.baseUrl, {
      params: this.buildParams(params)
    }).pipe(
      retry({ count: 2, delay: 1000 }),
      shareReplay(1)
    );
  }

  getProduct(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.baseUrl}/${id}`);
  }

  createProduct(payload: CreateProductRequest): Observable<Product> {
    return this.http.post<Product>(this.baseUrl, payload);
  }

  updateProduct(id: string, payload: UpdateProductRequest): Observable<Product> {
    return this.http.patch<Product>(`${this.baseUrl}/${id}`, payload);
  }

  deleteProduct(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  private buildParams(params: ProductQueryParams): HttpParams {
    let p = new HttpParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== null && val !== undefined) p = p.set(key, String(val));
    });
    return p;
  }
}
```

### 6.4 Pagination, Filtering & Sorting Standards

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface QueryParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, string | number | boolean>;
}
```

---

## 7. Forms Architecture

### 7.1 Rules

- **Reactive Forms only** — never Template-driven
- **Always strongly type** `FormGroup<T>` — never `FormGroup<any>`
- **Custom validators** for business rules
- **Async validators** for server-side uniqueness checks
- All forms must include loading, success, and error feedback

### 7.2 Typed Form Pattern

```typescript
// checkout-form.types.ts
export interface CheckoutForm {
  shippingAddress: FormGroup<AddressForm>;
  billingAddress: FormGroup<AddressForm>;
  sameAsBilling: FormControl<boolean>;
  shippingMethod: FormControl<string>;
}

export interface AddressForm {
  fullName: FormControl<string>;
  line1: FormControl<string>;
  line2: FormControl<string | null>;
  city: FormControl<string>;
  state: FormControl<string>;
  postalCode: FormControl<string>;
  country: FormControl<string>;
  phone: FormControl<string>;
}

// checkout.component.ts
@Component({ ... })
export class CheckoutComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly form: FormGroup<CheckoutForm> = this.fb.group({
    shippingAddress: this.buildAddressGroup(),
    billingAddress: this.buildAddressGroup(),
    sameAsBilling: this.fb.control(true),
    shippingMethod: this.fb.control('', Validators.required),
  });

  private buildAddressGroup(): FormGroup<AddressForm> {
    return this.fb.group({
      fullName: this.fb.control('', [Validators.required, Validators.minLength(2)]),
      line1: this.fb.control('', Validators.required),
      line2: this.fb.control<string | null>(null),
      city: this.fb.control('', Validators.required),
      state: this.fb.control('', Validators.required),
      postalCode: this.fb.control('', [Validators.required, postalCodeValidator()]),
      country: this.fb.control('KE', Validators.required),
      phone: this.fb.control('', [Validators.required, phoneValidator()]),
    });
  }
}
```

### 7.3 Custom Validators

```typescript
// validators/phone.validator.ts
export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const pattern = /^\+?[1-9]\d{9,14}$/;
    return pattern.test(control.value) ? null : { invalidPhone: true };
  };
}

// validators/unique-email.validator.ts
export function uniqueEmailValidator(authService: AuthService): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> =>
    authService.checkEmailExists(control.value).pipe(
      debounceTime(400),
      map(exists => exists ? { emailTaken: true } : null),
      catchError(() => of(null))
    );
}
```

### 7.4 Multi-Step Forms (Wizard)

Used for checkout, lease signing, and property onboarding:

```typescript
export class MultiStepFormComponent {
  readonly currentStep = signal(0);
  readonly steps = ['Details', 'Address', 'Documents', 'Review'];
  readonly totalSteps = this.steps.length;

  readonly progress = computed(() =>
    Math.round(((this.currentStep() + 1) / this.totalSteps) * 100)
  );

  goNext(): void {
    if (this.currentStep() < this.totalSteps - 1) {
      this.currentStep.update(s => s + 1);
    }
  }

  goPrev(): void {
    if (this.currentStep() > 0) {
      this.currentStep.update(s => s - 1);
    }
  }
}
```

---

## 8. Routing & Lazy Loading

### 8.1 Root Routes Pattern

```typescript
// app.routes.ts
export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) },
      {
        path: 'products',
        loadChildren: () => import('./features/catalog/catalog.routes').then(m => m.CATALOG_ROUTES)
      },
      {
        path: 'cart',
        loadComponent: () => import('./features/cart/cart.component').then(m => m.CartComponent)
      },
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadChildren: () => import('./features/checkout/checkout.routes').then(m => m.CHECKOUT_ROUTES)
      },
      {
        path: 'account',
        canActivate: [authGuard],
        loadChildren: () => import('./features/account/account.routes').then(m => m.ACCOUNT_ROUTES)
      },
    ]
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES)
  },
  { path: 'auth', loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES) },
  { path: '**', loadComponent: () => import('./shared/components/not-found/not-found.component').then(m => m.NotFoundComponent) },
];
```

### 8.2 Guards

```typescript
// guards/auth.guard.ts
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) return true;
  return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};

// guards/role.guard.ts
export const roleGuard = (requiredRole: UserRole): CanActivateFn => (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasRole(requiredRole)) return true;
  return router.createUrlTree(['/forbidden']);
};
```

---

## 9. Performance Optimization

Always apply all of the following without being asked.

### 9.1 Mandatory Optimizations

```typescript
// 1. OnPush everywhere
changeDetection: ChangeDetectionStrategy.OnPush

// 2. Track by id in @for loops
@for (item of items(); track item.id) { ... }

// 3. Lazy load all routes (see routing section)

// 4. Use NgOptimizedImage for all <img> tags
import { NgOptimizedImage } from '@angular/common';
// In template:
// <img ngSrc="product.jpg" width="400" height="400" alt="..." />

// 5. shareReplay for HTTP streams that multiple components subscribe to
getCategories(): Observable<Category[]> {
  return this.http.get<Category[]>('/api/categories').pipe(shareReplay(1));
}

// 6. Deferred views for below-the-fold content
@defer (on viewport; prefetch on idle) {
  <app-related-products [productId]="id" />
} @placeholder {
  <div class="h-64 skeleton-loader"></div>
}
```

### 9.2 Bundle Optimization

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withPreloading(QuicklinkStrategy), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, loadingInterceptor])),
    provideAnimationsAsync(),
    provideClientHydration(),
  ],
};
```

---

## 10. Security Standards

### 10.1 Authentication & Tokens

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  // Store tokens in memory (not localStorage) for XSS protection
  private _accessToken = signal<string | null>(null);
  // Use httpOnly cookies for refresh tokens (server-side)

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly accessToken = this._accessToken.asReadonly();

  hasRole(role: UserRole): boolean {
    const payload = this.decodeToken();
    return payload?.roles?.includes(role) ?? false;
  }

  hasPermission(permission: Permission): boolean {
    const payload = this.decodeToken();
    return payload?.permissions?.includes(permission) ?? false;
  }
}
```

### 10.2 Security Checklist (Generated per project)

- `DomSanitizer` used for any dynamic HTML binding
- No `innerHTML` binding without sanitization
- CSRF tokens sent on all mutation requests
- Route guards on every protected route
- Role-based AND permission-based guards separately
- HTTP-only cookies for refresh tokens
- Content Security Policy headers (document in README)
- No sensitive data in localStorage
- Validate file uploads (type, size) client-side before sending

---

## 11. UI/UX Design System

### 11.1 Design Tokens

Define tokens in `styles/_tokens.scss` and mirror in Tailwind config:

```scss
// _tokens.scss
:root {
  // Colors
  --color-primary:       #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-secondary:     #0F172A;
  --color-accent:        #7C3AED;
  --color-success:       #16A34A;
  --color-warning:       #F59E0B;
  --color-danger:        #DC2626;
  --color-info:          #0EA5E9;

  // Neutral scale
  --color-gray-50:  #F8FAFC;
  --color-gray-100: #F1F5F9;
  --color-gray-200: #E2E8F0;
  --color-gray-500: #64748B;
  --color-gray-900: #0F172A;

  // Spacing
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  // Typography
  --font-sans: 'Inter', system-ui, sans-serif;
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;

  // Border radius
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  // Shadows
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}
```

### 11.2 Tailwind Config Extensions

```typescript
// tailwind.config.ts
export default {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE' },
        secondary: { DEFAULT: '#0F172A' },
        success:   { DEFAULT: '#16A34A', light: '#DCFCE7' },
        warning:   { DEFAULT: '#F59E0B', light: '#FEF3C7' },
        danger:    { DEFAULT: '#DC2626', light: '#FEE2E2' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      screens: {
        xs: '475px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
    },
  },
};
```

### 11.3 Mobile-First Breakpoints

Design order is always: Mobile → Tablet → Desktop

```html
<!-- ✅ Mobile-first Tailwind classes -->
<div class="
  grid grid-cols-1           
  sm:grid-cols-2             
  lg:grid-cols-3             
  xl:grid-cols-4             
  gap-4 md:gap-6
">
```

### 11.4 Visual Hierarchy Priority

For product cards:
1. Product image (largest visual element)
2. Product name (bold, readable)
3. Price / discounted price
4. Discount badge (if applicable)
5. Primary CTA button
6. Secondary actions (wishlist, compare)

---

## 12. Component Library

### 12.1 Reusable Components Required for eCommerce

Every project must include these pre-built:

| Component | Inputs | Outputs |
|---|---|---|
| `ProductCard` | `product`, `layout: 'grid'\|'list'` | `addToCart`, `addToWishlist` |
| `ProductGrid` | `products`, `loading`, `columns` | — |
| `ProductGallery` | `images`, `activeIndex` | — |
| `PriceDisplay` | `price`, `originalPrice`, `currency` | — |
| `QuantitySelector` | `value`, `min`, `max`, `disabled` | `changed` |
| `RatingDisplay` | `rating`, `reviewCount`, `size` | — |
| `CartSummary` | `items`, `coupon` | `updateQty`, `remove`, `applyCoupon` |
| `AddressForm` | `formGroup`, `countries` | — |
| `OrderSummary` | `order` | — |
| `SearchBar` | `placeholder`, `value` | `searched`, `cleared` |
| `Pagination` | `total`, `page`, `pageSize` | `pageChanged` |
| `Breadcrumb` | `items: {label, url}[]` | — |
| `SkeletonLoader` | `type: 'card'\|'list'\|'table'`, `count` | — |
| `EmptyState` | `icon`, `title`, `message`, `actionLabel` | `actionClicked` |
| `ErrorState` | `message`, `showRetry` | `retry` |

### 12.2 Reusable Components Required for Housing Management

| Component | Inputs | Outputs |
|---|---|---|
| `PropertyCard` | `property`, `layout` | `selected`, `editClicked` |
| `PropertyMap` | `properties`, `center`, `zoom` | `markerClicked` |
| `UnitStatusBadge` | `status: UnitStatus` | — |
| `TenantAvatar` | `tenant`, `size` | — |
| `LeaseTimeline` | `lease` | — |
| `RentStatusBadge` | `status: PaymentStatus` | — |
| `MaintenanceTicketCard` | `ticket` | `statusChanged`, `assigned` |
| `DocumentUploader` | `accept`, `maxSize`, `multiple` | `uploaded`, `removed` |
| `OccupancyChart` | `data`, `period` | — |
| `FinancialSummaryCard` | `metric`, `value`, `trend` | — |
| `PaymentHistoryTable` | `payments`, `loading` | `exportClicked` |

---

## 13. eCommerce Domain

### 13.1 Core Models

```typescript
// product.model.ts
export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  images: ProductImage[];
  category: Category;
  subcategory?: Category;
  variants: ProductVariant[];
  attributes: ProductAttribute[];
  basePrice: number;
  salePrice?: number;
  currency: string;
  stockStatus: StockStatus;
  stockQuantity: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  attributes: Record<string, string>; // { color: 'Red', size: 'L' }
  price: number;
  stockQuantity: number;
  images: ProductImage[];
}

export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  maxQuantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
  shippingMethod: ShippingMethod;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  trackingNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 13.2 Enums

```typescript
export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
  Refunded = 'refunded',
}

export enum PaymentStatus {
  Unpaid = 'unpaid',
  Paid = 'paid',
  PartiallyPaid = 'partially_paid',
  Refunded = 'refunded',
  Failed = 'failed',
}

export enum StockStatus {
  InStock = 'in_stock',
  LowStock = 'low_stock',
  OutOfStock = 'out_of_stock',
  PreOrder = 'pre_order',
}

export enum UserRole {
  Customer = 'customer',
  Admin = 'admin',
  SuperAdmin = 'super_admin',
}
```

### 13.3 eCommerce Feature Checklist

**Catalog:**
- [ ] Product listing with grid/list toggle
- [ ] Category navigation with mega menu
- [ ] Advanced filtering (price range, attributes, ratings)
- [ ] Sort controls (price, rating, newest, popularity)
- [ ] Product detail with image gallery
- [ ] Variant selection (size, color, etc.)
- [ ] Stock status indicator
- [ ] Related / recently viewed products
- [ ] Product search with autocomplete

**Cart:**
- [ ] Add/remove/update quantity
- [ ] Guest cart (localStorage) + user cart (server-synced)
- [ ] Cart persistence across sessions
- [ ] Coupon/discount code
- [ ] Cart drawer (slide-over)
- [ ] Upsell suggestions

**Checkout:**
- [ ] Multi-step: Shipping → Payment → Review → Confirmation
- [ ] Address form with validation
- [ ] Shipping method selection
- [ ] Payment integration (Stripe / M-Pesa / PayPal)
- [ ] Order summary sidebar
- [ ] Guest checkout support

**Orders & Account:**
- [ ] Order history with status
- [ ] Order detail view
- [ ] Return/refund request
- [ ] Saved addresses
- [ ] Wishlist management

### 13.4 Payment Integration

```typescript
// stripe.service.ts
@Injectable({ providedIn: 'root' })
export class StripePaymentService {
  private stripe: Stripe | null = null;

  async initialize(publishableKey: string): Promise<void> {
    this.stripe = await loadStripe(publishableKey);
  }

  async confirmPayment(clientSecret: string, returnUrl: string): Promise<PaymentResult> {
    if (!this.stripe) throw new Error('Stripe not initialized');
    const { error } = await this.stripe.confirmPayment({
      elements: this.elements!,
      confirmParams: { return_url: returnUrl },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}

// Mobile Money (M-Pesa / Mpesa) — for Kenya/Africa deployments
export interface MpesaPaymentRequest {
  phoneNumber: string;  // Format: 254XXXXXXXXX
  amount: number;
  accountReference: string;
  transactionDescription: string;
}
```

---

## 14. Housing Management Domain

### 14.1 Core Models

```typescript
// property.model.ts
export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  address: Address;
  coordinates?: GeoCoordinates;
  units: Unit[];
  amenities: string[];
  images: PropertyImage[];
  description: string;
  managerId: string;
  ownerId: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  floor?: number;
  type: UnitType;
  bedrooms: number;
  bathrooms: number;
  size: number; // sq ft or sq m
  rentAmount: number;
  currency: string;
  status: UnitStatus;
  features: string[];
  images: UnitImage[];
  currentLease?: Lease;
}

export interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalId?: string;
  dateOfBirth?: Date;
  occupation?: string;
  employer?: string;
  emergencyContact: EmergencyContact;
  documents: TenantDocument[];
  status: TenantStatus;
  leases: Lease[];
  createdAt: Date;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  securityDeposit: number;
  paymentDueDay: number; // 1-28
  status: LeaseStatus;
  terms: string;
  documents: LeaseDocument[];
  renewals: LeaseRenewal[];
  createdAt: Date;
}

export interface MaintenanceTicket {
  id: string;
  unitId: string;
  tenantId: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: string;
  images: string[];
  comments: TicketComment[];
  resolvedAt?: Date;
  createdAt: Date;
}

export interface RentPayment {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  currency: string;
  period: string; // 'YYYY-MM'
  dueDate: Date;
  paidDate?: Date;
  method?: PaymentMethod;
  reference?: string;
  status: RentPaymentStatus;
  lateFee?: number;
}
```

### 14.2 Housing Enums

```typescript
export enum PropertyType {
  Apartment = 'apartment',
  House = 'house',
  Commercial = 'commercial',
  Student = 'student',
  Mixed = 'mixed',
}

export enum UnitType {
  Studio = 'studio',
  OneBedroom = '1br',
  TwoBedroom = '2br',
  ThreeBedroom = '3br',
  PentHouse = 'penthouse',
  Office = 'office',
  Shop = 'shop',
}

export enum UnitStatus {
  Vacant = 'vacant',
  Occupied = 'occupied',
  Maintenance = 'maintenance',
  Reserved = 'reserved',
  Unavailable = 'unavailable',
}

export enum LeaseStatus {
  Draft = 'draft',
  Active = 'active',
  Expiring = 'expiring',   // within 30 days of end
  Expired = 'expired',
  Terminated = 'terminated',
  Renewed = 'renewed',
}

export enum TicketPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Emergency = 'emergency',
}

export enum TicketStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Pending = 'pending',
  Resolved = 'resolved',
  Closed = 'closed',
}

export enum RentPaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Late = 'late',
  PartiallyPaid = 'partially_paid',
  Waived = 'waived',
}
```

### 14.3 Housing Feature Checklist

**Properties:**
- [ ] Property listing with map view (Google Maps / Mapbox)
- [ ] Property detail with unit overview
- [ ] Occupancy rate visualization
- [ ] Add/edit/deactivate property
- [ ] Property images upload

**Units:**
- [ ] Unit list per property with status badges
- [ ] Unit detail with lease and tenant info
- [ ] Add/edit unit
- [ ] Unit availability calendar

**Tenants:**
- [ ] Tenant list with search/filter
- [ ] Tenant profile with lease history
- [ ] Tenant onboarding wizard (KYC documents, references)
- [ ] Tenant portal (self-service: pay rent, raise ticket, view documents)

**Leases:**
- [ ] Create lease (multi-step form)
- [ ] Lease document generation (PDF)
- [ ] E-signature integration
- [ ] Renewal/termination workflow
- [ ] Lease expiry alerts

**Maintenance:**
- [ ] Submit maintenance request (tenant portal)
- [ ] Ticket assignment to technicians
- [ ] Priority queue
- [ ] Status updates with notifications
- [ ] Cost tracking

**Payments & Finance:**
- [ ] Rent collection tracking
- [ ] Automated reminder notifications
- [ ] Late fee calculation
- [ ] Payment receipts (PDF)
- [ ] Financial reports (income, expenses, vacancy loss)
- [ ] M-Pesa integration for Kenyan deployments
- [ ] Mpesa STK Push for rent collection

**Documents:**
- [ ] Document center per tenant/unit/property
- [ ] Document type tagging (lease, ID, proof of income)
- [ ] Expiry tracking
- [ ] Bulk download

**Reports:**
- [ ] Occupancy report
- [ ] Rent collection report
- [ ] Maintenance report
- [ ] Tenant turnover report
- [ ] Financial P&L summary

---

## 15. Testing Standards

### 15.1 Coverage Targets

| Layer | Tool | Target |
|---|---|---|
| Services | Jest / Jasmine | ≥ 90% |
| Signal Stores | Jest | ≥ 90% |
| Validators | Jest | 100% |
| Guards | Jest | 100% |
| Critical Components | Angular Testing Library | ≥ 80% |
| E2E (critical flows) | Playwright | All happy paths |

### 15.2 Service Test Pattern

```typescript
describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartService);
  });

  it('should add item to cart', () => {
    const item: CartItem = { productId: '1', name: 'Test', price: 100, quantity: 1, maxQuantity: 10, image: '' };
    service.addItem(item);
    expect(service.items()).toHaveLength(1);
    expect(service.total()).toBe(100);
  });

  it('should increase quantity if item already in cart', () => {
    const item: CartItem = { productId: '1', name: 'Test', price: 100, quantity: 1, maxQuantity: 10, image: '' };
    service.addItem(item);
    service.addItem(item);
    expect(service.items()).toHaveLength(1);
    expect(service.items()[0].quantity).toBe(2);
  });
});
```

### 15.3 Playwright E2E Critical Paths

**eCommerce:**
- Browse → Search product → Add to cart → Checkout → Payment → Order confirmation
- Register → Login → View order history

**Housing:**
- Login as manager → Add property → Add unit → Create tenant → Create lease
- Login as tenant → View lease → Submit maintenance request → Pay rent

---

## 16. TypeScript & Code Quality

### 16.1 Strict Rules

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 16.2 Type-Only Patterns

```typescript
// ✅ Always use specific types
createProduct(payload: CreateProductRequest): Observable<ProductDto>
updateLease(id: string, payload: UpdateLeaseRequest): Observable<LeaseDto>

// ❌ Never
createProduct(payload: any): Observable<any>

// ✅ Request/Response DTOs
export interface CreateProductRequest {
  name: string;
  sku: string;
  basePrice: number;
  categoryId: string;
  variants: CreateVariantRequest[];
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string;
  // ... all fields typed
}

// ✅ Immutable state updates
return { ...state, items: [...state.items, newItem] };

// ❌ Mutation
state.items.push(newItem);
```

### 16.3 Utility Types

```typescript
// Use TypeScript utility types
type PartialProduct = Partial<Product>;
type ReadonlyCart = Readonly<Cart>;
type ProductId = Pick<Product, 'id' | 'name'>;
type UpdateLeaseRequest = Omit<Lease, 'id' | 'createdAt' | 'updatedAt'>;
```

---

## 17. Admin Dashboard Patterns

### 17.1 Data Table Standards

Every admin data table must support:

```typescript
export interface TableConfig<T> {
  columns: TableColumn<T>[];
  data: T[];
  loading: boolean;
  pagination: PaginationConfig;
  sorting: SortConfig;
  filters: FilterConfig[];
  bulkActions: BulkAction[];
  exportFormats: ('csv' | 'pdf' | 'excel')[];
  searchable: boolean;
}
```

### 17.2 Admin Sidebar

```
Admin Dashboard
├── Overview
├── eCommerce Admin
│   ├── Products
│   │   ├── All Products
│   │   ├── Add Product
│   │   ├── Categories
│   │   └── Inventory
│   ├── Orders
│   │   ├── All Orders
│   │   ├── Returns
│   │   └── Refunds
│   ├── Customers
│   └── Analytics
│       ├── Sales
│       ├── Revenue
│       └── Traffic
│
└── Housing Admin
    ├── Properties
    ├── Units
    ├── Tenants
    ├── Leases
    ├── Maintenance
    ├── Payments
    ├── Documents
    └── Reports
```

### 17.3 Analytics Cards

Always provide these KPI cards at dashboard top:

**eCommerce:**
- Total Revenue (+ trend)
- Orders Today
- Conversion Rate
- Average Order Value

**Housing:**
- Occupancy Rate
- Rent Collection Rate
- Open Maintenance Tickets
- Leases Expiring (30 days)

### 17.4 Chart Requirements

Use `ng2-charts` (Chart.js) or `ngx-echarts`:

- Revenue over time (line chart)
- Orders by status (doughnut)
- Occupancy over time (area chart)
- Rent collection by month (bar chart)
- Maintenance by category (horizontal bar)

---

## 18. Accessibility (WCAG)

### 18.1 Required Standards: WCAG 2.1 AA

```html
<!-- ✅ Correct — all interactive elements labeled -->
<button
  [attr.aria-label]="'Add ' + product().name + ' to cart'"
  (click)="addToCart()"
>
  <mat-icon>add_shopping_cart</mat-icon>
</button>

<!-- ✅ Form fields with proper labels -->
<mat-form-field>
  <mat-label>Email address</mat-label>
  <input matInput type="email" [formControl]="emailControl"
         aria-required="true"
         [attr.aria-describedby]="emailError ? 'email-error' : null" />
  <mat-error id="email-error" *ngIf="emailControl.hasError('email')">
    Please enter a valid email
  </mat-error>
</mat-form-field>

<!-- ✅ Images with meaningful alt text -->
<img [ngSrc]="product().image" [alt]="product().name + ' - ' + product().shortDescription" />

<!-- ✅ Skip navigation link -->
<a class="sr-only focus:not-sr-only" href="#main-content">Skip to content</a>
```

### 18.2 Focus Management

```typescript
// Manage focus in modals and drawers
@Component({ ... })
export class CartDrawerComponent {
  @ViewChild('closeButton') closeButton!: ElementRef<HTMLButtonElement>;

  onOpen(): void {
    setTimeout(() => this.closeButton.nativeElement.focus(), 100);
  }
}
```

### 18.3 Color Contrast

All text must meet minimum contrast ratios:
- Normal text: ≥ 4.5:1
- Large text (18px+ bold or 24px+): ≥ 3:1
- UI components/icons: ≥ 3:1

---

## 19. Loading, Empty & Error States

The agent must NEVER generate a component without all three states.

### 19.1 State Components

```typescript
// ✅ Every async list/data view must follow this pattern
@Component({ ... })
export class ProductListComponent {
  readonly store = inject(CatalogStore);

  // Template drives all three states from store signals
}
```

```html
<!-- product-list.component.html -->
@if (store.loading()) {
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    @for (i of [1,2,3,4,5,6,7,8]; track i) {
      <app-skeleton-loader type="product-card" />
    }
  </div>
} @else if (store.error()) {
  <app-error-state
    [message]="store.error()!"
    (retry)="store.loadProducts()"
  />
} @else if (store.products().length === 0) {
  <app-empty-state
    icon="search_off"
    title="No products found"
    message="Try adjusting your filters or search term."
    actionLabel="Clear filters"
    (actionClicked)="store.clearFilters()"
  />
} @else {
  <app-product-grid [products]="store.products()" />
}
```

### 19.2 Standard Empty State Messages

| Context | Title | Message |
|---|---|---|
| Product search | No products found | Try different keywords or clear filters |
| Cart | Your cart is empty | Browse our catalog to find something you'll love |
| Orders | No orders yet | Your order history will appear here |
| Wishlist | Nothing saved yet | Click the heart icon on any product |
| Tenants | No tenants yet | Add your first tenant to get started |
| Maintenance | No tickets | All caught up! No open maintenance requests |
| Payments | No payments | Payment records will appear here |

---

## 20. Code Generation Rules (Quick Reference)

When generating any Angular file, the agent must follow ALL of these without exception:

```
ARCHITECTURE
✅ Angular 20+ standalone components only — no NgModule
✅ Feature-based folder structure
✅ Smart/Container vs Presentational separation
✅ inject() for DI — never constructor injection
✅ SOLID principles throughout

REACTIVITY
✅ Signals for local and shared synchronous state
✅ signalStore from @ngrx/signals for feature state
✅ NgRx Store for complex multi-step flows
✅ toSignal() to bridge RxJS → Signal boundary
✅ RxJS for HTTP and event streams only
✅ New control flow: @if @for @switch @defer
✅ input() output() model() for component API

PERFORMANCE
✅ ChangeDetectionStrategy.OnPush on every component
✅ track product.id in every @for loop
✅ Lazy load all routes with loadComponent/loadChildren
✅ @defer for below-the-fold content
✅ NgOptimizedImage for all images
✅ shareReplay(1) for cached observables

FORMS
✅ Reactive Forms only — never template-driven
✅ Strongly typed FormGroup<T> — never any
✅ NonNullableFormBuilder for most fields
✅ Custom validators as standalone functions
✅ Multi-step wizard for complex forms

API LAYER
✅ AuthInterceptor, ErrorInterceptor, LoadingInterceptor
✅ JWT with refresh token workflow
✅ Retry strategies on transient failures
✅ Typed request/response DTOs
✅ PaginatedResponse<T> for all list endpoints

TYPES
✅ Never use `any` — ever
✅ Interfaces for all domain models
✅ Enums for status fields
✅ Immutable state updates (spread operators)
✅ Strict TypeScript config

UI/UX
✅ Mobile-first responsive design
✅ Tailwind CSS utility classes — no inline styles
✅ Angular Material selectively for complex components
✅ Design tokens from _tokens.scss
✅ Loading + Empty + Error states on every async view
✅ WCAG 2.1 AA accessibility

SECURITY
✅ Route guards on all protected pages
✅ Role + Permission guards separate
✅ Access tokens in memory — not localStorage
✅ Sanitize dynamic HTML
✅ CSRF awareness

TESTING
✅ Unit tests for all services and stores
✅ Component tests for critical UI
✅ Playwright E2E for all critical user flows
```

---

*End of ANGULAR_AGENT_SKILLS.md — Version 1.0*  
*Applicable to: Angular 20+ | eCommerce Storefront & Admin | Housing Management Platform*