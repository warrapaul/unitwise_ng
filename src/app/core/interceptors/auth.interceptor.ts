import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSessionService } from '../services/auth-session.service';

function shouldSkipAuthorization(requestUrl: string): boolean {
  try {
    const pathname = new URL(requestUrl).pathname;
    return pathname.startsWith('/api/v1/auth/');
  } catch {
    return requestUrl.includes('/v1/auth/');
  }
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authSession = inject(AuthSessionService);
  const token = authSession.accessToken();

  if (!token || shouldSkipAuthorization(request.url)) {
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
