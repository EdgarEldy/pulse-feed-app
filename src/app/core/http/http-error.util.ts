import { HttpErrorResponse } from '@angular/common/http';
import { AppError } from '../models/app-error';

/** The three fallback strings `toAppError` itself constructs, already
 * resolved through `TranslateService` by `BaseApiService` (the one caller),
 * so this stays a plain, framework-agnostic mapping function rather than
 * an Angular-injectable one. */
export interface AppErrorFallbackMessages {
  noConnection: string;
  sessionExpired: string;
  unexpectedServer: string;
}

/** Only used if a caller does not supply `messages` (untranslated English,
 * kept solely so this function's default parameter is well-typed; every
 * real call site, `BaseApiService`, always passes translated strings). */
const DEFAULT_FALLBACK_MESSAGES: AppErrorFallbackMessages = {
  noConnection: 'No connection to the server.',
  sessionExpired: 'Session expired.',
  unexpectedServer: 'Unexpected server error.',
};

/**
 * Maps a raw `HttpErrorResponse` to the app's own `AppError` shape. This is
 * the only place that inspects an HTTP status code to decide what kind of
 * failure occurred; `BaseApiService` calls it once per request so every
 * `*ApiService` method, and every facade service consuming it, only ever
 * sees an `AppError`, never a raw `HttpErrorResponse`.
 */
export function toAppError(error: HttpErrorResponse, messages: AppErrorFallbackMessages = DEFAULT_FALLBACK_MESSAGES): AppError {
  if (error.status === 0) {
    return { kind: 'network', message: messages.noConnection };
  }
  if (error.status === 401) {
    return { kind: 'unauthorized', message: messages.sessionExpired };
  }
  return {
    kind: 'server',
    message: error.error?.message ?? messages.unexpectedServer,
    statusCode: error.status,
  };
}
