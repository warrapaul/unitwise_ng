import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

/** Set to false on a GET that must not be repeated, such as a poll that runs again on its own anyway. */
export const RETRY_GET = new HttpContextToken<boolean>(() => true);

const ATTEMPTS = 2;
const DELAY_MS = 1000;

/**
 * Every GET is tried twice more after a dropped connection or a server error (5xx), a second
 * apart. Writes never are: a POST that timed out may have been applied, and repeating it could
 * charge or record twice. A 4xx answer is final — asking again gets the same answer.
 */
export const retryInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'GET' || !request.context.get(RETRY_GET)) {
    return next(request);
  }
  return next(request).pipe(retry({
    count: ATTEMPTS,
    delay: (error, attempt) => transient(error) ? timer(DELAY_MS * attempt) : throwError(() => error)
  }));
};

function transient(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}
