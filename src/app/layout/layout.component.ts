import { afterNextRender, ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
          <div [class.sr-only]="sidebarCollapsed()">
            <p class="eyebrow">Unitwise</p>
            <h1>Operations</h1>
          </div>

          <button type="button" class="sidebar__toggle btn btn-secondary" (click)="toggleSidebar()" [attr.aria-label]="sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
            {{ sidebarCollapsed() ? '→' : '←' }}
          </button>
        </div>

        <nav class="nav">
          <a routerLink="/home" routerLinkActive="active">
            <span class="nav__abbr" aria-hidden="true">D</span>
            <span class="nav__label">Dashboard</span>
          </a>
          <a routerLink="/users" routerLinkActive="active">
            <span class="nav__abbr" aria-hidden="true">U</span>
            <span class="nav__label">Users</span>
          </a>
          <a routerLink="/ecommerce" routerLinkActive="active">
            <span class="nav__abbr" aria-hidden="true">E</span>
            <span class="nav__label">Ecommerce</span>
          </a>
          <a routerLink="/profile" routerLinkActive="active">
            <span class="nav__abbr" aria-hidden="true">P</span>
            <span class="nav__label">Profile</span>
          </a>
        </nav>

        <div class="sidebar__footer">
          <p class="muted" [class.sr-only]="sidebarCollapsed()">{{ authSession.payload()?.sub || 'Account' }}</p>
          <button class="btn btn-secondary sidebar__signout" type="button" (click)="authStore.logout()">
            <span class="nav__abbr" aria-hidden="true">S</span>
            <span class="nav__label">Sign out</span>
          </button>
        </div>
      </aside>

      <section class="content">
        <header class="topbar panel">
          <div>
            <p class="eyebrow">Unitwise</p>
            <h2 class="heading-lg">{{ pageTitle() }}</h2>
          </div>
        </header>

        <div class="content__body">
          <router-outlet />
        </div>
      </section>
    </div>
  `,
  styles: [`
    .layout-shell {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      min-height: 100vh;
      gap: 1rem;
      padding: 1rem;
    }

    .layout-shell--collapsed {
      grid-template-columns: 96px minmax(0, 1fr);
    }

    .sidebar,
    .topbar,
    .content__body {
      border-radius: 24px;
    }

    .sidebar {
      padding: 1.3rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 1.25rem;
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

    .sidebar__toggle {
      flex: none;
      width: 2.4rem;
      height: 2.4rem;
      padding: 0;
      border-radius: 999px;
    }

    .sidebar h1,
    .topbar h2 {
      margin: 0;
    }

    .nav {
      display: grid;
      gap: 0.5rem;
    }

    .nav a {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.9rem 1rem;
      border-radius: 14px;
      color: var(--text-muted);
      border: 1px solid transparent;
      background: rgba(15, 23, 42, 0.03);
      transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
    }

    .nav a.active {
      color: var(--text);
      border-color: rgba(79, 132, 217, 0.2);
      background: rgba(79, 132, 217, 0.08);
    }

    .nav a:hover {
      transform: translateX(2px);
      background: rgba(15, 23, 42, 0.05);
    }

    .nav__abbr {
      display: none;
      width: 1.85rem;
      height: 1.85rem;
      border-radius: 999px;
      align-items: center;
      justify-content: center;
      flex: none;
      background: rgba(79, 132, 217, 0.1);
      color: var(--primary-strong);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .sidebar__footer {
      display: grid;
      gap: 0.75rem;
    }

    .sidebar__signout {
      justify-content: flex-start;
    }

    .content {
      display: grid;
      gap: 1rem;
      min-width: 0;
      position: relative;
      z-index: 0;
    }

    .topbar {
      padding: 1.2rem 1.35rem;
    }

    .content__body {
      min-width: 0;
    }

    .layout-shell--collapsed .nav a,
    .layout-shell--collapsed .sidebar__signout {
      justify-content: center;
      padding-inline: 0.7rem;
    }

    .layout-shell--collapsed .nav__abbr {
      display: inline-flex;
    }

    .layout-shell--collapsed .nav__label {
      display: none;
    }

    @media (max-width: 980px) {
      .layout-shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: static;
        height: auto;
      }

      .sidebar--collapsed {
        padding: 1.3rem;
      }

      .layout-shell--collapsed {
        grid-template-columns: 1fr;
      }

      .layout-shell--collapsed .nav__label {
        display: inline;
      }

      .layout-shell--collapsed .nav__abbr {
        display: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  readonly authSession = inject(AuthSessionService);
  readonly authStore = inject(AuthStore);
  readonly pageTitle = signal('Dashboard');
  readonly sidebarCollapsed = signal(this.readSidebarPreference());

  constructor() {
    afterNextRender(() => this.updatePageTitle());
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.updatePageTitle());

    effect(() => {
      localStorage.setItem('unitwise_sidebar_collapsed', String(this.sidebarCollapsed()));
    });
  }


  toggleSidebar(): void {
    this.sidebarCollapsed.update((value) => !value);
  }


  private updatePageTitle(): void {
    let route: ActivatedRoute | null = this.activatedRoute;
    while (route?.firstChild) {
      route = route.firstChild;
    }
    const title = route?.snapshot.data['title'] as string | undefined;
    this.pageTitle.set(title ?? 'Unitw');
  }

  private readSidebarPreference(): boolean {
    return localStorage.getItem('unitwise_sidebar_collapsed') === 'true';
  }
}


