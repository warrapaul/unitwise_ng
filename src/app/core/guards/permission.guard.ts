import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';
import { ActiveContextService } from '../services/active-context.service';
import { RoutePaths } from '../routes/route-paths';
import { RoleConstants } from '../rbac/role.constants';

/**
 * Reachability is a different question from visibility.
 *
 * The nav and every `app-permission-gate` render from the **active role**, so a
 * section the current role cannot use is not offered. A URL, though, can arrive
 * from a bookmark, a colleague, or a notification — and refusing it because the
 * operator happens to be working as something else would be wrong when they
 * hold a role that allows it.
 *
 * So the guard asks "anywhere", then moves the context to a role that grants
 * it. The operator lands on a working page in the right role rather than on a
 * page with every control hidden, and the switcher shows what changed.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const authSession = inject(AuthSessionService);
  const context = inject(ActiveContextService);
  const router = inject(Router);

  const requiredPermissions = (route.data['permissions'] as string[] | undefined) ?? [];
  if (requiredPermissions.length === 0) {
    return true;
  }

  if (authSession.hasRole(RoleConstants.SUPER_ADMIN)) {
    return true;
  }

  const allowed = requiredPermissions.some((permission) => authSession.hasPermission(permission));
  if (!allowed) {
    return router.parseUrl(RoutePaths.home);
  }

  context.adoptContextGranting(requiredPermissions);
  return true;
};
