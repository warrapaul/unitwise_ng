/**
 * The sidebar is described as data rather than markup: 60-odd hand-written
 * links had drifted out of alignment with each other and with the route guards.
 * One model means grouping, ordering, icons and permission gating are declared
 * once and rendered uniformly.
 */
export interface NavLink {
  kind: 'link';
  label: string;
  route: string;
  icon: string;
  /** Match only this exact URL — for parents that also have child routes. */
  exact?: boolean;
  /**
   * Visibility that follows how many agencies are in play, not what the
   * operator may do.
   *
   * An agency is a container, not a destination: a landlord with one visits it
   * to add an admin or edit the contract terms, and works in buildings every
   * other day. A permanent nav slot that always lists exactly one card spends
   * the most valuable strip of the screen on a page nobody opens — while for a
   * super admin the same list is a real collection worth browsing.
   *
   * `multi` appears once more than one agency is reachable; `single` replaces it
   * with a direct link to the only one, which is a click shorter and names the
   * thing instead of listing it.
   */
  agencyScope?: 'multi' | 'single';
  /** Visible when the user holds ANY of these. Omit for always-visible. */
  permissions?: string[];
  /**
   * Visible only when the ACTIVE role is one of these.
   *
   * Normally visibility is a permission question (§30.9) and role names are
   * backend data that moves. This is the exception the rule leaves room for:
   * some sections are about *audience* rather than capability. "Find a room"
   * and the shop are for people renting and shopping, not for the staff who
   * administer them — and no permission expresses "is a renter", because
   * being one is not a thing you are allowed to do.
   *
   * Use sparingly, and never for anything that gates an operation; the
   * server authorises regardless of what the nav shows.
   */
  roles?: string[];
  /**
   * Label to use instead when the operator holds `platformPermission`.
   *
   * One destination, two truthful names: the agency list shows every agency to
   * a super admin and only the operator's own to an agency admin, so it is
   * "All agencies" for one and "Agencies" for the other. Two nav entries
   * pointing at the same screen was the alternative, and it read as two
   * different screens that happened to agree.
   */
  platformLabel?: string;
  platformPermission?: string;
  /** A live count shown beside the label — unread notifications or chat. */
  badge?: 'notifications' | 'chat';
  /** One line under the label saying what is inside ("Record, reconcile and confirm"). */
  hint?: string;
  /**
   * Which side of the app the link is for. `property` shows it only to roles that work with
   * buildings and tenants; `others` only to everyone else. Lets one destination sit where each
   * audience looks for it (the chat is "Communication" under Operations for a landlord) without
   * appearing twice.
   */
  audience?: 'property' | 'others';
}

export interface NavGroup {
  kind: 'group';
  /** Stable key for remembering the expanded/collapsed state. */
  id: string;
  label: string;
  icon: string;
  /** URL prefix used to detect that a child is active. */
  route: string;
  permissions?: string[];
  /** Same audience exception as NavLink.roles. */
  roles?: string[];
  /** One line under the label saying what is inside. */
  hint?: string;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

export interface NavSection {
  /** Stable key for tracking and for hoisting; never rendered. */
  id: string;
  /** Rendered as a small heading; omit for an unlabelled section. */
  label?: string;
  items: NavItem[];
}

const link = (
  label: string,
  route: string,
  icon: string,
  extra: Partial<NavLink> = {}
): NavLink => ({ kind: 'link', label, route, icon, ...extra });

/** Permission bundles — the union each section's routes actually require. */
const HOUSING = ['AGENCY_READ', 'AGENCY_READ_ALL', 'BUILDING_READ', 'BUILDING_READ_ALL'];
const TENANTS = [
  'TENANT_READ_ALL', 'LEASE_AGREEMENT_READ_ALL', 'LEASE_AMENDMENT_READ',
  'LEASE_AMENDMENT_READ_ALL', 'ROOM_APPLICATION_READ_ALL', 'TENANT_DOCUMENT_READ_ALL',
  'TENANT_MESSAGE_READ', 'TENANT_MESSAGE_READ_ALL', 'VERIFICATION_SNAPSHOT_READ_ALL'
];
const RENT = ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ', 'RENT_ARREAR_READ'];

/*
 * Audience, not capability.
 *
 * A caretaker holds plenty of permissions and is still not someone looking
 * for a room to rent or a basket to fill. These two lists say who a section
 * is *for*; everything else in the nav stays permission-driven.
 */
const RENTER_AUDIENCE = ['TENANT', 'SUPER_ADMIN'];
const SHOPPER_AUDIENCE = ['ECOM_CUSTOMER', 'GUEST', 'USER', 'TENANT', 'SUPER_ADMIN'];

export const NAV_SECTIONS: NavSection[] = [
  {
    /*
     * The dashboard alone. It is its own section so that the hoisted section —
     * Property for an agency-side role, Tenancy for a tenant, Ecommerce for the
     * shop — lands directly beneath it rather than beneath the General block.
     */
    id: 'dashboard',
    items: [
      link('Dashboard', '/home', 'grid', { exact: true })
    ]
  },
  {
    /*
     * Labelled, so it never reads as part of the section above it: whatever is
     * hoisted under the dashboard (Tenancy, Ecommerce, Property) lands directly
     * before this one, and an unlabelled list ran straight on from its heading.
     */
    id: 'utility',
    label: 'General',
    items: [
      // For a landlord the chat is "Communication", under Operations.
      link('Chat', '/chat', 'chat', { badge: 'chat', audience: 'others' }),
      link('Notifications', '/notifications', 'bell', { exact: true, badge: 'notifications' }),
      link('Settings', '/me/settings', 'settings')
    ]
  },
  {
    id: 'shopping',
    label: 'Shopping',
    items: [
      // Plain links under the section heading: four pages need no folding menu.
      link('Browse', '/shop', 'store', { exact: true, roles: SHOPPER_AUDIENCE }),
      link('Cart', '/shop/cart', 'bag', { roles: SHOPPER_AUDIENCE }),
      link('My orders', '/shop/my-orders', 'send', { roles: SHOPPER_AUDIENCE }),
      // Where orders go: add, edit, set the default — all from here.
      link('My addresses', '/me/delivery-addresses', 'pin', { roles: SHOPPER_AUDIENCE }),
      link('My vouchers', '/shop/my-vouchers', 'cash', { roles: SHOPPER_AUDIENCE })
    ]
  },
  {
    /*
     * The renter's own section: their tenancy, and finding a room. Its own
     * heading, so it reads as a part of the app rather than as an account
     * setting, and it is hoisted under the dashboard for a tenant.
     */
    id: 'tenancy',
    label: 'Tenancy',
    items: [
      // Leases, rent and documents are sections of the tenancy; messages are the chat.
      link('My tenancy', '/me/tenancy', 'key', { roles: RENTER_AUDIENCE }),
      link('Repairs', '/me/maintenance', 'wrench', { roles: RENTER_AUDIENCE })
      // TODO: restore once room search is built out on the backend — odd for an active tenant until then.
      // link('Find a room', '/rooms', 'building', { roles: RENTER_AUDIENCE })
    ]
  },
  /*
   * The agency's work in three sections, so a landlord can tell property, money and day-to-day
   * operations apart at a glance. The layout hoists all three to just below the dashboard for a
   * role that works with property (skills §33.1). Every page is still here; only the grouping moved.
   */
  {
    id: 'property',
    label: 'Property',
    items: [
      {
        kind: 'group',
        id: 'housing',
        label: 'Properties',
        hint: 'Buildings, rooms and units',
        icon: 'building',
        route: '/admin/housing',
        permissions: HOUSING,
        children: [
          link('Agencies', '/admin/housing/agencies', 'dot', {
            permissions: ['AGENCY_READ_ALL', 'AGENCY_READ'],
            platformLabel: 'All agencies',
            platformPermission: 'AGENCY_READ_ALL',
            agencyScope: 'multi'
          }),
          /* The same destination one level in, for the landlord who has one. */
          link('My agency', '/admin/housing/agencies', 'dot', {
            permissions: ['AGENCY_READ_ALL', 'AGENCY_READ'],
            agencyScope: 'single'
          }),
          link('Buildings', '/admin/housing/buildings', 'dot', {
            platformLabel: 'All buildings',
            platformPermission: 'BUILDING_READ_ALL'
          })
        ]
      },
      {
        kind: 'group',
        id: 'tenants',
        label: 'Tenants & leases',
        hint: 'Tenants, applications, agreements',
        icon: 'tenants',
        route: '/admin/tenants',
        permissions: TENANTS,
        children: [
          link('Overview', '/admin/tenants/overview', 'dot', { permissions: ['STATS_AGENCY_READ'] }),
          link('Tenants', '/admin/tenants', 'dot', {
            exact: true,
            permissions: ['TENANT_READ_ALL', 'TENANT_READ', 'SINGLE_TENANT_READ'],
            platformLabel: 'All tenants',
            platformPermission: 'TENANT_READ_ALL'
          }),
          link('Leases', '/admin/tenants/leases', 'dot', { permissions: ['LEASE_AGREEMENT_READ_ALL', 'LEASE_AGREEMENT_READ', 'LEASE_READ'] }),
          link('Amendments', '/admin/tenants/amendments', 'dot', { permissions: ['LEASE_AMENDMENT_READ', 'LEASE_AMENDMENT_READ_ALL'] }),
          link('Applications', '/admin/tenants/applications', 'dot', { permissions: ['ROOM_APPLICATION_READ_ALL', 'ROOM_APPLICATION_READ'] })
          // No Documents, Snapshots or Profile sharing entry. Each is about one
          // tenant and lives on that tenant's page; a share code is redeemed
          // from Add tenant. The profile-sharing route stays for old links.
          // Maintenance is under Operations; conversations with tenants are the chat.
        ]
      }
    ]
  },
  {
    id: 'finance',
    label: 'Financial management',
    items: [
      {
        kind: 'group',
        id: 'rent',
        label: 'Rent & billing',
        hint: 'Bills, room balances, adjustments',
        icon: 'cash',
        route: '/admin/rent',
        permissions: RENT,
        children: [
          // The month at a glance: the billing cycle per building, then where to act.
          link('Overview', '/admin/rent', 'dot', { exact: true, permissions: ['STATS_AGENCY_READ'] }),
          link('Rent per room', '/admin/rent/arrears', 'dot', { permissions: ['RENT_ARREAR_READ'] }),
          // Waivers, extra charges and amount changes between billing and confirming.
          link('Rent adjustments', '/admin/rent/adjustments', 'dot', { permissions: ['RENT_ARREAR_READ'] }),
          // The platform's list of charges landlords pick from; only the super admin keeps it.
          link('Charge catalog', '/admin/rent/charge-catalog', 'dot', { permissions: ['CHARGE_CATALOG_MANAGE'] })
        ]
      },
      {
        kind: 'group',
        id: 'payments',
        label: 'Payments',
        hint: 'Record, reconcile and confirm',
        icon: 'swap',
        route: '/admin/rent/payments',
        permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ'],
        children: [
          link('All payments', '/admin/rent/payments', 'dot', { exact: true, permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ'] }),
          // Tenants' reported payments, waiting to be confirmed.
          link('Payments to confirm', '/admin/rent/payment-reports', 'dot', { permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ'] }),
          link('Record payment', '/admin/rent/payments/new', 'dot', { permissions: ['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE'] })
        ]
      },
      link('Arrears & reports', '/admin/rent/portfolio-overdue', 'chart', {
        hint: 'Debtors, collection and exports',
        permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ']
      }),
      link('Deposits', '/admin/rent/deposits', 'safe', {
        hint: 'Tenant deposits and refunds',
        permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ']
      })
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      link('Utilities & meter readings', '/admin/rent/meter-readings', 'gauge', { permissions: ['RENT_ARREAR_READ'] }),
      link('Maintenance', '/admin/tenants/maintenance', 'wrench', { permissions: ['MAINTENANCE_READ_ALL', 'MAINTENANCE_READ'] }),
      link('Communication', '/chat', 'chat', { badge: 'chat', audience: 'property' })
    ]
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      link('Users', '/admin/users', 'users', { permissions: ['USER_READ_ALL'] }),
      /*
       * Two kinds of place data under one heading: the address registry
       * (county, ward, estate...) and the geo layer drawn in QGIS — region
       * polygons and the landmarks riders use to find people.
       */
      {
        kind: 'group',
        id: 'addresses',
        label: 'Addresses',
        icon: 'pin',
        route: '/admin/addresses',
        permissions: ['ADDRESS_READ_ALL', 'APP_MANAGEMENT_WRITE', 'GEO_REGION_READ', 'GEO_LANDMARK_READ', 'GEO_BUILDING_READ'],
        children: [
          link('Address registry', '/admin/addresses', 'dot', { exact: true, permissions: ['ADDRESS_READ_ALL'] }),
          // Where new addresses start: the county, sub-county and ward the business serves.
          link('Address defaults', '/admin/settings/address-defaults', 'dot', { permissions: ['APP_MANAGEMENT_WRITE'] }),
          link('Geo regions', '/admin/geo/regions', 'dot', { permissions: ['GEO_REGION_READ'] }),
          link('Landmarks', '/admin/geo/landmarks', 'dot', { permissions: ['GEO_LANDMARK_READ'] }),
          link('Geo buildings', '/admin/geo/buildings', 'dot', { permissions: ['GEO_BUILDING_READ'] })
        ]
      },
      /*
       * The platform master every agency's contract is forked from. Agency,
       * building and room documents are reached from the record they belong to,
       * not from the nav — there is one per agency, not a list to browse.
       */
      link('Contract master', '/admin/contracts/master', 'shield', { permissions: ['CONTRACT_TEMPLATE_MANAGE_ALL'] })
    ]
  },
  {
    /*
     * The shop, split by what the desk is doing: selling (orders), who it
     * sells to (people), what it sells (catalogue), what is on the shelf
     * (stock) and the money. One long list of thirteen links read as a
     * directory, not a menu.
     */
    id: 'ecommerce',
    label: 'Ecommerce',
    items: [
      link('Overview', '/admin/ecommerce', 'grid', { exact: true, permissions: ['STATS_ECOM_READ'] }),
      {
        kind: 'group',
        id: 'ecom-orders',
        label: 'Orders',
        icon: 'send',
        route: '/admin/ecommerce/orders',
        permissions: ['ORDER_READ_ALL', 'ORDER_UPDATE'],
        children: [
          link('All orders', '/admin/ecommerce/orders', 'dot', { permissions: ['ORDER_READ_ALL'] }),
          // Riders: their deliveries and the ones nobody has taken. Admins assign from the order instead.
          link('My deliveries', '/admin/ecommerce/deliveries', 'dot', { permissions: ['ORDER_UPDATE'] }),
          link('Stores', '/admin/ecommerce/stores', 'dot', { permissions: ['ORDER_READ_ALL'] })
        ]
      },
      {
        kind: 'group',
        id: 'ecom-people',
        label: 'Customers & riders',
        icon: 'users',
        route: '/admin/ecommerce/customers',
        permissions: ['ECOM_CUSTOMER_READ', 'ECOM_RIDER_READ', 'CUSTOMER_GROUP_READ'],
        children: [
          link('Customers', '/admin/ecommerce/customers', 'dot', { permissions: ['ECOM_CUSTOMER_READ'] }),
          link('Riders', '/admin/ecommerce/riders', 'dot', { permissions: ['ECOM_RIDER_READ'] }),
          link('Customer groups', '/admin/ecommerce/customer-groups', 'dot', { permissions: ['CUSTOMER_GROUP_READ'] })
        ]
      },
      {
        kind: 'group',
        id: 'ecom-catalogue',
        label: 'Catalogue',
        icon: 'tag',
        route: '/admin/ecommerce/products',
        permissions: ['PRODUCT_READ_ALL', 'CATEGORY_READ_ALL', 'TAG_READ'],
        children: [
          link('Products', '/admin/ecommerce/products', 'dot', { permissions: ['PRODUCT_READ_ALL'] }),
          link('Categories', '/admin/ecommerce/categories', 'dot', { permissions: ['CATEGORY_READ_ALL'] }),
          link('Tags', '/admin/ecommerce/tags', 'dot', { permissions: ['TAG_READ'] })
        ]
      },
      {
        kind: 'group',
        id: 'ecom-stock',
        label: 'Stock',
        icon: 'box',
        route: '/admin/ecommerce/stock',
        permissions: ['PRODUCT_READ_ALL'],
        children: [
          link('Stock levels', '/admin/ecommerce/stock', 'dot', { exact: true, permissions: ['PRODUCT_READ_ALL'] }),
          link('Stock history', '/admin/ecommerce/stock/history', 'dot', { permissions: ['PRODUCT_READ_ALL'] })
        ]
      },
      {
        kind: 'group',
        id: 'ecom-money',
        label: 'Payments',
        icon: 'cash',
        route: '/admin/ecommerce/payments',
        permissions: ['ORDER_PAYMENT_READ_ALL', 'PARTIAL_PAYMENT_POLICY_READ', 'VOUCHER_READ_ALL'],
        children: [
          link('Payments', '/admin/ecommerce/payments', 'dot', { permissions: ['ORDER_PAYMENT_READ_ALL'] }),
          link('Partial payments', '/admin/ecommerce/partial-payment-policies', 'dot', { permissions: ['PARTIAL_PAYMENT_POLICY_READ'] }),
          link('Vouchers', '/admin/ecommerce/vouchers', 'dot', { permissions: ['VOUCHER_READ_ALL'] })
        ]
      }
    ]
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        kind: 'group',
        id: 'settings',
        label: 'Settings',
        icon: 'settings',
        route: '/admin/settings',
        permissions: ['APP_MANAGEMENT_WRITE'],
        children: [
          /*
           * Cache maintenance, not preferences. It lives under Settings because
           * that is where an operator looks for "the app itself", and it is the
           * first entry because a stale permission cache is the reason anyone
           * comes here — a 403 on something their own profile says they can do.
           */
          link('Cache manager', '/admin/settings/cache', 'dot', { permissions: ['APP_MANAGEMENT_WRITE'] })
        ]
      },
      {
        kind: 'group',
        id: 'access-control',
        label: 'Access control',
        icon: 'shield',
        route: '/admin/access-control',
        permissions: ['ROLE_READ', 'PERMISSION_READ'],
        children: [
          link('Roles', '/admin/access-control/roles', 'dot', { permissions: ['ROLE_READ'] }),
          link('Permissions', '/admin/access-control/permissions', 'dot', { permissions: ['PERMISSION_READ'] })
        ]
      },
      {
        kind: 'group',
        id: 'app-management',
        label: 'App management',
        icon: 'settings',
        route: '/admin/app-management',
        permissions: ['APP_MANAGEMENT_READ'],
        children: [
          link('Notices', '/admin/app-management/notices', 'dot'),
          link('Version config', '/admin/app-management/version-config', 'dot')
        ]
      },
      link('Send notification', '/admin/notifications/broadcast', 'send', { permissions: ['NOTIFICATION_SEND'] })
    ]
  }
];
