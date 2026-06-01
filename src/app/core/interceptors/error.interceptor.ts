import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { ErrorResponse } from '../models/error-response.model';
import { NotificationService } from '../services/notification.service';

function shouldSkipNotification(requestUrl: string): boolean {
  try {
    const pathname = new URL(requestUrl).pathname;
    return pathname.startsWith('/api/v1/auth/');
  } catch {
    return requestUrl.includes('/v1/auth/');
  }
}

function extractMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as Partial<ErrorResponse> | string | null;
    if (typeof body === 'string') {
      return body;
    }

    return body?.message || error.message || 'Request failed';
  }

  return 'Request failed';
}

export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const notifications = inject(NotificationService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!shouldSkipNotification(request.url)) {
        const message = extractMessage(error);
        notifications.push('error', message);
      }
      return throwError(() => error);
    })
  );
};
