import { PageTitleService } from '../core/services/page-title.service';
import { RentService } from '../features/rent/rent.service';
import { Location } from '@angular/common';
import { ConfirmService } from '../shared/services/confirm.service';
import { ChangeDetectionStrategy, Component, DOCUMENT, HostListener, computed, effect, inject, signal, untracked, DestroyRef } from '@angular/core';
import { BillingBannerComponent } from '../features/billing/components/billing-banner.component';
import { ActivatedRouteSnapshot, NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, map } from 'rxjs';
import { ActiveContextService } from '../core/services/active-context.service';
import { PermissionConstants } from '../core/rbac/permission.constants';
import { RoleConstants } from '../core/rbac/role.constants';
import { RoutePaths } from '../core/routes/route-paths';
import { AuthSessionService } from '../core/services/auth-session.service';
import { AuthStore } from '../features/auth/store/auth.store';
import { AppManagementService } from '../features/app-management/app-management.service';
import { TenancyChipComponent } from '../features/tenants/tenants/tenancy-chip.component';
import { ContextSwitcherComponent } from '../shared/components/context-switcher/context-switcher.component';
import { NavIconsComponent } from './nav-icons.component';
import { NAV_SECTIONS, NavGroup, NavItem, NavLink, NavSection } from './nav.model';
import { BillingService } from '../features/billing/billing.service';
import { PendingCounts } from '../features/billing/billing.models';
import { NotificationCenterService } from '../features/notifications/notification-center.service';
import { ChatCenterService } from '../features/chat/chat-center.service';

const COLLAPSED_KEY = 'unitwise_sidebar_collapsed';
const EXPANDED_KEY = 'unitwise_sidebar_expanded';

interface BottomTab {
  label: string;
  route: string;
  icon: string;
  exact: boolean;
  permissions: readonly string[];
}

/*
 * The tab bar is the job of the ACTIVE role. A tab can share a label across roles and still
 * open a different page: Rent is the whole agency (or the building in context) for an agency
 * role, and only the tenant's own balance for a tenant. Within a set, tabs still need their
 * permissions; the first three that pass are shown, then More.
 */
const AGENCY_TABS: readonly BottomTab[] = [
  { label: 'Rent', route: RoutePaths.rentOverview, icon: 'cash', exact: true, permissions: ['STATS_AGENCY_READ'] },
  { label: 'Payments', route: RoutePaths.rentPayments, icon: 'swap', exact: true, permissions: ['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ'] },
  { label: 'Tenants', route: RoutePaths.tenants, icon: 'tenants', exact: false, permissions: ['TENANT_READ_ALL', 'TENANT_READ'] },
  { label: 'Repairs', route: RoutePaths.maintenance, icon: 'wrench', exact: false, permissions: ['MAINTENANCE_READ_ALL', 'MAINTENANCE_READ'] }
];

/** A tenant's own records are authorised by ownership, not permissions, so these carry none. */
const TENANT_TABS: readonly BottomTab[] = [
  { label: 'Rent', route: RoutePaths.myArrears, icon: 'cash', exact: false, permissions: [] },
  { label: 'Payments', route: RoutePaths.myRentPayments, icon: 'swap', exact: false, permissions: [] },
  { label: 'Repairs', route: RoutePaths.myMaintenance, icon: 'wrench', exact: false, permissions: [] }
];

/** An owner: statements by ownership, the rest read-only through their building-level assignment. */
const LANDLORD_TABS: readonly BottomTab[] = [
  { label: 'Statements', route: RoutePaths.myProperties, icon: 'building', exact: false, permissions: [] },
  { label: 'Rent', route: RoutePaths.rentMonth, icon: 'cash', exact: false, permissions: ['RENT_ARREAR_READ'] },
  { label: 'Repairs', route: RoutePaths.maintenance, icon: 'wrench', exact: false, permissions: ['MAINTENANCE_READ'] }
];

const ECOM_ADMIN_TABS: readonly BottomTab[] = [
  { label: 'Orders', route: RoutePaths.ecomOrders, icon: 'box', exact: false, permissions: ['ORDER_READ_ALL'] },
  { label: 'Products', route: RoutePaths.ecomProducts, icon: 'tag', exact: false, permissions: ['PRODUCT_READ_ALL'] }
];

const SHOPPER_TABS: readonly BottomTab[] = [
  { label: 'Shop', route: RoutePaths.shop, icon: 'bag', exact: true, permissions: [] },
  { label: 'Orders', route: RoutePaths.myOrders, icon: 'box', exact: false, permissions: [] }
];

/** The platform's own jobs: the agencies it serves, its billing, and who can sign in. */
const PLATFORM_TABS: readonly BottomTab[] = [
  { label: 'Agencies', route: RoutePaths.agencies, icon: 'building', exact: false, permissions: ['AGENCY_READ_ALL'] },
  { label: 'Billing', route: RoutePaths.billingOverview, icon: 'cash', exact: false, permissions: ['BILLING_SUBSCRIPTION_MANAGE'] },
  { label: 'Users', route: RoutePaths.adminUsers, icon: 'users', exact: false, permissions: ['USER_READ_ALL'] }
];

const TABS_BY_ROLE: Readonly<Record<string, readonly BottomTab[]>> = {
  SUPER_ADMIN: PLATFORM_TABS,
  TENANT: TENANT_TABS,
  LANDLORD: LANDLORD_TABS,
  ECOM_ADMIN: ECOM_ADMIN_TABS,
  ECOM_CUSTOMER: SHOPPER_TABS,
  GUEST: SHOPPER_TABS,
  USER: SHOPPER_TABS
};

/** The URL is the route or a page beneath it. */
const under = (url: string, route: string) => url === route || url.startsWith(`${route}/`);

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [TenancyChipComponent, BillingBannerComponent, RouterOutlet, RouterLink, RouterLinkActive, ContextSwitcherComponent, NavIconsComponent],
  template: `
    <app-nav-icons />

    <div class="shell" [class.shell--collapsed]="rail()">
      <!-- With the drawer open on a phone, everything behind it is out of reach of the keyboard. -->
      <header class="topbar" [attr.inert]="behindDrawer() || null">
        <!-- The tab bar's More opens the menu, so this end of the bar is free for the way back. -->
        @if (showBack()) {
          <button type="button" class="icon-btn" aria-label="Back" (click)="goBack()"><span aria-hidden="true">‹</span></button>
        }
        <span class="topbar__title">{{ pageTitle() }}</span>
        <!-- One count for everything unread, notifications and messages; with only messages unread, it opens Chat. -->
        <a class="icon-btn topbar__bell" [routerLink]="bellRoute()"
           [attr.aria-label]="unreadTotal() > 0 ? 'Notifications and messages, ' + unreadTotal() + ' unread' : 'Notifications'">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="#nav-bell" /></svg>
          @if (unreadTotal() > 0) {
            <span class="topbar__count" aria-hidden="true">{{ unreadTotal() > 99 ? '99+' : unreadTotal() }}</span>
          }
        </a>

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
            <!-- A tenant has no building to switch: their home is the context. -->
            @if (tenantView()) { <app-tenancy-chip /> } @else { <app-context-switcher /> }
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
              <!-- The app's mark: a roof over a door, in the brand colour. A real logo file can replace it here. -->
              <span class="brand__mark" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v8.5h11V10" /><path d="M10.5 18.5v-4h3v4" /></svg>
              </span>
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
            @if (tenantView()) { @if (!rail()) { <app-tenancy-chip /> } } @else { <app-context-switcher [compact]="rail()" /> }
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
                    <span class="row__text">
                      <span class="row__label">{{ navLabel(item) }}</span>
                    </span>
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
                      <span class="row__text">
                        <span class="row__label">{{ item.label }}</span>
                        </span>
                      @if (!isOpen(item) && groupBadge(item); as count) {
                        <span class="row__badge" [attr.aria-label]="count + ' waiting'">{{ count > 99 ? '99+' : count }}</span>
                      }
                      <span class="row__chevron" aria-hidden="true">›</span>
                    } @else if (groupBadge(item)) {
                      <span class="row__badge row__badge--dot" aria-hidden="true"></span>
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
                          @if (badgeCount(child); as count) {
                            <!-- In the rail the label is gone, so the count shrinks to a dot on the icon. -->
                            <span class="row__badge" [class.row__badge--dot]="rail()" [attr.aria-label]="count + ' unread'">
                              {{ rail() ? '' : (count > 99 ? '99+' : count) }}
                            </span>
                          }
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

          <button type="button" class="row row--signout" [title]="rail() ? 'Sign out' : ''" (click)="signOut()">
            <svg class="row__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#nav-logout" /></svg>
            @if (!rail()) {
              <span class="row__label">Sign out</span>
            }
          </button>
          @if (appVersion() && !rail()) { <span class="app-version">Version {{ appVersion() }}</span> }
        </footer>
      </aside>

      <main class="content" [class.content--tabs]="showTabs()" [class.content--focus]="focusPage()" [attr.inert]="behindDrawer() || null">
        <!-- The agency's subscription, when it needs the landlord: trial ending, overdue, read-only. -->
        <app-billing-banner />
        <router-outlet />
      </main>

      @if (showRecordPayment()) {
        <a class="btn btn-primary fab" [class.fab--over-tabs]="showBar()" [routerLink]="RoutePaths.rentPaymentCreate">Record payment</a>
      }

      @if (showBar()) {
        <nav class="tabs" aria-label="Quick links" [attr.inert]="behindDrawer() || null">
          @for (tab of tabs(); track tab.route) {
            <a class="tabs__item" [routerLink]="tab.route" routerLinkActive="tabs__item--active"
               [routerLinkActiveOptions]="{ exact: tab.exact }">
              <svg viewBox="0 0 24 24" aria-hidden="true"><use [attr.href]="'#nav-' + tab.icon" /></svg>
              <span>{{ tab.label }}</span>
            </a>
          }
          <button type="button" class="tabs__item" (click)="openDrawer()">
            <!-- The icon stays the icon: unread counts live on the header's bell. -->
            <span class="tabs__more" aria-hidden="true">&#9776;</span>
            <span>More</span>
          </button>
        </nav>
      }
    </div>
  `,
  styles: [`
    .shell {
      display: grid;
      grid-template-columns: 268px minmax(0, 1fr);
      min-height: 100vh;
      gap: var(--space-4);
      padding: var(--space-4);
      /*
       * Nothing inside may widen the page. Phone browsers do not reliably honour
       * overflow-x on html, so a few pixels spilling out of any card let the
       * background pan sideways past the content. clip (not hidden) creates no
       * scroll container, so the sticky sidebar keeps working; fixed bars,
       * the drawer and top-layer dialogs are not clipped by it.
       */
      max-width: 100%;
      overflow-x: clip;
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
      gap: var(--space-2-5);
      padding: var(--space-3) var(--space-3);
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
      gap: var(--space-2);
      padding: 0 var(--space-0-5);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .brand__mark {
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: var(--radius-xs);
      background: var(--primary);
      color: var(--surface);
      font-weight: var(--weight-bold);
      font-size: var(--text-sm);
      flex: none;
    }
    .brand__mark svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    .brand__name {
      font-weight: var(--weight-bold);
      letter-spacing: -0.01em;
    }

    .icon-btn {
      position: relative;
      flex: none;
      width: 2.75rem;
      height: 2.75rem;
      display: grid;
      place-items: center;
      border-radius: var(--radius-xs);
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--text-sm);
      line-height: 1;
    }

    .icon-btn:hover {
      color: var(--text);
    }

    .sidebar__context {
      padding: 0 var(--space-0-5);
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
      gap: var(--space-0-5);
      align-content: start;
      padding-right: var(--space-1);
    }

    .nav::-webkit-scrollbar {
      width: 6px;
    }

    .nav::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: var(--radius-pill);
    }

    .nav::-webkit-scrollbar-track {
      background: transparent;
    }

    .nav__heading {
      margin: var(--space-3) 0 var(--space-1);
      padding-left: var(--space-2-5);
      /* One step up from a caption: a heading people read, not small print. */
      font-size: var(--text-sm);
      font-weight: var(--weight-bold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text);
    }

    .nav__rule {
      margin: var(--space-2) var(--space-1-5);
      border: 0;
      border-top: 1px solid var(--border);
    }

    /* One row style for links, group headers and sign-out. */
    .row {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-2-5);
      width: 100%;
      padding: var(--space-2) var(--space-2-5);
      border: 0;
      border-left: 2px solid transparent;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--text-muted);
      font: inherit;
      font-size: var(--text-md);
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
      font-weight: var(--weight-semibold);
    }

    .row__icon {
      flex: none;
      width: 1.15rem;
      height: 1.15rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .row__text { display: grid; flex: 1; min-width: 0; }
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
      padding: 0 var(--space-1-5);
      border-radius: var(--radius-pill);
      background: var(--danger);
      color: var(--on-accent);
      font-size: var(--text-2xs);
      font-weight: var(--weight-bold);
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
      font-size: var(--text-base);
      line-height: 1;
      color: var(--text-subtle);
      transition: transform 0.15s ease;
    }

    /* One direction everywhere: down to open, up to close. */
    .row__chevron { transform: rotate(90deg); }
    .group--open .row__chevron {
      transform: rotate(-90deg);
    }

    /* The page's own link carries the highlight; its open group only says which section it is in. */
    .group--open > .row--group.row--active { background: none; border-left-color: transparent; }

    .submenu {
      display: grid;
      gap: var(--space-0-5);
      margin: var(--space-0-5) 0 var(--space-1) var(--space-5);
      padding-left: var(--space-2);
      border-left: 1px solid var(--border);
    }

    /* The whole row is the target, so a finger gets the full height. */
    @media (pointer: coarse) {
      .row { min-height: 2.75rem; }
    }

    .row--child {
      padding: var(--space-1-5) var(--space-2-5);
      font-size: var(--text-sm);
      border-left-width: 0;
      border-radius: 7px;
    }

    .row--child.row--active {
      background: var(--primary-tint);
      color: var(--primary);
    }

    .sidebar__foot {
      display: grid;
      gap: var(--space-1-5);
      padding-top: var(--space-2);
      border-top: 1px solid var(--border);
    }

    .row--account { align-items: center; }

    /*
     * Sign out is separated, not merely spaced. Sitting flush under the
     * account row it reads as part of it, and it is the one control here
     * that ends the session — worth a beat of distance and a rule.
     */
    .row--signout {
      margin-top: var(--space-2-5);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }

    .avatar {
      display: inline-grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      flex: none;
      border-radius: var(--radius-pill);
      background: var(--primary-tint);
      border: 1px solid var(--primary-ring);
      color: var(--primary-strong);
      font-size: var(--text-2xs);
      font-weight: var(--weight-bold);
      letter-spacing: 0.02em;
    }

    .account__text {
      display: grid;
      gap: var(--space-0-5);
      min-width: 0;
    }

    /* An email is long and the sidebar is not; truncate rather than wrap. */
    .account__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: var(--weight-semibold);
    }

    .account__hint {
      font-size: var(--text-2xs);
      font-weight: var(--weight-medium);
      color: var(--text-muted);
    }

    .row--account.row--active .avatar {
      background: var(--primary-strong);
      border-color: var(--primary-strong);
      color: var(--surface);
    }

    /* Collapsed: icons only, centred, labels and submenus gone. */
    .shell--collapsed .row {
      justify-content: center;
      padding-inline: var(--space-1-5);
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
      gap: var(--space-4);
      min-width: 0;
      /* Air under the last card, so the page visibly ends rather than looking cut off. */
      padding-bottom: var(--space-8);
    }


    /* Clear of the tab bar, or the page's last action sits underneath it. */
    .content--tabs { padding-bottom: calc(var(--space-8) + 4rem); }
    .app-version { display: block; padding: var(--space-1) var(--space-3) 0; font-size: var(--text-xs); color: var(--text-muted); }
    .content--tabs.content--focus { padding-bottom: var(--space-8); }

    .tabs {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 40;
      display: flex;
      padding-bottom: env(safe-area-inset-bottom);
      border-top: 1px solid var(--border);
      background: var(--surface);
    }

    .fab {
      position: fixed;
      right: var(--space-3);
      bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
      z-index: 39;
      box-shadow: var(--shadow-md);
    }

    .fab--over-tabs { bottom: calc(4.25rem + env(safe-area-inset-bottom)); }

    /* Large text: a label stays inside its own tab, cut short rather than running into the next. */
    .tabs__item > span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-inline: 2px; }
    .tabs__item {
      display: grid;
      flex: 1 1 0;
      justify-items: center;
      gap: var(--space-0-5);
      min-width: 0;
      min-height: 3.5rem;
      padding: var(--space-1-5) 0;
      border: 0;
      background: none;
      color: var(--text-muted);
      font: inherit;
      font-size: var(--text-xs);
      text-decoration: none;
    }

    .tabs__more { position: relative; }
    .tabs__item svg,
    .topbar__bell svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .tabs__item svg { width: 22px; height: 22px; }
    .tabs__item--active { color: var(--primary-strong); font-weight: var(--weight-semibold); }

    /* The phone header. Off on desktop, where the sidebar is always present. */
    .topbar {
      display: none;
      align-items: center;
      gap: var(--space-2-5);
      padding: var(--space-0-5) var(--space-0-5);
    }

    /*
     * Takes the slack after the menu button and the brand, capped so a long
     * agency name cannot push the header wider than the screen. Its panel
     * inherits this width, which is what makes it readable on a phone.
     */
    /* Up to two lines, then cut: a record's name should read in full, not as "Highridge Hom…". */
    .topbar__title {
      /* Keeps room for a short word ("Rent") whole; the context beside it gives way first. */
      flex: 1 0 5.5rem;
      min-width: 5.5rem;
      overflow: hidden;
      font-weight: var(--weight-semibold);
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow-wrap: anywhere;
    }

    .topbar__bell { position: relative; flex: none; color: inherit; }
    .topbar__count { position: absolute; top: -4px; right: -4px; min-width: 1.25rem; height: 1.25rem; padding: 0 4px; border-radius: var(--radius-pill);
                     background: var(--danger-fill); color: var(--on-primary); font-size: var(--text-2xs); font-weight: var(--weight-bold);
                     line-height: 1.25rem; text-align: center; }

    .topbar__context {
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
        gap: var(--space-2);
        padding: var(--space-2) var(--space-2-5);
      }

      /*
       * A fixed app bar: the menu and the working context stay in reach however far the page
       * scrolls, so the building every screen is showing is always one tap from being changed.
       */
      .topbar {
        display: flex;
        position: sticky;
        top: 0;
        z-index: 50;
        margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2-5)) 0;
        padding: var(--space-2) var(--space-2-5);
        border-bottom: 1px solid var(--border);
        background: var(--surface);
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
        background: var(--backdrop);
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
  private readonly confirmDialog = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private readonly pageTitles = inject(PageTitleService);
  private readonly rent = inject(RentService);
  readonly context = inject(ActiveContextService);
  readonly center = inject(NotificationCenterService);
  readonly chatCenter = inject(ChatCenterService);

  readonly RoutePaths = RoutePaths;

  /** Tenants' reported payments waiting on the landlord; refreshed as they move around. */
  readonly reportsWaiting = signal(0);

  /** One place for it on a phone, above the tab bar; the pages' own buttons step aside. */
  readonly showRecordPayment = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    return this.mobile() && this.context.canAny(['RENT_PAYMENT_CREATE', 'RENT_PAYMENT_WRITE'])
      && (path === RoutePaths.home || under(path, RoutePaths.rentOverview))
      // The form itself, and the lists where every row already has one for that tenant.
      && path !== RoutePaths.rentPaymentCreate && path !== RoutePaths.rentPortfolioOverdue && path !== RoutePaths.rentArrears;
  });

  /** Home for everyone, then the frequent jobs a role can reach; More is always the full menu. */
  readonly tabs = computed<BottomTab[]>(() => {
    const role = this.context.active().roleName ?? '';
    const work = (TABS_BY_ROLE[role] ?? AGENCY_TABS)
      .filter((tab) => !tab.permissions.length || this.context.canAny(tab.permissions))
      .slice(0, 3);
    return [{ label: 'Home', route: RoutePaths.home, icon: 'grid', exact: true, permissions: [] }, ...work];
  });
  /** The web version as the platform admin set it under App management. */
  readonly appVersion = signal<string | null>(null);
  private readonly appInfo = inject(AppManagementService);

  readonly unreadTotal = computed(() => this.center.unread() + this.chatCenter.unread());
  readonly bellRoute = computed(() => this.center.unread() === 0 && this.chatCenter.unread() > 0 ? RoutePaths.chat : RoutePaths.notifications);

  /** Working as a tenant, with no other role to switch to. */
  readonly tenantView = computed(() => this.context.active().roleName === 'TENANT' && !this.context.canSwitchRole());
  readonly showTabs = computed(() => this.mobile() && this.tabs().length > 0);
  /**
   * A form or a conversation (route data `focus`) has the screen to itself: the tab bar hides so
   * the form's actions or the composer sit at the bottom. The header, and its Back, stay.
   */
  readonly focusPage = computed(() => {
    this.currentUrl();
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route) {
      if (route.data?.['focus'] === true) {
        return true;
      }
      route = route.firstChild;
    }
    return false;
  });
  readonly showBar = computed(() => this.showTabs() && !this.focusPage());
  readonly showBack = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    // Every page but Home has the way back, tab pages included: one header, wherever it was opened from.
    return this.showTabs() && path !== RoutePaths.home;
  });

  /** What the deepest route calls itself, for the phone header. */
  readonly pageTitle = computed(() => {
    const named = this.pageTitles.title();
    if (named) {
      return named;
    }
    this.currentUrl();
    let route = this.router.routerState.snapshot.root;
    let title: string | undefined;
    while (route) {
      title = (route.data['title'] as string | undefined) ?? title;
      route = route.firstChild!;
    }
    return title ?? 'Unitwise';
  });

  private async loadReportsWaiting(agencyId: number | null): Promise<void> {
    if (agencyId === null) {
      this.reportsWaiting.set(0);
      return;
    }
    try {
      const page = await firstValueFrom(this.rent.getPaymentReports(agencyId, { status: 'SUBMITTED', page: 0, size: 1 }));
      this.reportsWaiting.set(page.pagination?.totalElements ?? page.items.length);
    } catch {
      // A badge is a hint: without it the page itself still shows what is waiting.
    }
  }

  /** A link opened fresh has nothing behind it, so back goes home rather than off the app. */
  goBack(): void {
    const state = this.location.getState() as { navigationId?: number } | null;
    if ((state?.navigationId ?? 1) > 1) {
      this.location.back();
    } else {
      void this.router.navigateByUrl(RoutePaths.home);
    }
  }

  /** The live count for a link that carries one; 0 hides the badge. */
  badgeCount(item: NavLink): number {
    switch (item.badge) {
      case 'notifications': return this.center.unread();
      case 'chat': return this.chatCenter.unread();
      case 'reports': return this.reportsWaiting();
      case 'billing-requests': return this.billingPending().paymentReports + this.billingPending().planRequests;
      case 'billing-unmatched': return this.billingPending().unmatchedPayments;
      default: return 0;
    }
  }

  /** What waits for the platform's billing: payment reports, plan requests, unmatched money. */
  readonly billingPending = signal<PendingCounts>({ paymentReports: 0, planRequests: 0, unmatchedPayments: 0, total: 0 });
  private readonly billing = inject(BillingService);

  /** A folded group shows its children's counts added up. */
  groupBadge(item: NavItem): number {
    return item.kind === 'group' && item.badge === 'billing'
      ? item.children.reduce((sum, child) => sum + this.badgeCount(child), 0) : 0;
  }

  private async loadBillingPending(load: boolean): Promise<void> {
    if (!load) {
      this.billingPending.set({ paymentReports: 0, planRequests: 0, unmatchedPayments: 0, total: 0 });
      return;
    }
    try {
      this.billingPending.set(await firstValueFrom(this.billing.pendingCounts()));
    } catch {
      // A badge is a hint.
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
  readonly behindDrawer = computed(() => this.mobile() && this.drawerOpen());

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
    const hoist = (...ids: string[]) => {
      const picked = ids.flatMap((id) => sections.filter((section) => section.id === id));
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
    // An owner: their statements first, then the read-only rent and building pages.
    if (this.context.active().roleName === RoleConstants.LANDLORD) {
      return hoist('landlord', 'finance', 'property');
    }

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
        : hoist('finance', 'tenant-work', 'property');
    }

    // The shop desk's day is the shop: its section sits right under the dashboard.
    return this.isOperator() ? hoist('ecommerce') : hoist('landlord', 'tenancy');
  });

  /** It sits right under the profile link, where a slip of the thumb ends the session. */
  async signOut(): Promise<void> {
    if (await this.confirmDialog.ask({ title: 'Sign out?', message: 'Anything not saved on this page will be lost, and you will need to sign in again.', confirmLabel: 'Sign out' })) {
      this.authStore.logout();
    }
  }

  constructor() {
    effect(() => this.writeFlag(COLLAPSED_KEY, this.collapsed()));
    this.appInfo.getAppInfo().pipe(takeUntilDestroyed()).subscribe({ next: (info) => this.appVersion.set(info.appVersion ?? null), error: () => undefined });

    // A record's name belongs to that page only.
    this.router.events.pipe(filter((event) => event instanceof NavigationStart), takeUntilDestroyed())
      .subscribe(() => this.pageTitles.set(null));

    effect(() => {
      const agencyId = this.context.agencyId();
      const canRead = this.context.canAny(['RENT_PAYMENT_READ_ALL', 'RENT_PAYMENT_READ']);
      this.currentUrl();
      untracked(() => void this.loadReportsWaiting(canRead ? agencyId : null));
    });

    effect(() => {
      const platform = this.context.canAny(['BILLING_PAYMENT_RECORD', 'BILLING_SUBSCRIPTION_MANAGE']);
      this.currentUrl();
      untracked(() => void this.loadBillingPending(platform));
    });

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

  /** Under the group's prefix, or on any of its children — a group may gather pages from several prefixes. */
  /**
   * A group holds the current page when one of its links does (an exact link only on its own
   * URL). Failing that, the group whose route prefixes the URL most specifically claims it — a
   * tenant's detail page under Tenants & leases, a payment's under Payments rather than Rent &
   * billing — unless a link elsewhere already does. Only one group is where the operator is.
   */
  isGroupActive(group: NavGroup): boolean {
    const url = this.currentUrl();
    if (group.children.some((child) => this.linkMatches(child, url))) {
      return true;
    }
    if (!under(url, group.route)) {
      return false;
    }
    // Another link claims the page, or a group with a longer (more specific) route does.
    return !this.sections().some((section) => section.items.some((item) =>
      item.kind === 'group'
        ? item !== group && (item.children.some((child) => this.linkMatches(child, url))
          || (under(url, item.route) && item.route.length > group.route.length))
        : this.linkMatches(item, url)));
  }

  private linkMatches(link: NavLink, url: string): boolean {
    return link.exact ? url === link.route : under(url, link.route);
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
      if (item.unless?.length && this.context.canAny(item.unless)) {
        return null;
      }
      if (item.forOwners && !this.context.managesForOwners()) {
        return null;
      }
      return this.forSide(item) ? item : null;
    }

    const children = item.children
      .filter((child: NavLink) =>
        this.allowed(child.permissions) && this.forAudience(child.roles) && this.inAgencyScope(child) && this.forSide(child))
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

  /** Property-side links for roles that work with buildings; `others` links for everyone else. */
  private forSide(link: NavLink): boolean {
    return !link.audience || (link.audience === 'property') === this.worksWithProperty();
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
