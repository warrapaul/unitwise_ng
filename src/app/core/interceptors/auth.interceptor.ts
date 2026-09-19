import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';

/**
 * The auth endpoints that are genuinely anonymous.
 *
 * An allow-list, not a `/v1/auth/` prefix skip. Several endpoints under that
 * prefix *require* a bearer, and blanket-skipping them broke the first-login
 * flow outright: a login that returns `passwordResetRequired` hands back a
 * short-lived password-change JWT as its access token, and
 * `POST /v1/auth/password-change` is authorised with exactly that token. The
 * prefix rule stripped it, so the one request the temporary token exists for
 * was the one request that never carried it.
 *
 * `logout`, `logout-all-devices`, `admin/force-logout` and
 * `password-reset/admin-initiate` are authenticated for the same reason.
 * `password-set` stays public: it carries its own verification token in the body.
 */
export const PUBLIC_AUTH_PATHS: ReadonlySet<string> = new Set([
  'v1/auth/login',
  'v1/auth/check-login-method',
  'v1/auth/login-otp/request',
  'v1/auth/login-otp/confirm',
  'v1/auth/signup',
  'v1/auth/signup/verify-phone/request',
  'v1/auth/signup/verify-phone/confirm',
  'v1/auth/refresh-token',
  'v1/auth/password-reset/initiate',
  'v1/auth/password-reset/confirm',
  'v1/auth/password-set'
]);

/** `https://host/api/v1/auth/login?x=1` -> `v1/auth/login`. */
export function apiPath(requestUrl: string): string {
  let path: string;
  try {
    path = new URL(requestUrl, 'http://localhost').pathname;
  } catch {
    path = requestUrl.split('?')[0];
  }

  const versioned = path.indexOf('v1/');
  return versioned === -1 ? path.replace(/^\//, '') : path.slice(versioned);
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authSession = inject(AuthSessionService);
  const token = authSession.accessToken();

  if (!token || PUBLIC_AUTH_PATHS.has(apiPath(request.url))) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};
