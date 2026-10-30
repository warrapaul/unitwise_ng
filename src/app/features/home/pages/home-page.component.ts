import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoleConstants } from '../../../core/rbac/role.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoleDashboardComponent } from '../../stats/components/role-dashboard.component';
import { PermissionGateComponent } from '../../../shared/components/permission-gate/permission-gate.component';
import { CatalogPageComponent } from '../../shop/pages/catalog-page.component';
import { CustomerQuickFindComponent } from '../../ecommerce/customers/customer-quick-find.component';
import { CartService } from '../../shop/cart.service';
import { AuthSessionService } from '../../../core/services/auth-session.service';

/** Who the dashboard is being drawn for. Derived from permissions, never names. */
type Persona = 'platform' | 'agency' | 'caretaker' | 'commerce' | 'shopper' | 'tenant' | 'visitor';

/**
 * A movement against a named period.
 *
 * `tone` is the *meaning*, not the direction: arrears rising is `bad` while
 * collections rising is `good`, and both are `up`. The arrow carries the
 * direction so the tone never has to be read from colour alone — the same rule
 * the status chips follow (styles.scss, WCAG 1.4.1).
 */
interface Shortcut {
  label: string;
  route: string;
  hint: string;
}

/**
 * The landing screen inside the app, which is a different screen depending on
 * who is looking at it.
 *
 * Six audiences, not one: the platform operator counts agencies, the landlord
 * counts shillings, the caretaker counts rooms, the shop admin counts orders,
 * the tenant wants their own balance, and a visitor wants somewhere to go.
 * Serving all of them from one layout gives five of them somebody else's
 * screen.
 *
 * The figures themselves belong to `app-role-dashboard`, which reads the stats
 * endpoint for the role being worked as. This page owns what surrounds them:
 * who is signed in, where to go next, and a tenant's own rent.
 */
@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, SectionCardComponent, RoleDashboardComponent, PermissionGateComponent,
    CatalogPageComponent, CustomerQuickFindComponent],
  template: `
    <section class="stack">
      <!--
        An agency's dashboard draws its own compact title bar (title, month, building, primary
        action), so the oversized greeting card is left out for it: it spent the top of the page
        on a name and a row of links the sidebar already has.
      -->
      @if (!agencyDashboard()) {
        <!-- The role is account metadata: it is on the profile page, not a badge on every dashboard. -->
        <app-section-card [title]="greeting()" [subtitle]="subtitle()">
          @if (shortcuts().length > 0) {
            <nav class="shortcuts" aria-label="Go to">
              @for (shortcut of shortcuts(); track shortcut.route) {
                <a class="shortcut" [routerLink]="shortcut.route" [title]="shortcut.hint">
                  {{ shortcut.label }}
                  @if (shortcut.route === RoutePaths.cart && cart.itemCount() > 0) { <span class="shortcut__count">{{ cart.itemCount() }}</span> }
                </a>
              }
            </nav>
          }
        </app-section-card>
      }

      <!--
        Real figures, and which ones depends on the role being worked as: a
        platform admin, an agency admin and a caretaker are asking different
        questions and the backend answers each on its own endpoint. The sample
        hero, tiles, trend and split that stood here were placeholders for
        exactly this.
      -->
      <!--
        A customer comes to shop: the shelf is the dashboard, with their orders,
        cart and addresses one tap away above it. Filtering keeps them here.
      -->
      @if (persona() === 'shopper') {
        <app-catalog-page [base]="RoutePaths.home" [q]="q()" [category]="category()" [sub]="sub()" [min]="min()"
                          [max]="max()" [featured]="featured()" [tags]="tags()" [sort]="sort()" />
      } @else {
        <!-- The shop desk's first move of the day, and every day: a number, then the customer. -->
        @if (persona() === 'commerce') {
          <app-permission-gate [permissions]="['ECOM_CUSTOMER_READ']">
            <div class="quick-find"><app-customer-quick-find /></div>
          </app-permission-gate>
        }
        <app-role-dashboard />
      }

      <!--
        The tenant's rent used to be embedded here as the payments list, because
        nothing else answered "do I owe anything". The tenant dashboard answers
        it properly now — position, due date and statement — so the list stays a
        page of its own, linked from there.
      -->

    </section>
  `,
  styles: [`

    .quick-find { max-width: 40rem; }

    /* ---- shortcuts ---- */
    .shortcuts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1-5);
    }

    .shortcut {
      padding: var(--space-1) var(--space-3);
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      text-decoration: none;
    }

    .shortcut:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    .shortcut:hover { border-color: var(--border-strong); }
    .shortcut__count {
      margin-left: var(--space-1);
      padding: 0 var(--space-1-5);
      border-radius: 999px;
      background: var(--primary);
      color: var(--on-primary, #fff);
      font-size: var(--text-xs);
    }
    .shortcut span { font-size: var(--text-sm); }

    @media (max-width: 700px) {
      .row {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .row__track { grid-column: 1 / -1; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  readonly RoutePaths = RoutePaths;
  readonly context = inject(ActiveContextService);
  readonly cart = inject(CartService);
  private readonly session = inject(AuthSessionService);

  // The shelf's filters, from the URL: a shopper filtering on the dashboard stays on it.
  readonly q = input<string | undefined>();
  readonly category = input<string | undefined>();
  readonly sub = input<string | undefined>();
  readonly min = input<string | undefined>();
  readonly max = input<string | undefined>();
  readonly featured = input<string | undefined>();
  readonly tags = input<string | undefined>();
  readonly sort = input<string | undefined>();

  /**
   * Which of the six dashboards to draw.
   *
   * Decided by permission, never by role name: the role list is backend data
   * that changes, and "can this person manage other people's property" is
   * exactly what the read permissions already answer. Order matters — the tests
   * run widest first, so an agency admin who also sells in the shop still gets
   * the property dashboard.
   */

  /** The agency dashboard is showing, with its own title bar (the same test the role dashboard makes). */
  readonly agencyDashboard = computed(() => this.persona() === 'agency'
    && this.context.can(PermissionConstants.STATS_AGENCY_READ) && this.context.agencyId() !== null);

  readonly persona = computed<Persona>(() => {
    // Platform breadth is the `_ALL` permissions, which are the super-admin
    // reserve; holding one means the whole system is in scope.
    if (this.context.canAny([
      PermissionConstants.AGENCY_READ_ALL,
      PermissionConstants.BUILDING_READ_ALL,
      PermissionConstants.USER_READ_ALL
    ])) {
      return 'platform';
    }

    // Runs an agency: can see the agency record itself, not just a building
    // inside it.
    if (this.context.canAny([PermissionConstants.AGENCY_READ])) {
      return 'agency';
    }

    // Works inside buildings without owning the agency — the caretaker's shape.
    // BUILDING_READ alone is deliberately not enough: a tenant holds it for the
    // building they live in.
    if (this.context.canAny([
      PermissionConstants.ROOM_UPDATE,
      PermissionConstants.BUILDING_FLOOR_MANAGE,
      PermissionConstants.TENANT_READ
    ])) {
      return 'caretaker';
    }

    if (this.context.canAny([
      PermissionConstants.PRODUCT_READ_ALL,
      PermissionConstants.ORDER_READ_ALL
    ])) {
      return 'commerce';
    }

    // Shops, and nothing more: the customer role, like TENANT, is what says so.
    if (this.context.active().roleName === RoleConstants.ECOM_CUSTOMER) {
      return 'shopper';
    }

    // A tenant's own records are authorised by ownership, so the TENANT role holds almost no
    // permissions: the role itself is what says "tenant".
    if (this.context.active().roleName === RoleConstants.TENANT || this.context.canAny([
      PermissionConstants.SINGLE_TENANT_READ,
      PermissionConstants.LEASE_READ,
      PermissionConstants.RENT_PAYMENT_READ
    ])) {
      return 'tenant';
    }

    return 'visitor';
  });

  readonly greeting = computed(() => {
    const scope = this.context.active();
    switch (this.persona()) {
      case 'platform':
        return 'Platform overview';
      case 'agency':
        return scope.agencyName ? `${scope.agencyName} · Agency overview` : 'Agency overview';
      case 'caretaker':
        return scope.buildingName ? `${scope.buildingName} today` : 'Your blocks today';
      case 'commerce':
        return 'Store overview';
      case 'shopper':
      case 'tenant':
        return this.session.userProfile()?.firstName ? `Welcome back, ${this.session.userProfile()!.firstName}` : 'Welcome back';
      default:
        return 'Welcome';
    }
  });

  readonly subtitle = computed(() => {
    const scope = this.context.active();
    switch (this.persona()) {
      case 'platform':
        return 'Every agency, building and tenant on the platform.';
      case 'agency':
        return scope.buildingName ? `Showing ${scope.buildingName}` : 'Across every building in this agency.';
      case 'caretaker':
        return 'Rooms, move-ins and maintenance on the blocks assigned to you.';
      case 'commerce':
        return 'Orders, stock and revenue for the storefront.';
      case 'shopper':
        return 'Browse the shop, or pick up where you left off.';
      case 'tenant':
        // The tenant dashboard opens with the room, building and status — anything here repeated it.
        return null;
      default:
        return 'Browse the shop or find a room to rent.';
    }
  });

  readonly shortcuts = computed<Shortcut[]>(() => {
    switch (this.persona()) {
      case 'platform':
        return [
          { label: 'All agencies', route: RoutePaths.agencies, hint: 'Every agency on the platform' },
          { label: 'All buildings', route: RoutePaths.buildings, hint: 'Floors, rooms and utilities' },
          { label: 'Users', route: RoutePaths.users, hint: 'Accounts and role assignment' },
          { label: 'Roles', route: RoutePaths.roles, hint: 'Permissions per role' }
        ];
      case 'agency':
        return [
          // Rent work first: it is what an agency opens the app for most days.
          { label: 'Payments to confirm', route: RoutePaths.paymentReports, hint: 'Payments tenants reported' },
          { label: 'Rent per room', route: RoutePaths.rentArrears, hint: 'Bills, readings and confirming the month' },
          { label: 'Meter readings', route: RoutePaths.rentMeterReadings, hint: 'Readings still to enter' },
          { label: 'Overdue', route: RoutePaths.rentPortfolioOverdue, hint: 'Who is behind, and by how much' },
          { label: 'Tenants', route: RoutePaths.tenants, hint: 'Tenancies and documents' },
          { label: 'Buildings', route: RoutePaths.buildings, hint: 'Floors, rooms and utilities' }
        ];
      case 'caretaker':
        return [
          { label: 'Buildings', route: RoutePaths.buildings, hint: 'Your blocks, floor by floor' },
          { label: 'Meter readings', route: RoutePaths.rentMeterReadings, hint: 'Record this month' },
          { label: 'Applications', route: RoutePaths.roomApplications, hint: 'People asking for a room' },
          { label: 'Tenants', route: RoutePaths.tenants, hint: 'Who is in which room' }
        ];
      case 'commerce':
        return [
          { label: 'Orders', route: RoutePaths.ecomOrders, hint: 'Fulfil and track' },
          { label: 'Products', route: RoutePaths.ecomProducts, hint: 'Catalogue and stock' },
          { label: 'Vouchers', route: RoutePaths.vouchers, hint: 'Discounts and campaigns' },
          { label: 'Customers', route: RoutePaths.ecomCustomers, hint: 'Groups and history' }
        ];
      case 'shopper':
        return [
          { label: 'My orders', route: RoutePaths.myOrders, hint: 'Track what you bought' },
          { label: 'Cart', route: RoutePaths.cart, hint: 'What you are about to order' },
          { label: 'My addresses', route: RoutePaths.deliveryAddresses, hint: 'Where your orders go' },
          { label: 'My vouchers', route: RoutePaths.myVouchers, hint: 'Discounts you can use' },
          { label: 'My account', route: RoutePaths.userProfile, hint: 'Details and security' }
        ];
      case 'tenant':
        // The tenant dashboard carries its own links, beside the tenancy they apply to.
        return [];      default:
        return [
          { label: 'Browse the shop', route: RoutePaths.shop, hint: 'Order and pay on delivery' },
          { label: 'Find a room', route: RoutePaths.availableRooms, hint: 'Vacant rooms to rent' },
          { label: 'My orders', route: RoutePaths.myOrders, hint: 'Track what you bought' },
          { label: 'My account', route: RoutePaths.userProfile, hint: 'Details and security' }
        ];
    }
  });

}
