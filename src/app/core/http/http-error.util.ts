import { HttpErrorResponse } from '@angular/common/http';
import { AppError } from '../models/app-error';

/**
 * Maps a raw `HttpErrorResponse` to the app's own `AppError` shape. This is
 * the only place that inspects an HTTP status code to decide what kind of
 * failure occurred; `BaseApiService` calls it once per request so every
 * `*ApiService` method, and every facade service consuming it, only ever
 * sees an `AppError`, never a raw `HttpErrorResponse`.
 *
 * `translate` resolves exactly one of `errors.network`/`errors.unauthorized`/
 * `errors.server` (the same keys `ErrorViewComponent`'s `AppErrorKind`
 * mapping already uses, not a separate copy of the same three sentences) —
 * whichever single branch below actually applies, never all three, since
 * this stays a plain, framework-agnostic function that cannot call
 * `TranslateService` itself. `BaseApiService` is the one caller, passing
 * `(key) => this.translate.instant(key)`.
 */
export function toAppError(error: HttpErrorResponse, translate: (key: string) => string): AppError {
  if (error.status === 0) {
    return { kind: 'network', message: translate('errors.network') };
  }
  if (error.status === 401) {
    return { kind: 'unauthorized', message: translate('errors.unauthorized') };
  }
  return {
    kind: 'server',
    message: error.error?.message ?? translate('errors.server'),
    statusCode: error.status,
  };
}
