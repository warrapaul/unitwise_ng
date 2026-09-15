# Angular AI Agent Skills Guide
## Portable conventions for generating Angular 20+ applications

Every rule here is meant to transfer to another Angular project. Anything
that only makes sense for one codebase — its backend contract, domain
models, business rules or named components — belongs in a companion
project file, not here.

**The split, so it stays split:** this file states the *rule* and shows a
neutral example; the project file states that project's *answer*. §6 says
unwrap the envelope in the service — the project file says what the
envelope's fields are called. §8 says mirror the server's permission
list — the project file holds the list. When the two disagree, the
backend is right and the project file is stale.

For this repository the project file is **`unitwise-skills.md`**
(backend contract in §24, domain rules in §22–23).


---

## Table of Contents

1. Core Architecture Principles
2. Project Structure
3. Angular Modern Patterns (Signals, Control Flow)
4. State Management
5. RxJS Mastery
6. API Integration & HTTP Layer — the Response Envelope
7. Auth & JWT Integration
8. RBAC & Permission Gates — Permission-First
9. Forms Architecture
10. Routing, Lazy Loading & List-State Preservation
11. Performance Optimization
12. Security Standards
13. File Uploads (Object Storage)
14. WebSocket & Real-Time (STOMP)
15. Push & In-App Notifications
16. Error Handling
17. Pagination & Search/Filter DTOs
18. Domain Models — Mirror the Backend, Never Invent
19. UI/UX Design System
20. Component Library
21. Accessibility (WCAG)
22. Loading, Empty & Error States
23. UI Copy Standards
24. Testing Standards
25. Feature Generation Checklist
26. Code Generation Rules (Quick Reference)
28. ID Inputs — Never Make the Operator Know an ID
29. Responsive Shell — Phone Layout
30. Active Role — One Role at a Time
31. Forms Must Speak — Validation and Backend Errors
32. Feedback, Credentials & Where a Save Lands
33. Two Audiences, Two Interfaces
34. Charts and Figures
35. Show the Provisional State, Marked as Provisional
36. Density — Fewer Screens, Uniform Rhythm
37. Status Chips — One Meaning, One Colour
38. Editing Replaces the Record, It Does Not Sit Beside It
39. Shareable Identifiers, Consent and One-Time Secrets

Project-specific material — the backend contract, domain models and this
platform's own rules — belongs in `unitwise-skills.md`, not here.

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
  `orders`, `organisations`, `members`, `contracts`, `chat`, `notifications`.
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
│   │   ├── organisations/       # one folder per domain feature
│   │   ├── members/
│   │   ├── contracts/
│   │   ├── chat/
│   │   ├── notifications/
│   │   └── admin/
│   │       ├── users/
│   │       ├── products/
│   │       ├── categories/
│   │       ├── orders/
│   │       ├── organisations/
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
  // A server-side validation call before the irreversible step.
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
| Complex cross-feature flow (checkout, multi-party signing) | NgRx Store + Effects, or a step-based signal store (§9.4) |
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

## 6. API Integration & HTTP Layer — the Response Envelope

Most Spring-style backends wrap **every** response in an envelope. Two
rules, and they hold whatever the envelope looks like:

- **Type the envelope, then unwrap it in the service.** A component that
  touches `.data` has coupled a template to a transport detail, and every
  such site has to change the day the envelope does.
- **Normalise paging into one client-side shape**, so pages and stores
  never care which server produced it.

The exact envelope this project's backend sends — field names, the
timestamp format, the pagination keys — is recorded in
`unitwise-skills.md`. Read it there rather than assuming these shapes.

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

### Casing — pick the server's, and never translate per module

Whatever casing the wire uses, mirror it exactly and everywhere. A
client that renames fields in some modules and not others turns every
new endpoint into a guess. Jackson defaults to camelCase, so a Spring
backend usually hands you camelCase throughout (`phoneNumber`, `firstName`, `orderNumber`,
`createdAt`). There is no snake_case/camelCase split to track per module —
mirror the server's DTO field names exactly, and don't invent a casing convention.

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

## 7. Auth & JWT Integration

### Session model

- **Access token in memory**, as a signal — not `localStorage`, where any
  injected script can read it. Accept that a reload loses it and restore
  from the refresh call instead.
- **Refresh token out of JavaScript's reach** wherever the server allows
  it: an httpOnly cookie the browser attaches on its own is the safest
  arrangement, because the client cannot leak what it cannot read. It
  needs `withCredentials` on the client and matching CORS server-side.
- **Silent refresh-and-retry**, if the server supports it: a
  `tokenRefreshInterceptor` catches a 401 mid-session, refreshes once,
  and retries the original request. Refresh exactly once per failure and
  share one in-flight refresh across concurrent 401s, or a burst of
  parallel requests will fire a burst of refreshes.
- **Check whether CSRF applies before adding it.** A stateless JWT API
  usually disables it server-side; adding token handling the server does
  not read is cargo cult, and omitting it where the server *does* expect
  it breaks every write.

This project's concrete flow — the refresh endpoint, the login response
shape, and whether CSRF is on — is in `unitwise-skills.md`.

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

  login(credentials: LoginRequest): Observable<AuthResult> {
    return this.http.post<ApiResponse<AuthResult>>(`${this.apiUrl}/v1/auth/login`, credentials).pipe(
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
    return this.http.post<ApiResponse<AuthResult>>(`${this.apiUrl}/v1/auth/refresh`, {}).pipe(
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
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  passwordResetRequired: boolean;
}
export interface LoginRequest { email: string; password: string; }
export interface TokenPayload {
  sub: string; userId: number; roles: string[]; permissions: string[]; exp: number;
}
```

### `authInterceptor` — allow-list the anonymous endpoints, never skip by prefix

Skipping the bearer for everything under `/v1/auth/` looks right and is wrong.
Several endpoints under that prefix **require** a token:

| Public (no bearer) | Authenticated (needs bearer) |
|---|---|
| `login`, `check-login-method` | `password-change` |
| `login-otp/request`, `login-otp/confirm` | `logout`, `logout-all-devices` |
| `signup`, `signup/verify-phone/*` | `admin/force-logout/{id}` |
| `refresh-token` | `password-reset/admin-initiate` |
| `password-reset/initiate`, `password-reset/confirm` | |
| `password-set` — carries its own verification token in the body | |

The prefix rule broke first login outright. A login whose account has
`passwordResetRequired` returns a **short-lived password-change JWT as its
access token** and a null refresh token (`handlePasswordResetOrBuildJwt` on the
backend). `POST /v1/auth/password-change` is authorised with exactly that token
— so the one request the temporary token exists for was the one request that
never carried it.

Match on the normalised path, so a proxied or absolute URL resolves the same:

```typescript
const PUBLIC_AUTH_PATHS: ReadonlySet<string> = new Set(['v1/auth/login', /* … */]);

if (!token || PUBLIC_AUTH_PATHS.has(apiPath(request.url))) {
  return next(request);
}
```

Adding an auth endpoint means deciding which column it belongs in. The default
for anything not listed is **send the bearer**, which fails safe: a public
endpoint ignoring a token is harmless, an authenticated one missing it is not.

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

### Permission constants — one file, mirroring the server's own list

```typescript
// core/rbac/permission-constants.ts
// One flat object, one entry per string the server actually registers.
// Mirrors the server list exactly; this project's real one lives in
// unitwise-skills.md.
export const PermissionConstants = {
  USER_CREATE: 'USER_CREATE',
  USER_READ: 'USER_READ',
  // The scoped/platform pair (§30.9): the plain form reaches what the
  // caller's own grant covers, the _ALL form reaches the whole platform.
  USER_READ_ALL: 'USER_READ_ALL',
} as const;

export type Permission = typeof PermissionConstants[keyof typeof PermissionConstants];
```

> **Living document, not a fixed enum.** Where the server derives its
> permission table from the guards on its own endpoints, the two lists
> must move together: when a new permission string appears server-side,
> add it here in the same PR. Only ever list strings you have actually
> read in the server's guards — a permission the client invents gates
> nothing, and reads as working right up until someone relies on it.

### Role constants — secondary/optional mechanism

```typescript
// core/rbac/role-constants.ts
export const RoleConstants = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  MEMBER: 'MEMBER',
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

### 9.4 Multi-step forms

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
      { path: 'members', canActivate: [authGuard], loadChildren: () => import('./features/members/members.routes').then(m => m.MEMBERS_ROUTES) },
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

Any control fed from the backend (roles, categories, organisations, zones) must use
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
- Validate file type/size client-side before upload (§13), mirroring the
  server's own limits — but the backend is the authority. A client-side
  pass is UX, never a control: anything that matters is re-checked there.

---

## 13. File Uploads (Object Storage)

Where the server stores object **paths** and resolves a presigned or CDN
URL only when building a response, the client **sends files** and
**displays whatever URL came back**. Never assemble a storage URL on the
client: it hardcodes the bucket layout into the frontend, and it cannot
sign anything, so every private object breaks the day the bucket stops
being public.

```typescript
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  uploadImage(ownerId: number, file: File, opts?: { altText?: string; isPrimary?: boolean }) {
    const formData = new FormData();
    formData.append('file', file);
    // Only append what was given: an empty string is a value, and it
    // overwrites a real caption with nothing.
    if (opts?.altText) formData.append('altText', opts.altText);
    if (opts?.isPrimary !== undefined) formData.append('isPrimary', String(opts.isPrimary));
    return this.http.post<ApiResponse<ImageResponse>>(
      `${this.baseUrl}/v1/items/${ownerId}/images`, formData,
    ).pipe(map(r => r.data));
  }

  uploadDocument(ownerId: number, file: File, documentType: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    return this.http.post<ApiResponse<DocumentResponse>>(
      `${this.baseUrl}/v1/members/${ownerId}/documents`, formData,
    ).pipe(map(r => r.data));
  }
}
```

### Client-side pre-validation mirrors the server's own rules

```typescript
export function validateFile(file: File, opts: { maxSizeMB: number; allowedTypes: string[] }): string | null {
  if (file.size > opts.maxSizeMB * 1024 * 1024) return `File exceeds ${opts.maxSizeMB}MB limit`;
  if (!opts.allowedTypes.includes(file.type)) return `File type "${file.type}" not allowed`;
  return null;
}

// One list per upload context, because the limits genuinely differ: a
// gallery image and a signed PDF have nothing in common but being files.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];   // 5MB
export const DOCUMENT_TYPES = [
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

## 14. WebSocket & Real-Time (STOMP)

Where the server speaks **STOMP** (typically a Spring broker, often
relayed through a real message broker) the client is `@stomp/rx-stomp`,
not Socket.IO — they are different protocols and not interchangeable.

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
      // Servers often register two endpoints — a plain WebSocket one and
      // a SockJS fallback — and they are not interchangeable. Read which
      // is which off the server config rather than guessing.
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
    return this.rxStomp?.watch(`/topic/site/${siteId}`).pipe(map(m => JSON.parse(m.body))) ?? EMPTY;
  }

  sendChatMessage(body: unknown): void { this.rxStomp?.publish({ destination: '/app/chat.send', body: JSON.stringify(body) }); }
  sendTypingStart(conversationId: number): void { this.rxStomp?.publish({ destination: '/app/chat.typing.start', body: JSON.stringify({ conversationId }) }); }
  sendTypingStop(conversationId: number): void { this.rxStomp?.publish({ destination: '/app/chat.typing.stop', body: JSON.stringify({ conversationId }) }); }
  sendReadReceipt(conversationId: number): void { this.rxStomp?.publish({ destination: '/app/chat.read', body: JSON.stringify({ conversationId }) }); }
}
```

### Destination conventions

Read the real destinations off the server's WebSocket config and keep
them in one constants file — never scattered as string literals at the
subscribe sites. The shape that matters to the client:

| Direction | Shape | Meaning |
|---|---|---|
| Server → one user | `/user/{userId}/queue/...` | Private. The broker resolves the user; never subscribe to somebody else's. |
| Server → a group | `/topic/{scope}/{id}` | Anyone subscribed receives it, so it must carry nothing private. |
| Client → server | `/app/{action}` | A command, authorised server-side like any other request. |

The `/topic/` vs `/user/queue/` distinction is a security boundary, not
a naming style: a topic is a broadcast, so putting a personal record on
one hands it to every subscriber.

**One connection for the app**, opened after login at bootstrap and
closed on logout. A connection per feature component multiplies
reconnect storms and leaves sockets open behind a router navigation.

This project's destination list lives in `unitwise-skills.md`.

---

## 15. Push & In-App Notifications

**Two transports, and the web app usually needs only one.** Device-token
push (FCM and friends) exists to wake an app that is not running, which
is a mobile concern. While a browser tab is open, the socket already
delivers everything — so the live channel (§14) is the primary
transport, rendered through the shared toast region and notification
centre.

Only add browser Web Push when the product genuinely needs to reach
someone with the tab closed. It is a separate and much larger
integration — a service worker, a permission prompt you get one chance
at, and its own token lifecycle — so do not wire it "for parity" with
the mobile client.

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

  /**
   * Where a notification takes you. Keep this mapping in one place: the
   * same notification arrives by socket, by push and in the history
   * list, and three copies of the switch drift apart.
   */
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

## 16. Error Handling

### The error envelope

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

### Branch on the code, not the message

The server sends a stable machine-readable `errorCode` alongside human
prose. Branch on the code; render the prose. Matching on message text
breaks the first time someone improves the wording.

Four behaviours cover almost every backend's taxonomy:

| Kind | Client behaviour |
|---|---|
| Validation failure (usually 400, with a `details[]` of `"field: message"`) | Map each entry onto its control (§31.2); show the rest in the form's error card. |
| Uniqueness / conflict (409) | A specific title — "That name is taken" beats "Unable to save". |
| Forbidden (403) | The operator's permissions changed or never allowed it. Do not retry, and do not present it as a network problem. |
| Server fault (5xx) | Offer a retry; say the failure was ours. |

**A transport failure is not an error code.** When no response reached
the client there is no `errorCode` to read, so detect it by `status === 0`
and say "we could not reach the server" — not "something went wrong",
which sends people looking for a mistake they did not make.

The authoritative code list for this backend is in `unitwise-skills.md`.

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

## 18. Domain Models — Mirror the Backend, Never Invent

Model interfaces are a **transcription** of the server's DTOs, not a
design exercise. Three rules carry all of it:

- **Copy the field names exactly**, in whatever casing the wire uses
  (this project: camelCase throughout, §6). A rename in the client is a
  bug the compiler cannot see — it silently sends a field the server
  ignores.
- **Status fields are string unions, not `string`.** Take the members
  from the server's enum, so an unhandled state is a compile error
  rather than a blank chip.
- **Never invent a shape you have not read.** If no DTO source is to
  hand, say so in a comment and go and read it — a plausible guess is
  worse than a gap, because nothing later re-checks it.

```typescript
// Preview vs Detail is the usual split: a list row carries what the
// table shows, the detail adds the rest. Mirror that split rather than
// fetching a fat object for a list of names.
export interface ThingPreview {
  id: number;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: string;           // ISO-8601 from the server; never a Date
}

export interface ThingDetail extends ThingPreview {
  description?: string | null; // optional AND nullable: the server sends both
  updatedAt: string;
}
```

Optional-and-nullable (`?: T | null`) is deliberate: a field the server
omits and a field it sends as `null` are different wire states, and
typing only one of them puts the other past the type checker.

Concrete domain models for this platform live in `unitwise-skills.md`.

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

### 19.4 Titles carry the screen

A page or card shows its title and nothing else above the content. **§23 is the
rule** — this is only where it bites in markup:

- No `subtitle` on `app-section-card`, and no `<p class="muted">` under an `<h1>`,
  unless it states something the title cannot: a reach ("Applies to every room in
  this site"), a count, or a state.
- No `.pill` or `.eyebrow` kicker above a heading. "Create user" over "Create a
  new user" is the title twice, and the weaker copy is the one taking the top of
  the page.
- Guidance needed *while filling a field* is a `.hint` under that field, not a
  subtitle over the form.

Apply §23's deletion test before writing either: if removing it costs the reader
real information, keep it; if the page just gets shorter, it was decoration.

### 19.5 Mobile-first breakpoints

There is no Tailwind here — breakpoints are plain media queries in
`src/styles.scss` and, where the rule is component-local, in that component's
`styles`. Two of them: `980px` (shell becomes a drawer) and `700px` (grids fall
to one column, filters become sheets). See **§29** for the whole phone layout,
including why tables scroll rather than restack.

### 19.6 Charts (admin reports — both domains)

Use `ngx-echarts` or `ng2-charts` (Chart.js).

Pick the mark from the question, not from variety:

| Question | Mark |
|---|---|
| How has one measure moved over time? | Line |
| How do a few parts divide a whole? | Doughnut — and only for a handful of slices |
| Which items rank highest? | Horizontal bar, sorted |
| How much, per period? | Column |

A second chart type on one screen needs a reason beyond looking less
repetitive.

### 19.7 Spacing between sections

Spacing is owned by the **container**, never by the thing being spaced. A section
never carries its own `margin-bottom`, because the moment two of them do, the gap
between any pair depends on which two.

**The rhythm.** A page is a `.stack` (`display: grid; gap: 1rem`, `0.6rem` under
700px). The same class handles rows inside a card, so one scale covers both.

**Proximity — the rule that makes sections read as sections.** The gap *between*
sections must be at least the gap *inside* one. `app-section-card` is
`padding: 1.25rem; gap: 1rem`; a page gap below `1rem` makes two cards read as a
single slab and the grouping stops meaning anything.

**Pass-through wrappers must not own a box.** This is the trap. A component whose
template is only `<ng-content />` — `app-permission-gate`, `app-context-guard` —
sits between the grid container and the sections it wraps. Left at the default
`display: inline` host, *it* becomes the single grid item, its children stack
inside it with no gap, and every section it guards renders flush against the next:

```ts
// Required on any wrapper that only projects content.
styles: [`
  :host { display: contents; }
`]
```

A component that renders its own box (`app-section-card`, `app-detail-group`) needs
no such rule: as a direct child of the grid it is already an item, and its display
is blockified.

**Horizontal gutters belong to the shell, not the page.** `.shell` carries
`padding: 1rem` (`0.5rem 0.6rem` under 980px) and the routed page fills the
column. A page that adds its own left/right padding stops lining up with every
other screen.

Checklist for a new page:

- Root is `<section class="stack">`; sections are its children.
- No `margin` on a section, panel or card — ever.
- Any wrapper between the stack and the cards is `display: contents`.
- No page-level horizontal padding.

### 19.8 Buttons and form actions

**One set of sizes, defined globally.** `.btn` (default), `.btn-sm` (table rows,
card headers), `.btn-lg` (marketing surfaces only). Never redefine a size in a
component — a local `.btn-lg` in one page is how two "large" buttons end up
different sizes on two screens.

**A button is as wide as its label.** `.btn` sets `justify-self: start`, so a bare
button inside a grid form hugs its content instead of spanning the card. Never
write `width: 100%` on a button: a full-bleed pill reads as a banner, and when the
widest one is destructive it becomes the biggest target on the screen.

**Every form ends with a `.button-row`** — even a single-button one. Bare buttons
dropped straight into a `.stack` become grid items on their own rows, which is
how a Save and a Cancel ended up stacked as two full-width-looking pills:

```html
<div class="button-row">
  <button type="submit" class="btn btn-primary">Save member</button>
  <button type="button" class="btn btn-secondary" (click)="cancel()">Cancel</button>
</div>
```

**Actions sit on one line, primary on the right.** Buttons short enough to fit
side by side always do. Stacked, each reads as a separate decision and the row
becomes a column of banners — which is also why a button never gets
`width: 100%`.

Primary first in the **markup**, always: tab order and screen readers meet the
main action first. `.button-row` paints it right with `flex-direction: row-reverse`,
so the DOM order and the paint order can differ without reordering any template.
The same rule holds at every width — on a phone the right edge is additionally
the thumb zone for the ~90% who are right-handed.

`.button-row--center` is the one exception, for a surface with nothing to align
to: a marketing hero, an empty state.

**Keep destructive actions out of the thumb corner.** A row of three or more falls
into a two-column grid on phones, which keeps source order — with that many
actions there is no single dominant target, and Delete must not land where the
thumb rests.

**Colour ranks the actions, one primary per surface.** `.btn-primary` marks the one
thing the screen exists to do; everything beside it is `.btn-secondary`;
`.btn-danger` is only ever destructive. Two primaries on a card means the card is
doing two jobs.

**Phones** (≤700px): actions still size to their labels, with `min-height: 2.75rem`
for the target. Three or more fall into two equal columns rather than a ragged
wrap.

**A link that acts like a button takes the button classes** —
`<a class="btn btn-secondary" [routerLink]="…">` — so navigation and submission
never look like two different vocabularies.

---

## 20. Component Library

The shared infrastructure every feature reuses. Domain components —
product cards, cart summaries, chat threads — belong to their feature,
not here; this project's inventory is in `unitwise-skills.md`.

| Component | Inputs | Outputs |
|---|---|---|
| `SearchableSelect` | `options`, `placeholder`, `emptyOptionLabel`, `required` | `selectionChange`; value via `ControlValueAccessor` |
| `EntityPicker` | `config` (`EntityPickerConfig`), `placeholder`, `required` | `selectionChange`; value via `ControlValueAccessor` |
| `MultiSelect` | `options`, `searchPlaceholder`, `emptyMessage` | value (`T[]`) via `ControlValueAccessor` |
| `UnitPicker` | `orgId`, `siteId` | unit id via `ControlValueAccessor` (§28.1) |
| `DataTable` | `columns`, `data`, `loading`, `pagination`, `sorting` | `rowSelected`, `sortChanged` |
| `Paginator` | `page` (0-based), `size`, `totalElements`, `totalPages` | `pageChange` |
| `FilterPanel` | `label`, `form` (the filter `FormGroup`), `alwaysOpen` | — (§29.4) |
| `FieldError` | `control`, `label`, `patternMessage`, `messages` | — (§31.1) |
| `PasswordInput` | `placeholder`, `autocomplete` | value via `ControlValueAccessor` (§32.3) |
| `ErrorCard` | `title`, `message`, `details` | — |
| `PermissionGate` | `permissions`, `roles`, `requireAll` | — |
| `SkeletonLoader` | `type`, `count` | — |
| `EmptyState` | `icon`, `title`, `message`, `actionLabel` | `actionClicked` |
| `Toast`/`ToastRegion` | `politeness` | — |
| `DocumentUploader` | `accept`, `maxSize`, `multiple` | `uploaded`, `removed` |

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
| Members | No members yet | Add your first member to get started. |
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
  2. A **state explaining a missing/disabled control** ("This contract is
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
- Login as an organisation admin → add a member → create a contract
- Open chat → send text message → send message with attachment → receive via STOMP

---

## 25. Feature Generation Checklist

1. **Add API URLs** to `api-urls.ts`, versioned (`v1/...`) exactly matching the
   controller's `@RequestMapping`.
2. **Add permission constants** only for strings you have read in the
   server's own guards — never invent one (§8).
3. **Create TypeScript interfaces** mirroring the server's DTO fields
   exactly (§6, §18). Go and read the DTO — never infer a shape from an
   endpoint name.
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
15. **Before touching a module whose shapes you have not read**, confirm the DTO
    against the actual backend rather than a shape you assumed (§18).

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
✅ Unwrap the response envelope in the service — never in a component
✅ Pagination is 0-based — never adjust
✅ Casing is camelCase everywhere — no per-module exceptions
✅ retry({count:2, delay:1000}) on GETs only, never on writes
✅ errorCode-driven error handling (§16); status===0 handled separately

AUTH
✅ Access token in memory only
✅ Refresh token via httpOnly cookie — never read/stored client-side
✅ Silent refresh-and-retry interceptor, one refresh shared per burst
✅ CSRF handling only if the server actually expects it

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
✅ Client-side type/size pre-check mirrors the server's limits; backend is authority

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
✅ Field names mirror the server's DTOs exactly
✅ Model shapes are read from the DTO, never inferred or invented
```

---

---

## 28. ID Inputs — Never Make the Operator Know an ID

An admin does not know that Jane Doe is user `1042`, or that the branch
they are looking at is site `17`. Any control whose value is a foreign key must let them search by
something they actually have — a name, a phone number, an email, a registration
number — and resolve the id behind the scenes. The request DTO is unchanged: the
form control's value is still the raw id.

### 28.1 Which control to reach for

| Situation | Control | Why |
|---|---|---|
| Bounded list, fetched whole and **not** searchable server-side (roles, permissions, tags) | `app-searchable-select` | One request, filter client-side. Still typeable — never a bare `<select>` for anything longer than a handful of options. |
| Unbounded or server-searched (users, organisations, records, places) | `app-entity-picker` | Opens a modal that searches by several fields and pages results. |
| One record holds several (a user's roles, a product's tags) | `app-multi-select` | Searchable checkbox list; value is `T[]`. |
| Genuinely 2–5 fixed options (status, direction, billing type) | plain `<select>` | A search box would be noise. |
| A child inside a structured parent (a seat in a venue, a unit in a block) | a purpose-built picker | Renders the parent's real shape instead of a flat list. See below. |

An id whose options have a **shape** should be picked in that shape. A
flat `<select>` of "Unit 1 … Unit 18" asks the operator to hold the
parent's layout in their head, when they think of it as "the second one
on floor 3". Group by the real structure, sort with a numeric-aware
collator so `A2` precedes `A10`, and surface on each option the one
fact that decides the choice — availability, capacity, price. Options
that are taken stay **selectable** (someone may be booking ahead) but
must not read as free.

**Never** ship a raw `<input type="number" formControlName="somethingId">` for a
foreign key. That includes list-page filters: an operator narrowing a list by its
parent should pick the parent, not recall its id.

### 28.2 Declaring an entity once

Picker behaviour lives in `EntityPickerRegistry`, one config per entity, reused
everywhere that id is required:

```typescript
readonly user: EntityPickerConfig<number> = {
  title: 'Find a user',
  fields: [                       // what a human actually knows
    { key: 'firstName', label: 'First name' },
    { key: 'email', label: 'Email' },
    { key: 'phoneNumber', label: 'Phone number' },
  ],
  metaHeadings: ['Phone', 'National ID'],
  search: (params) => this.users.getUsers(params),
  toRow: (item) => ({ id: user.id, label: fullName(user), hint: user.email }),
  resolve: (id) => this.users.getUserById(id).pipe(map(toRow)),   // prefills edit forms
};
```

`resolve` is what makes an edit form show *"Jane Doe"* instead of *42* — without
it the field renders the bare id until the operator reopens the picker. Supply
it for anything reachable by a single GET.

```html
<label class="field">
  <span>Owner</span>
  <app-entity-picker [config]="pickers.user" [required]="true"
                     formControlName="ownerId" placeholder="Search for the owner" />
</label>
```

### 28.3 A picker's value is whatever the API takes

Normally the id, and that is the default to reach for. Where the server
keeps a registry table with real foreign keys, every form and filter
that names one of its rows binds to a picker and submits the id.

**Never a free-text input for a registry value.** Typing is how
"Nairobi", "nairobi" and "Nairobi County" become three filters that
each match a different slice of one table.

The exception is a DTO that genuinely stores free text — an ecommerce delivery
address, where the customer may be shipping somewhere the registry does not
cover. For those, `pickers.countyName` / `pickers.cityName` are the same lists
keyed by name:

```typescript
readonly countyName: EntityPickerConfig<string> = {
  toRow: (item) => ({ id: item.name, label: item.name, meta: [item.code] }),
  resolve: (name) => of({ id: name, label: name }),   // the value already is the label
};
```

The type parameter is the rule: `EntityPickerConfig<number>` writes an id,
`EntityPickerConfig<string>` writes a name, and the control submits exactly what
its DTO expects either way.

Where the reference endpoint answers with a whole array rather than a page, wrap
it (`asSinglePage`). That is honest **only** because the filtering already
happened in the database: the name the operator typed went to the server.

### 28.4 Where picker configs live

`EntityPickerRegistry` is the single entry point a page injects — one import, and
every entity the app can search is discoverable on it. But each config is *about*
one feature: its search params, its row shape and its resolve call all change
when that feature's API changes.

So: **the feature owns the config; the registry composes it.**

```typescript
// features/users/users.picker.ts — owned by the users feature
export function userPicker(): EntityPickerConfig<number> {
  const users = inject(UsersService);          // called from an injection context
  return { title: 'Find a user', fields: […], search: (p) => users.getUsers(p), … };
}

// the registry becomes a facade
export class EntityPickerRegistry {
  readonly user = userPicker();
  readonly member = memberPicker();
}
```

Why not let each feature stand alone with no registry: consumers would import
from six features to build one form, and a shared component would sprout six
feature dependencies. Why not put everything in the registry: a change to the
user search DTO would be made in a file the users feature does not own.

The registry must stay **eagerly reachable** — it cannot be assembled by
lazy-loaded features registering themselves, or a picker would be missing until
some unrelated route had been visited.

**Scoped pickers are methods, not fields.** When the search only makes sense
inside a parent, take the scope as an argument: `unitsIn(orgId, siteId)`
returns a config bound to that parent.

### 28.5 Keeping the raw id searchable

Removing an id field from a filter form is fine; removing the *ability* to
filter by id is not. Where an id filter already exists, replace the input with a
picker bound to the same control — the control still submits an id, so a
deep-linked or pasted id keeps working while nobody has to type one.

### 28.6 After a create, the list must show it

A create that leaves the table unchanged reads as a failure, whatever the toast
said. Two acceptable endings, and no third:

- **Refetch** (`await this.reload()`) — always correct, and the only correct
  option when the server decides the order, when one write produces several rows,
  or when the response is not the row the table renders.
- **Prepend** the created record (`[created, ...items]`) — for a single row the
  endpoint hands straight back, where a round trip would be visible latency.
  Never append: at the bottom of page 1 of 12 it is indistinguishable from
  nothing happening.

Check what the endpoint actually returns before doing either. A create
that fans out server-side may answer with **a row per child** rather
than one record — type it as a single object and push the array into
your list, and something that saved perfectly well never appears.

### 28.7 A short list is not a table

A table is machinery for comparison and narrowing — a header row, sortable
columns, a filter panel, a pager. Pointed at three records it is all machinery
and no comparison: the operator can already see the whole set, and every control
above it answers a question they do not have.

**Under five records, render cards** (`.record-grid` / `.record-card`) and drop
the filter panel with them. Above that, the table earns its place.

```typescript
const COMPACT_THRESHOLD = 5;

/** The size of the SET, from the first unfiltered read. */
private readonly baselineTotal = signal<number | null>(null);
readonly compact = computed(() => {
  const total = this.baselineTotal();
  return total !== null && total <= COMPACT_THRESHOLD;
});
```

**Measure the set, never the current result.** Filtering two hundred
records down to two must not swap the table and its filters out from under the operator
mid-search — so the baseline is captured only when no criterion is set. This is
the whole reason it is a separate signal rather than `items().length`.

**The threshold is about the data, not the role.** A super-admin on a
fresh install sees one record as a card; the same admin with two hundred
gets the table. Which records a page lists is already decided by the
endpoint it calls (an `_ALL` permission widens it, §30.9), so a separate
"all records" page would duplicate a screen whose only difference is
that choice.

Cards carry the record's own actions — Open, Edit — since there is no row to
click through and no actions column to put them in.

**Render neither until the size is known.** `baselineTotal` starts null, so a
page that defaults to "not compact" paints the filter panel and withdraws it a
moment later — controls appearing and vanishing read as a glitch, not as a
decision. Gate the panel on the baseline having arrived:

```typescript
readonly showFilters = computed(() => this.baselineTotal() !== null && !this.compact());
```

**Where it does not apply:** lists that are normally long — line items,
orders, audit entries. A threshold that never fires is a branch nobody
tests.

### 28.8 Listing tables

- **An empty list has two meanings, and they need different words.** "No
  records found — try a different search" sends a first-time admin looking for
  filters they never set. Branch on whether any criterion is set: nothing found
  offers a way to widen the search, nothing yet offers the way to create the
  first record (`actionLabel` on `app-empty-state`).
- **Every row reaches its detail page** — either the whole row is clickable or
  the first cell is a link. A row with no way through is a dead end.
- Keep a real `<a routerLink>` in the first cell even when the whole row is
  clickable: it keeps the destination keyboard-reachable and visible in the
  status bar. A `(click)` on `<tr>` alone is neither.
- Where the detail route is scoped to a parent (§30), a row can only link
  once a context is selected — fall back to plain text rather than
  assembling a broken URL.
- **A repeated action is an icon, not a word.** Down twenty rows, "Edit" and
  "Delete" are twenty copies of a verb crowding out the data, and the row already
  names the subject. Use `.icon-action` with a symbol from the shell's sprite
  (`#act-edit`, `#act-trash`, `#act-view`), and put the words in `aria-label` and
  `title` so screen readers and hover still get them. `.icon-action--danger`
  colours destructive intent on hover, before the click.
- **Page-level actions keep their text.** There is one of each, there is room,
  and "Edit member" says what is about to be edited. Icons there buy nothing and
  cost a guess.
- **Detail pages own the writes.** Edit, status changes and delete belong on the
  detail view, not scattered across list rows; the list stays a way to find
  things. An inline action is justified only for a one-field toggle that would
  otherwise cost a round trip each way (activate/deactivate).

### 28.9 Confirming an action

**Never `window.confirm`.** It blocks the tab, cannot be styled, announces the
page's origin, and labels its buttons "OK" and "Cancel" whatever the question
was — the same word for archiving a notice and for deleting a site with
sixty tenancies under it.

`ConfirmService` holds the question; one `app-confirm-dialog` in the shell
answers it. A call site says only what it is asking:

```typescript
private readonly confirm = inject(ConfirmService);

async remove(site: SiteDetail): Promise<void> {
  if (!await this.confirm.ask({
    title: `Delete ${site.name}?`,
    message: 'Its floors, rooms and their tenancies go with it.',
    confirmLabel: 'Delete site',
    destructive: true
  })) {
    return;
  }
  …
}
```

- **`confirmLabel` names the act**, never "OK" or "Yes". Read alone it should say
  what will happen: *Delete site*, *Withdraw application*, *Sign out*.
- **`destructive: true`** for anything that removes or cannot be undone. It
  colours the button, and it is the only visual difference between a question
  worth pausing over and a routine one.
- **`message` carries the consequence**, particularly anything outside the record
  in front of the operator — the rooms that go with a floor, the tenancies that
  go with a site.
- Cancel takes focus, and every escape route (Escape, the backdrop, the cancel
  button) answers **no**. A stray Enter must never confirm a deletion.
- The dialog traps focus (`appFocusTrap`) and is an `alertdialog`, because it
  interrupts a task rather than presenting a new one.

### 28.10 Back is not an action

A detail page's action row is for things done **to the record** — Edit, Delete,
Utilities. Back undoes navigation, so putting it in that row gives it equal
weight and lands a destructive control in the middle of a row where a mis-click
is cheap.

Use `app-back-link` above the title: a quiet `‹ Back to buildings` in link
colour, left-aligned, outside the actions.

```html
<section class="stack">
  <app-back-link [to]="RoutePaths.buildings" label="Back to buildings" />
  <app-section-card …>
    <ng-container actions>…Edit, Delete…</ng-container>
```

### 28.11 Show the file, do not just link to it

"Open file" makes every check a new tab and a round trip. An identity document is
an identity photo far more often than anything else, and the question is usually
just "is this the right one".

`app-file-preview` renders images and PDFs inline and falls back to a download
link for what a browser cannot display (`.doc`, `.xlsx`). It reads the kind from
the API's content type when there is one and the extension otherwise, since a
signed URL usually keeps its extension before the query string.

An `<iframe src>` needs an explicitly trusted resource URL, and trusting one
disables Angular's sanitiser — so trust **only** a parsed `http:`/`https:` URL
and fall through to the download link for anything else, whatever put it in the
record.

### 28.12 Search runs in the database, never on the payload

Every filter on every listing table is a request. The form's values go to the
endpoint as query params, the backend filters and pages, and the page renders
what comes back:

```typescript
async search(): Promise<void> {
  this.form.patchValue({ page: 0 });   // a new query starts at the first page
  await this.reload();                 // reload() sends form.getRawValue()
}
```

**Sort is one param, not two.** Spring's `Pageable` resolver reads the direction
out of `sort` itself — `sort=createdAt,desc` — and ignores a separate `direction`.
List forms hold the two apart, so `buildHttpParams` folds them together on the way
out; keep them apart in the form and never hand-build the joined string. Sending
them apart is how a descending sort came back ascending, with the header arrow
flipped and the rows unmoved.

Filtering `items()` client-side is wrong even when it looks identical on screen:
it searches one page of results, so a match on page 3 of 40 simply does not
exist, and the row count in the header stops meaning anything.

Two rules follow from that:

- **Never render a filter the endpoint cannot honour.** Where the same page has
  two data sources — a super-admin list that takes the search DTO and a scoped
  "mine" endpoint that takes nothing — gate the filter panel and the sortable
  headers on which one this operator reaches. Fields that silently do nothing
  are worse than no fields, and they are indistinguishable from a broken API.
- **The exception is a fixed catalogue with no search endpoint.** Roles and
  permissions are served whole and unpaginated, so their list pages filter in
  memory. Whenever such an endpoint gains search, the page moves with it.

### 28.13 Ordering

Ordering is part of the query, not a view preference: it goes to the server with
everything else, and a page never re-sorts the rows it already has.

**One primitive, not a `sortBy()` per page.** `SortState` (`shared/utils/sort-state.util.ts`)
holds the ordering as a list, and `app-sort-header` renders the heading:

```html
<th>
  <app-sort-header [state]="sorting" field="createdAt" label="Created" (sorted)="search()" />
</th>
```

```typescript
readonly sorting = sortState('createdAt', 'desc');
// …and the request carries it:
const params = { ...this.form.getRawValue(), sort: this.sorting.toParams() };
```

**Multi-column ordering is free.** A plain click replaces the ordering, shift or
ctrl/cmd-click appends to it, and `toParams()` emits `['createdAt,desc', 'name,asc']`
which `buildHttpParams` sends as repeated `sort` params — the order they arrive is
the order Spring applies them. A column cycles asc → desc → off, because dropping
a secondary key is a thing an operator wants and a two-state toggle cannot say.

**The active column has to look active.** It takes the accent colour and a solid
arrow; unsorted columns carry a faint `↕` so the affordance is visible before the
hover. Where more than one key is active, each shows its position — "1" is the
primary. A grey caret that appears only on the sorted column is indistinguishable
from decoration.

**Sort keys must be real entity properties.** `Pageable` sorts on the JPA entity,
so `sort=roomName` on a table whose column is a joined `room.name` throws rather
than degrading. Check the entity before adding a header.

### 28.14 Accessibility

The picker modal uses `appFocusTrap` (§21) and closes on Escape via
`trap-escape`. `app-searchable-select` opens on Enter or ArrowDown from its
control, and Enter picks the only remaining match after filtering.

### 28.15 Addresses and other composed values

**One component owns the formatting.** An address, a full name, a
money range — anything assembled from several fields — is written in
exactly one place. Every screen was doing its own `join`, which is how
one record came out three ways on three pages. Take a permissive
shape (`AddressLike`, not `AddressDetail`) so a form's live values, a
list row and a detail page all feed the same component.

**Drop blanks rather than printing dashes.** A record holding only a
city and a county should read "Nairobi, Nairobi County", not a line of
dashes shaped like a complete address.

**Read the hierarchy off the backend; do not assume one chain.**
Administrative divisions frequently branch — two parallel ladders
hanging off a shared parent is common, and flattening them into one
five-level chain states a containment that does not exist. Branch the
UI where the data branches.

**Coordinates are optional, and pasting beats typing.** Offer the map
link first (people have a shared URL, not a decimal pair), the
browser's own location second, the numbers last. Parse the link rather
than asking anyone to dig the pair out of it. A point is both halves
or neither, so report a whole value or `null` — which makes it an
input/output pair, not a `ControlValueAccessor`.

**A person's records belong to the person.** Addresses, documents and
saved preferences outlive any one relationship the app models, and one
person has several. File them under the user's own account, not under
whichever feature happens to consume them.

## 29. Responsive Shell — Phone Layout

The desktop layout is a two-column shell: a persistent sidebar and a content
column. A phone has room for one of those, so below the breakpoints the shell
does not shrink — it changes shape. Two rules govern everything here:

- **Nothing that overlays may push.** Pushing page content down to make room for
  chrome buries the thing the operator opened the page for.
- **Nothing may hide data to save space.** Space is bought by deferring chrome,
  never by dropping a column, a figure, or a label.

### 29.1 Breakpoints

| Width | What changes |
|---|---|
| `≤ 980px` | Sidebar becomes an overlay drawer; `.topbar` with the hamburger appears |
| `≤ 700px` | Grids fall to one column; filter panels switch to bottom sheets |

Both live in `src/styles.scss` and the two component stylesheets that need them.
`--field-max-width` (420px) is a desktop cap and is dropped below 700px — on a
phone it only wastes the width.

### 29.2 A grid with spare height gives it to its rows

`align-content` defaults to `stretch`, so **any** grid taller than its content
spreads that slack between its rows. It has bitten this codebase twice, from
opposite directions:

- **The container is sized.** `.shell` has `min-height: 100vh`. On desktop it
  has one row and nothing shows; on a phone it gains a second (topbar +
  content) and the leftover viewport height is split *between* them — a dead
  band above the header and another below it.
- **A sibling is taller.** `.field` is a grid, and `.grid-auto` makes every cell
  in a row as tall as the tallest. A text input sharing a row with a
  multi-select inherited ~14rem of slack, which `.field` then handed to its
  label and input rows — a plain input rendered at textarea height, with its
  label floating above it.

Any grid that can end up taller than its content — one sized to the viewport,
or one that shares a row with something tall — needs `align-content: start`,
plus explicit rows if it is the sized one:

```css
grid-template-rows: auto minmax(0, 1fr);
align-content: start;
```

`.field`, `.filters` and `.auth-form` carry it. Symptom to recognise: content
correct but *spaced out*, gaps where nothing was authored.

#### 29.2b A mobile constraint is not a desktop default

The filter panel started collapsed on **every** width because the instruction
that produced it — "filter fields should not be opened by default" — arrived in
a message about phone layout, and the rule got applied to both.

The constraint does not transfer, and the numbers say why. `.filters-grid` is
`repeat(auto-fit, minmax(170px, 1fr))`:

| Width | Columns | Ten fields |
|---|---|---|
| ~1100px content | ~6 | 2 rows, ~150px — table still on screen |
| 360px phone | 1 | 10 rows, ~700px — results pushed below the fold |

Nineteen of twenty-eight list pages carry more than four filters, so nearly
every listing in the app was hiding its primary tool behind a click on a screen
with room to spare.

Separate **"has a toggle"** from **"starts closed"**. The first is about field
count, the second about width:

```typescript
readonly collapsible = computed(() => !this.alwaysOpen() && (!this.measured() || this.fieldCount() > FEW_FIELDS));

readonly open = computed(() => {
  if (!this.collapsible()) return true;
  return this.userOpen() ?? !this.phone();   // null = follow the viewport
});
```

The `null` third state is what makes it work: a boolean `userOpen` cannot tell
"never touched" from "deliberately closed", so the viewport default could never
apply. Same tri-state trick as the organisation selection in §30.

Before generalising a layout rule, ask which viewport's constraint produced it.

#### 29.2f Action rows: two per row on a phone, never one

Three fixes, two of them wrong, so the sequence is worth keeping:

1. `.button-row .btn { flex: 1 1 auto }` — **inert.** Most action rows wrap each
   button in an `<app-permission-gate>`, so the flex items are the gates. A flex
   property on a non-flex-item does nothing, on eighteen rows.
2. `flex-basis: 100%` on the items — **overcorrected.** Four stacked full-width
   pills swallowed the top of the card, pushed the record off screen, and made
   Delete the largest target on the page.
3. A two-column grid — right.

```css
.button-row:has(> :nth-child(3)) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
```

An odd last action stays at half width rather than spanning the row. Spanning
looks tidier, but the odd one out is usually Delete, and a full-bleed
destructive button under the thumb is not a tidiness win.

**And `width: 100%` belongs to the wrapped button only.** A gate-wrapped button
must fill its gate, but a plain button IS the flex item — giving it `width: 100%`
made it demand the container's whole width, so Save and Cancel wrapped onto
separate rows on every form in the app. Scope it to the wrapped case:

```css
.button-row > *:not(.btn) .btn { width: 100%; }
```

The lesson generalises: a rule written for a wrapped child is usually wrong for
an unwrapped one, and `> *:not(.btn)` is how you say which you meant.

#### 29.2g One column is not the only phone layout

`.grid-auto` collapsed to a single column below 700px, so "Payment due day" and
"Grace period (days)" each owned a full row on a 500px screen and a six-field
section scrolled like a questionnaire. A floor instead of a fixed count pairs
short fields up on a large phone and still falls back to one column on a small
one:

```css
.grid-auto { grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
```

Fields that genuinely need the width then have to say so. Rather than a modifier
every page must remember, ask what the field contains:

```css
.grid-auto > .field--wide,
.grid-auto > .field:has(textarea),
.grid-auto > .field:has(app-multi-select) { grid-column: 1 / -1; }
```

#### 29.2c Scope is not a filter

The Filters badge read "1" on a page where nobody had typed anything, and Clear
would not shift it. Six list pages mirror the active context into a filter
control:

```typescript
effect(() => {
  const buildingId = this.context.buildingId();
  this.form.patchValue({ buildingId, page: 0 }, { emitEvent: false });
});
```

That control is **scope**, not a filter, and the badge must not count it.
The switcher already states the scope, so counting it again claims the
operator filtered something they did not — and the count never clears,
because Clear resets the control and the effect immediately puts it back.

`app-filter-panel` takes `[scopeControls]="['buildingId']"` and drops those from
the count, alongside the paging/sorting keys it already ignored. When a form
control is written by an effect rather than by a person, ask whether the UI
should report it as something the person did.

**But do not just hide it.** Dropping the count left a list silently narrowed
with nothing on screen saying so. `[scopeLabel]="context.active().buildingName"`
renders a quiet `in b2` beside the toggle — quieter than the badge, because it
reports context rather than counting a choice. An unexplained narrowing is worse
than a wrong badge.

#### 29.2d Put the group label in the gutter; don't sit groups side by side

A record's summary card is four labelled groups. Stacked, each spends a whole
row on its heading and rule — ~120px of pure label — and a one-field group like
Record then spends a second full-width row on one value inside a six-column
grid.

The tempting fix is two groups side by side. It is worse: each group's field
grid then gets half the width, the columns stop lining up between groups, and
the predictable left-to-right scan that makes these pages readable breaks.

Move the label into a left gutter instead (at `min-width: 1100px`):

```css
.detail-group { grid-template-columns: 8.5rem minmax(0, 1fr); gap: 0 1.75rem; }
.detail-group__label { border-bottom: 0; text-align: right; }
.detail-group + .detail-group { border-top: 1px solid var(--border); }
```

Labels now cost no vertical space, every group's fields still start at the same
x, and the rule separates groups instead of underlining a heading.

Reclaiming the label rows is the point; collapsing the groups into one unbroken
block is not. The separator still needs `padding-top: 1.6rem` around it — the
first pass set the group gap to `0` and the card went from airy to airless.

#### 29.2e On a phone, a field is one line, not two

One column turned every field into a label line, a value line, and a 1.35rem gap
— more empty space than content. Put them on one line, value right-aligned:

```css
.detail-grid { grid-template-columns: minmax(0, max-content) minmax(0, 1fr); }
.detail-grid > div { display: contents; }
```

Two things had to be right:

- **`display: contents` on the wrapper, not a grid on it.** Each
  `<div><dt><dd></div>` is its own grid, so an `auto` label column is sized per
  row and the values stagger. Dropping the wrapper's box makes `dt`/`dd` items
  of `.detail-grid` itself, which sizes the column once from the widest label.
  The wrapper still exists in the DOM, so `.lead` keeps matching.
- **Left-aligned values, not right.** Right-aligning throws every value to the
  far edge and opens a lane of empty space down the middle of the card — the
  first attempt did exactly that. Left-aligned in a shared column, the values
  start immediately after the labels and still line up.

#### 29.2a A wrapping grid needs a bigger row gap than column gap

The opposite symptom — content correct but *crammed*, rows running together —
comes from a single `gap` on a grid whose cells are themselves stacks. A
`.field` is a label, an input and often a hint separated by `0.45rem`; a
`.detail-grid` cell is a `dt` over a `dd`. Give such a grid one uniform `1rem`
and the space between one cell's last line and the next cell's first line is
barely more than the space *inside* a cell, so the eye stops seeing rows.

Set the row gap roughly 1.4× the column gap wherever cells stack:

```css
.grid-auto  { gap: 1.4rem 1rem; }        /* form fields */
.detail-grid { gap: 1.35rem 0.9rem; }    /* dt/dd pairs */
```

Corollary: fix it **once, globally**. Three detail pages had pasted their own
`.detail-grid` rule into `styles: []`, and component styles outrank the global
sheet — so the global fix silently skipped exactly those pages. Before declaring
a shared class fixed, grep for components that redeclare it.

### 29.3 Navigation — drawer, not a collapsed rail

`LayoutComponent` carries two independent states, and conflating them is the bug
to avoid:

| Signal | Meaning |
|---|---|
| `collapsed()` | The operator's icon-rail preference. Persisted. **Desktop only.** |
| `drawerOpen()` | Whether the phone drawer is showing. Never persisted. |
| `rail()` | `collapsed() && !mobile()` — the only thing the template may test to hide a label |

A phone must never get the icon rail. It has room for the labels, and an
unlabelled column of glyphs is not a smaller menu, it is a worse one. So every
label-hiding check reads `rail()`, never `collapsed()`.

The drawer is `position: fixed` with `transform: translateX(-100%)`, so it
leaves the grid entirely and overlays the page rather than displacing it. It
must close on **all** of: item selection, any navigation, scrim click, Escape,
and a resize back to desktop. A drawer that survives a tap is a trap.

While off-screen it takes `inert` — a translated element is still focusable, and
tabbing into an invisible menu is worse than no menu.

### 29.4 Filters — deferred, then sheeted

`app-filter-panel` wraps a list page's `<form class="filters">`. It counts its
own projected `.filters .field` nodes in `afterNextRender` rather than taking a
count as an input, because an input drifts the moment somebody adds a field.

| Fields | Behaviour |
|---|---|
| ≤ 4 | Always open, inline, **no toggle**. Nothing worth hiding. |
| > 4 | Starts collapsed. Desktop: expands in place. Phone: opens as a bottom sheet. |

The panel is projected into the section card's `[actions]` slot, so its toggle
shares the **title row** with the primary action rather than spending a row of
its own — on a phone that row is the difference between seeing results and not:

```html
<app-section-card title="Buildings">
  <ng-container actions>
    <a class="btn btn-primary" [routerLink]="…">New site</a>
  </ng-container>

  <app-filter-panel actions [form]="form">
    <form class="filters" [formGroup]="form" (ngSubmit)="search()">…</form>
  </app-filter-panel>
</app-section-card>
```

`<ng-content select="[actions]">` only matches **direct children**, and content
inside `@if` or another component does not reach the slot. Where the filters are
conditional, the panel stays the direct child and the condition moves *inside*
it — the panel removes itself when it counts no fields:

```html
<app-filter-panel actions [form]="form">
  @if (!mine()) { <form class="filters" …>…</form> }
</app-filter-panel>
```

Why a sheet and not an inline expansion on a phone: at one column a field is
roughly 62px, so a 13-field filter form is ~800px — on a ~550px viewport,
expanding it in place pushes the results a screen and a half down. These forms
all apply on an explicit Search, so there is nothing to watch update behind the
sheet, and Search/Clear land in the thumb zone instead of at the end of a long
scroll.

The sheet caps at `85dvh` with its body scrolling, closes on the `submit` event
bubbling out of the projected form (the operator asked for results; show them),
and locks body scroll via `.body--drawer-open`.

Collapsed, the toggle shows a badge counting the filters currently set, read off
the bound `FormGroup` minus `page`/`size`/`sort`. A filter silently narrowing a
list the operator cannot see is the failure mode collapsing introduces, and the
badge is what pays for it.

### 29.5 Never nest a `<form>` inside a page's form

A component that renders its own `<form>` — a picker modal with a search box, a
panel with an apply button — is almost always dropped into some page's form. The
inner submit **bubbles to the outer form**, firing that page's `(ngSubmit)` and
running its search. The operator clicks Search in a modal and the list behind it
reloads; they click something else and an API call they never asked for goes out.

So a control that lives inside a form uses a `<div>`, a `type="button"` action,
and an explicit Enter handler that stops the event:

```typescript
onSearchEnter(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  void this.search();
}
```

The same reasoning applies to any host listening for `submit`: scope it to its
own form (`target.classList.contains('filters')`) rather than trusting that the
only submit it can see is its own.

### 29.6 Tables do not reflow

Listing tables scroll sideways inside `.table-scroll`. They are **not** restacked
into cards on a phone.

These lists carry figures the operator reads *across* rows — rent, due, paid,
outstanding — and a card per row destroys exactly that comparison. A horizontal
scroll on one element is the honest trade: nothing is hidden, and the page
itself never scrolls sideways. Cell padding tightens below 700px; the columns
stay.

### 29.7 A state class must not race the rule it overrides

The bug that shipped twice: a panel whose open/closed state was correct in the
component but ignored by the stylesheet.

```css
.panel__shell--closed        { display: none; }   /* one class  (0,1,0) */
.panel--sheet .panel__shell  { display: grid; }   /* two classes (0,2,0) — wins */
```

The sheet was permanently visible, its close button inert, and — because the
scrim only rendered when the component believed it was open — there was no
backdrop either. The state was never wrong; nothing was listening to it.

Write the two states as **mutually exclusive selectors**, never as a base rule
plus an override that has to out-rank it:

```css
.panel__shell--closed { display: none; }
.panel--sheet .panel__shell:not(.panel__shell--closed) { display: grid; }
```

Two single-class rules that tie on specificity are just as bad — they resolve by
source order, so a reorder silently breaks them. `.sidebar:not(.sidebar--open)`,
not a bare `.sidebar` that `.sidebar--open` happens to follow.

**Verify it in the emitted CSS, not in your head.** Specificity is exactly the
kind of thing that reads correct and behaves otherwise:

```bash
grep -ho "\.your-class[^{]*{[^}]*display:[^;}]*" dist/**/browser/*.js
```

### 29.8 No backticks anywhere inside a component's template or styles

A backtick terminates the template literal. It has broken the build three times
in this codebase, each time from a *comment* — where it looks like harmless
prose:

- in a `styles: [\`…\`]` CSS comment → `Failed to resolve styles`, no line number
- in an HTML `<!-- … -->` comment inside `template: \`…\`` → a cascade of
  `',' expected` errors pointing at unrelated lines
- worst case, the decorator still parses and the component silently stops being
  standalone: `NG2012: Component imports must be standalone…` reported against
  *every page that imports it*, naming files that are not the problem

Write `[selected]`, not a backticked one, in comments. When a build error names
many innocent files, suspect a terminated literal in a component they share.

### 29.9 A modal inside another overlay uses native `<dialog>`

The entity picker opens from inside a filter bottom sheet — an element that is
`position: fixed`, owns a stacking context, sets `z-index`, and scrolls its
body. A hand-rolled `.backdrop` div nested in that is at the mercy of every one
of those ancestors, and debugging it means reasoning about the cascade twice.

Use the platform: `<dialog>` + `showModal()` renders in the **top layer**, above
every stacking context, unclipped by ancestor `overflow`, unaffected by ancestor
`transform`. It brings a focus trap, Escape, and `::backdrop` for free — so no
`appFocusTrap` on a dialog.

```html
<dialog #dialog (click)="onDialogClick($event)" (cancel)="close()" (close)="close()">
  <div class="modal" (click)="$event.stopPropagation()">…</div>
</dialog>
```

```typescript
// Click landing on the dialog element itself is a click outside the panel.
onDialogClick(event: MouseEvent): void {
  if (event.target === this.dialogRef()?.nativeElement) { this.close(); }
}
```

Keep the element **outside** any `@if`. Behind one, a close can destroy it
before `close()` runs and strand the top layer; a closed dialog renders nothing,
so there is no cost to leaving it mounted. Drive it from a signal in an effect,
guarding on `dialog.open` so `showModal()` is never called twice.

### 29.10 Header order: title — filters — space — primary action

The primary action anchors the **end** of the row. It is the highest-intent
control on the page, so it belongs where it is predictable and does not move;
the filter toggle changes width when its badge appears, and a control that
shoves the primary action sideways as you type is worse than one that shoves
itself.

Ordering is `order` on the flex row, not source order, because the panel also
has to fall below the action once its fields are showing inline:

```css
.section-card__header > :first-child           { order: -2; }            /* title  */
.section-card__header app-filter-panel         { order: -1; flex: 0 0 auto; }
.section-card__header app-filter-panel.is-expanded { order: 1; flex: 1 1 100%; }
```

### 29.11 Do not offer a choice of one

A control whose only option is the state you are already in is noise. The
context switcher hides the site select when the active organisation has one
reachable site — it is auto-selected and shown as text instead. Same rule
for the workspace select via `hasChoice()`.

Note "reachable", not "existing": a site-level grant may name one site
inside an organisation that has twenty, and that operator has no choice either.

### 29.12 Focus trapping something that is only sometimes modal

`appFocusTrap` used bare traps for as long as the element exists — right for a
modal rendered inside an `@if`. An element that is an inline region on a desktop
and a dialog on a phone binds the boolean form instead:

```html
<div [appFocusTrap]="sheet() && open()" [returnFocusTo]="toggleElement()"
     (trap-escape)="close()" [attr.role]="sheet() ? 'dialog' : null">
```

The trap activates and releases as the value changes, restoring focus to the
toggle on the way out. Do not trap an element that is merely visible — only one
that is modal.

---

## 30. Active Role — One Role at a Time

An operator who holds two roles — say a platform administrator who also
manages one customer organisation — does two different jobs. The app must
let them do one at a time, not present a merged super-role whose nav
carries both.

This section uses *organisation* and *site* for the two scoping tiers
below a role. Substitute whatever your domain calls them; the shape of
the problem does not change.

### 30.1 One context per role, never a union

`resolveAuthorities` keeps system roles apart in `globalRoles[]`. There is no
single "Administration" workspace: two system roles produce two contexts.

Organisation grants are keyed by organisation — **one role per organisation**. Repeat entries for
the same organisation are site-level slices of that one role, so `mergeReach`
widens `siteIds` and never unions permissions. Merging two different roles
would invent a role nobody was granted.

| Question | Ask | Used by |
|---|---|---|
| What may the **active role** do? | `ActiveContextService.can/canAny/canAll` | nav, `app-permission-gate` — everything that renders |
| Could this user do it **anywhere**? | `AuthSessionService.hasPermission` | route guards deciding whether a URL is reachable at all |

Swap the two and the switcher becomes cosmetic: a nav that asks
"anywhere" renders the same entries whatever the active role, so
switching context changes nothing on screen.

### 30.2 Visibility is scoped; reachability is not

The nav and every gate render from the active role, so a section that role
cannot use is not offered. A **URL** is different — it arrives from a bookmark,
a colleague, or a notification, and refusing it because the operator happens to
be working as something else would be wrong when they hold a role that allows
it.

So `permissionGuard` asks "anywhere", then calls `adoptContextGranting()` to
move to a role that grants it. The operator lands on a working page in the right
role instead of a page with every control hidden, and the switcher shows what
changed. Only when no role would help is it a real denial.

### 30.3 Defaults

- Nothing chosen yet → the SUPER_ADMIN context if held, else the **first role**.
  There is no "My account" option: a permission-less context reads as a role the
  operator can work as, and choosing it showed them an empty app. Personal
  screens are reachable from the nav whatever the active role, so the entry
  bought nothing.
- One organisation → active by default. One reachable site → selected, and the
  site control is replaced by its name (§29.11).
- A signed-in user with **no** role resolves to a `'none'` context rather than
  throwing — every gate closed, and the UI says so.

### 30.4 Three tiers: role, then organisation, then site

Do not fold the organisation into the role. Grouping grants by
organisation gives one option per organisation — "Acme · SITE_MANAGER" —
so switching organisation reads as switching role, and an operator with
a single organisation gets no organisation control at all and cannot
tell what they are acting on.

| Tier | When it appears | Auto-selected |
|---|---|---|
| Role | more than one option (`hasChoice`) | most capable, never "My account" |
| Organisation | the user holds any organisation grant | a stored choice, else **the first** |
| Site | the organisation has >1 reachable site | when there is exactly one |

**One option is shown, just not offered.** A new customer starts with a single
default organisation; rendering nothing for that tier left them unable to tell which
organisation their sites belonged to. One organisation or one site renders as
**text**, two or more render a `<select>` (§29.11). The default organisation is an
organisation like any other — it appears in the tier and can be renamed, or joined by
more, with no special case.

Defaulting to the *first* organisation rather than none is deliberate: the scoped list
endpoints need an organisation, so an unscoped page falls back to the platform-wide
route and 403s for exactly the roles this tier exists for. Every tier persists
per user in `localStorage`, so a deliberate choice always outranks the default.

Organisation grants therefore group by **role name**: being ORG_ADMIN of three
organisations is one job done in three places. Changing a tier clears every tier
below it — an organisation belongs to one role, a site to one organisation.

`syncFromRoute` resolves the role *from* the organisation, not the other way round: a
user may hold different roles in different organisations, so the URL's organisation decides
which role option is active.

### 30.5 The context is a filter, not decoration

A selected organisation or site has to change what the lists show, or it is a
label pretending to be a control.

- **Sites** with an organisation selected shows that organisation's sites.
- **Records** with a site selected shows that site's records; clearing
  the site widens back to the organisation.

Seed the filter control from the context and follow it, guarding against the
loop where writing the control re-triggers the effect:

```typescript
effect(() => {
  const siteId = this.context.siteId();
  if (this.form.controls.siteId.value === siteId) { return; }
  this.form.patchValue({ siteId, page: 0 }, { emitEvent: false });
  void this.reload();
});
```

The control stays editable — the context sets a default, it does not lock the
page.

### 30.6 Scope the request, not just the filter

Seeding a filter from the context is not enough: the platform-wide endpoint
usually needs the `_ALL` permission an organisation role does not hold, so for that
role it does not merely return too much — it returns 403.

Ask the **narrowest endpoint the context allows**:

| Context | Records | Sites |
|---|---|---|
| organisation + site | `getRecordsForSite` | — |
| organisation only | `getRecordsForOrg` | `getSitesForOrg` |
| nothing selected | `searchRecords` (needs `RECORD_READ_ALL`) | `searchSites` (needs `SITE_READ_ALL`) |

Each tier offers only what the tier above it contains: the organisation list is the
organisations the user **administers** (from `orgRoles[]`, never a global organisation
list), and the site list is fetched per selected organisation and then filtered
again by `restrictedToSiteIds()` — a `SITE_LEVEL` grant reaches only the
sites it names, even inside an organisation it belongs to.

### 30.7 `_ALL` means the whole platform, and belongs to super admins

`ORG_READ_ALL`, `RECORD_READ_ALL` and `SITE_READ_ALL` list **everything on
the platform**. An organisation admin does not hold them and must not: they see the
organisations they administer, and the sites and records inside those.

The scoped path is therefore a **different endpoint**, not the same one returning
fewer rows. Asking for the platform list without the permission is a 403, not a
short list.

**Read the guard, not the URL.** A scoped-looking route is not automatically the
scoped one: `/v1/records/organisation/{id}` was once guarded
`hasOrgAccess(id, 'RECORD_READ_ALL')`, which no organisation admin could satisfy
despite the path naming their organisation. Check the `@PreAuthorize` before assuming
a path implies its own scope — and when the frontend has to work around a guard
that looks wrong, say so rather than site the workaround permanently.

| Context | Sites | Records |
|---|---|---|
| super admin, no context | `GET /sites` | `GET /records` |
| any role, organisation selected | `GET /sites/organisation/{id}` | `GET /records/organisation/{id}` |
| organisation scoped + site | `GET /sites/organisation/{id}` | `GET /records/{orgId}/{siteId}` |
| no organisation, no `_ALL` | `GET /sites/my-sites` | prompt to pick an organisation |

Only the platform-wide routes (`/sites`, `/records`) require `_ALL`; every
scoped route takes the plain permission within the organisation or site named in
the path.


```typescript
if (this.context.can(PermissionConstants.ORG_READ_ALL)) {
  … searchOrganisations(params)      // super admin: every organisation
} else {
  … getMyOrganisations()             // only the organisations this user administers
}
```

Writes are narrower still. Whether Edit, Delete or Add appears depends on the
**selected** organisation, because an organisation context draws its permissions from that
organisation's grant. One person can be ORG_ADMIN of one organisation and SITE_MANAGER of
another, and the buttons change as they switch — no page special-cases that, it
falls out of `activePermissions()`.

### 30.7b Organisation-granted permissions are per organisation; "all" is a real state

Two tiers of permission arrive from the backend and they behave differently:

- **System permissions** (`profile.roles[]`) apply everywhere.
- **Organisation permissions** (`profile.orgRoles[]`) apply **only in the organisation
  that granted them** — never across every organisation the user administers.

`activePermissions()` therefore draws from the *selected* organisation's grant, not a
union. Verified: a user who is ORG_ADMIN of organisation 1 and SITE_MANAGER of organisation 2
has `RECORD_CREATE` in 1 and not in 2, and the buttons follow the switcher.

The organisation tier is **tri-state**, and the three differ:

| `selectedOrganisationId` | Meaning |
|---|---|
| `undefined` | never chosen — the first organisation is used |
| `null` | explicitly **all my organisations** |
| number | that organisation |

Collapsing "not chosen" into "all" silently unscopes every list, so persistence
uses key *absence* versus an explicit `null` (`'orgId' in stored`, not `??`).

Work that cuts across the portfolio — a broadcast, a portfolio total — sets
"all" and reads `scopedOrganisationIds()`, which returns the selected organisation or every
organisation the operator holds a grant in. Iterating that list means such an action
only ever reaches organisations the backend will accept it for. Screens that need one
organisation keep prompting through `context-guard`'s `'pick-organisation'`.

### 30.7c One destination, one nav entry — named for who is reading it

"Organisations" and "My organisations" pointed at screens that returned the same rows for
an organisation admin, which reads as two features that happen to agree. There is one
destination; what differs is its **scope**, and the scope is already decided by
the permission.

So the nav entry carries an alternate label instead of a twin:

```typescript
link('Organisations', '/admin/organisations', 'dot', {
  permissions: ['ORG_READ_ALL', 'ORG_READ'],
  platformLabel: 'All organisations',
  platformPermission: 'ORG_READ_ALL'
})
```

An organisation admin sees **Organisations** (theirs); a super admin sees **All organisations**.
Same for Sites and Records. Both names are true, and neither implies a second
screen.

### 30.7d Never bind `[value]` on a `<select>` with looped options

```html
<select [value]="active().key">          <!-- WRONG -->
  @for (o of options(); track o.key) { <option [value]="o.key">…</option> }
</select>
```

The property is set before the options exist, so the browser cannot match
it and falls back to the **first option**. The control then displays a
value that is not in effect — a switcher reading "Organisation admin"
while the active role is SUPER_ADMIN, disagreeing with the summary line
beside it.

Bind `[selected]` per option instead; it is evaluated once each option exists:

```html
<option [value]="o.key" [selected]="o.key === active().key">…</option>
```

Static `<option>` lists are unaffected, which is why this hides so well: the same
pattern works everywhere except the one place it matters.

### 30.7e The organisation tier belongs to roles that work *inside* an organisation

One permission is the discriminator — the one that means "may see an
organisation as a thing to administer". It separates the roles cleanly:

| Role | Holds `ORG_READ` | Organisation tier |
|---|---|---|
| ORG_ADMIN, SITE_MANAGER | yes | shown — they choose which organisation they are working in |
| SUPER_ADMIN | yes (holds everything) | shown — may scope to any organisation they administer |
| END_USER | **no** (only `SITE_READ`) | hidden |
| GUEST, other non-org roles | no | hidden |

An end user's site is settled by their own record, not chosen from a menu:
offering the tier asks them to administer something they merely belong to.
A role from another part of the product never touches a site at all. In both
cases the scope still **resolves** silently so their screens address the right
ids — it is the *control* that disappears, not the scoping.

By permission, never by role name (§30.1): the seeder changes, and a new
organisation-side role should inherit the tier without anyone editing this.

Corollary: when a role has one option and no organisation tier, render **no switcher**.
A control that opens an empty panel is worse than no control.

### 30.8 Always show the active context

An operator must never have to open a menu to find out which organisation or site
they are acting on. The switcher renders a summary line **above** its controls,
and the phone topbar repeats it, because the drawer that holds the switcher is
closed by default there.

A super admin works globally: no organisation tier appears, nothing needs choosing,
and the whole selection persists per user in `localStorage` so it survives a
reload.

### 30.9 Gate on the operation, not on the platform-wide permission

The registry pairs most operations: an `_ALL` permission that reaches every
record on the platform, and a plain one that reaches only what the caller's
organisation or site grant covers. `RECORD_READ_ALL` / `RECORD_READ`,
`INVOICE_READ_ALL` / `INVOICE_READ`, and so on.

**A gate must accept either half.** Asking only the `_ALL` question hid most of
the app from every organisation role — an ORG_ADMIN holds `RECORD_CREATE`,
`RECORD_READ` and `RECORD_WRITE`, and saw no Records section at all, because
only SUPER_ADMIN holds the `_ALL` forms.

Express the union once in `PermissionSets`, never inline per screen:

```typescript
export const PermissionSets = {
  RECORD_VIEW: [P.RECORD_READ_ALL, P.RECORD_READ, P.SINGLE_RECORD_READ],
  RECORD_CREATE: [P.RECORD_CREATE, P.SITE_RECORD_MANAGE],
} as const;
```

```html
<app-permission-gate [permissions]="PermissionSets.RECORD_CREATE">
```

Two standing rules:

- **Declare every permission the backend registers.** A missing one is
  invisible while only super admins are testing — the gap is almost
  always the *scoped* half of a pair, so it surfaces the first time an
  organisation role signs in. A permission the frontend has never heard
  of can never open anything.
- **Never encode which role holds what.** Role→permission mappings live in the
  backend seeder and change at any time. The UI knows only permission *names*
  and asks whether the active role has them.

When adding a screen, check the registry for the scoped sibling of whatever
`_ALL` permission you reached for first.

### 30.10 One `<ng-content />` per component, ever

A wrapper that renders its children in more than one branch **must not** declare
`<ng-content />` in each. Angular projects a component's children into a single
outlet; the same slot declared twice leaves whichever branch is active rendering
nothing.

This is how a route-addressed site page came out blank while its API call
returned perfectly good data: the guard had an `<ng-content />` in its
"ids supplied, authorised" branch and another in its final `@else`, and the
children belonged to only one of them.

Collapse the branches to a single verdict and give it one outlet:

```typescript
readonly gate = computed<'ok' | 'denied' | 'pick-organisation' | ...>(() => …);
```

```html
@switch (gate()) {
  @case ('denied') { … }
  @default { <ng-content /> }
}
```

Symptom to recognise: **a blank region, with no error and no empty state**, in a
component that wraps projected content. A `select`-ed slot has the sibling
constraint from §29.4; this is the default slot's version of it.

### 30.11 This is still not a security boundary

Narrowing here stops the UI offering controls that belong to a different job. It
enforces nothing — the server authorises every request against the user's real
grants. Never treat a hidden control as a protected one.

---

## 31. Forms Must Speak — Validation and Backend Errors

**Every form shows both kinds of failure: invalid controls before the request,
and the backend's rejection after it.** A form that refuses to submit and says
nothing is indistinguishable from a broken button — the operator clicks Save, no
request goes out, no message appears, and the page looks dead. A form that
submits and silently discards a 400 is the same failure one step later.

`if (form.invalid) { markAllAsTouched(); return; }` is only defensible when the
form then *shows* what is wrong (§31.1). A `catch` around a mutation is only
defensible when it renders what came back (§31.2).

### 31.1 Never hand-write the messages

Written by hand they get written for some fields and forgotten for others. An
audit of this repo found 53 components using `Validators` and **10 with no error
markup at all** — including every auth page, so a failed signup or login said
nothing whatsoever.

Use `app-field-error`, which derives the message from the validators already on
the control:

```html
<label class="field">
  <span>Phone number</span>
  <input formControlName="phoneNumber">
  <app-field-error [control]="form.controls.phoneNumber" label="Phone number"
                   patternMessage="9-15 digits, optionally starting with +." />
</label>
```

It handles `required`, `email`, `minlength`, `maxlength`, `min` and `max` on its
own. `pattern` is the one validator whose meaning only the page knows, so it
takes `patternMessage`; `messages` overrides any key.

Timing is part of the contract, and it has three parts:

1. Hidden until the control is **touched** — nothing accuses a field the
   operator has not reached yet.
2. Hidden **while the field has focus**. An email is genuinely invalid at
   `j`, `ja`, `jane@` — saying so on every keystroke is nagging, not help.
   Judge a field when they leave it.
3. Shown on **submit** regardless, read from the injected
   `FormGroupDirective.submitted`, so pressing Save reveals everything
   outstanding at once.

The focus half comes from `focusin`/`focusout` on the component's parent
`.field` label — the input lives in that same label, so the label's focus events
are the field's.

Reactivity comes from `control.events`, not `statusChanges`: touched is half of
when a message should appear and `statusChanges` never reports it.

### 31.2 Every form shows backend errors too

Client validation is half the contract. A form that passes validation and then
fails on the server must say so **in the form**, next to the button the operator
pressed. A request that vanishes is the same dead button as a silent
`form.invalid`.

So every submitting form shows **both**:

| Failure | Rendered by | Where |
|---|---|---|
| A control is invalid | `app-field-error` (§31.1) | under that field |
| The request was rejected | `app-error-card` | above the submit row |

```typescript
readonly saveError = signal<ApiError | null>(null);

try {
  await firstValueFrom(this.service.update(id, payload));
} catch (error) {
  this.saveError.set(toApiError(error));   // never extractErrorMessage() here
}
```

```html
@if (saveError(); as apiError) {
  <app-error-card
    [title]="apiError.status === 409 ? 'Already exists' : 'Unable to save'"
    [message]="apiError.message"
    [details]="apiError.details"
  />
}
```

**Use `toApiError`, not `extractErrorMessage`, for anything that mutates.**
`extractErrorMessage` returns `message` only and throws away `details[]` — which
is exactly the per-field list a 400 carries, the part that tells the operator
*which* field the server rejected. Reserve `extractErrorMessage` for loads,
where there is no field to blame and `app-error-state` is the right shape.

Clear the error when a fresh attempt starts, so a stale failure never sits under
a form that has since been fixed. Never rely on a toast alone: it disappears,
and it does not sit next to the field.

Rules that follow from this:

- **Never swallow.** An empty `catch {}` around a mutation is a bug.
- **Keep the operator's input.** On failure the form keeps its values; never
  reset or navigate away from a rejected submit.
- **Re-enable the button.** Reset the pending flag in `finally`, or a failed
  save leaves a permanently disabled control.
- **Say what the status means.** Map at least `409` (conflict) and `422`/`400`
  (validation) to a title in the operator's language; the raw code is not copy.

### 31.3 A failed mutation must not replace the page

The commonest shape of this bug is a detail or form page with one `error`
signal, rendered by `app-error-state`, and a delete or save `catch` that writes
into it. The failure then *replaces the record with a "retry the load" button* —
the operator loses the page they were on and is offered the wrong recovery.

Keep them apart:

```typescript
readonly error = signal<string | null>(null);        // the load  -> app-error-state
readonly actionError = signal<ApiError | null>(null); // the save  -> app-error-card
```

Stores get the same split: `error` for loads, `mutationError` for writes. Any
navigation that follows a mutation must gate on the mutation's own outcome —
`if (!store.mutationError())`, never `if (!store.error())`, or a failed save
still navigates away.

### 31.4 Mark required fields, and take the operator to the error

Both come from one directive on the form — `appFormFeedback` — because both are
things every form needs and no form remembers:

```html
<form [formGroup]="form" (ngSubmit)="submit()" appFormFeedback>
```

**A red asterisk on every required field.** The directive reads
`control.hasValidator(Validators.required)` and adds `field--required` to the
wrapping label; the stylesheet renders the marker. Derived from the validators,
so a field cannot be required in TypeScript and unmarked in the template — the
two cannot drift. The asterisk is decorative: assistive tech gets requiredness
from the control, so it must not be announced as "star".

**Scroll to the first invalid control on submit.** A long form submitted from
the bottom rejected silently — `Name is required.` sat three screens up, out of
sight, and the button read as dead. The directive listens on the **native
`submit`**, which fires before the component's `ngSubmit` handler returns early
on `form.invalid`, then scrolls the first `.ng-invalid` control into view and
focuses it.

Focus the control, not the wrapper: a custom control (`app-searchable-select`,
`app-room-picker`) is `.ng-invalid` on its host element, and the thing a person
types into is a descendant.

Caveat worth knowing: `hasValidator` matches the exact `Validators.required`
reference, so a control wrapped in `Validators.compose([...])` will not be
marked. Nothing in this codebase composes; if that changes, mark those controls
explicitly.

**The marker is only as honest as the validators, so audit them against the
DTO.** A field the backend annotates `@NotNull` and the form leaves optional
produces a 400 the operator could not have predicted — one form here let
`paymentDueDay`, `monthlyRent`, `securityDeposit`, `numberOfFloors` and
`roomsPerFloor` through unmarked. Extract the truth from the source rather than
reading forms:

```bash
# fields carrying @NotNull / @NotBlank / @NotEmpty in a CreateRequest
grep -B4 'private .* \w\+;' SomeDtos.java | grep -E '@(NotNull|NotBlank|NotEmpty)'
```

Watch for the harder case: a column that is `NOT NULL` in the schema but carries
no `@NotNull` on the DTO. Bean validation passes, the insert fails, and the
operator gets a 409 about a column name they have never heard of
(`rent_arrears_generate_day`). Require it in the form and report the mismatch —
the real fix is the missing annotation.

### 31.5 Check the regex, not just the form

```typescript
Validators.pattern(/^\\+?[0-9]{9,15}$/)   // shipped in 5 forms
```

`\\+?` is *one or more backslashes*, lazily — not an optional `+`. No phone
number could match it, so signup, phone login, password set, verify and admin
user creation were all permanently unsubmittable, silently. The escape was
doubled as if the pattern were a string; in a regex literal it is not.

Test a pattern against real inputs before trusting it:

```bash
node -e "const re=/^\+?[0-9]{9,15}$/; ['+254712345678','0712345678'].forEach(v=>console.log(v,re.test(v)))"
```

---

### 22.1 An empty state must not stand in for loading or failure

`@if (items().length === 0) { "None yet" }` is a lie whenever the list is still
loading or the request failed. It reads as a fact about the data when it is
actually a fact about the request — and it hides the retry the operator needs.

Every projected list renders **four** states in this order:

```html
@if (loading()) { … } @else if (error()) { … retry … } @else if (!items().length) { … } @else { … }
```

The usual failure is a secondary list on a page that gets this right
elsewhere: a picker beside the main card announcing "nothing to assign
yet" while its fetch is still in flight, and still announcing it after
records are added, because it loads once in `ngOnInit` and never again.
A list that any other action on the page can invalidate must be
re-fetched by that page's `reload()`, not only on init.

---

## 33. Two Audiences, Two Interfaces

The same signed-in app serves people doing two different things, and the split is
not cosmetic:

| Audience | Wants | Shape |
|---|---|---|
| **Operators** — anyone administering other people's records | a control room | figures first, then what needs attention, then the tools |
| **Visitors** — signed in, nothing of their own yet | somewhere to go | a few destinations, no chrome, no jargon |
| **Members** — one record of their own | just their own | between the two: their balance, their documents, no portfolio |

**Decide by permission, never by role name.** Role lists are backend data that
change; "can this person manage other people's records" is exactly what the
read permissions already answer:

```typescript
readonly isOperator = computed(() => this.context.canAny([
  P.SITE_READ, P.SITE_READ_ALL, P.RECORD_READ, P.RECORD_READ_ALL,
  P.CATALOG_READ_ALL, P.ORDER_READ_ALL, P.USER_READ_ALL
]));
```

Hardcoding `roleName === 'ORG_ADMIN'` breaks the moment a role is renamed or
a new one is seeded — and §30.1 already forbids it for gating.

### 33.1 Whatever the role does most sits under the dashboard

The nav order is not fixed. The dashboard and context switcher stay first for
everyone; what comes **next** is whatever that role actually does:

| Role | Second section |
|---|---|
| org-side operators | **Operations** — the records they manage all day |
| members, visitors | **My account** — their own records |
| other admins | default order (their work lives elsewhere) |

A nav ordered by how the app is built rather than by who is reading it
buries the operations group under admin and unrelated product areas,
putting a site manager's whole day three clicks down. Select the
org-side roles with the same permission the context switcher uses for
its organisation tier (§30.7e), so one test decides both.

**"Under the dashboard" means under the dashboard, not under the lead section.**
Hoisting to just after the lead section is not the same thing, because
that section usually holds the dashboard *plus* a handful of utility
links — so the hoisted group lands fifth and looks untouched. Give the
dashboard a section of its own (`id: 'dashboard'`) and put the utility
links in a second unlabelled section behind it, so the hoisted group
slots between them:

```typescript
const afterDashboard = rest.findIndex((section) => section.id === 'dashboard') + 1;
```

Two unlabelled sections render as one unbroken list — no heading, no rule — so
nothing changes visually for a role with nothing to hoist. `NavSection` gained a
required `id` for this, which is also the `@for` track key: `section.label` no
longer identifies a section once two of them have no label.

**A scoped read permission does not mean "operator".** A member often
holds the read permission for the one site they belong to, and treating
that as operator-hood hands them an operator's nav and an operator's
dashboard. Managing *other people's* records is a different permission.
Define the test once and let the layout and the dashboard both consume
it — two copies will disagree.

**Reduce the page count too.** Nine sibling entries describing the same
person (Profile, My membership, My documents, …) make the reader guess
which one holds the field they want. Merge by **navigation, not by
rewriting**: a tab host renders the existing route components in place,
so each keeps its own loading, error and empty handling and nothing is
re-implemented.

**Merge what shares an owner, not what shares a menu.** Tabs assert that
their panels are faces of one thing, so merging by adjacency in the nav
states something false. Two records about the same person are still two
records when one belongs to the person and the other belongs to an
organisation that holds a relationship with them — different owners,
different lifetimes, and often several of the second per person.

So the test is ownership, not position: panels hanging off the *same*
record become tabs, and anything with a different owner stays its own
destination.

**Fewer pages, not less content.** Do not gate the merged tabs on permissions —
that deletes the content instead of consolidating it. Tabs hidden behind an
"owns a record" check made Documents unreachable for exactly the person
about to upload the documents needed to create one. Show every tab; let each panel say "nothing here yet" (§22.1). A
missing tab is a dead end; an empty panel is an answer.

```html
@switch (active()) {
  @case ('record')    { <app-my-record-page /> }
  @case ('documents') { <app-my-documents-page /> }
  @default            { <app-profile-page /> }
}
```

Two things this costs, both cheap: an embedded component that reads
`route.snapshot.data` needs that key declared on the **host** route (`mine: true`),
and the old paths should stay routed so existing deep links keep working even
once the nav entry is gone.

And put the answer where the question is asked: if someone opens the
dashboard to ask "do I owe anything", the balance belongs on it — not
behind a nav entry that makes them go and look.

### 33.2 The public front door is not the app shell

`/` renders a landing page **outside** the app shell: no sidebar, no
context switcher, no role. Someone arriving from a link is deciding whether the product
is for them, and operator chrome answers a question they have not asked. Once
there is a session the page offers "Open dashboard" rather than redirecting, so
a returning visitor is not bounced past what they came back to read.

### 33.3 Placeholder content is labelled as such

Sample figures on a dashboard must say they are samples. An unlabelled
placeholder that reaches a demo is indistinguishable from a wrong number, and
whoever sees it will act on it.

---

## 32. Feedback, Credentials & Where a Save Lands

### 32.1 Toasts collapse, and every one self-dismisses

A toast is a *notice*. The record of a failure is the page's own error card
(§31.2), which sits next to the control that caused it and stays until fixed.
So the toast may — and must — go away on its own.

- **Identical messages collapse**, they do not stack. One rejected permission
  fails several parallel requests; six copies of the same sentence is one piece
  of information repeated until it covers the page. Increment a count on the
  existing toast and restart its timer.
- **Everything self-dismisses**, errors included: 4.5s for info/success, 9s for
  warning/error. Errors used to persist so assistive tech had time to read them;
  an undismissable pile is its own accessibility failure, and the assertive live
  region has already announced it.
- **Cap the stack** (3). Past that the oldest goes.

### 32.2 Status is never carried by a border alone

A toast appears away from where the operator is looking, so its severity has to
register peripherally. The palette's own rule applies (see the token header):
the darkened accents converge in luminance, so colour never carries meaning by
itself.

Each variant therefore gets a **tint, a glyph and a border**: `--danger-tint`
plus a 4px `--danger-fill` edge and `✕` for errors, and the matching triple for
success, warning and info. The 1px border alone was invisible at a glance.

### 32.3 Password fields

Use `app-password-input` — never a bare `<input type="password">`.

- A **reveal toggle**, `type="button"` so it cannot submit the form around it,
  with `aria-pressed` and a label that changes with state.
- `autocomplete="current-password"` on a login, `new-password` everywhere one is
  being set.
- **A confirmation field wherever a password is being created or set** — signup,
  password-set, password-reset, change-password. Not on login: there is nothing
  to mistype twice.

The confirmation validator lives on the **confirmation control**, not the group,
so `app-field-error` has a field to render under:

```typescript
confirmPassword: ['', [Validators.required, matchesControl('newPassword')]]
```

Pair it with a subscription that re-judges the match when the password itself is
edited afterwards, or the confirmation keeps a stale verdict:

```typescript
this.form.controls.newPassword.valueChanges
  .pipe(takeUntilDestroyed())
  .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
```

### 32.4 A save lands on the record, not the list

After creating or updating, navigate to **that record's detail page**. The
operator's next move is almost always about the thing they just made — assign
its roles, add its rooms, publish it — and a list forces them to find it again.

```typescript
const saved = await firstValueFrom(this.service.create(payload));
await this.router.navigateByUrl(RoutePaths.thingDetail(saved.id));
```

Where a store owns the write, have it keep the created record so the page can
read the id back (`store.selectedUser()`), and gate the navigation on
`mutationError` (§31.3) so a failed save stays put.

The only acceptable reason to land on the list is that **no detail route
exists** — currently app notices and partial-payment policies. That is a gap to
close, not a pattern to copy.

---

## 35. Show the Provisional State, Marked as Provisional

Many records carry a value twice: the one that has been *settled* and the
one that has only been *proposed*. A room assigned versus a room intended,
a delivery date confirmed versus requested, a price agreed versus quoted.
The settled field is null until the record advances.

Rendering only the settled field puts a dash in the cell — so a record
with a perfectly clear intention looks identical to one where nobody has
decided anything. That is the opposite of the truth, and it is the cell
an operator is reading precisely to find out which case they are in.

**Fall back to the proposed value and label it.** One component takes
both, prefers the settled one, and marks the other:

```html
<app-value-link
  [id]="row.settledId ?? row.proposedId ?? null"
  [label]="row.settledId ? row.settledLabel : null"
  [provisional]="!row.settledId && !!row.proposedId"
/>
```

Four rules make it hold up:

- **Pass the label that belongs to the id.** A settled label beside a
  proposed id is worse than no label — it is confidently wrong. Guard
  each label on the field it describes, exactly as above.
- **Link it in both states.** The thing exists either way, and the
  reason anyone looks at the cell is to go and see it.
- **Mark it in text, not colour alone** (§37.3) — "intended", "requested",
  "quoted". A tint says *something* is different without saying what.
- **Do not duplicate the row.** A separate "proposed" row earns its place
  only once a settled value exists *and differs*. While the record is
  unsettled, the proposed value already **is** the row.

`#<id>` stays as a last-resort fallback for records carrying neither
label — an id is worse than a name, but far better than an empty cell.

---

## 34. Charts and Figures

### 34.1 The status trio is not a chart palette — this was measured

`--success` `#4e614e`, `--warning` `#7a5c33` and `--danger` `#7a4230` are the
three status tokens, and they were run through a palette validator rather than
eyeballed. They fail:

| Check | Result |
|---|---|
| Lightness band | PASS |
| Chroma floor | **FAIL** — all three read close to gray |
| CVD separation | **FAIL** — worst adjacent pair ΔE 4.0 (protan) |
| Normal-vision floor | **FAIL** — worst pair ΔE 7.1, against a floor of 15 |
| Contrast vs surface | PASS |

The normal-vision failure is the damning one: a reader with full colour vision
cannot reliably tell warning from danger when the two sit side by side as bare
fills. The token file already says why — the accents were darkened to pass WCAG
AA on paper, and darkening converged their luminance.

So: **never build a stacked bar, pie or segmented meter keyed by status colour.**
The tokens are fine where they were designed to work — a chip, a row of text,
a delta — because there each one carries a glyph and a word beside it.

For a status breakdown, use a **labelled list with one-hue bars**: the row's text
carries identity, the bar carries only magnitude. `HomePageComponent`'s
`breakdown` is the worked example.

### 34.2 The rest of the house rules

- **Magnitude gets one hue.** `--primary` for the fill, `--surface-2` for the
  unfilled track. A single series needs no legend — the card title names it.
- **Never two y-axes.** Two measures of different scale are two charts.
- **Round the data end only.** `border-radius: 4px 4px 0 0` on a column so it
  reads as standing on the baseline rather than floating.
- **A recessive baseline, not a grid cage.** One `1px solid var(--border)` under
  the plot; no horizontal gridlines.
- **Tick labels go in their own row**, outside the plot. Put a label inside the
  column and it steals height from the bar it labels.
- **Direct-label selectively** — the current period, or the outlier. Never every
  point.
- **Text wears text tokens.** A value or label is `--text` / `--text-muted`, never
  the series colour.
- **`role="img"` plus an `aria-label` that reads the series out** as a sentence.
  The columns themselves are decoration to a screen reader.
- **Proportional figures for big numbers, `tabular-nums` only in columns.**
  `tabular-nums` gives every digit the width of a `0`, which makes a hero figure
  look loose. Reserve it for stacked rows of numbers that must align.

### 34.3 A delta needs a glyph, not just a colour

`tone` is the *meaning* and `direction` is the *arrow*, and they are separate
fields for a reason: arrears rising is bad, collections rising is good, and both
are `up`. Colour reinforces; the arrow states. Same rule as the status chips
(WCAG 1.4.1).

```ts
interface Delta {
  value: string;                              // "6.2%"
  direction: 'up' | 'down' | 'flat';          // the glyph
  tone: 'good' | 'bad' | 'neutral';           // the colour
  period: string;                             // "vs August"
}
```

### 34.4 Sample data must say it is sample data

Every placeholder figure ships under `Sample figures — not yet wired to live
endpoints.` An operator who trusts a made-up number and acts on it is a worse
outcome than an empty state.

---

## 36. Density — Fewer Screens, Uniform Rhythm

A page that scrolls is a page someone has to hold in their head. Most of the
scrolling in this app was never content: it was space between content, one field
per row where three would fit, and buttons sized for nothing in particular.

The goal is not "tight". It is **uniform** — one rhythm, one set of alignments,
so the eye stops re-measuring on every block.

### 36.1 The spacing scale

Six values. Anything else needs a reason in a comment.

| Step | Where |
|---|---|
| `0.4rem` | label to its own control, chip to chip |
| `0.5rem` | buttons in a row, tight inline groups |
| `0.6rem` | rows in a compact list, group label to its fields |
| `0.75rem` | blocks inside a card |
| `1rem` | columns in any grid; cards in a `.stack` |
| `1.15rem` | rows in a form grid; between a form's own sections |
| `1.6rem` | between labelled groups, around a separating rule |

Below `0.3rem` is a hairline, not a step — a two-line context label, an icon
against its own text. Those stay as authored.

**Write the scale from what the code actually does.** The first version of this
table listed five values and omitted `0.75rem`, which was the single most-used
gap in the project — a scale nothing follows is worse than no scale. Count
first:

```bash
grep -rhoP "gap: \K[0-9.]+rem;" --include=*.ts src/app | sort | uniq -c | sort -rn
```

The tail is the problem, not the head. 67 declarations sat on values like
`0.35`, `0.45`, `0.65`, `0.9`, `1.25` — each a plausible one-off, together a
page with no rhythm at all. Snap the band to the nearest step and leave the
hairlines alone.

**Row gap > column gap, always.** A grid cell is a stack (label over control,
`dt` over `dd`); a column gap only has to separate two things side by side. Equal
gaps make the rows read as one block — see §29.2a.

**Never pad and gap the same seam.** A `gap` on the parent plus `margin-top` on
the child is two people solving one problem, and the total is whatever they
happen to add up to on that page.

### 36.2 Short things share a row

The default is not one field per row — the default is *as many as fit at a
sensible minimum width*:

```css
.grid-auto { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }

@media (max-width: 700px) {
  .grid-auto { grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
}
```

A phone is not automatically one column. "Payment due day" and "Grace period"
are four characters of input; giving each a full 500px row turns a six-field
section into a questionnaire (§29.2g).

Things that need the width say so by what they *contain*, not by a modifier each
page has to remember:

```css
.grid-auto > .field--wide,
.grid-auto > .field:has(textarea),
.grid-auto > .field:has(app-multi-select) { grid-column: 1 / -1; }
```

Same rule for actions: **Save and Cancel belong on one row.** Two actions share a
row at every width; three or more become a two-column grid on a phone, never a
stack of full-width pills (§29.2f).

### 36.3 Alignment is a promise

- **One left edge.** Every label, control and value in a card starts at the same
  x. A control that is centred or indented "because it looked better" breaks the
  scan for every row after it.
- **Values align to each other, not to their labels.** On a phone this means one
  shared label column via `display: contents`, not a per-row `auto` column that
  staggers (§29.2e).
- **Primary actions top-right, always.** Muscle memory is worth more than local
  optimisation.
- **Destructive actions last, and never full-bleed.** If Delete is the widest
  control on the screen, the layout is arguing for something nobody wants.
- **Group labels in the gutter on wide screens** (§29.2d). A heading that owns a
  whole row costs ~30px per group and buys nothing.
- **Two or more actions get their own row.** Squeezed into the slack beside a
  card title they become a narrow column of half-buttons wrapping at odd points.
  One action can share the title's row; past that, `flex: 1 1 100%`.

### 36.3a Case: sentence, not upper

Field labels are sentence case. Uppercase reads as a *structural* marker, so
using it for the group heading **and** every field inside gives the two the same
voice — and `ARREARS GENERATION DAY` is measurably slower to read than
`Arrears generation day`, because all-caps strips the word shapes the eye scans
by.

Uppercase survives in exactly one place: the group label. There is one per
group, it is genuinely structural, and it now has something to contrast against.

The other half of the argument is consistency across states: a field is
`Monthly rent` when you read it and `Monthly rent` when you edit it. It was
`MONTHLY RENT` then `Monthly rent`, which is the same field wearing two names.

### 36.4 Empty is not content

Seven of fifteen cells reading `-` is a grid advertising what you do not know.
Prefer, in order: omit the field, group the unknowns, or render `-` quietly —
but never let an empty value take the same weight as a filled one.

And a unit with no number is not a unit: `{{ value ?? '-' }} days` renders
"- days". Use `| unit: 'days'`.

## 38. Editing Replaces the Record, It Does Not Sit Beside It

A detail page had two cards open at once: the record, and an "Edit <thing>" card
below repeating every value as an input. Nine fields read twice, and no way to
tell which set was live — is the card above what is saved, or what I am typing?

**One card, two states.** The header, title and actions stay exactly where they
are; only the body swaps:

```html
<app-section-card [title]="detail.name">
  <ng-container actions>
    <button (click)="toggleEdit()">{{ editing() ? 'Close editor' : 'Edit room' }}</button>
  </ng-container>

  @if (!editing()) {
    <div class="detail-groups">…</div>
  } @else {
    <form [formGroup]="form" appFormFeedback (ngSubmit)="save()">…</form>
  }
</app-section-card>
```

The form is prefilled from the same record, so the transition reads as the
values becoming editable in place rather than as a new screen. Keeping the
header fixed matters: the page must not appear to navigate, because it has not.

### 38.1 Button hierarchy

| Role | Style | Why |
|---|---|---|
| Commit the change | `btn-primary` | Exactly one per view. It is the thing the screen is for. |
| Get to a form (**Edit**) | `btn-secondary` | Edit does not change anything — it opens the place where you can. |
| Leave without saving (**Cancel**) | `btn-secondary` | Never primary, never danger. |
| Destroy (**Delete**) | `btn-danger` | Last in the row, never full-bleed. |

Thirteen detail pages had **Edit** in the primary colour, competing with **Save**
on the very next screen for the same visual promise. Primary belongs to the
action that commits; on a detail page, nothing commits, so nothing is primary.

### 38.2 One Cancel

Fourteen form pages carried a Cancel in the card header **and** a Cancel beside
Save. On a phone that is two identical escape hatches within one thumb's reach,
one of which sits above the fields it abandons.

Keep the one **next to Save**. Cancel is the negative half of a decision, and the
decision is made at the bottom of the form, where the operator has finished
reading. The header is for what the card *is*, not for how to leave it — the
back link already covers leaving.

---

## 37. Status Chips — One Meaning, One Colour

A status is the most-read thing on a listing. It has to be readable at a glance,
mean the same thing on every page, and not depend on colour alone.

### 37.1 Use the component, never a local switch

```html
<app-status-chip [status]="record.status" />
```

Let each component write its own `statusClass()` and they will disagree
within a release: `CLOSED` rendered danger on one screen, neutral on the
next and success on a third; `INACTIVE` warning in one list and neutral
in another. Boolean chips split the same way — `isActive ? success :
neutral` on some pages, `isActive ? success : danger` on others.

Nobody decided that. It is what happens when a mapping is re-typed per page.

### 37.2 The four tones

Chosen by **what the operator must do**, not by whether the word sounds positive:

| Tone | Glyph | Meaning | Examples |
|---|---|---|---|
| `success` | ✓ | settled, and settled well | ACTIVE, PAID, VERIFIED, APPROVED, DELIVERED, RESOLVED |
| `warning` | ● | in flight, or waiting on someone | PENDING\*, DRAFT, PROCESSING, PARTIAL, SUBMITTED, RESERVED |
| `danger` | ✕ | failed, refused, ended badly | UNPAID, OVERDUE, EXPIRED, REJECTED, CANCELLED, TERMINATED, EVICTED, LOCKED |
| `neutral` | – | inert; switched off or filed away | INACTIVE, CLOSED, ARCHIVED, WITHDRAWN, REFUNDED |

The pairs the reader relies on most: **Active/Inactive** is green ✓ against grey
–, **Paid/Unpaid** green ✓ against clay ✕, **Verified** green ✓ against a warning
● while it is still pending.

### 37.3 Colour is never the only channel

`.status-chip--*` prepends a glyph and the word is always rendered. This is not
optional politeness: the darkened accents sit within 1.33:1 of each other, and
measured against a validator the worst adjacent pair separates by ΔE 7.1 where
the floor is 15 (§34.1). A reader with full colour vision cannot reliably tell
warning from danger by hue.

So: **hue + glyph + word**, or the chip is not doing its job.

### 37.4 Where a value's meaning really does differ

`CLOSED` is the honest hard case — a closed organisation is an ended business, a closed
message thread is a solved problem. Resolve it **in the map**, not per page:
"ended" is the meaning all of them share, so `CLOSED` is neutral everywhere.

`[tone]` exists for a chip whose text is not a status enum at all — a computed
"In stock", say. It is a whole-chip override, so reaching for it to recolour one
value on one page puts the twenty-nine switch statements straight back.

---

## 39. Shareable Identifiers, Consent and One-Time Secrets

Patterns for any screen where one party asks another for access to
something private. Nothing here is domain-specific; the project's own
rules live in `unitwise-skills.md`.

**A shareable identifier is not an authenticator.** A short code a
person is meant to quote to someone else — an account uid, an invite
code, a reference number — is seen by everyone who ever handled it: a
former counterparty, a screenshot, a glance over a shoulder. So a
lookup by one answers exactly one question, usually "is this the right
person?", and returns only what confirms that. If a screen shows
contact details, identity numbers or related records off the back of
such a code, the code has silently become a password.

**An "ask" and a "grant" are different operations, and only one side
has each.** Build the requesting screen so it cannot approve, and keep
the approving screen on routes guarded by ownership alone — no
permission an administrator can hold should reach them. If you find
yourself adding a convenience path so staff can skip the wait, you
have removed the feature.

**Never offer "select all" in a consent flow.** A flow whose easy path
is "all of it" is not consent. Make the selection explicit, and bound
the duration — an open-ended share is indistinguishable from giving
the thing away.

**Consider showing the access count, not merely logging it.** "Opened
nine times, last on Tuesday" on the owner's own screen is what makes
consent observable rather than ceremonial. It is a genuine trade-off:
a counter invites the owner to read intent into ordinary activity, and
a product may reasonably decide the noise outweighs the visibility. Be
sure that is a decision rather than a thing nobody wired.

**A one-time secret is shown once — say so on the screen.** When the
server stores only a hash, the create response is the only moment the
value can ever be displayed. Put it in front of the user immediately,
state plainly that it will not be shown again, and do not leave them
to discover that by reloading.

**Two queues are two states.** "Waiting on them" and "waiting on us"
must never share a status, or one party's worklist fills with items
they cannot act on. Name whose turn it is in the UI, and put the item
that unblocks the flow above the fold rather than behind a tab.

**Waiting cannot be a dead end.** People ignore notifications, lose
phones, or were never reachable. Give the blocked party a documented
way to proceed — with a mandatory recorded reason — and make sure that
route grants *less* convenience, not more access. The escape hatch
must cost the person taking it something, or it becomes the default
path and the consent step becomes decorative.

**Revoking access must not destroy the record built on it.** Where a
decision was made against evidence, the decision keeps its own frozen
copy while the live source closes. Hide the payload, keep the record:
its date, its author and its stated basis stay readable, or the
decision can no longer be shown to have been justified. Re-opening is
granted to a named person, never to an organisation, always with a
reason and an expiry.

**Render the backend's refusal; do not improve on it.** When a server
deliberately answers "wrong code", "not your code" and "expired code"
identically, or returns the same empty result for "none" and "none you
may see", it is avoiding an oracle. Showing the raw message is the
correct behaviour; translating it into something more helpful reopens
the hole the server closed.
