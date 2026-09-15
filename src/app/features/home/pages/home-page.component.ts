import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveContextService } from '../../../core/services/active-context.service';
import { PermissionConstants } from '../../../core/rbac/permission.constants';
import { RoutePaths } from '../../../core/routes/route-paths';
import { SectionCardComponent } from '../../../shared/components/section-card/section-card.component';
import { RoleDashboardComponent } from '../../stats/components/role-dashboard.component';

/** Who the dashboard is being drawn for. Derived from permissions, never names. */
type Persona = 'platform' | 'agency' | 'caretaker' | 'commerce' | 'tenant' | 'visitor';

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
  imports: [RouterLink, SectionCardComponent, RoleDashboardComponent],
  template: `
    <section class="stack">
      <app-section-card [title]="greeting()" [subtitle]="subtitle()">
        <ng-container actions>
          <span class="pill">{{ context.active().roleName ?? 'Signed in' }}</span>
        </ng-container>

        <!--
          Compact links rather than a card of their own. They are how someone
          leaves this page, so they belong beside the heading — below the
          figures they sat under a loading spinner, which read as the page
          having finished and being empty.
        -->
        <nav class="shortcuts" aria-label="Go to">
          @for (shortcut of shortcuts(); track shortcut.route) {
            <a class="shortcut" [routerLink]="shortcut.route" [title]="shortcut.hint">{{ shortcut.label }}</a>
          }
        </nav>
      </app-section-card>

      <!--
        Real figures, and which ones depends on the role being worked as: a
        platform admin, an agency admin and a caretaker are asking different
        questions and the backend answers each on its own endpoint. The sample
        hero, tiles, trend and split that stood here were placeholders for
        exactly this.
      -->
      <app-role-dashboard />

      <!--
        The tenant's rent used to be embedded here as the payments list, because
        nothing else answered "do I owe anything". The tenant dashboard answers
        it properly now — position, due date and statement — so the list stays a
        page of its own, linked from there.
      -->

    </section>
  `,
  styles: [`

    /* ---- shortcuts ---- */
    .shortcuts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .shortcut {
      padding: 0.3rem 0.7rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
      text-decoration: none;
    }

    .shortcut:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    .shortcut:hover { border-color: var(--border-strong); }
    .shortcut span { font-size: 0.8rem; }

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

  /**
   * Which of the six dashboards to draw.
   *
   * Decided by permission, never by role name: the role list is backend data
   * that changes, and "can this person manage other people's property" is
   * exactly what the read permissions already answer. Order matters — the tests
   * run widest first, so an agency admin who also sells in the shop still gets
   * the property dashboard.
   */
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

    if (this.context.canAny([
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
        return scope.agencyName ? `${scope.agencyName} overview` : 'Agency overview';
      case 'caretaker':
        return scope.buildingName ? `${scope.buildingName} today` : 'Your blocks today';
      case 'commerce':
        return 'Store overview';
      case 'tenant':
        return 'Your tenancy';
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
      case 'tenant':
        return 'Your room, rent and documents.';
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
          { label: 'Buildings', route: RoutePaths.buildings, hint: 'Floors, rooms and utilities' },
          { label: 'Tenants', route: RoutePaths.tenants, hint: 'Tenancies and documents' },
          { label: 'Rent payments', route: RoutePaths.rentPayments, hint: 'Record and reconcile' },
          { label: 'Arrears', route: RoutePaths.rentArrears, hint: 'Who is behind, and by how much' }
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
      case 'tenant':
        return [
          { label: 'My lease', route: RoutePaths.myLeases, hint: 'Terms and amendments' },
          { label: 'My account', route: RoutePaths.userProfile, hint: 'Profile, tenancy and documents' },
          { label: 'Message the landlord', route: RoutePaths.myTenantMessages, hint: 'Requests and replies' },
          { label: 'My arrears', route: RoutePaths.myArrears, hint: 'Anything outstanding' }
        ];
      default:
        return [
          { label: 'Browse the shop', route: RoutePaths.shop, hint: 'Order and pay on delivery' },
          { label: 'Find a room', route: RoutePaths.availableRooms, hint: 'Vacant rooms to rent' },
          { label: 'My orders', route: RoutePaths.myOrders, hint: 'Track what you bought' },
          { label: 'My account', route: RoutePaths.userProfile, hint: 'Details and security' }
        ];
    }
  });

}
