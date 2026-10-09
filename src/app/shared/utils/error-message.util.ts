import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from '../../core/models/error-response.model';

/** Client-normalised error shape every feature renders from. */
export interface ApiError {
  status: number;
  errorCode: string;
  message: string;
  details: string[];
}

/*
 * "No answer" has two causes the person handles differently, and blaming their
 * connection for a server that is down sends them off resetting a Wi-Fi that
 * works. The browser knows which: `navigator.onLine` is false only when the
 * device itself has no network.
 */
const OFFLINE_MESSAGE = 'You appear to be offline. Check your internet connection and try again.';
const SERVER_DOWN_MESSAGE = 'Server error. Unitwise can\'t be reached right now. Please try again later.';

/** 502/503/504 with no API body: a proxy answered for a server that did not. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return isOffline()
        ? { status: 0, errorCode: 'OFFLINE', message: OFFLINE_MESSAGE, details: [] }
        : { status: 0, errorCode: 'SERVER_UNREACHABLE', message: SERVER_DOWN_MESSAGE, details: [] };
    }

    // The API always answers in JSON; an HTML or empty body on these is the proxy's page.
    const apiBody = error.error && typeof error.error === 'object' && 'message' in error.error;
    if (GATEWAY_STATUSES.has(error.status) && !apiBody) {
      return { status: error.status, errorCode: 'SERVER_UNAVAILABLE', message: SERVER_DOWN_MESSAGE, details: [] };
    }

    const body = error.error as Partial<ErrorResponse> | string | null;
    if (typeof body === 'string') {
      return { status: error.status, errorCode: 'UNKNOWN', message: body, details: [] };
    }

    return {
      status: error.status,
      errorCode: body?.errorCode ?? 'UNKNOWN',
      message: body?.message ?? error.message ?? 'Request failed',
      details: body?.details ?? []
    };
  }

  if (error && typeof error === 'object' && 'error' in error) {
    const body = (error as { error?: Partial<ErrorResponse> }).error;
    return {
      status: (error as { status?: number }).status ?? 0,
      errorCode: body?.errorCode ?? 'UNKNOWN',
      message: body?.message ?? 'Request failed',
      details: body?.details ?? []
    };
  }

  // A plain Error is one the app raised on purpose, with a sentence for the operator
  // ("Choose an agency…"). A TypeError and the like are bugs, not guidance: keep them generic.
  if (error instanceof Error && error.name === 'Error' && error.message) {
    return { status: 0, errorCode: 'CLIENT', message: error.message, details: [] };
  }

  return { status: 0, errorCode: 'UNKNOWN', message: 'Request failed', details: [] };
}

export function extractErrorMessage(error: unknown): string {
  return toApiError(error).message;
}
