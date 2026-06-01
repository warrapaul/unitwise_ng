import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';
import { RoutePaths } from '../routes/route-paths';
import { UserRole } from '../rbac/role.constants';

export const roleGuard: CanActivateFn = (route) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const requiredRoles = (route.data['roles'] as string[] | undefined) ?? [];

  if (requiredRoles.length === 0) {
    return true;
  }

  const allowed = requiredRoles.some((role) => authSession.hasRole(role as UserRole));
  if (allowed) {
    return true;
  }

  return router.parseUrl(RoutePaths.home);
};
