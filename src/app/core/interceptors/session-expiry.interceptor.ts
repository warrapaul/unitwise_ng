import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentInjector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, defaultIfEmpty, of, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthSessionService } from '../services/auth-session.service';
import { RoutePaths } from '../routes/route-paths';
import { PUBLIC_AUTH_PATHS, apiPath } from './auth.interceptor';
import { REFRESH_FLOW, RETRIED } from './session-context';

/**
 * Turns a dead session into a sign-out instead of a wall of errors.
 *
 * Until now a 401 was only ever a toast: the access token stayed in storage,
 * the route guard saw a token and let the user stay, and every request on the
 * page failed in the same way. That was survivable while tokens only died of
 * old age. It is not survivable now that "sign out of all other devices"
 * exists — the whole point of that feature is to strand the *other* device,
 * and stranding it on a page that keeps reporting "Unauthorized" is not
 * signing it out.
 *
 * A 401 is first treated as an expired access token: refresh once and replay
 * the request. Only when the refresh fails — which is what a revoked device
 * gets, because its refresh token was deleted along with the session — does
 * the session end.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);

  /*
   * Resolved lazily, not with inject(AuthService) here. AuthService injects
   * HttpClient, and HttpClient is what is constructing this interceptor —
   * asking for it up front is a cycle.
   */
  const injector = inject(EnvironmentInjector);

  return next(request).pipe(
    catchError((error: unknown) => {
      const path = apiPath(request.url);
      const recoverable =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !!session.accessToken() &&
        !request.context.get(RETRIED) &&
        !request.context.get(REFRESH_FLOW) &&
        !PUBLIC_AUTH_PATHS.has(path);

      if (!recoverable) {
        return throwError(() => error);
      }

      const auth = injector.get(AuthService);

      return auth.refreshSessionOnce().pipe(
        // refreshSessionOnce completes empty when there is no refresh token to
        // spend. That is a failed refresh, not a successful no-op.
        defaultIfEmpty(null),
        // The refresh itself failing is the revoked-device case: the token was
        // deleted server-side and there is nothing left to sign in with.
        catchError(() => of(null)),
        switchMap((refreshed) => {
          if (!refreshed) {
            return endSession();
          }

          return next(request.clone({
            context: request.context.set(RETRIED, true),
            setHeaders: { Authorization: `Bearer ${session.accessToken()}` }
          })).pipe(
            // Only a second 401 means the fresh token is no good either.
            // Anything else is the endpoint's own failure and belongs to the
            // caller — ending the session over a 500 would sign the user out
            // for a bug on one screen.
            catchError((replayError: unknown) =>
              replayError instanceof HttpErrorResponse && replayError.status === 401
                ? endSession()
                : throwError(() => replayError)
            )
          );
        })
      );
    })
  );

  function endSession() {
    session.clear();
    void router.navigateByUrl(RoutePaths.login);

    /*
     * A new error, not the original 401: the message reaches the user through
     * the error interceptor's toast, and "Unauthorized" explains nothing to
     * somebody who has just been signed out from another device.
     */
    return throwError(() => new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      url: request.url,
      error: { message: 'Your session has ended. Please sign in again.' }
    }));
  }
};
