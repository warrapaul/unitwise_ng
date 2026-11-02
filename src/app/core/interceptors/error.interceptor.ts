import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { Injector, inject } from '@angular/core';
import { BillingStatusService } from '../../features/billing/billing-status.service';
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
  // Resolved lazily: the billing service itself makes HTTP calls through this interceptor.
  const injector = inject(Injector);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!shouldSkipNotification(request.url)) {
        const message = extractMessage(error);
        // 402: the agency's plan or subscription stops this. Say where it is fixed, and re-read the
        // subscription so the banner shows the reason at once.
        if (error instanceof HttpErrorResponse && error.status === 402) {
          injector.get(BillingStatusService).refresh();
          notifications.push('error', `${message} See Billing to change your plan or pay.`);
        } else {
          notifications.push('error', message);
        }
      }
      return throwError(() => error);
    })
  );
};
