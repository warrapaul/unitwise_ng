import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { RoleConstants } from '../../../core/rbac/role.constants';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="container home-page">
      <section class="hero panel">
        <div class="stack">
          <span class="pill">Unitwise dashboard</span>
          <h1 class="heading-xl">Operations, auth, user management, and ecommerce in one clean workspace.</h1>
          <p class="muted">
            This starter keeps authentication, profiles, users, and ecommerce aligned with the Spring Boot contract.
          </p>
          <div class="hero__actions">
            <a routerLink="/users" class="btn btn-primary">Open users</a>
            <a routerLink="/ecommerce" class="btn btn-secondary">Open ecommerce</a>
            <a routerLink="/profile" class="btn btn-secondary">View profile</a>
          </div>
        </div>

        <aside class="hero__aside card">
          <p class="eyebrow">Session</p>
          <h2 class="heading-lg">Signed in</h2>
          <p class="muted">{{ authSession.payload()?.sub || 'Authenticated user' }}</p>
          <div class="stack compact">
            <div><strong>Roles</strong><p class="muted">{{ authSession.userRoles().join(', ') || 'None' }}</p></div>
            <div><strong>Permissions</strong><p class="muted">{{ authSession.userPermissions().length }} available</p></div>
            <div><strong>Super admin</strong><p class="muted">{{ authSession.hasRole(roleConstants.SUPER_ADMIN) ? 'Yes' : 'No' }}</p></div>
          </div>
        </aside>
      </section>
    </main>
  `,
  styles: [`
    .home-page {
      padding-block: 2rem 3rem;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.5fr 0.9fr;
      gap: 1.5rem;
      padding: clamp(1.25rem, 4vw, 2rem);
    }

    .hero__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .hero__aside {
      padding: 1.25rem;
      display: grid;
      gap: 0.9rem;
    }

    .compact {
      gap: 0.75rem;
    }

    @media (max-width: 900px) {
      .hero {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  readonly authSession = inject(AuthSessionService);
  readonly roleConstants = RoleConstants;
}
