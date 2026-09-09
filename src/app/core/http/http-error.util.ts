import { HttpErrorResponse } from '@angular/common/http';
import { AppError } from '../models/app-error';

/**
 * Maps a raw `HttpErrorResponse` to the app's own `AppError` shape. This is
 * the only place that inspects an HTTP status code to decide what kind of
 * failure occurred; `BaseApiService` calls it once per request so every
 * `*ApiService` method, and every facade service consuming it, only ever
 * sees an `AppError`, never a raw `HttpErrorResponse`.
 */
export function toAppError(error: HttpErrorResponse): AppError {
  if (error.status === 0) {
    return { kind: 'network', message: 'No connection to the server.' };
  }
  if (error.status === 401) {
    return { kind: 'unauthorized', message: 'Session expired.' };
  }
  return {
    kind: 'server',
    message: error.error?.message ?? 'Unexpected server error.',
    statusCode: error.status,
  };
}
