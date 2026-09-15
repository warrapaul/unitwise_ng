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
const ECOMMERCE = ['PRODUCT_READ_ALL', 'ORDER_READ_ALL', 'CATEGORY_READ_ALL'];
const HOUSING = ['AGENCY_READ', 'AGENCY_READ_ALL', 'BUILDING_READ', 'BUILDING_READ_ALL'];
const TENANTS = [
  'TENANT_READ_ALL', 'LEASE_AGREEMENT_READ_ALL', 'LEASE_AMENDMENT_READ',
  'LEASE_AMENDMENT_READ_ALL', 'ROOM_APPLICATION_READ_ALL', 'TENANT_DOCUMENT_READ_ALL',
  'TENANT_MESSAGE_READ', 'TENANT_MESSAGE_READ_ALL', 'VERIFICATION_SNAPSHOT_READ_ALL'
];
const RENT = ['RENT_PAYMENT_READ_ALL', 'RENT_ARREAR_READ'];

export const NAV_SECTIONS: NavSection[] = [
  {
    /*
     * The dashboard alone. It is its own section so that the hoisted section —
     * Property for an agency-side role, My account for a tenant — lands
     * directly beneath it rather than beneath the whole utility block. Both
     * sections are unlabelled, so they still render as one unbroken list.
     */
    id: 'dashboard',
    items: [
      link('Dashboard', '/home', 'grid', { exact: true })
    ]
  },
  {
    id: 'utility',
    items: [
      link('Find a room', '/rooms', 'key'),
      link('Chat', '/chat', 'chat'),
      link('Notifications', '/notifications', 'bell', { exact: true }),
      link('Notification settings', '/me/notification-preferences', 'settings')
    ]
  },
  {
    id: 'shopping',
    label: 'Shopping',
    items: [
      {
        kind: 'group',
        id: 'shop',
        label: 'Shop',
        icon: 'bag',
        route: '/shop',
        children: [
          link('Browse', '/shop', 'dot', { exact: true }),
          link('Cart', '/shop/cart', 'dot'),
          link('My orders', '/shop/my-orders', 'dot'),
          link('My vouchers', '/shop/my-vouchers', 'dot')
        ]
      }
    ]
  },
  {
    id: 'my-account',
    label: 'My account',
    items: [
      {
        kind: 'group',
        id: 'me',
        label: 'My account',
        icon: 'user',
        route: '/me',
        children: [
          // Profile is not listed here. It is reached from the account row
          // in the sidebar footer, because it is the person rather than
          // another record about them — and everything in this group is a
          // record about them. Rent and arrears live on the dashboard,
          // which is where someone looks to ask "do I owe anything".
          // One entry, three tabs: the renter profile, any tenancy a landlord
          // has created, and the documents. A separate nav entry for the
          // profile made two destinations out of one subject.
          link('My tenancy', '/me/tenancy', 'dot'),
          // Their own entry rather than a tab under tenancy: the documents
          // belong to the person, and they share them across landlords, so
          // filing this under one tenancy would misstate what it controls.
          link('Profile sharing', '/me/profile-sharing', 'dot'),
          link('My leases', '/me/leases', 'dot'),
          link('My applications', '/me/applications', 'dot'),
          link('My messages', '/me/messages', 'dot'),
          link('My addresses', '/me/delivery-addresses', 'dot')
        ]
      }
    ]
  },
  {
    // Housing, tenancies and rent are the daily work for an agency-side
    // role, so they are their own section and the layout hoists it to just
    // below the dashboard for those roles (skills §33.1).
    id: 'property',
    label: 'Property',
    items: [
      {
        kind: 'group',
        id: 'housing',
        label: 'Housing',
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
        label: 'Tenants',
        icon: 'tenants',
        route: '/admin/tenants',
        permissions: TENANTS,
        children: [
          link('Tenants', '/admin/tenants', 'dot', {
            exact: true,
            permissions: ['TENANT_READ_ALL', 'TENANT_READ', 'SINGLE_TENANT_READ'],
            platformLabel: 'All tenants',
            platformPermission: 'TENANT_READ_ALL'
          }),
          link('Leases', '/admin/tenants/leases', 'dot', { permissions: ['LEASE_AGREEMENT_READ_ALL', 'LEASE_AGREEMENT_READ', 'LEASE_READ'] }),
          link('Amendments', '/admin/tenants/amendments', 'dot', { permissions: ['LEASE_AMENDMENT_READ', 'LEASE_AMENDMENT_READ_ALL'] }),
          link('Applications', '/admin/tenants/applications', 'dot', { permissions: ['ROOM_APPLICATION_READ_ALL', 'ROOM_APPLICATION_READ'] }),
          link('Documents', '/admin/tenants/documents', 'dot', { permissions: ['TENANT_DOCUMENT_READ_ALL', 'TENANT_DOCUMENT_READ'] }),
          // Separate from Documents: that lists what the agency holds, this
          // lists what it is currently allowed to open. A tenancy on the books
          // is not itself permission to read somebody's national ID.
          link('Profile sharing', '/admin/tenants/profile-sharing', 'dot', { permissions: ['TENANT_DOCUMENT_READ_ALL', 'TENANT_DOCUMENT_READ'] }),
          link('Messages', '/admin/tenants/messages', 'dot', { permissions: ['TENANT_MESSAGE_READ', 'TENANT_MESSAGE_READ_ALL'] }),
          link('Snapshots', '/admin/tenants/verification-snapshots', 'dot', { permissions: ['VERIFICATION_SNAPSHOT_READ_ALL', 'VERIFICATION_SNAPSHOT_READ'] })
        ]
      },
      {
        kind: 'group',
        id: 'rent',
        label: 'Rent',
        icon: 'cash',
        route: '/admin/rent',
        permissions: RENT,
        children: [
          link('Payments', '/admin/rent/payments', 'dot', { permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ'] }),
          link('Arrears', '/admin/rent/arrears', 'dot', { permissions: ['RENT_ARREAR_READ'] }),
          link('Adjustments', '/admin/rent/adjustments', 'dot', { permissions: ['RENT_ARREAR_READ'] }),
          link('Charge templates', '/admin/rent/charge-templates', 'dot', { permissions: ['RENT_ARREAR_READ'] }),
          link('Meter readings', '/admin/rent/meter-readings', 'dot', { permissions: ['RENT_ARREAR_READ'] })
        ]
      }
    ]
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      link('Users', '/admin/users', 'users', { permissions: ['USER_READ_ALL'] }),
      link('Addresses', '/admin/addresses', 'pin', { permissions: ['ADDRESS_READ_ALL'] }),
      /*
       * The platform master every agency's contract is forked from. Agency,
       * building and room documents are reached from the record they belong to,
       * not from the nav — there is one per agency, not a list to browse.
       */
      link('Contract master', '/admin/contracts/master', 'shield', { permissions: ['CONTRACT_TEMPLATE_MANAGE_ALL'] }),
      {
        kind: 'group',
        id: 'ecommerce',
        label: 'Ecommerce',
        icon: 'store',
        route: '/admin/ecommerce',
        permissions: ECOMMERCE,
        children: [
          link('Overview', '/admin/ecommerce', 'dot', { exact: true }),
          link('Products', '/admin/ecommerce/products', 'dot', { permissions: ['PRODUCT_READ_ALL'] }),
          link('Orders', '/admin/ecommerce/orders', 'dot', { permissions: ['ORDER_READ_ALL'] }),
          link('Categories', '/admin/ecommerce/categories', 'dot', { permissions: ['CATEGORY_READ_ALL'] }),
          link('Stores', '/admin/ecommerce/stores', 'dot'),
          link('Customers', '/admin/ecommerce/customers', 'dot', { permissions: ['ECOM_CUSTOMER_READ'] }),
          link('Tags', '/admin/ecommerce/tags', 'dot', { permissions: ['TAG_READ'] }),
          link('Customer groups', '/admin/ecommerce/customer-groups', 'dot', { permissions: ['CUSTOMER_GROUP_READ'] }),
          link('Vouchers', '/admin/ecommerce/vouchers', 'dot', { permissions: ['VOUCHER_READ_ALL'] }),
          link('Payments', '/admin/ecommerce/payments', 'dot', { permissions: ['ORDER_PAYMENT_READ_ALL'] }),
          link('Partial payments', '/admin/ecommerce/partial-payment-policies', 'dot', { permissions: ['PARTIAL_PAYMENT_POLICY_READ'] })
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
        id: 'geo',
        label: 'Geo',
        icon: 'globe',
        route: '/admin/geo',
        permissions: ['GEO_REGION_READ', 'GEO_LANDMARK_READ'],
        children: [
          link('Regions', '/admin/geo/regions', 'dot', { permissions: ['GEO_REGION_READ'] }),
          link('Landmarks', '/admin/geo/landmarks', 'dot', { permissions: ['GEO_LANDMARK_READ'] })
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
      link('Send notification', '/admin/notifications/broadcast', 'send', { permissions: ['NOTIFICATION_SEND'] }),
      link('Notification channels', '/admin/notifications/channels', 'bell', { permissions: ['NOTIFICATION_POLICY_READ'] })
    ]
  }
];
