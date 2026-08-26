# Angular AI Agent Skills Guide — Unitwise
## Full-Stack Angular Conventions for the Unitwise Platform (eCommerce + Housing/Agency + Chat)

if you need to reference backend code refer to
/home/warra/Documents/work/sb/unitwise_sb   (springboot backend code)


---

## Table of Contents

1. Core Architecture Principles
2. Project Structure
3. Angular Modern Patterns (Signals, Control Flow)
4. State Management
5. RxJS Mastery
6. API Integration & HTTP Layer — Unitwise Envelope Contract
7. Auth & JWT Integration — Confirmed Architecture
8. RBAC & Permission Gates — Permission-First
9. Forms Architecture
10. Routing, Lazy Loading & List-State Preservation
11. Performance Optimization
12. Security Standards
13. File Uploads (MinIO)
14. WebSocket & Real-Time (STOMP + RabbitMQ)
15. Push Notifications (FCM) & In-App Notifications
16. Error Handling — Backend Error Shapes
17. Pagination & Search/Filter DTOs
18. Domain Models — eCommerce, Housing/Agency, Chat
19. UI/UX Design System
20. Component Library
21. Accessibility (WCAG)
22. Loading, Empty & Error States
23. UI Copy Standards
24. Testing Standards
25. Feature Generation Checklist
26. Code Generation Rules (Quick Reference)
27. Confirmed vs. Open Questions

---

## 1. Core Architecture Principles

- **Angular Standalone Components only** — never generate `NgModule`-based code.
- **Zoneless change detection.** Bootstrap with `provideZonelessChangeDetection()`;
  no `zone.js` in polyfills. Consequences:
  - Any state that should update the view **must** be a signal. A plain field
    mutated outside a signal renders nothing — there is no zone patching
    `setTimeout`/promises to catch it implicitly.
  - `effect()` is the escape hatch for side effects that read signals, not
    `ngOnChanges` or manual dirty-checking.
  - Third-party callbacks that mutate DOM/state outside Angular's reactivity need
    `afterRenderEffect()` or an explicit signal write.
  - `ChangeDetectionStrategy.OnPush` is still declared explicitly on every
    component — costs nothing, keeps intent unambiguous.
- **Feature-based folder structure**, grouped by domain, not file type.
- **Domain-Driven Design** — features model business concepts: `catalog`, `cart`,
  `orders`, `agencies`, `tenants`, `leases`, `maintenance`, `chat`, `notifications`.
- **Smart/Container vs Presentational separation.**
- **SOLID** throughout; **Clean Architecture layers:** `core → domain → infrastructure → presentation`.
- **`inject()` for DI — never constructor injection.**

```typescript
// ✅ Correct
export class ProductService {
  private readonly http = inject(HttpClient);
}
// ❌ Never
export class ProductService {
  constructor(private http: HttpClient) {}
}
```

### Component anatomy

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
  readonly product = input.required<ProductPreview>();
  readonly showActions = input<boolean>(true);
  readonly addToCart = output<ProductPreview>();

  private readonly router = inject(Router);

  readonly discountPercent = computed(() => {
    const p = this.product();
    return p.salePrice ? Math.round((1 - p.salePrice / p.basePrice) * 100) : 0;
  });

  onAddToCart(): void {
    this.addToCart.emit(this.product());
  }
}
```

---

## 2. Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── auth/
│   │   │   ├── auth.service.ts
│   │   │   ├── auth-api.service.ts
│   │   │   └── auth.guard.ts
│   │   ├── interceptors/
│   │   │   ├── error.interceptor.ts
│   │   │   ├── loading.interceptor.ts
│   │   │   └── auth.interceptor.ts
│   │   ├── guards/
│   │   │   └── permission.guard.ts
│   │   ├── rbac/
│   │   │   ├── permission-constants.ts
│   │   │   └── role-constants.ts
│   │   ├── tokens/
│   │   │   ├── api-url.token.ts
│   │   │   └── ws-url.token.ts
│   │   ├── models/
│   │   ├── services/
│   │   │   ├── notification.service.ts
│   │   │   └── websocket.service.ts
│   │   └── core.providers.ts
│   │
│   ├── shared/
│   │   ├── components/
│   │   │   ├── button/ card/ modal/ paginator/ search-bar/
│   │   │   ├── skeleton-loader/ empty-state/ error-state/ error-card/
│   │   │   ├── data-table/ permission-gate/ toast/ breadcrumb/
│   │   │   ├── searchable-select/ entity-lookup-field/
│   │   │   └── document-uploader/
│   │   ├── pipes/
│   │   ├── directives/
│   │   │   └── focus-trap.directive.ts
│   │   ├── validators/
│   │   └── utils/
│   │       └── query-params.util.ts
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── catalog/            # products + categories
│   │   ├── cart/
│   │   ├── orders/              # ecom order + checkout
│   │   ├── agencies/             # housing: agencies
│   │   ├── tenants/
│   │   ├── leases/
│   │   ├── maintenance/
│   │   ├── chat/
│   │   ├── notifications/
│   │   └── admin/
│   │       ├── users/
│   │       ├── products/
│   │       ├── categories/
│   │       ├── orders/
│   │       ├── agencies/
│   │       └── reports/
│   │
│   ├── layout/
│   ├── app.config.ts
│   ├── app.routes.ts
│   └── app.component.ts
│
├── environments/
└── styles/
    ├── _tokens.scss
    ├── _typography.scss
    ├── _utilities.scss
    └── styles.scss
```

**Domain layout rule:** every feature lives under its own package; shared
concerns only in `core/`/`shared/`. This mirrors the backend's own
`common/`+`<domain>/` split — keep the two codebases conceptually parallel.

---

## 3. Angular Modern Patterns

### Signals (mandatory for all local/shared synchronous state)

```typescript
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>(this.restore());

  readonly items = this._items.asReadonly();
  readonly itemCount = computed(() => this._items().reduce((s, i) => s + i.quantity, 0));
  readonly subtotal = computed(() => this._items().reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  readonly isEmpty = computed(() => this._items().length === 0);

  addItem(item: CartItem): void {
    this._items.update(items => {
      const idx = items.findIndex(i => i.productId === item.productId && i.variantId === item.variantId);
      const updated = idx >= 0
        ? items.map((i, n) => n === idx ? { ...i, quantity: i.quantity + item.quantity } : i)
        : [...items, item];
      this.persist(updated);
      return updated;
    });
  }

  removeItem(productId: number, variantId?: number): void {
    this._items.update(items => {
      const updated = items.filter(i => !(i.productId === productId && i.variantId === variantId));
      this.persist(updated);
      return updated;
    });
  }

  clear(): void { this._items.set([]); localStorage.removeItem('cart_items'); }

  // Cart is the ONE deliberate exception to "no localStorage" — items only,
  // never tokens or session data. Always re-validated server-side via
  // POST /v1/orders/validate-cart before checkout (see §18.1).
  private persist(items: CartItem[]): void { localStorage.setItem('cart_items', JSON.stringify(items)); }
  private restore(): CartItem[] {
    try { return JSON.parse(localStorage.getItem('cart_items') ?? '[]'); } catch { return []; }
  }
}
```

### Modern template syntax — never `*ngIf`/`*ngFor`/`*ngSwitch`

```html
@if (store.loading()) {
  <app-skeleton-loader type="table" [count]="8" />
} @else if (store.error()) {
  <app-error-state [message]="store.error()!.message" (retry)="store.load()" />
} @else if (store.items().length === 0) {
  <app-empty-state title="No orders yet" message="Orders will appear here once placed." />
} @else {
  <app-order-table [orders]="store.items()" />
}

@for (item of items(); track item.id) {
  <app-product-card [product]="item" />
} @empty {
  <app-skeleton-loader />
}

@defer (on viewport; prefetch on idle) {
  <app-related-products [productId]="id" />
} @placeholder {
  <div class="h-64 skeleton-loader"></div>
}
```

### `toSignal`/`toObservable`

```typescript
readonly searchResults = toSignal(
  toObservable(this.searchQuery).pipe(
    debounceTime(300), distinctUntilChanged(),
    filter(q => q.length >= 2),
    switchMap(q => this.catalogService.search({ name: q })),
  ),
  { initialValue: { items: [], pagination: emptyPagination } },
);
```

---

## 4. State Management

| State type | Solution |
|---|---|
| Component-local UI state | `signal()` |
| Shared transient state | Signal-based service (cart, notification) |
| Feature-scoped server-backed state | `signalStore` from `@ngrx/signals` |
| Complex cross-feature flow (checkout, lease signing) | NgRx Store + Effects, or a step-based signal store (§9.4) |
| App-wide session state | Root-provided `AuthService` (signals) |

### Signal store pattern — separate `loading` from `mutating`

Never let a save/delete blank the screen the user is already looking at.

```typescript
export interface ProductsState {
  loading: boolean;     // initial/list fetch — skeleton state
  mutating: boolean;    // create/update/delete — keeps existing data visible
  error: ApiError | null;
  pagination: PaginationState;
}

export const ProductsStore = signalStore(
  { providedIn: 'root' },
  withState<ProductsState>({
    loading: false, mutating: false, error: null,
    pagination: { page: 0, size: 20, totalElements: 0, totalPages: 0, isFirst: true, isLast: true },
  }),
  withEntities<ProductPreview>(),

  withMethods((store, productsService = inject(ProductsService)) => ({
    async load(params?: Partial<ProductSearchParams>): Promise<void> {
      patchState(store, { loading: true, error: null });
      try {
        const result = await firstValueFrom(productsService.search({ page: 0, size: 20, ...params }));
        patchState(store, setEntities(result.items), { loading: false, pagination: result.pagination });
      } catch (err: any) {
        patchState(store, { loading: false, error: err as ApiError });
      }
    },

    async update(id: number, request: UpdateProductRequest): Promise<void> {
      patchState(store, { mutating: true, error: null });
      try {
        const updated = await firstValueFrom(productsService.update(id, request));
        patchState(store, updateEntity({ id, changes: updated }), { mutating: false });
      } catch (err: any) {
        patchState(store, { mutating: false, error: err as ApiError });
      }
    },
  })),
);
```

> Because feature stores are `{ providedIn: 'root' }`, they outlive the component
> that first injected them (§10.2) — this is what makes back-navigation list-state
> preservation nearly free.

---

## 5. RxJS Mastery

| Scenario | Operator |
|---|---|
| Cancel previous HTTP on new trigger | `switchMap` |
| Allow concurrent HTTP calls | `mergeMap` |
| Queue sequential requests | `concatMap` |
| Prevent repeat clicks (submit) | `exhaustMap` |
| Parallel requests, wait for all | `forkJoin` |
| React to multiple streams | `combineLatest` |
| Share single subscription | `shareReplay(1)` |
| De-dupe concurrent identical in-flight calls (e.g. two guards racing a refresh) | `shareReplay(1)` on a cached ref, cleared on completion |
| Auto-cleanup on destroy | `takeUntilDestroyed()` |

```typescript
// ❌ NEVER — nested subscriptions
this.authService.getMe().subscribe(me => {
  this.ordersService.getMyOrders().subscribe(orders => { /* ... */ });
});

// ✅ pipe and flatten
this.authService.getMe().pipe(
  switchMap(() => this.ordersService.getMyOrders()),
  takeUntilDestroyed(),
).subscribe(orders => { /* ... */ });
```

**Retry — reads only, never writes.** Transient network blips are common on
mobile-first deployments; retry idempotent GETs before they reach the error
interceptor. **Never** wrap a POST/PATCH/DELETE in `retry` — a retried mutation
can double-create or double-charge.

```typescript
search(params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
  return this.http.get<PaginatedApiResponse<ProductPreview>>(`${this.baseUrl}/v1/products`, {
    params: buildHttpParams(params),
  }).pipe(
    retry({ count: 2, delay: 1000 }),
    map(r => ({ items: r.data, pagination: r.pagination })),
  );
}
```

---

## 6. API Integration & HTTP Layer — Unitwise Envelope Contract

The backend wraps **every** response in one of two envelopes (source: `ApiResponse.java` /
`PaginatedApiResponse.java`). Components never see either envelope directly —
services unwrap them.

### Single item

```typescript
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;   // "yyyy-MM-dd HH:mm:ss"
}
```

### Paginated list — pagination is 0-based (Spring `Pageable` default)

```typescript
export interface PaginatedApiResponse<T> {
  data: T[];
  pagination: {
    page: number;            // 0-based — page 0 is the first page
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

### Client-side normalized shape

```typescript
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginatedApiResponse<never>['pagination'];
}
```

### Unwrapping

```typescript
getProductById(id: number): Observable<ProductDetail> {
  return this.http.get<ApiResponse<ProductDetail>>(`${this.baseUrl}/v1/products/${id}`)
    .pipe(map(r => r.data));
}

searchProducts(params: ProductSearchParams): Observable<PaginatedResult<ProductPreview>> {
  return this.http.get<PaginatedApiResponse<ProductPreview>>(`${this.baseUrl}/v1/products`, {
    params: buildHttpParams(params),
  }).pipe(
    retry({ count: 2, delay: 1000 }),
    map(r => ({ items: r.data, pagination: r.pagination })),
  );
}

// Delete/void — envelope still present, data is typically null
deleteProduct(id: number): Observable<void> {
  return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/v1/products/${id}`)
    .pipe(map(() => void 0));
}

// String responses (e.g. regenerated temp password)
regenerateTempPassword(userId: number): Observable<string> {
  return this.http.post<ApiResponse<string>>(`${this.baseUrl}/v1/users/${userId}/temp-password`, {})
    .pipe(map(r => r.data ?? r.message));
}
```

### Casing — consistently camelCase, no per-module exceptions

Unlike some backends, Jackson's default serialization means **every** DTO field
is camelCase project-wide (`phoneNumber`, `firstName`, `orderNumber`,
`createdAt`). There is no snake_case/camelCase split to track per module —
mirror the Java DTO field names exactly, and don't invent a casing convention.

### Interceptors

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.accessToken();
  if (token) req = req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) });
  return next(req);
};

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);
  loadingService.show();
  return next(req).pipe(finalize(() => loadingService.hide()));
};
```

`errorInterceptor` and `tokenRefreshInterceptor` are covered in §7 and §16 since
they depend on the confirmed auth/error contracts.

### app.config.ts

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withInterceptors([
      authInterceptor,
      tokenRefreshInterceptor,   // see §7 — this backend DOES support silent refresh
      errorInterceptor,
      loadingInterceptor,
    ])),
    provideAnimationsAsync(),
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return firstValueFrom(authService.restoreSession());
    }),
  ],
};
```

---

## 7. Auth & JWT Integration — Confirmed Architecture

### Session model

- **Access token:** kept in memory only, as an `AuthService` signal. Never persisted.
- **Refresh token:** delivered via an **httpOnly cookie** — the backend reads it
  automatically on `POST /v1/auth/refresh` with an empty body. The Angular client
  never reads, stores, or sends the refresh token itself; the browser attaches
  the cookie automatically (requires `withCredentials`/`allowCredentials` CORS
  config server-side, already implied by the backend's cookie-based design).
- **Login response** (`AuthModel`): `{ accessToken, refreshToken?, passwordResetRequired }`.
  `refreshToken` in the body is not the source of truth for restore — treat it as
  vestigial/legacy and rely on the cookie + `/v1/auth/refresh`.
- **Silent refresh-and-retry IS supported here** (unlike some backends) — a
  `tokenRefreshInterceptor` catches a 401 mid-session, calls
  `authService.refreshToken()` (which posts to `/v1/auth/refresh`, cookie attached
  automatically), and retries the original request once with the new token.
- **CSRF:** the backend explicitly disables CSRF protection
  (`.csrf(AbstractHttpConfigurer::disable)`) since auth is stateless-JWT-based.
  Do not add CSRF token handling on the client.

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _passwordResetRequired = signal(false);

  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly accessToken = this._accessToken.asReadonly();
  readonly passwordResetRequired = this._passwordResetRequired.asReadonly();

  login(credentials: LoginRequest): Observable<AuthModel> {
    return this.http.post<ApiResponse<AuthModel>>(`${this.apiUrl}/v1/auth/login`, credentials).pipe(
      map(r => r.data),
      tap(auth => {
        this._accessToken.set(auth.accessToken);
        this._passwordResetRequired.set(auth.passwordResetRequired);
      }),
    );
  }

  logout(): Observable<void> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/v1/auth/logout`, {}).pipe(
      map(() => void 0),
      tap(() => this._accessToken.set(null)),
      // Sanctioned exception to "never swallow errors" — there's no useful
      // "logout failed" state; always end up locally logged out.
      catchError(() => { this._accessToken.set(null); return of(void 0); }),
    );
  }

  refreshToken(): Observable<void> {
    // No refresh token in the body — the httpOnly cookie is sent automatically.
    return this.http.post<ApiResponse<AuthModel>>(`${this.apiUrl}/v1/auth/refresh`, {}).pipe(
      map(r => r.data),
      tap(auth => this._accessToken.set(auth.accessToken)),
      map(() => void 0),
    );
  }

  // Bootstrap/guard-driven — degrades silently to "logged out" on failure.
  restoreSession(): Observable<void> {
    return this.refreshToken().pipe(catchError(() => of(void 0)));
  }

  hasPermission(permission: string): boolean {
    return this.decodeTokenPayload()?.permissions?.includes(permission) ?? false;
  }

  hasRole(role: string): boolean {
    return this.decodeTokenPayload()?.roles?.includes(role) ?? false;
  }

  currentUserId(): number | null {
    return this.decodeTokenPayload()?.userId ?? null;
  }

  private decodeTokenPayload(): TokenPayload | null {
    const token = this._accessToken();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
  }
}
```

```typescript
export interface AuthModel {
  accessToken: string;
  refreshToken?: string;
  passwordResetRequired: boolean;
}
export interface LoginRequest { email: string; password: string; }
export interface TokenPayload {
  sub: string; userId: number; roles: string[]; permissions: string[]; exp: number;
}
```

### `tokenRefreshInterceptor`

```typescript
export const tokenRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/v1/auth/')) {
        return authService.refreshToken().pipe(
          switchMap(() => {
            const retried = req.clone({
              headers: req.headers.set('Authorization', `Bearer ${authService.accessToken()}`),
            });
            return next(retried);
          }),
          catchError(refreshErr => {
            authService.logout().subscribe();
            return throwError(() => refreshErr);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
```

### `authGuard`

```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isAuthenticated()) return true;
  return authService.restoreSession().pipe(
    map(() => authService.isAuthenticated()
      ? true
      : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })),
  );
};
```

---

## 8. RBAC & Permission Gates — Permission-First

### Permission constants (mirrors `PermissionConstants.java` exactly — `RESOURCE_ACTION`, SCREAMING_SNAKE_CASE)

```typescript
// core/rbac/permission-constants.ts
export const PermissionConstants = {
  USER_CREATE: 'USER_CREATE', USER_READ: 'USER_READ', USER_READ_ALL: 'USER_READ_ALL',
  USER_WRITE: 'USER_WRITE', USER_DELETE: 'USER_DELETE',

  PRODUCT_CREATE: 'PRODUCT_CREATE', PRODUCT_READ: 'PRODUCT_READ',
  PRODUCT_UPDATE: 'PRODUCT_UPDATE', PRODUCT_DELETE: 'PRODUCT_DELETE',

  ORDER_CREATE: 'ORDER_CREATE', ORDER_READ: 'ORDER_READ', ORDER_READ_ALL: 'ORDER_READ_ALL',
  ORDER_UPDATE: 'ORDER_UPDATE', ORDER_CANCEL_ALL: 'ORDER_CANCEL_ALL',

  CATEGORY_CREATE: 'CATEGORY_CREATE', CATEGORY_UPDATE: 'CATEGORY_UPDATE', CATEGORY_DELETE: 'CATEGORY_DELETE',

  AGENCY_CREATE: 'AGENCY_CREATE', AGENCY_READ: 'AGENCY_READ', AGENCY_READ_ALL: 'AGENCY_READ_ALL',
  TENANT_CREATE: 'TENANT_CREATE', TENANT_READ_ALL: 'TENANT_READ_ALL',
  LEASE_CREATE: 'LEASE_CREATE', MAINTENANCE_READ_ALL: 'MAINTENANCE_READ_ALL',
} as const;

export type Permission = typeof PermissionConstants[keyof typeof PermissionConstants];
```

> **Living document, not a fixed enum.** The backend's `scanControllerPermissions()`
> auto-discovers every `@PreAuthorize("hasAuthority('...')")` string on startup and
> syncs the `permission` table to match. Whenever a new permission string appears
> in a controller, add it here in the same PR — don't let the two drift. This list
> only contains strings actually confirmed in the provided controller code
> (products/orders/users/categories/agency-adjacent housing permissions); treat
> any *additional* permission the agent invents as unconfirmed (§27).

### Role constants — secondary/optional mechanism

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

### `PermissionGateComponent` — permission-first, default allow-through

The backend requires authentication globally (`anyRequest().authenticated()`) and
adds permission restrictions **only** on the specific controller methods that
declare `@PreAuthorize`. An endpoint with no `@PreAuthorize` is reachable by any
authenticated user. The gate must mirror that: **no `permissions` and no `roles`
specified → show the content**, not hide it. (This corrects a common mistake of
defaulting to `false` when both arrays are empty, which would fight the backend's
own allow-by-default posture.)

```typescript
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

  /** Primary gate — prefer this for all new features. */
  readonly permissions = input<string[]>([]);
  /** Secondary/optional gate — use deliberately, not as the default mechanism. */
  readonly roles = input<string[]>([]);
  readonly requireAll = input<boolean>(false);

  readonly hasAccess = computed(() => {
    // Convenience UI bypass only — confirm against the actual backend
    // @PreAuthorize expressions before relying on this for anything sensitive;
    // the backend method-level check is the real enforcement point either way.
    if (this.authService.hasRole(RoleConstants.SUPER_ADMIN)) return true;

    const perms = this.permissions();
    const roleList = this.roles();

    // Nothing specified = allow, mirroring the backend's default-authenticated
    // (not default-denied) posture for unannotated endpoints.
    if (perms.length === 0 && roleList.length === 0) return true;

    const permCheck = perms.length === 0 ? true
      : this.requireAll()
        ? perms.every(p => this.authService.hasPermission(p))
        : perms.some(p => this.authService.hasPermission(p));

    const roleCheck = roleList.length === 0 ? true
      : roleList.some(r => this.authService.hasRole(r));

    return permCheck && roleCheck;
  });
}
```

```html
<!-- Primary usage — permission-based -->
<app-permission-gate [permissions]="['ORDER_UPDATE']">
  <button (click)="editOrder()">Edit Order</button>
</app-permission-gate>

<!-- Either of two permissions -->
<app-permission-gate [permissions]="['ORDER_READ', 'ORDER_READ_ALL']" [requireAll]="false">
  <app-order-list />
</app-permission-gate>

<!-- Role gating — only when deliberately choosing role-level UX -->
<app-permission-gate [roles]="['SUPER_ADMIN', 'ECOMMERCE_ADMIN']">
  <app-admin-panel />
</app-permission-gate>
```

### Ownership fallback pattern

Several backend endpoints gate on **permission OR resource ownership** via SpEL
security-bean expressions, e.g.
`hasAuthority('ORDER_READ_ALL') or @orderResourceSecurity.isCurrentUserOrderOwner(#id, authentication)`.
`PermissionGateComponent` alone can't express "or you own this row" — add the
ownership check inline where that pattern appears:

```typescript
readonly canEditOrder = computed(() =>
  this.authService.hasPermission(PermissionConstants.ORDER_UPDATE) ||
  this.order()?.customerId === this.authService.currentUserId()
);
```

```html
@if (canEditOrder()) {
  <button (click)="editOrder()">Edit</button>
}
```

---

## 9. Forms Architecture

### Rules

- **Reactive Forms only.** Always strongly type `FormGroup<T>` — never `<any>`.
- Custom validators mirror `@Valid`/Bean Validation constraints on the backend
  DTO for immediate feedback, but the server error card is still required —
  uniqueness and cross-field business rules can't be fully replicated client-side.
- Every form owns its own `saving`/`error` signals — never a shared/global one.

### 9.1 Audit fields — never client-supplied

`BaseEntity` derives `createdBy`/`updatedBy` from Spring Security's auditor-aware
context (`@CreatedBy`/`@LastModifiedBy`), never from the request body. No
create/update `FormGroup` or request interface should ever include a
"performed by"/"updated by"/"actor id" field — if the acting user's identity
needs to reach the backend, the `Authorization` header already carries it.

### 9.2 The `ApiError` contract (built on §16's interceptor)

```typescript
export interface ApiError {
  status: number;         // HTTP status, or 0 for network/offline
  errorCode: string;      // e.g. 'VALIDATION_ERROR', 'RESOURCE_NOT_FOUND' — see §16
  message: string;
  details?: string[];     // "fieldName: message" per entry — VALIDATION_ERROR only
  raw?: unknown;
}
```

### 9.3 Canonical submit handler + per-control error rendering

```typescript
submit(): void {
  if (this.form.invalid) { this.form.markAllAsTouched(); return; }
  this.saving.set(true);
  this.error.set(null);

  this.productsService.create(this.form.getRawValue()).subscribe({
    next: () => { this.saving.set(false); /* navigate / toast */ },
    error: (err: ApiError) => { this.saving.set(false); this.error.set(err); },
  });
}
```

```html
<label>
  <span>SKU</span>
  <input formControlName="sku" />
  @if (form.controls.sku.invalid && form.controls.sku.touched) {
    <small class="error-text">SKU is required.</small>
  }
</label>

@if (error()) {
  <app-error-card
    [title]="error()!.status === 409 ? 'Already exists' : 'Unable to save'"
    [message]="error()!.message"
    [details]="error()!.details ?? []"
  />
}
```

`markAllAsTouched()` is necessary but not sufficient — every validated control
must render its own inline message, or an invalid submit silently appears to do
nothing.

### 9.4 Multi-step forms (checkout, lease signing, tenant onboarding)

Each step owns its own signals — never one shared `error`/`saving` pair across
steps, since a resend/retry action on step B must not write into step A's error
block.

```typescript
readonly step = signal<'details' | 'otp'>('details');
readonly sendingOtp = signal(false);
readonly verifying = signal(false);
readonly detailsError = signal<ApiError | null>(null);
readonly otpError = signal<ApiError | null>(null);
readonly resendCooldown = signal(0);
```

Resend/retry cooldown pattern:

```typescript
private resendTimer?: ReturnType<typeof setInterval>;
constructor() { inject(DestroyRef).onDestroy(() => this.clearResendTimer()); }

private startResendCooldown(seconds = 30): void {
  this.clearResendTimer();
  this.resendCooldown.set(seconds);
  this.resendTimer = setInterval(() => {
    const next = this.resendCooldown() - 1;
    next <= 0 ? (this.resendCooldown.set(0), this.clearResendTimer()) : this.resendCooldown.set(next);
  }, 1000);
}
private clearResendTimer(): void {
  if (this.resendTimer) { clearInterval(this.resendTimer); this.resendTimer = undefined; }
}
```

Disable the resend button while `sendingOtp() || resendCooldown() > 0`.

---

## 10. Routing, Lazy Loading & List-State Preservation

```typescript
export const routes: Routes = [
  {
    path: '', component: LayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent) },
      { path: 'products', loadChildren: () => import('./features/catalog/catalog.routes').then(m => m.CATALOG_ROUTES) },
      { path: 'cart', loadComponent: () => import('./features/cart/cart.component').then(m => m.CartComponent) },
      { path: 'orders', canActivate: [authGuard], loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES) },
      { path: 'tenants', canActivate: [authGuard], loadChildren: () => import('./features/tenants/tenants.routes').then(m => m.TENANTS_ROUTES) },
      { path: 'chat', canActivate: [authGuard], loadChildren: () => import('./features/chat/chat.routes').then(m => m.CHAT_ROUTES) },
    ],
  },
  { path: 'admin', canActivate: [authGuard], loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'auth', loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES) },
  { path: '**', loadComponent: () => import('./shared/components/not-found/not-found.component').then(m => m.NotFoundComponent) },
];
```

### 10.1 `permissionGuard`

```typescript
export const permissionGuard = (...permissions: string[]): CanActivateFn => () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (permissions.every(p => authService.hasPermission(p))) return true;
  return router.createUrlTree(['/forbidden']);
};
```

### 10.2 List-state preservation on back-navigation

Because feature stores are `{ providedIn: 'root' }`, they survive navigation away
from the list route — re-mounting the list component re-injects the same store
instance with its last-loaded entities and filters intact.

```typescript
// ❌ Wrong — always refetches, discarding whatever page/filters existed
export class ProductsListPage {
  private readonly store = inject(ProductsStore);
  constructor() { this.store.load({ page: 0 }); }  // resets to page 0 on every mount!
}

// ✅ Correct — store's own onInit hook loaded it once; list page just reads state.
export class ProductsListPage {
  readonly store = inject(ProductsStore);
}
```

Enable native scroll restoration (already in `app.config.ts` §6) rather than a
custom `RouteReuseStrategy` — reserve that for measured, expensive-render
exceptions only (e.g. a very large virtualized table).

---

## 11. Performance Optimization

```typescript
// OnPush everywhere, explicit even in a zoneless app
changeDetection: ChangeDetectionStrategy.OnPush

// track by id in every @for
@for (item of items(); track item.id) { ... }

// NgOptimizedImage for all images
import { NgOptimizedImage } from '@angular/common';

// shareReplay for HTTP streams read by multiple components
getCategoryHierarchy(): Observable<ProductCategory[]> {
  return this.http.get<ApiResponse<ProductCategory[]>>(`${this.baseUrl}/v1/categories/hierarchy`)
    .pipe(map(r => r.data), shareReplay(1));
}

// Deferred views for below-the-fold content
@defer (on viewport; prefetch on idle) {
  <app-related-products [productId]="id" />
} @placeholder {
  <div class="h-64 skeleton-loader"></div>
}
```

Any control fed from the backend (roles, categories, agencies, zones) must use
a searchable component (`app-searchable-select` for a small fetched-whole list,
`app-entity-lookup-field` for paginated/server-searched lists) — never a raw
`<select>` bound to an unbounded API-driven list, and never a raw UUID/id input.

---

## 12. Security Standards

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _accessToken = signal<string | null>(null);  // memory-only
  readonly isAuthenticated = computed(() => !!this._accessToken());
}
```

- Access token: memory-only, never persisted (XSS protection).
- Refresh token: httpOnly cookie, invisible to JS by design — do not try to read it.
- CSRF: disabled server-side for this stateless-JWT API — no client-side CSRF handling needed.
- `DomSanitizer` for any dynamic HTML binding; no unsanitized `innerHTML`.
- Route guards mirror backend `@PreAuthorize` authorities exactly — never invent
  a client-only permission string.
- No form/DTO collects an actor/performed-by field (§9.1).
- Cart persists to `localStorage` (items only) — the one sanctioned exception;
  no other client-side persistence of sensitive/session data.
- Validate file type/size client-side before upload (§13), matching
  `FileUploadContext` limits — but treat the backend as the authority; a
  client-side pass is UX only.

---

## 13. File Uploads (MinIO)

The backend stores object **paths**, not URLs, and resolves a presigned
(private) or public/CDN (public) URL only at response-build time. The Angular
client always **sends files** and **displays URLs from the response** — it
never constructs a path itself.

```typescript
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  uploadProductImage(productId: number, file: File, opts?: { altText?: string; isPrimary?: boolean }) {
    const formData = new FormData();
    formData.append('file', file);
    if (opts?.altText) formData.append('altText', opts.altText);
    if (opts?.isPrimary !== undefined) formData.append('isPrimary', String(opts.isPrimary));
    return this.http.post<ApiResponse<ProductImageResponse>>(
      `${this.baseUrl}/v1/products/${productId}/images`, formData,
    ).pipe(map(r => r.data));
  }

  uploadTenantDocument(tenantId: number, file: File, documentType: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    return this.http.post<ApiResponse<TenantDocumentResponse>>(
      `${this.baseUrl}/v1/tenants/${tenantId}/documents`, formData,
    ).pipe(map(r => r.data));
  }
}
```

### Client-side pre-validation (mirrors `FileUploadContext.validate()`)

```typescript
export function validateFile(file: File, opts: { maxSizeMB: number; allowedTypes: string[] }): string | null {
  if (file.size > opts.maxSizeMB * 1024 * 1024) return `File exceeds ${opts.maxSizeMB}MB limit`;
  if (!opts.allowedTypes.includes(file.type)) return `File type "${file.type}" not allowed`;
  return null;
}

export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];   // 5MB
export const TENANT_DOCUMENT_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];  // 10MB
```

Dual JSON + multipart endpoints (e.g. chat messages with an optional
attachment) need **two service methods** hitting the same URL with different
`Content-Type`, mirroring the backend's two `@PostMapping` variants sharing a
private handler:

```typescript
sendTextMessage(conversationId: number, body: SendMessageRequest) {
  return this.http.post<ApiResponse<MessageResponse>>(
    `${this.baseUrl}/v1/chat/conversations/${conversationId}/messages`, body,
  ).pipe(map(r => r.data));
}

sendMessageWithAttachment(conversationId: number, body: SendMessageRequest, file: File) {
  const formData = new FormData();
  formData.append('request', new Blob([JSON.stringify(body)], { type: 'application/json' }));
  formData.append('file', file);
  return this.http.post<ApiResponse<MessageResponse>>(
    `${this.baseUrl}/v1/chat/conversations/${conversationId}/messages`, formData,
  ).pipe(map(r => r.data));
}
```

---

## 14. WebSocket & Real-Time (STOMP + RabbitMQ)

The backend is a **STOMP** broker relayed through RabbitMQ — not plain
Socket.IO. Use `@stomp/rx-stomp`.

```bash
npm install @stomp/rx-stomp @stomp/stompjs
```

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
      // Browser client uses the SockJS-fallback endpoint; Flutter/native
      // clients use the plain-WS endpoint. Confirm which this web app should
      // target against the actual WebSocketConfig (see §27).
      brokerURL: `${this.wsUrl}?token=${token}`,
      heartbeatIncoming: 5000, heartbeatOutgoing: 5000, reconnectDelay: 3000,
    });
    this.rxStomp.activate();
  }

  disconnect(): void { this.rxStomp?.deactivate(); this.rxStomp = null; }

  watchNotifications(): Observable<InAppNotification> {
    return this.rxStomp?.watch('/user/queue/notifications').pipe(map(m => JSON.parse(m.body))) ?? EMPTY;
  }
  watchChatMessages(): Observable<MessageResponse> {
    return this.rxStomp?.watch('/user/queue/chat').pipe(map(m => JSON.parse(m.body))) ?? EMPTY;
  }
  watchAdminBroadcast(): Observable<unknown> {
    return this.rxStomp?.watch('/topic/admin-chat').pipe(map(m => JSON.parse(m.body))) ?? EMPTY;
  }
  watchBuildingAnnouncements(buildingId: number): Observable<unknown> {
    return this.rxStomp?.watch(`/topic/building/${buildingId}`).pipe(map(m => JSON.parse(m.body))) ?? EMPTY;
  }

  sendChatMessage(body: unknown): void { this.rxStomp?.publish({ destination: '/app/chat.send', body: JSON.stringify(body) }); }
  sendTypingStart(conversationId: number): void { this.rxStomp?.publish({ destination: '/app/chat.typing.start', body: JSON.stringify({ conversationId }) }); }
  sendTypingStop(conversationId: number): void { this.rxStomp?.publish({ destination: '/app/chat.typing.stop', body: JSON.stringify({ conversationId }) }); }
  sendReadReceipt(conversationId: number): void { this.rxStomp?.publish({ destination: '/app/chat.read', body: JSON.stringify({ conversationId }) }); }
}
```

### Channel reference (confirmed against `WebSocketConfig`)

| Direction | Destination | Purpose |
|---|---|---|
| Server → user | `/user/{userId}/queue/chat` | Personal chat messages |
| Server → user | `/user/{userId}/queue/notifications` | Personal in-app notifications |
| Server → all admins | `/topic/admin-chat` | Admin dashboard broadcast |
| Server → building | `/topic/building/{id}` | Building-wide announcements |
| Client → server | `/app/chat.send` | Send text message |
| Client → server | `/app/chat.typing.start` / `.typing.stop` | Typing indicator |
| Client → server | `/app/chat.read` | Mark conversation as read |
| Client → server | `/app/chat.init` | Request subscription manifest |

Connect once at app bootstrap (after login) and disconnect on logout — don't
open a second connection per feature component.

---

## 15. Push Notifications (FCM) & In-App Notifications

FCM device-token push is primarily a **mobile** (Flutter) concern in this
backend's design (`FcmNotificationRequest`, topic/token/tokens targeting). For
the Angular web app, treat the STOMP `/user/queue/notifications` channel (§14)
as the **primary** live-notification transport, rendered through the shared
`ToastRegion`/notification center — don't build a parallel FCM-token flow for
web unless the product explicitly needs background/tab-closed browser push
(Web Push via Firebase JS SDK), which is a separate, larger integration outside
this file's confirmed scope (§27).

```typescript
export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  notificationType: string;   // e.g. 'ORDER_CONFIRMED', 'CHAT_MESSAGE', 'BUILDING_ANNOUNCEMENT'
  entityType?: string;        // 'ORDER' | 'CONVERSATION' | 'BUILDING' | ...
  entityId?: string;
  action?: string;            // 'OPEN_ORDER' | 'OPEN_CHAT' | ...
  createdAt: string;
}
```

```typescript
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly ws = inject(WebSocketService);
  private readonly _notifications = signal<InAppNotification[]>([]);
  readonly notifications = this._notifications.asReadonly();
  readonly unreadCount = computed(() => this._notifications().length);

  init(): void {
    this.ws.watchNotifications().subscribe(n => this._notifications.update(list => [n, ...list]));
  }

  dismiss(id: string): void {
    this._notifications.update(list => list.filter(n => n.id !== id));
  }

  /** Deep-link routing off notificationType — mirrors Flutter's switch. */
  routeFor(n: InAppNotification): string | null {
    switch (n.action) {
      case 'OPEN_ORDER': return `/orders/${n.entityId}`;
      case 'OPEN_CHAT': return `/chat/${n.entityId}`;
      default: return null;
    }
  }
}
```

---

## 16. Error Handling — Backend Error Shapes

### `ErrorResponse` (source: `GlobalExceptionHandler`)

```typescript
export interface ErrorResponse {
  status: number;
  errorCode: string;
  message: string;
  details?: string[];   // one "fieldName: message" string per violated constraint — VALIDATION_ERROR only
  timestamp: string;
  path: string;
}
```

### `errorInterceptor`

```typescript
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

      if (error.status === 0) {
        return throwError(() => ({
          status: 0, errorCode: 'NETWORK_ERROR',
          message: 'Unable to reach the server. Check your connection.', raw: error.error,
        } satisfies ApiError));
      }

      const backendError: Partial<ErrorResponse> = error.error ?? {};
      const isAuthRoute = req.url.includes('/v1/auth/');

      // 401 here means tokenRefreshInterceptor's own refresh attempt also
      // failed — log out for real.
      if (error.status === 401 && !isAuthRoute) {
        authService.logout().subscribe();
        router.navigate(['/login']);
      }
      if (error.status === 403) {
        notify.dismiss;  // no-op placeholder — surface via toast in the calling feature
        router.navigate(['/forbidden']);
      }

      return throwError(() => ({
        status: error.status,
        errorCode: backendError.errorCode ?? 'UNKNOWN',
        message: backendError.message ?? 'An unexpected error occurred',
        details: backendError.details ?? [],
        raw: backendError,
      } satisfies ApiError));
    }),
  );
};
```

### Error code reference (source: `GlobalExceptionHandler` + `BaseException` hierarchy — authoritative, 9 confirmed codes)

| `errorCode` | HTTP | When |
|---|---|---|
| `RESOURCE_NOT_FOUND` | 404 | Entity doesn't exist |
| `RESOURCE_ALREADY_EXISTS` | 409 | Uniqueness violation |
| `BAD_REQUEST` | 400 | Malformed/invalid input outside bean validation |
| `VALIDATION_ERROR` | 400 | `@Valid` failed — `details[]` has one `"field: message"` per violation |
| `ACCESS_DENIED` | 403 | Custom `AccessDeniedException` (distinct from Spring Security's own) |
| `BUSINESS_VALIDATION_ERROR` | 400 | `BusinessException` — generic business rule violation |
| `OPERATION_NOT_ALLOWED` | 405 | Entity state prevents the requested operation |
| `TOKEN_REFRESH_ERROR` | 401 | Refresh token invalid/expired |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limiter rejected the request |
| `MESSAGE_PROCESSING_ERROR` | 500 | RabbitMQ consumer failure (rare on the client side) |
| `BAD_CREDENTIALS` | 401 | Wrong email/password on login |
| `DATA_CONFLICT` | 409 | DB constraint violation surfaced with a user-friendly message |
| `TYPE_MISMATCH` / `INVALID_SORT_FIELD` / `MALFORMED_JSON` / `METHOD_NOT_ALLOWED` / `ENDPOINT_NOT_FOUND` | 400/404/405 | Framework-level request shape errors |
| `RUNTIME_ERROR` / `INTERNAL_SERVER_ERROR` | 500 | Unhandled exception |
| *(client-synthesized)* `NETWORK_ERROR` | 0 | No HTTP response reached the client at all |

Never branch UI copy on `errorCode === 0`-style guesses — check `status === 0`
specifically for the network case, since there is no backend `errorCode` for it.

---

## 17. Pagination & Search/Filter DTOs

### Pagination — 0-based

```typescript
export interface PaginationState {
  page: number;      // 0-based
  size: number;
  totalElements: number;
  totalPages: number;
  isFirst: boolean;
  isLast: boolean;
}
```

```html
<app-paginator
  [page]="store.pagination().page"
  [size]="store.pagination().size"
  [totalElements]="store.pagination().totalElements"
  [totalPages]="store.pagination().totalPages"
  (pageChange)="onPageChange($event)"
/>
```

```typescript
onPageChange(page: number): void {
  // page is already 0-based — pass straight through
  this.store.load({ page });
}
```

### Search DTOs bound via `@ModelAttribute` — build params explicitly, skip nulls

```typescript
export function buildHttpParams(params: Record<string, any>): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    p = Array.isArray(value) ? p.set(key, value.join(',')) : p.set(key, String(value));
  }
  return p;
}
```

Build a typed searchable/sortable-fields const per feature so the UI can't emit
a key the backend silently ignores:

```typescript
export const PRODUCT_SEARCHABLE_FIELDS = ['name', 'sku', 'upc', 'slug', 'categoryId', 'status'] as const;
export const PRODUCT_SORTABLE_FIELDS = ['name', 'basePrice', 'createdAt', 'rating'] as const;
```

---

## 18. Domain Models — eCommerce, Housing/Agency, Chat

Field names mirror the Java DTOs exactly (all camelCase — see §6). Status
fields are confirmed uppercase string unions where the entity/DTO was directly
provided; anything not directly confirmed is flagged (§27) rather than invented.

### 18.1 eCommerce — confirmed

```typescript
export interface ProductPreview {
  id: number; name: string; sku: string; slug: string;
  basePrice: number; salePrice?: number; currency: string;
  stockStatus: string; stockQuantity: number; status: string;
  isFeatured: boolean; rating: number; reviewCount: number;
  primaryImageUrl?: string; category: ProductCategoryPreview;
  createdAt: string; updatedAt: string;
}

export interface ProductDetail extends ProductPreview {
  description: string; shortDescription: string; upc?: string;
  images: ProductImageResponse[]; subcategory?: ProductCategoryPreview;
  variants: ProductVariantResponse[]; attributes: ProductAttributeResponse[];
  tags: ProductTagResponse[]; isTaxable: boolean;
}

export interface ProductCategory {
  id: number; name: string; slug: string; description?: string;
  parentId?: number; imageUrl?: string; level: number; children: ProductCategory[];
}
export interface ProductCategoryPreview { id: number; name: string; slug: string; level: number; }

// Order — confirmed status union (from Order.OrderStatus)
export type OrderStatus =
  | 'WAITING_PAYMENT_CONFIRMATION' | 'PAID' | 'PROCESSING' | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED'
  | 'REFUNDED' | 'PAYMENT_TIMEOUT' | 'PAYMENT_FAILED';
export type DeliveryMethod = 'HOME_DELIVERY' | 'PICK_AT_STORE';
export type PaymentMethod = 'MPESA' | 'PAY_ON_DELIVERY';

export interface OrderPreview {
  id: number; orderNumber: string; customerId: number; customerName: string;
  status: OrderStatus; paymentMethod: string; paymentStatus: string;
  deliveryMethod: string; totalAmount: number; itemCount: number;
  createdAt: string; updatedAt: string;
}

export interface OrderDetail extends OrderPreview {
  customerEmail?: string; customerPhone?: string;
  subtotal: number; discountAmount: number; taxAmount: number; deliveryFee: number;
  notes?: string; items: OrderItemResponse[]; payment?: OrderPaymentResponse;
  statusHistory: OrderStatusHistoryResponse[];
}

export interface OrderItemResponse {
  id: number; productIdSnapshot: number; productNameSnapshot: string; productSkuSnapshot: string;
  productImageUrlSnapshot?: string; variantColorSnapshot?: string; variantSizeSnapshot?: string;
  originalPrice: number; unitPrice: number; quantity: number; subtotal: number;
  discountApplied: number; taxAmount: number;
}

// Cart — client-only until validated
export interface CartItem {
  productId: number; variantId?: number; name: string; image?: string;
  unitPrice: number; quantity: number; maxQuantity: number;
}
export interface CreateOrderRequest {
  customerId: number;
  deliveryMethod: DeliveryMethod;
  deliveryAddressId?: number;
  storeId?: number;
  paymentMethod: PaymentMethod;
  paymentPhoneNumber?: string;   // required for MPESA — format 254XXXXXXXXX
  cartItems: { productId: number; variantId?: number; quantity: number; unitPrice: number }[];
  voucherCodes?: string[];
  deliveryInstructions?: string;
  notes?: string;
}
```

### 18.2 Housing / Agency — provisional (entity/DTO not directly confirmed)

The permission constants (`AGENCY_*`, `TENANT_*`, `LEASE_*`, `MAINTENANCE_*`)
confirm these modules exist, but no entity/DTO source was provided for them.
Treat the shapes below as a **starting scaffold only** — confirm field names
and enum values against the real `*Dtos.java` before shipping.

```typescript
// ⚠️ PROVISIONAL — confirm against AgencyDtos.java / TenantDtos.java / LeaseDtos.java
export interface AgencyPreview {
  id: number; name: string; type?: string; unitCount?: number;
  occupancyRate?: number; isActive: boolean; createdAt: string;
}

export interface TenantPreview {
  id: number; firstName: string; lastName: string; email: string; phoneNumber: string;
  status: string;   // ⚠️ unconfirmed union — likely ACTIVE/INACTIVE/PENDING, not verified
  currentUnitNumber?: string; currentPropertyName?: string; leaseStatus?: string;
  createdAt: string;
}

export interface LeaseDetail {
  id: number; unitId: number; tenantId: number; startDate: string; endDate: string;
  rentAmount: number; securityDeposit: number; paymentDueDay: number;
  status: string;   // ⚠️ unconfirmed union
  terms: string; createdAt: string;
}

export interface MaintenanceTicketPreview {
  id: number; unitId: number; tenantId: number; title: string; category: string;
  priority: string;  // ⚠️ unconfirmed union
  status: string;    // ⚠️ unconfirmed union
  assignedTo?: string; createdAt: string;
}
```

**Rule:** when scaffolding a status `<select>`/`@switch`/`StatusBadge` off any
of the provisional unions above, add a visible fallback branch and flag to the
requester that the enum should be confirmed — don't ship a silently
incomplete list.

### 18.3 Chat

```typescript
export interface ConversationPreview {
  id: number; participantName: string; lastMessage?: string; lastMessageAt?: string;
  unreadCount: number;
}
export interface SendMessageRequest { conversationId?: number; content: string; }
export interface MessageResponse {
  id: number; conversationId: number; senderId: number; senderName: string;
  content: string; attachmentUrl?: string; createdAt: string;
}
```

---

## 19. UI/UX Design System

### 19.1 Design tokens

```scss
:root {
  --color-primary:       #2563EB; --color-primary-hover: #1D4ED8;
  --color-secondary:     #0F172A; --color-accent: #7C3AED;
  --color-success:       #16A34A; --color-warning: #F59E0B;
  --color-danger:        #DC2626; --color-info: #0EA5E9;

  --color-gray-50: #F8FAFC; --color-gray-100: #F1F5F9; --color-gray-200: #E2E8F0;
  --color-gray-500: #64748B; --color-gray-900: #0F172A;

  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

  --font-sans: 'Inter', system-ui, sans-serif;
  --text-xs: 0.75rem; --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.25rem; --text-2xl: 1.5rem;

  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;

  --field-max-width: 420px;       /* single-value inputs, selects, pickers */
  --field-max-width-wide: 720px;  /* textareas */
}
input, select, textarea { width: 100%; max-width: var(--field-max-width); }
```

Add new semantic tokens to `:root` before ever reaching for a literal hex value
in a component. **No hardcoded hex/rgba in component SCSS** — always `var(--token)`.

### 19.2 Global vs. component styles

Global, never component-local: `.page-shell`/`.editor-shell`/`.detail-shell` (+
`-hero` variants), `.panel`/`.card-surface`, buttons (`.primary`/`.secondary`/
`.danger`/etc.), `table`/`th`/`td`/`.pagination`, base `input`/`select`/
`textarea` styling, `.error-text`/`.success`/`.empty`/`.hint`, `.toast`/
`.toast-region`. A component's `.scss` should only contain layout unique to
that screen — if a rule would look identical copy-pasted elsewhere, it belongs
globally.

### 19.3 Minimalist visual direction

Keep the UI quiet, compact, and easy to scan — a clean product feel, not
decorative density.

- Modest title sizes; a title shouldn't consume most of the panel.
- No large intro paragraphs when a form/table already makes the screen's
  purpose clear (see §23 for the full copy rule).
- Compact cards, tighter vertical spacing, dense tables with smaller row
  heights and subtle separators.
- One calm primary color, one neutral surface palette, only the semantic
  colors a view truly needs; light backgrounds, soft borders, restrained
  contrast; interactive states clear but subtle.
- Vertical spacing is owned by the container (`.page-shell { gap: 18px }`,
  `.panel > * + * { margin-top: 14px }`), never by an individual section
  adding its own `margin-bottom`.

### 19.4 Mobile-first breakpoints

```html
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
```

### 19.5 Charts (admin reports — both domains)

Use `ngx-echarts` or `ng2-charts` (Chart.js).

| Chart | Data source |
|---|---|
| Line — revenue over time | `Order.totalAmount` bucketed by day/week |
| Doughnut — orders by status | `OrderStatus` distribution |
| Bar — top products | `OrderItem` aggregated by `productIdSnapshot` |
| Area — occupancy over time *(once housing entities are confirmed, §27)* | lease start/end ranges per unit |
| Bar — rent collection by month *(provisional)* | `RentPayment`-equivalent status per period |

---

## 20. Component Library

| Component | Inputs | Outputs |
|---|---|---|
| `ProductCard` | `product`, `layout` | `addToCart`, `addToWishlist` |
| `ProductGrid` | `products`, `loading`, `columns` | — |
| `PriceDisplay` | `price`, `originalPrice`, `currency` | — |
| `CartSummary` | `items` | `updateQty`, `remove` |
| `OrderSummary` | `order` | — |
| `SearchableSelect` | `options`, `emptyOptionLabel` | value via `ControlValueAccessor` |
| `EntityLookupField` | `searchFn`, `displayField` | value via `ControlValueAccessor` |
| `DataTable` | `columns`, `data`, `loading`, `pagination`, `sorting` | `rowSelected`, `sortChanged` |
| `Paginator` | `page` (0-based), `size`, `totalElements`, `totalPages` | `pageChange` |
| `ErrorCard` | `title`, `message`, `details` | — |
| `PermissionGate` | `permissions`, `roles`, `requireAll` | — |
| `SkeletonLoader` | `type`, `count` | — |
| `EmptyState` | `icon`, `title`, `message`, `actionLabel` | `actionClicked` |
| `Toast`/`ToastRegion` | `politeness` | — |
| `DocumentUploader` | `accept`, `maxSize`, `multiple` | `uploaded`, `removed` |
| `ChatConversationList` / `ChatThread` | `conversations` / `messages` | `selected` / `sent` |
| `MaintenanceTicketCard` *(provisional shape, §18.2)* | `ticket` | `statusChanged`, `assigned` |

---

## 21. Accessibility (WCAG)

WCAG 2.1 AA throughout. Contrast ratios:
- Normal text ≥ 4.5:1; large text (18px+ bold or 24px+) ≥ 3:1; UI
  components/icons/focus indicators ≥ 3:1.

### Focus trap — every modal/drawer

```typescript
@Directive({ selector: '[appFocusTrap]', standalone: true })
export class FocusTrapDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly returnFocusTo = input<HTMLElement | null>(null);
  private readonly keydownHandler = (e: KeyboardEvent) => this.onKeydown(e);
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      this.previouslyFocused = document.activeElement as HTMLElement | null;
      this.el.nativeElement.addEventListener('keydown', this.keydownHandler);
      this.getFocusable()[0]?.focus();
    });
  }
  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('keydown', this.keydownHandler);
    (this.returnFocusTo() ?? this.previouslyFocused)?.focus();
  }
  private onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.el.nativeElement.dispatchEvent(new CustomEvent('trap-escape', { bubbles: true })); return; }
    if (e.key !== 'Tab') return;
    const f = this.getFocusable(); if (!f.length) return;
    const [first, last] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  private getFocusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
  }
}
```

```html
<div class="modal-panel" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId"
     appFocusTrap (trap-escape)="close.emit()" (click)="$event.stopPropagation()">
  <h2 [id]="titleId">{{ title() }}</h2>
  <ng-content />
</div>
```

### `aria-live` — toasts, mounted once at root, never inside a conditional `@if`

```html
<div class="toast-region" aria-live="polite" aria-atomic="false" role="status">
  @for (t of notifications.polite(); track t.id) { <div class="toast toast--{{t.variant}}">{{ t.message }}</div> }
</div>
<div class="toast-region" aria-live="assertive" aria-atomic="false" role="alert">
  @for (t of notifications.assertive(); track t.id) { <div class="toast toast--{{t.variant}}">{{ t.message }}</div> }
</div>
```

Two regions, not one: `polite` for success/info, `assertive` for errors that
need immediate announcement. Never auto-dismiss an assertive/error toast before
the user can read it.

---

## 22. Loading, Empty & Error States

Every async list/data view renders all three, driven by store signals:

```html
@if (store.loading()) {
  <app-skeleton-loader type="table" [count]="8" />
} @else if (store.error()) {
  <app-error-state [message]="store.error()!.message" (retry)="store.load()" />
} @else if (store.items().length === 0) {
  <app-empty-state title="No products found" message="Try adjusting your filters." />
} @else {
  <app-product-grid [products]="store.items()" />
}
```

### Standard empty-state copy

| Context | Title | Message |
|---|---|---|
| Product search | No products found | Try different keywords or clear filters. |
| Cart | Your cart is empty | Browse the catalog to find something you'll love. |
| My orders | No orders yet | Your order history will appear here. |
| Admin orders | No orders yet | Orders will appear here once customers check out. |
| Products (admin) | No products yet | Create a product to get started. |
| Tenants *(provisional)* | No tenants yet | Add your first tenant to get started. |
| Maintenance *(provisional)* | No tickets | All caught up — no open maintenance requests. |
| Chat | No conversations yet | Messages will appear here once someone reaches out. |

A network-failure error state (`status === 0`) should read as connectivity-specific
("Unable to reach the server. Check your connection.") — never conflate it with a
generic "Something went wrong."

---

## 23. UI Copy Standards

### No explanatory prose under headings

Admin/product UI is for people who already know what the page does.

- Don't add a `<p>` under a heading that restates the heading, explains a
  feature's purpose, or narrates what an action will do — the admin chose the
  action and knows what it does.
- Only three kinds of sentence survive:
  1. An **arbitrary input rule** the admin can't guess ("Leave empty to
     apply to all zones.").
  2. A **state explaining a missing/disabled control** ("This lease is
     terminated and can no longer be edited.").
  3. A **consequence outside the current screen** ("Changing your password
     signs you out everywhere.").
- No `.eyebrow` kicker above an `<h1>` — the heading and sidebar already say
  where the admin is.
- No sentence restating the table under it ("0 of 0 orders need review.").

**Deletion test:** if removing a sentence costs the admin real information,
keep it; if the page just gets shorter, delete it.

---

## 24. Testing Standards

| Layer | Tool | Target |
|---|---|---|
| Services | Jest | ≥ 90% |
| Signal Stores | Jest | ≥ 90% |
| Validators | Jest | 100% |
| Guards | Jest | 100% |
| Critical components | Angular Testing Library | ≥ 80% |
| E2E (critical flows) | Playwright | all happy paths |

```typescript
describe('ProductsService', () => {
  it('unwraps the { success, message, data } envelope', () => {
    service.getProductById(1).subscribe(p => expect(p.sku).toBe('SKU-001'));
    const req = httpMock.expectOne(r => r.url.endsWith('/v1/products/1'));
    req.flush({ success: true, message: 'ok', data: { id: 1, sku: 'SKU-001' }, timestamp: '2026-01-01 00:00:00' });
  });

  it('unwraps a 0-based paginated envelope', () => {
    service.search({ page: 0, size: 20 }).subscribe(r => {
      expect(r.pagination.page).toBe(0);
      expect(r.items).toHaveLength(2);
    });
    const req = httpMock.expectOne(r => r.url.includes('/v1/products'));
    req.flush({
      data: [{ id: 1 }, { id: 2 }],
      pagination: { page: 0, size: 20, totalElements: 2, totalPages: 1, isFirst: true, isLast: true },
      success: true, message: 'ok', timestamp: '2026-01-01 00:00:00',
    });
  });
});
```

### Critical E2E flows

- Browse → search product → add to cart → checkout → payment → order confirmation
- Register/login → view order history → cancel an order
- Login as admin → create product → assign category → verify list reflects it
- Login as admin → open order → update status → verify status history updates
- Login as agency admin *(once housing entities confirmed)* → add tenant → create lease
- Open chat → send text message → send message with attachment → receive via STOMP

---

## 25. Feature Generation Checklist

1. **Add API URLs** to `api-urls.ts`, versioned (`v1/...`) exactly matching the
   controller's `@RequestMapping`.
2. **Add permission constants** only for strings confirmed in an actual
   `@PreAuthorize("hasAuthority('...')")` — never invent one (§8).
3. **Create TypeScript interfaces** mirroring the Java DTO fields exactly
   (camelCase, no exceptions — §6). Flag anything not directly confirmed as
   provisional (§18.2, §27).
4. **Create the service** — inject `API_URL`, unwrap `ApiResponse<T>` /
   `PaginatedApiResponse<T>`, never expose either envelope to a component.
5. **Create the signal store** — separate `loading` from `mutating`; don't
   force a reload on every mount (§10.2).
6. **Create the page component** — wrap protected actions in
   `PermissionGate`, defaulting to permission-based gating; add an ownership
   fallback where the backend uses an "OR owner" SpEL expression (§8).
7. **Wire search/order** via a per-feature searchable/sortable-fields const
   (§17) — never hand-built ad hoc query objects.
8. **Wire pagination** as 0-based — never add/subtract 1 anywhere.
9. **Wire error messages** per §9.2/§16 — local `error` signal, `<app-error-card>`,
   inline message under every invalid/touched control, `status === 0` handled
   distinctly from a normal 4xx/5xx.
10. **Add client validators** loosely matching the DTO's Bean Validation
    constraints, but treat the backend as final authority.
11. **Confirm no request DTO/form collects an actor/performed-by field** (§9.1).
12. **Style per §19** — global classes/tokens only, no hardcoded hex.
13. **Any new modal/drawer or toast** uses `appFocusTrap`/the app-wide
    `ToastRegion` (§21) rather than a one-off implementation.
14. **Write service tests** using the real envelope shapes (§24) — success,
    validation-error (`details[]`), and a synthesized `status: 0` case.
15. **Before touching a housing/agency module**, re-confirm the entity/DTO
    against the actual backend rather than the provisional shapes in §18.2.

### Pre-generation confirmation

- Is pagination 0-based?
- Is `search`/`sort` built from a typed per-feature fields const, params
  skipped when null/empty (not JSON-stringified arrays — that's a different
  backend's convention, not this one)?
- Does the DTO use camelCase (always, here — no snake_case modules)?
- Is the permission string exact `RESOURCE_ACTION` SCREAMING_SNAKE_CASE?
- For M-Pesa phone numbers: normalized to `254XXXXXXXXX` before submission?
- Does the form avoid collecting an actor identity field?
- If auth-adjacent: does it reuse `AuthService`'s existing signals and the
  confirmed httpOnly-cookie refresh flow, rather than introducing a second
  session source of truth?

---

## 26. Code Generation Rules (Quick Reference)

```
ARCHITECTURE
✅ Standalone components only — no NgModule
✅ Zoneless — provideZonelessChangeDetection(), no zone.js
✅ Feature-based folders; inject() for DI

REACTIVITY
✅ Signals for local/shared sync state
✅ signalStore (loading vs mutating) for feature state
✅ New control flow: @if @for @switch @defer
✅ input()/output()/model()

API LAYER
✅ Unwrap { success, message, data, timestamp } and { data, pagination, success, message, timestamp }
✅ Pagination is 0-based — never adjust
✅ Casing is camelCase everywhere — no per-module exceptions
✅ retry({count:2, delay:1000}) on GETs only, never on writes
✅ errorCode-driven error handling (9 confirmed codes, §16), status===0 handled separately

AUTH
✅ Access token in memory only
✅ Refresh token via httpOnly cookie — never read/stored client-side
✅ Silent refresh-and-retry interceptor IS used here (unlike some backends)
✅ CSRF disabled server-side — no client CSRF handling

RBAC
✅ Permission-first gating (PermissionGateComponent, PermissionConstants)
✅ Empty permissions+roles = allow (mirrors backend's authenticated-by-default posture)
✅ Roles supported as secondary/optional mechanism only
✅ Ownership fallback (`|| resource.ownerId === currentUserId()`) where backend uses "permission OR owner"

FORMS
✅ Reactive Forms only, strongly typed FormGroup<T>
✅ Never collect actor/performed-by fields
✅ Every form/step owns its own saving/error signals
✅ Every validated control renders its own inline error message

FILE UPLOAD
✅ Send File via multipart; display URL from response only, never construct paths
✅ Client-side type/size pre-check mirrors FileUploadContext, backend is authority

REALTIME
✅ STOMP over @stomp/rx-stomp, not Socket.IO
✅ One connection per session, disconnect on logout
✅ In-app notifications via /user/queue/notifications, rendered through ToastRegion

STYLING
✅ Global classes/tokens only; zero hardcoded hex in component SCSS
✅ Minimalist/dense: compact cards, no restated headings, container-owned spacing

ACCESSIBILITY
✅ appFocusTrap on every modal/drawer
✅ Two aria-live regions (polite/assertive), mounted once at root

TYPES
✅ Never `any`
✅ Field names mirror Java DTOs exactly (camelCase)
✅ Flag provisional/unconfirmed domain shapes explicitly (§18.2, §27) — never invent silently
```

---

## 27. Confirmed vs. Open Questions

**Confirmed** (safe to generate against directly): API envelopes (§6), 0-based
pagination (§17), JWT auth model + httpOnly refresh cookie + silent-refresh
interceptor (§7), CSRF disabled (§12), permission-string convention and the
full `PermissionConstants`/`RoleConstants` lists (§8), file-upload path-not-URL
pattern (§13), STOMP channel list (§14), the 9-code error taxonomy (§16),
eCommerce domain models including the full `OrderStatus` union (§18.1).

**Open — confirm before generating code, don't silently invent:**

1. **Housing/Agency entity shapes** (§18.2) — `Agency`, `Tenant`, `Lease`,
   `MaintenanceTicket`/unit/property equivalents have no confirmed DTO source.
   The permission strings prove the domain exists; the field shapes are a
   scaffold guess only.
2. **Web STOMP endpoint** (§14) — whether the Angular web client should
   connect via the plain `/ws` endpoint or a SockJS fallback endpoint wasn't
   confirmed from the provided `WebSocketConfig`; check for a
   `/ws-sockjs`-style registration before wiring `RxStomp`.
3. **RolesService/agency-admin merge behavior** — whether agency-scoped roles
   (beyond system roles) affect the JWT's `permissions` claim or are resolved
   separately server-side per request wasn't shown for this specific backend
   variant; don't assume agency-role permissions are present in the decoded
   token without checking.
4. **SuperAdmin UI bypass** (§8) — no `@PreAuthorize` expression in the
   provided controllers explicitly shows a role-based bypass; the
   `PermissionGateComponent`'s SuperAdmin short-circuit is a UX convenience
   only, not derived from a confirmed backend rule.
5. **Web Push (FCM in-browser)** — not scoped in this file (§15); FCM here is
   confirmed only for mobile/device-token delivery.
6. **Rate-limit headers/backoff** — `RATE_LIMIT_EXCEEDED` (429) is a confirmed
   error code, but no `Retry-After`-style contract was shown; don't build a
   specific backoff UI beyond a generic "too many requests" message until
   confirmed.