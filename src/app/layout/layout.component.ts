import { ChangeDetectionStrategy, Component, DOCUMENT, HostListener, computed, effect, inject, signal, DestroyRef } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ActiveContextService } from '../core/services/active-context.service';
import { PermissionConstants } from '../core/rbac/permission.constants';
import { RoutePaths } from '../core/routes/route-paths';
import { AuthSessionService } from '../core/services/auth-session.service';
import { AuthStore } from '../features/auth/store/auth.store';
import { ContextSwitcherComponent } from '../shared/components/context-switcher/context-switcher.component';
import { NavIconsComponent } from './nav-icons.component';
import { NAV_SECTIONS, NavGroup, NavItem, NavLink, NavSection } from './nav.model';
import { NotificationCenterService } from '../features/notifications/notification-center.service';
import { ChatCenterService } from '../features/chat/chat-center.service';

const COLLAPSED_KEY = 'unitwise_sidebar_collapsed';
const EXPANDED_KEY = 'unitwise_sidebar_expanded';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ContextSwitcherComponent, NavIconsComponent],
  template: `
    <app-nav-icons />

    <div class="shell" [class.shell--collapsed]="rail()">
      <header class="topbar">
        <button
          type="button"
          class="icon-btn"
          aria-label="Open menu"
          [attr.aria-expanded]="drawerOpen()"
          (click)="openDrawer()"
        >
          <span aria-hidden="true">&#9776;</span>
          <!-- The menu is closed on a phone, so the unread dot rides on the button that opens it. -->
          @if (anyUnread()) {
            <span class="topbar__dot" aria-hidden="true"></span>
          }
        </button>
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">U</span>
          <span class="brand__name">Unitwise</span>
        </div>

        <!--
          The drawer is closed on a phone, so the context summary inside it is out
          of sight. It lives here instead — and as the switcher rather than a
          label, because the operator who notices they are in the wrong building
          is exactly the one who needs to change it (§30.5).

          Rendered only on a phone so that exactly one switcher is ever mounted:
          two would each load the agency's buildings.
        -->
        @if (mobile()) {
          <div class="topbar__context">
            <app-context-switcher />
          </div>
        }
      </header>

      @if (drawerOpen()) {
        <button type="button" class="scrim" aria-label="Close menu" (click)="closeDrawer()"></button>
      }

      <aside class="sidebar" [class.sidebar--open]="drawerOpen()" [attr.inert]="sidebarInert() || null">
        <header class="sidebar__head">
          @if (!rail()) {
            <div class="brand">
              <span class="brand__mark" aria-hidden="true">U</span>
              <span class="brand__name">Unitwise</span>
            </div>
          }

          <button
            type="button"
            class="icon-btn"
            [attr.aria-label]="headButtonLabel()"
            [attr.aria-expanded]="mobile() ? drawerOpen() : !collapsed()"
            (click)="onHeadButton()"
          >
            <span aria-hidden="true">{{ mobile() ? '✕' : (collapsed() ? '»' : '«') }}</span>
          </button>
        </header>

        @if (!mobile()) {
          <div class="sidebar__context" [class.sidebar__context--rail]="rail()">
            <app-context-switcher [compact]="rail()" />
          </div>
        }

        <nav class="nav" aria-label="Main">
          @for (section of sections(); track section.id) {
            @if (section.label && !rail()) {
              <p class="nav__heading">{{ section.label }}</p>
            } @else if (section.label) {
              <hr class="nav__rule" aria-hidden="true">
            }

            @for (item of section.items; track itemKey(item)) {
              @if (item.kind === 'link') {
                <a
                  class="row"
                  [routerLink]="item.route"
                  routerLinkActive="row--active"
                  [routerLinkActiveOptions]="{ exact: !!item.exact }"
                  [title]="rail() ? item.label : ''"
                  (click)="closeDrawer()"
                >
                  <svg class="row__icon" viewBox="0 0 24 24" aria-hidden="true"><use [attr.href]="'#nav-' + item.icon" /></svg>
                  @if (!rail()) {
                    <span class="row__label">{{ navLabel(item) }}</span>
                  }
                  @if (badgeCount(item); as count) {
                    <!-- In the rail the label is gone, so the count shrinks to a dot on the icon. -->
                    <span class="row__badge" [class.row__badge--dot]="rail()" [attr.aria-label]="count + ' unread'">
                      {{ rail() ? '' : (count > 99 ? '99+' : count) }}
                    </span>
                  }
                </a>
              } @else {
                <div class="group" [class.group--open]="isOpen(item)">
                  <button
                    type="button"
                    class="row row--group"
                    [class.row--active]="isGroupActive(item)"
                    [attr.aria-expanded]="isOpen(item)"
                    [title]="rail() ? item.label : ''"
                    (click)="toggleGroup(item)"
                  >
                    <svg class="row__icon" viewBox="0 0 24 24" aria-hidden="true"><use [attr.href]="'#nav-' + item.icon" /></svg>
                    @if (!rail()) {
                      <span class="row__label">{{ item.label }}</span>
                      <span class="row__chevron" aria-hidden="true">›</span>
                    }
                  </button>

                  @if (isOpen(item) && !rail()) {
                    <div class="submenu">
                      @for (child of item.children; track child.route) {
                        <a
                          class="row row--child"
                          [routerLink]="child.route"
                          routerLinkActive="row--active"
                          [routerLinkActiveOptions]="{ exact: !!child.exact }"
                          (click)="closeDrawer()"
                        >
                          <span class="row__label">{{ navLabel(child) }}</span>
                        </a>
                      }
                    </div>
                  }
                </div>
              }
            }
          }
        </nav>

        <footer class="sidebar__foot">
          <!--
            The account is a destination, not a menu entry. It sat among
            My tenancy, My leases and the rest, where it read as one more
            record about the person rather than the person themselves —
            and the footer spent a line saying "Signed in", which nobody
            needed told. Naming who is signed in and making that the way
            into the profile answers both.
          -->
          <a
            class="row row--account"
            routerLink="/me"
            routerLinkActive="row--active"
            [routerLinkActiveOptions]="{ exact: true }"
            [title]="rail() ? accountName() : ''"
            [attr.aria-label]="'View profile for ' + accountName()"
            (click)="closeDrawer()"
          >
            <!--
              Collapsed, the initials are all that renders, and they are
              decorative — the link carries its own label so it is never
              announced as an unnamed link.
            -->
            <span class="avatar" aria-hidden="true">{{ initials() }}</span>
            @if (!rail()) {
              <span class="row__label account__text">
                <span class="account__name">{{ accountName() }}</span>
                <span class="account__hint">View profile</span>
              </span>
            }
          </a>

          <button type="button" class="row row--signout" [title]="rail() ? 'Sign out' : ''" (click)="authStore.logout()">
            <svg class="row__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#nav-send" /></svg>
            @if (!rail()) {
              <span class="row__label">Sign out</span>
            }
          </button>
        </footer>
      </aside>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .shell {
      display: grid;
      grid-template-columns: 268px minmax(0, 1fr);
      min-height: 100vh;
      gap: 1rem;
      padding: 1rem;
    }

    .shell--collapsed {
      grid-template-columns: 72px minmax(0, 1fr);
    }

    .sidebar {
      position: sticky;
      top: 1rem;
      height: calc(100vh - 2rem);
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 0.6rem;
      padding: 0.85rem 0.7rem;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: var(--shadow-md);
      min-width: 0;
    }

    .sidebar__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0 0.15rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }

    .brand__mark {
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 9px;
      background: var(--primary);
      color: var(--surface);
      font-weight: 700;
      font-size: 0.85rem;
      flex: none;
    }

    .brand__name {
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .icon-btn {
      position: relative;
      flex: none;
      width: 1.9rem;
      height: 1.9rem;
      display: grid;
      place-items: center;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
    }

    .icon-btn:hover {
      color: var(--text);
    }

    .sidebar__context {
      padding: 0 0.15rem;
    }

    /* Only the nav scrolls, so the brand, switcher and sign-out stay put. */
    .nav {
      /* Allow this grid item to use its allotted row instead of growing the
       * drawer when a section has more links than fit on screen. */
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: var(--border-strong) transparent;
      display: grid;
      gap: 0.1rem;
      align-content: start;
      padding-right: 0.2rem;
    }

    .nav::-webkit-scrollbar {
      width: 6px;
    }

    .nav::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: 999px;
    }

    .nav::-webkit-scrollbar-track {
      background: transparent;
    }

    .nav__heading {
      margin: 0.7rem 0 0.2rem;
      padding-left: 0.6rem;
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .nav__rule {
      margin: 0.5rem 0.4rem;
      border: 0;
      border-top: 1px solid var(--border);
    }

    /* One row style for links, group headers and sign-out. */
    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      width: 100%;
      padding: 0.44rem 0.6rem;
      border: 0;
      border-left: 2px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted);
      font: inherit;
      font-size: 0.875rem;
      text-align: left;
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease;
    }

    .row:hover {
      background: var(--surface-2);
      color: var(--text);
    }

    .row--active {
      background: var(--primary-tint);
      border-left-color: var(--primary);
      color: var(--primary);
      font-weight: 600;
    }

    .row__icon {
      flex: none;
      width: 1.05rem;
      height: 1.05rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .row__label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Unread count: red, the one place the nav uses the colour, so it is noticed. */
    .row__badge {
      flex: none;
      min-width: 1.25rem;
      height: 1.25rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      background: var(--danger);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1.25rem;
      text-align: center;
    }

    .row__badge--dot {
      position: absolute;
      top: 0.35rem;
      right: 0.35rem;
      min-width: 0;
      width: 0.55rem;
      height: 0.55rem;
      padding: 0;
    }

    .topbar__dot {
      position: absolute;
      top: 0.2rem;
      right: 0.2rem;
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
      background: var(--danger);
      box-shadow: 0 0 0 2px var(--surface);
    }

    .row__chevron {
      flex: none;
      font-size: 1rem;
      line-height: 1;
      color: var(--text-subtle);
      transition: transform 0.15s ease;
    }

    .group--open .row__chevron {
      transform: rotate(90deg);
    }

    .submenu {
      display: grid;
      gap: 0.05rem;
      margin: 0.1rem 0 0.25rem 1.35rem;
      padding-left: 0.55rem;
      border-left: 1px solid var(--border);
    }

    .row--child {
      padding: 0.36rem 0.6rem;
      font-size: 0.84rem;
      border-left-width: 0;
      border-radius: 7px;
    }

    .row--child.row--active {
      background: var(--primary-tint);
      color: var(--primary);
    }

    .sidebar__foot {
      display: grid;
      gap: 0.4rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border);
    }

    .row--account { align-items: center; }

    /*
     * Sign out is separated, not merely spaced. Sitting flush under the
     * account row it reads as part of it, and it is the one control here
     * that ends the session — worth a beat of distance and a rule.
     */
    .row--signout {
      margin-top: 0.65rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }

    .avatar {
      display: inline-grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      flex: none;
      border-radius: 999px;
      background: var(--primary-tint);
      border: 1px solid var(--primary-ring);
      color: var(--primary-strong);
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .account__text {
      display: grid;
      gap: 0.05rem;
      min-width: 0;
    }

    /* An email is long and the sidebar is not; truncate rather than wrap. */
    .account__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .account__hint {
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--text-subtle);
    }

    .row--account.row--active .avatar {
      background: var(--primary-strong);
      border-color: var(--primary-strong);
      color: var(--surface);
    }

    /* Collapsed: icons only, centred, labels and submenus gone. */
    .shell--collapsed .row {
      justify-content: center;
      padding-inline: 0.4rem;
      border-left-width: 0;
    }

    .shell--collapsed .row--active {
      background: var(--primary-tint);
      color: var(--primary);
    }

    .shell--collapsed .sidebar__head {
      justify-content: center;
    }

    .sidebar__context--rail {
      display: flex;
      justify-content: center;
    }

    .content {
      display: grid;
      align-content: start;
      gap: 1rem;
      min-width: 0;
    }

    /* The phone header. Off on desktop, where the sidebar is always present. */
    .topbar {
      display: none;
      align-items: center;
      gap: 0.6rem;
      padding: 0.15rem 0.1rem;
    }

    /*
     * Takes the slack after the menu button and the brand, capped so a long
     * agency name cannot push the header wider than the screen. Its panel
     * inherits this width, which is what makes it readable on a phone.
     */
    .topbar__context {
      margin-left: auto;
      min-width: 0;
      /* Only as wide as the label, capped so a long agency name cannot push the
       * header past the screen. A fixed 16rem basis claimed all of it whatever
       * the label was, which is what crowded the wordmark. */
      flex: 0 1 auto;
      max-width: 16rem;
    }

    .scrim {
      display: none;
    }

    @media (max-width: 980px) {
      .shell,
      .shell--collapsed {
        grid-template-columns: minmax(0, 1fr);
        /*
         * Two auto rows (topbar, content) inside a 100vh grid: without this the
         * default stretch shares the leftover height between them and opens a
         * dead band above the header and another under it.
         */
        grid-template-rows: auto minmax(0, 1fr);
        align-content: start;
        gap: 0.5rem;
        padding: 0.5rem 0.6rem;
      }

      .topbar {
        display: flex;
      }

      /*
       * On a narrow phone the wordmark and the working context compete for one
       * row, and the context is the one that matters: it says which agency every
       * screen is acting on. The mark stays; the name gives way.
       */
      @media (max-width: 420px) {
        .brand__name { display: none; }
      }

      /*
       * A phone has no room for an icon rail, and pushing the page down to make
       * space for the nav buries the content the operator came for. So the
       * sidebar leaves the flow entirely and slides in over the page, at full
       * width with its labels intact.
       */
      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 60;
        width: min(86vw, 300px);
        height: 100dvh;
        /* The context-switcher row is not rendered on phones. Without a
         * three-row template, auto-placement puts the nav in the vacant
         * desktop context row (auto), letting Super Admin's long menu grow
         * and forcing the footer below the viewport. */
        grid-template-rows: auto minmax(0, 1fr) auto;
        border-radius: 0;
        border-inline-start: 0;
        /* The nav is the drawer's only scroll region. If the drawer itself
         * scrolls too, its footer (including Sign out) can be pushed beyond
         * the phone viewport instead of remaining in the final grid row. */
        overflow: hidden;
        transition: transform 0.22s ease, visibility 0.22s;
      }

      /*
       * Stated as mutually exclusive selectors rather than a base rule and an
       * override. Both are single-class, so an override would win only by
       * source order — and a reorder would silently strand the drawer offscreen
       * with no way to open it.
       */
      .sidebar:not(.sidebar--open) {
        visibility: hidden;
        transform: translateX(-100%);
      }

      .sidebar--open {
        visibility: visible;
        transform: none;
      }

      .scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 55;
        border: 0;
        padding: 0;
        background: rgba(20, 26, 23, 0.45);
        cursor: pointer;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sidebar {
        transition: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent {
  readonly authSession = inject(AuthSessionService);
  readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  readonly context = inject(ActiveContextService);
  readonly center = inject(NotificationCenterService);
  readonly chatCenter = inject(ChatCenterService);

  /** Anything unread anywhere — the dot on a phone's menu button. */
  readonly anyUnread = computed(() => this.center.unread() + this.chatCenter.unread() > 0);

  /** The live count for a link that carries one; 0 hides the badge. */
  badgeCount(item: NavLink): number {
    switch (item.badge) {
      case 'notifications': return this.center.unread();
      case 'chat': return this.chatCenter.unread();
      default: return 0;
    }
  }

  readonly collapsed = signal(this.readFlag(COLLAPSED_KEY));

  /** Phone layout: the sidebar is an overlay drawer rather than a column. */
  readonly mobile = signal(false);
  readonly drawerOpen = signal(false);

  /**
   * The icon-only rail is a desktop affordance. On a phone the same `collapsed`
   * preference would strip the labels off a drawer that has room for them, so
   * the rail is suppressed there and the drawer always shows full labels.
   */
  readonly rail = computed(() => this.collapsed() && !this.mobile());

  /** A closed drawer is off-screen; keep it out of the tab order while it is. */
  readonly sidebarInert = computed(() => this.mobile() && !this.drawerOpen());

  readonly headButtonLabel = computed(() => {
    if (this.mobile()) {
      return 'Close menu';
    }

    return this.collapsed() ? 'Expand sidebar' : 'Collapse sidebar';
  });

  /** Groups the operator has opened by hand. */
  private readonly openedByUser = signal<ReadonlySet<string>>(this.readExpanded());

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** Hide anything the user could not open, so the nav never offers a dead end. */
  /**
   * Is this an operator or an occupant? Decided by permission, not role name
   * (§33) — the same test the dashboard uses to pick its layout.
   */
  private readonly isOperator = computed(() =>
    this.worksWithProperty()
    // Bare BUILDING_READ is deliberately absent: a TENANT holds it for the
    // building they live in, and reading it as "manages property" gave them an
    // operator's nav. Managing other people's records is TENANT_READ upward.
    || this.context.canAny([
      PermissionConstants.TENANT_READ,
      PermissionConstants.TENANT_READ_ALL,
      PermissionConstants.PRODUCT_READ_ALL,
      PermissionConstants.ORDER_READ_ALL,
      PermissionConstants.USER_READ_ALL
    ]));

  /**
   * Agency-side: the roles whose day is buildings, tenants and rent. Decided by
   * permission, not role name (§30.1) — the same `AGENCY_READ` test the context
   * switcher uses to decide whether the agency tier is meaningful.
   */
  private readonly worksWithProperty = computed(() => this.context.canAny([
    PermissionConstants.AGENCY_READ,
    PermissionConstants.AGENCY_READ_ALL,
    PermissionConstants.BUILDING_READ_ALL
  ]));

  readonly sections = computed<NavSection[]>(() => {
    const sections = NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items
          .map((item) => this.pruneItem(item))
          .filter((item): item is NavItem => item !== null)
      }))
      .filter((section) => section.items.length > 0);

    /*
     * Hoist a section to directly under the dashboard.
     *
     * "Directly" is the whole point: hoisting to after the *lead section* put
     * Property below Find a room, Chat, Notifications and Notification
     * settings, because all five links used to share one section. The dashboard
     * now has a section of its own, and the hoisted section slots in behind it.
     * The context switcher sits above both and does not move.
     */
    const hoist = (id: string) => {
      const picked = sections.filter((section) => section.id === id);
      if (picked.length === 0) {
        return sections;
      }

      const rest = sections.filter((section) => !picked.includes(section));
      const afterDashboard = rest.findIndex((section) => section.id === 'dashboard') + 1;
      return [...rest.slice(0, afterDashboard), ...picked, ...rest.slice(afterDashboard)];
    };

    /*
     * Whatever the role does most sits directly under the dashboard.
     *
     * For an agency-side role — super admin, agency admin, caretaker — that is
     * housing: buildings, tenancies and rent are the daily work, and they were
     * buried under Users, Addresses and the whole ecommerce group. For a tenant
     * or a shopper it is their own records, which otherwise sat below
     * administration sections they cannot open at all.
     */
    if (this.worksWithProperty()) {
      /*
       * A super admin's day starts with the platform, not with one agency's
       * buildings: users, roles and the master contract are what only they
       * can reach, and Property is somewhere they go on behalf of someone
       * else. Administration is the one hoisted for them, so it lands under
       * the dashboard and Property keeps its place below it.
       */
      return this.context.isSuperAdmin()
        ? hoist('administration')
        : hoist('property');
    }

    return this.isOperator() ? sections : hoist('my-account');
  });

  constructor() {
    effect(() => this.writeFlag(COLLAPSED_KEY, this.collapsed()));

    const query = this.document.defaultView?.matchMedia('(max-width: 980px)');
    if (query) {
      this.mobile.set(query.matches);
      query.addEventListener('change', (event) => {
        this.mobile.set(event.matches);
        if (!event.matches) {
          this.drawerOpen.set(false);
        }
      });
    }

    // Any navigation closes the drawer — including a submenu child, a logo tap,
    // or a redirect the operator did not initiate from the nav at all.
    effect(() => {
      this.currentUrl();
      this.drawerOpen.set(false);
    });

    // The page behind an overlay must not scroll with it.
    effect(() => {
      this.document.body.classList.toggle('body--drawer-open', this.drawerOpen());
    });

    // Leaving the shell with the drawer open — signing out from it — must not
    // carry the scroll lock onto the sign-in page, where nothing would lift it
    // and a long form (sign-up) could never reach its submit button.
    inject(DestroyRef).onDestroy(() => this.document.body.classList.remove('body--drawer-open'));
  }

  /**
   * Who is signed in.
   *
   * Read from the profile the session already holds, never from the
   * token: its `sub` is the user id, so using it here printed a bare
   * number where a name belongs. Falls back to the email, then to a
   * neutral label while the profile is still in flight.
   */
  readonly accountName = computed(() => {
    const profile = this.authSession.userProfile();
    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();

    if (name) {
      return name;
    }

    const email = profile?.email;
    return email ? email.split('@')[0] || email : 'My account';
  });

  /** Two letters for the avatar: initials, or the first of the email. */
  readonly initials = computed(() => {
    const profile = this.authSession.userProfile();
    const first = profile?.firstName?.trim();
    const last = profile?.lastName?.trim();

    if (first || last) {
      return ((first?.charAt(0) ?? '') + (last?.charAt(0) ?? '')).toUpperCase();
    }

    const email = profile?.email?.trim();
    return email ? email.charAt(0).toUpperCase() : '·';
  });

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  /** Closes the drawer on a phone; toggles the icon rail on a desktop. */
  onHeadButton(): void {
    if (this.mobile()) {
      this.drawerOpen.set(false);
      return;
    }

    this.toggleSidebar();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.drawerOpen.set(false);
  }

  /** "All agencies" for a platform-wide reader, "Agencies" for everyone else. */
  navLabel(item: NavItem): string {
    if (item.kind === 'link' && item.platformLabel && item.platformPermission
        && this.context.can(item.platformPermission)) {
      return item.platformLabel;
    }

    return item.label;
  }

  itemKey(item: NavItem): string {
    return item.kind === 'group' ? item.id : item.route;
  }

  isGroupActive(group: NavGroup): boolean {
    const url = this.currentUrl();
    return url === group.route || url.startsWith(`${group.route}/`);
  }

  /** Open when the operator opened it, or when it holds the current page. */
  isOpen(group: NavGroup): boolean {
    return this.openedByUser().has(group.id) || this.isGroupActive(group);
  }

  toggleGroup(group: NavGroup): void {
    if (this.rail()) {
      // Collapsed rail has no room for a submenu — jump to the section instead.
      void this.router.navigateByUrl(group.children[0]?.route ?? group.route);
      return;
    }

    this.openedByUser.update((open) => {
      const next = new Set(open);
      // An active group is open implicitly, so the first click must close it.
      const shouldClose = next.has(group.id) || this.isGroupActive(group);
      if (shouldClose) {
        next.delete(group.id);
      } else {
        next.add(group.id);
      }

      this.writeExpanded(next);
      return next;
    });
  }

  toggleSidebar(): void {
    this.collapsed.update((value) => !value);
  }

  private pruneItem(item: NavItem): NavItem | null {
    if (!this.allowed(item.permissions) || !this.forAudience(item.roles)) {
      return null;
    }

    if (item.kind === 'link') {
      return item;
    }

    const children = item.children
      .filter((child: NavLink) =>
        this.allowed(child.permissions) && this.forAudience(child.roles) && this.inAgencyScope(child))
      .map((child: NavLink) => this.resolveAgencyRoute(child));

    return children.length > 0 ? { ...item, children } : null;
  }

  /**
   * More than one agency to choose between — either the operator administers
   * several, or they can read every agency on the platform. Read from the
   * profile already in memory, so the nav costs no request to decide.
   */
  private readonly multipleAgencies = computed(() =>
    this.context.canSwitchAgency() || this.context.can(PermissionConstants.AGENCY_READ_ALL));

  private inAgencyScope(link: NavLink): boolean {
    if (!link.agencyScope) {
      return true;
    }

    return link.agencyScope === 'multi'
      ? this.multipleAgencies()
      : !this.multipleAgencies() && this.context.agencyId() !== null;
  }

  /** The single-agency link points at that agency, not at a list of one. */
  private resolveAgencyRoute(link: NavLink): NavLink {
    const agencyId = this.context.agencyId();
    return link.agencyScope === 'single' && agencyId !== null
      ? { ...link, route: RoutePaths.agencyDetail(agencyId), exact: true }
      : link;
  }

  /**
   * Whether a section is for the person currently working.
   *
   * Almost everything in the nav is decided by permission (§30.9) and this
   * is the deliberate exception: a few sections are about audience rather
   * than capability. A caretaker holds plenty of permissions and is still
   * not someone browsing for a room to rent, and no permission says "is a
   * renter" — being one is not an operation.
   *
   * Read from the ACTIVE role, so switching context changes what is
   * offered, and it hides nothing the server would have allowed: every
   * route behind these is still reachable by URL and still authorised
   * there.
   */
  private forAudience(roles?: string[]): boolean {
    if (!roles?.length) {
      return true;
    }

    const active = this.context.active().roleName;
    return !!active && roles.includes(active);
  }

  private allowed(permissions?: string[]): boolean {
    // No permissions declared means the route is open to any signed-in user,
    // mirroring the backend's authenticated-by-default posture (skills §8).
    //
    // Scoped to the ACTIVE role, so the nav is the job the operator is doing —
    // an ecommerce admin gets no agency or building sections, even if they hold
    // an agency role elsewhere (§30).
    return !permissions?.length || this.context.canAny(permissions);
  }

  private readFlag(key: string): boolean {
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  }

  private writeFlag(key: string, value: boolean): void {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Restricted browsing context — the preference just lasts this session.
    }
  }

  private readExpanded(): ReadonlySet<string> {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
    } catch {
      return new Set();
    }
  }

  private writeExpanded(open: ReadonlySet<string>): void {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...open]));
    } catch {
      // As above.
    }
  }
}
