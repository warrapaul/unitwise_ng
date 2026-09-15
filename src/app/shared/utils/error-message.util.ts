import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from '../../core/models/error-response.model';

/** Client-normalised error shape every feature renders from. */
export interface ApiError {
  status: number;
  errorCode: string;
  message: string;
  details: string[];
}

const NETWORK_MESSAGE = 'Unable to reach the server. Check your connection.';

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return { status: 0, errorCode: 'NETWORK_ERROR', message: NETWORK_MESSAGE, details: [] };
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

  return { status: 0, errorCode: 'UNKNOWN', message: 'Request failed', details: [] };
}

export function extractErrorMessage(error: unknown): string {
  return toApiError(error).message;
}
