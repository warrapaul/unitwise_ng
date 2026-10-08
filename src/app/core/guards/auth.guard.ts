import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';
import { RoutePaths } from '../routes/route-paths';

export const authGuard: CanActivateFn = () => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);

  // A forced change comes first: the only page that session may open is the
  // change-password screen (which is outside this guard), so every other one
  // sends it there instead of loading screens whose calls would all be refused.
  if (authSession.isAuthenticated() && authSession.passwordResetRequired()) {
    return router.parseUrl(RoutePaths.changePassword);
  }

  if (authSession.isAuthenticated()) {
    return true;
  }

  return router.parseUrl(RoutePaths.login);
};
