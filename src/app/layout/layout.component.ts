import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthSessionService } from '../core/services/auth-session.service';
import { AuthStore } from '../features/auth/store/auth.store';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="layout-shell" [class.layout-shell--collapsed]="sidebarCollapsed()">
      <aside class="sidebar glass" [class.sidebar--collapsed]="sidebarCollapsed()">
        <div class="sidebar__header">
          <div class="brand" [class.sr-only]="sidebarCollapsed()">
            <p class="eyebrow">Unitwise</p>
            <h1>Operations</h1>
          </div>

          <button
            type="button"
            class="sidebar__toggle btn btn-secondary"
            (click)="toggleSidebar()"
            [attr.aria-label]="sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            {{ sidebarCollapsed() ? '→' : '←' }}
          </button>
        </div>

        <nav class="nav">
          <a routerLink="/home" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            <span class="nav__icon" aria-hidden="true">D</span>
            <span class="nav__label">Dashboard</span>
          </a>

          <a routerLink="/users" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">
            <span class="nav__icon" aria-hidden="true">U</span>
            <span class="nav__label">Users</span>
          </a>

          <a routerLink="/addresses" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">
            <span class="nav__icon" aria-hidden="true">A</span>
            <span class="nav__label">Addresses</span>
          </a>

          <div class="nav-group">
            <a #ecommerceActive="routerLinkActive" routerLink="/ecommerce" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">
              <span class="nav__icon" aria-hidden="true">E</span>
              <span class="nav__label">Ecommerce</span>
            </a>

            @if (ecommerceActive.isActive && !sidebarCollapsed()) {
              <div class="nav-submenu">
                <a routerLink="/ecommerce" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Overview</a>
                <a routerLink="/ecommerce/products" routerLinkActive="active">Products</a>
                <a routerLink="/ecommerce/orders" routerLinkActive="active">Orders</a>
                <a routerLink="/ecommerce/categories" routerLinkActive="active">Categories</a>
                <a routerLink="/ecommerce/stores" routerLinkActive="active">Stores</a>
                <a routerLink="/ecommerce/customers" routerLinkActive="active">Customers</a>
              </div>
            }
          </div>

          <a routerLink="/profile" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            <span class="nav__icon" aria-hidden="true">P</span>
            <span class="nav__label">Profile</span>
          </a>
        </nav>

        <div class="sidebar__footer">
          <p class="muted" [class.sr-only]="sidebarCollapsed()">{{ authSession.payload()?.sub || 'Account' }}</p>
          <button class="btn btn-secondary sidebar__signout" type="button" (click)="authStore.logout()">
            <span class="nav__icon" aria-hidden="true">S</span>
            <span class="nav__label">Sign out</span>
          </button>
        </div>
      </aside>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .layout-shell {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      min-height: 100vh;
      gap: 1rem;
      padding: 1rem;
    }

    .layout-shell--collapsed {
      grid-template-columns: 96px minmax(0, 1fr);
    }

    .sidebar,
    .content {
      min-width: 0;
    }

    .sidebar {
      padding: 1.3rem;
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
      position: sticky;
      top: 1rem;
      height: calc(100vh - 2rem);
      z-index: 1;
    }

    .sidebar--collapsed {
      padding: 1rem 0.8rem;
    }

    .sidebar__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .brand h1 {
      margin: 0;
      font-size: clamp(1.8rem, 2vw, 2.2rem);
      line-height: 1.06;
      letter-spacing: -0.04em;
    }

    .sidebar__toggle {
      flex: none;
      width: 2.4rem;
      height: 2.4rem;
      padding: 0;
      border-radius: 999px;
    }

    .nav {
      display: grid;
      gap: 0.55rem;
    }

    .nav a {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.9rem 1rem;
      border-radius: 16px;
      color: var(--text-muted);
      border: 1px solid transparent;
      background: rgba(15, 23, 42, 0.03);
      transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
    }

    .nav a.active {
      color: var(--text);
      border-color: rgba(79, 132, 217, 0.18);
      background: rgba(79, 132, 217, 0.08);
    }

    .nav a:hover {
      transform: translateX(2px);
      background: rgba(15, 23, 42, 0.05);
    }

    .nav__icon {
      display: none;
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 999px;
      align-items: center;
      justify-content: center;
      flex: none;
      background: rgba(79, 132, 217, 0.1);
      color: var(--primary-strong);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .nav-group {
      display: grid;
      gap: 0.45rem;
    }

    .nav-submenu {
      display: grid;
      gap: 0.35rem;
      margin-left: 0.7rem;
      padding-left: 0.9rem;
      border-left: 1px solid rgba(79, 132, 217, 0.12);
    }

    .nav-submenu a {
      padding: 0.72rem 0.9rem;
      border-radius: 14px;
      font-size: 0.92rem;
      background: rgba(15, 23, 42, 0.02);
    }

    .nav-submenu a.active {
      background: rgba(79, 132, 217, 0.08);
    }

    .sidebar__footer {
      display: grid;
      gap: 0.75rem;
      margin-top: auto;
    }

    .sidebar__signout {
      justify-content: flex-start;
    }

    .content {
      display: grid;
      align-content: start;
      gap: 1rem;
      padding-right: 0.25rem;
    }

    .layout-shell--collapsed .nav a,
    .layout-shell--collapsed .sidebar__signout {
      justify-content: center;
      padding-inline: 0.7rem;
    }

    .layout-shell--collapsed .nav__icon {
      display: inline-flex;
    }

    .layout-shell--collapsed .nav__label,
    .layout-shell--collapsed .nav-submenu {
      display: none;
    }

    @media (max-width: 980px) {
      .layout-shell,
      .layout-shell--collapsed {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: static;
        height: auto;
      }

      .sidebar--collapsed {
        padding: 1.3rem;
      }

      .layout-shell--collapsed .nav__label,
      .layout-shell--collapsed .nav-submenu {
        display: block;
      }

      .layout-shell--collapsed .nav__icon {
        display: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent {
  readonly authSession = inject(AuthSessionService);
  readonly authStore = inject(AuthStore);
  readonly sidebarCollapsed = signal(this.readSidebarPreference());

  constructor() {
    effect(() => {
      this.writeSidebarPreference(this.sidebarCollapsed());
    });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((value) => !value);
  }

  private readSidebarPreference(): boolean {
    try {
      return localStorage.getItem('unitwise_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  }

  private writeSidebarPreference(value: boolean): void {
    try {
      localStorage.setItem('unitwise_sidebar_collapsed', String(value));
    } catch {
      // Ignore storage errors in private/restricted contexts.
    }
  }
}
