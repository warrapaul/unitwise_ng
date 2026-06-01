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


