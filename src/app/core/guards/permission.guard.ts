import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';
import { RoutePaths } from '../routes/route-paths';
import { RoleConstants } from '../rbac/role.constants';

export const permissionGuard: CanActivateFn = (route) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const requiredPermissions = (route.data['permissions'] as string[] | undefined) ?? [];
  if (requiredPermissions.length === 0) {
    return true;
  }

  const allowed = requiredPermissions.some((permission) => authSession.hasPermission(permission));
  const superAdminAccess = authSession.hasRole(RoleConstants.SUPER_ADMIN);

  if (allowed || superAdminAccess) {
    return true;
  }
  return router.parseUrl(RoutePaths.home);
};
